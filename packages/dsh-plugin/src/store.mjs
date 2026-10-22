import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDefaultWorkspace } from '../lib/workspace-state.js';
import { getBlocks } from '../lib/knot-model.js';
import { applyCommand, normalizeSnapshot, KontError, reject, isRecord, text } from './kernel.mjs';
export { KontError };

const fresh = () => ({ schemaVersion: 4, revision: 0, seq: 0, assets: [], edges: [], workspace: createDefaultWorkspace(), titles: { legacy: '第一个工作现场' } });
const clone = value => structuredClone(value);

/** One authoritative schema-4 snapshot with atomic persistence and post-commit events. */
export class KontStore {
  #state; #queue = Promise.resolve(); #lock; #closing = false; #closePromise;
  #events = []; #eventFloor = 0; #listeners = new Set();
  constructor(file) { this.file = file; }
  async init() {
    await mkdir(dirname(this.file), { recursive: true });
    try { this.#lock = await open(`${this.file}.lock`, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') reject('STORE_LOCKED', '另一个 KONT 进程占用现场存储；先关闭它，异常退出需核对锁文件', 503); throw error; }
    try {
      try { this.#state = this.#validate(JSON.parse(await readFile(this.file, 'utf8'))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; this.#state = fresh(); }
      this.#eventFloor = this.#state.seq;
    } catch (error) { await this.close(); throw error; }
    return this;
  }
  #validate(input) {
    if (!isRecord(input)) reject('INVALID_STORE', '现场存储损坏，已停止写入', 503);
    let value = input;
    // Only the explicitly identified old candidate receives these defaults.
    // Its bytes are left intact until an actual successful mutation occurs.
    if (value.schema === 1 && value.schemaVersion === undefined) {
      if (!Array.isArray(value.assets)) reject('INVALID_STORE', '旧候选资产格式无效', 503);
      value = { ...value, schemaVersion: 4, seq: value.revision,
        edges: [], assets: value.assets.map(asset => ({ ...asset, src: asset.src ?? '', chain_id: asset.chain_id ?? '' })) };
    }
    const revision = value.revision ?? 0, seq = value.seq ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(seq) || seq < 0) reject('INVALID_STORE', '存储版本无效', 503);
    let snapshot;
    try { snapshot = normalizeSnapshot(value); }
    catch (error) { reject('INVALID_STORE', `现场快照无效: ${error.message}`, 503); }
    if (snapshot.assets.length > 500 || snapshot.edges.length > 2000 || snapshot.workspace.worksites.length > 200) reject('STORE_LIMIT', '现场容量已达本轮上限');
    for (const asset of snapshot.assets) {
      text(asset.title, 200, '材料标题'); text(asset.summary, 50000, '材料正文');
      text(asset.src, 10000, '来源'); text(asset.chain_id, 1000, '链身份');
      if (asset.blocks?.length > 1000) reject('STORE_LIMIT', '结内块过多');
      for (const block of asset.blocks ?? []) text(block.content, 50000, '块正文');
    }
    const titles = isRecord(value.titles) ? clone(value.titles) : {};
    for (const site of snapshot.workspace.worksites) {
      text(site.draft, 50000, '草稿');
      if (!Object.hasOwn(titles, site.id)) Object.defineProperty(titles, site.id, { value: site.id, enumerable: true, writable: true, configurable: true });
      text(titles[site.id], 200, '现场标题');
    }
    return { ...snapshot, revision, seq, titles };
  }
  read() { return clone(this.#state); }
  snapshot() { const { revision, seq, titles, ...snapshot } = this.read(); return snapshot; }
  subscribe(listener) {
    if (this.#closing) reject('STORE_CLOSED', '现场存储已关闭', 503);
    this.#listeners.add(listener); return () => this.#listeners.delete(listener);
  }
  eventsSince(since) {
    if (!Number.isSafeInteger(since) || since < 0 || since > this.#state.seq) reject('INVALID_CURSOR', '事件游标无效');
    return { reset: since < this.#eventFloor, seq: this.#state.seq,
      events: since < this.#eventFloor ? [] : clone(this.#events.filter(event => event.seq > since)) };
  }
  mutate(request, source = 'human') { return this.#commit(request, source).then(({ state }) => state); }
  async command(command, source = 'agent:local') {
    try {
      if (command?.type === 'ping') return { ok: true, value: { seq: this.#state.seq, time: new Date().toISOString() } };
      const result = await this.#commit({ commands: [command], baseSeq: command?.baseSeq }, source, true);
      return { ok: true, value: result.results[0] };
    } catch (error) {
      if (error instanceof KontError) return { ok: false, error: { code: error.code, message: error.message } };
      return { ok: false, error: { code: 'STORAGE_ERROR', message: '现场保存失败，原有数据保留' } };
    }
  }
  #commit(request, source, legacyCommand = false, imported = null) {
    if (this.#closing) return Promise.reject(new KontError('STORE_CLOSED', '现场存储已关闭', 503));
    // Freeze the call's payload before yielding to the writer queue. The
    // snapshot validator rejects accessors/non-JSON values on the actual model.
    try { request = clone(request); if (imported) imported = normalizeSnapshot(imported); }
    catch (error) { return Promise.reject(error); }
    const result = this.#queue.then(async () => {
      text(source, 200, '操作来源');
      if (!source.trim()) reject('INVALID_SOURCE', '操作来源无效');
      if (!isRecord(request)) reject('INVALID_COMMAND', '请求格式无效');
      if ((!legacyCommand && request.revision !== this.#state.revision)
        || (request.baseSeq !== undefined && request.baseSeq !== this.#state.seq)) reject('STALE_REVISION', '现场已被另一个窗口更新；请刷新后重试，未保存草稿仍保留', 409);
      if (!Array.isArray(request.commands) || request.commands.length < 1 || request.commands.length > 10) reject('INVALID_COMMAND', '操作数量无效');
      const next = imported ? { ...normalizeSnapshot(imported), revision: this.#state.revision, seq: this.#state.seq, titles: {} } : this.read();
      const events = [], results = [];
      for (const command of request.commands) {
        const applied = imported ? { value: true, event: { type: 'snapshot.restored' } } : applyCommand(next, command);
        results.push(clone(applied.value));
        if (applied.event) events.push({ ...clone(applied.event), source, seq: ++next.seq, ts: new Date().toISOString() });
      }
      if (events.length === 0) return { state: this.read(), results };
      next.revision += 1;
      const valid = this.#validate(next);
      const serialized = JSON.stringify(valid);
      if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) reject('STORE_LIMIT', '现场存储已达本轮容量上限');
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
        await rename(temporary, this.file);
      } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
      this.#state = valid;
      this.#events.push(...events);
      while (this.#events.length > 200) this.#eventFloor = this.#events.shift().seq;
      // Observer exceptions cannot undo a durable fact.
      for (const event of events) for (const listener of this.#listeners) { try { listener(clone(event)); } catch {} }
      return { state: this.read(), results };
    });
    this.#queue = result.catch(() => {});
    return result;
  }
  restoreSnapshot(snapshot, revision = this.#state.revision, source = 'human') {
    return this.#commit({ revision, commands: [{ type: 'snapshot.restore' }] }, source, false, snapshot).then(({ state }) => state);
  }
  preview(worksiteId) {
    const state = this.read();
    const site = state.workspace.worksites.find(site => site.id === worksiteId);
    if (!site) reject('NOT_FOUND', '现场不存在', 404);
    return { worksiteId: site.id, draft: site.draft, materials: site.checkedIds.filter(id => !site.excludedIds.includes(id)).map(id => {
      const asset = state.assets.find(asset => asset.id === id);
      return { id: asset.id, title: asset.title, summary: asset.summary, blocks: getBlocks(asset) };
    }) };
  }
  close() {
    if (this.#closePromise) return this.#closePromise;
    this.#closing = true;
    this.#closePromise = (async () => {
      await this.#queue;
      this.#listeners.clear();
      if (this.#lock) { await this.#lock.close(); this.#lock = undefined; await unlink(`${this.file}.lock`); }
    })();
    return this.#closePromise;
  }
}
