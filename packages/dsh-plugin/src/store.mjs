import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDefaultWorkspace } from '../lib/workspace-state.js';
import { createWorksitePreview } from './worksite-preview.mjs';
import { applyCommand, normalizeSnapshot, normalizeOrganization, KontError, reject, isRecord, text } from './kernel.mjs';
import { prepareRun, returnRun, validateRuns, runHash, claimRunDispatch, settleRunDispatch } from './run.mjs';
export { KontError };

const fresh = () => ({ schemaVersion: 4, revision: 0, seq: 0, assets: [], edges: [], workspace: createDefaultWorkspace(), titles: { legacy: '第一个工作现场' }, organization: { version: 1, folders: [] } });
const clone = value => structuredClone(value);
const STORE_SNAPSHOT_FORMAT = 'kont-store-snapshot/v1';
const defaultTitle = worksiteId => worksiteId === 'legacy' ? '第一个工作现场' : worksiteId;
const isDefaultTitle = (worksiteId, title) => title === worksiteId || title === defaultTitle(worksiteId);

// The marker is owned by the Store contract, not Canvas schemaVersion. Check
// it before core normalization can discard a future/invalid format claim.
function isFullStoreSnapshot(value) {
  const marker = Object.getOwnPropertyDescriptor(value, 'format');
  if (!marker) return false;
  if (!marker.enumerable || !Object.hasOwn(marker, 'value') || marker.value !== STORE_SNAPSHOT_FORMAT)
    reject('UNSUPPORTED_STORE_SNAPSHOT_FORMAT', '不支持的完整Store快照格式');
  const keys = ['format', 'schemaVersion', 'assets', 'edges', 'workspace', 'titles', 'organization', 'runs'];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length
    || Object.keys(descriptors).some(key => !keys.includes(key))) reject('INVALID_STORE_SNAPSHOT', '完整Store快照字段无效');
  for (const key of ['schemaVersion', 'assets', 'edges', 'workspace']) {
    if (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))
      reject('INVALID_STORE_SNAPSHOT', '完整Store快照缺少核心字段');
  }
  if (value.schemaVersion !== 4 || !Array.isArray(value.assets) || !Array.isArray(value.edges) || !isRecord(value.workspace))
    reject('INVALID_STORE_SNAPSHOT', '完整Store快照核心格式无效');
  for (const [key, code] of [['titles', 'TITLES_RESTORE_REQUIRED'], ['organization', 'ORGANIZATION_RESTORE_REQUIRED'], ['runs', 'RUN_RESTORE_CONFLICT']]) {
    if (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))
      reject(code, '完整Store快照缺少业务元数据');
  }
  if (value.runs === undefined) reject('RUN_RESTORE_CONFLICT', '完整Store快照必须显式包含Run记录');
  return true;
}

function normalizeTitles(value, workspace, allowMissing = false) {
  const invalid = () => reject('INVALID_TITLES', '现场名称表格式或覆盖范围无效');
  if (value === undefined && allowMissing) value = {};
  if (!isRecord(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length) invalid();
  const result = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!key.trim() || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
      || typeof descriptor.value !== 'string' || descriptor.value.length > 200) invalid();
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true, writable: true, configurable: true });
  }
  for (const site of workspace.worksites) {
    if (!Object.hasOwn(result, site.id)) {
      if (!allowMissing) invalid();
      Object.defineProperty(result, site.id, { value: defaultTitle(site.id), enumerable: true, writable: true, configurable: true });
    }
    text(result[site.id], 200, '现场标题');
  }
  return result;
}

function prepareStoreRestore(value) {
  if (!isRecord(value)) reject('INVALID_STORE_SNAPSHOT', '恢复快照必须为普通数据');
  const full = isFullStoreSnapshot(value);
  const snapshot = normalizeSnapshot(value);
  const titles = Object.getOwnPropertyDescriptor(value, 'titles');
  const organization = Object.getOwnPropertyDescriptor(value, 'organization');
  const runs = Object.getOwnPropertyDescriptor(value, 'runs');
  if (titles && !Object.hasOwn(titles, 'value')) reject('INVALID_TITLES', '现场名称表必须为普通数据');
  if (organization && !Object.hasOwn(organization, 'value')) reject('INVALID_ORGANIZATION', '现场文件夹组织必须为普通数据');
  if (runs && !Object.hasOwn(runs, 'value')) reject('RUN_RESTORE_CONFLICT', 'Run记录必须为普通数据');
  return { snapshot, titles: titles ? normalizeTitles(titles.value, snapshot.workspace) : null,
    organization: organization ? normalizeOrganization(organization.value, snapshot.workspace) : null,
    runs: runs && (full || runs.value !== undefined) ? validateRuns(clone(runs.value)) : null };
}

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
    const full = isFullStoreSnapshot(input);
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
    if (Object.hasOwn(value, 'titles') && value.titles === undefined) reject('INVALID_TITLES', '现场名称表不能为undefined');
    const titles = normalizeTitles(value.titles, snapshot.workspace, !full);
    for (const site of snapshot.workspace.worksites) {
      text(site.draft, 50000, '草稿');
    }
    const organization = normalizeOrganization(Object.hasOwn(value, 'organization') ? value.organization : { version: 1, folders: [] }, snapshot.workspace);
    return { ...snapshot, revision, seq, titles, organization, ...(value.runs !== undefined ? { runs: validateRuns(value.runs) } : {}) };
  }
  read() { return clone(this.#state); }
  // Complete business export; local CAS counters remain owned by the target.
  snapshot() { const { revision, seq, ...snapshot } = this.read(); return { format: STORE_SNAPSHOT_FORMAT, ...snapshot, runs: snapshot.runs ?? [] }; }
  // Explicitly lossy Canvas projection for consumers of the frozen core only.
  coreSnapshot() { return normalizeSnapshot(this.read()); }
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
  /** Internal adapter entry only; no HTTP command dispatches here. Evidence authenticity
   * is the future adapter's responsibility. Current tests supply labelled synthetic logs. */
  returnRun(runId, evidence, source = 'runtime:dsh', { signal } = {}) {
    return this.#commit({ commands: [{ runId, evidence }] }, source, true, null, true, signal).then(result => result.results[0]);
  }
  // Internal coordination only. Ordinary commands cannot reserve or settle dispatch.
  claimRunDispatch(runId, constraints) {
    return this.#commit({ commands: [{ runId, constraints }] }, 'runtime:dispatch', true, null, 'claim').then(r => r.results[0]);
  }
  settleRunDispatch(runId, claimId, outcome) {
    return this.#commit({ commands: [{ runId, claimId, outcome }] }, 'runtime:dispatch', true, null, 'settle').then(r => r.results[0]);
  }
  #commit(request, source, legacyCommand = false, imported = null, internalReturn = false, returnSignal) {
    if (this.#closing) return Promise.reject(new KontError('STORE_CLOSED', '现场存储已关闭', 503));
    // Freeze the call's payload before yielding to the writer queue. The
    // snapshot validator rejects accessors/non-JSON values on the actual model.
    try {
      request = clone(request);
      if (imported) imported = prepareStoreRestore(imported);
    }
    catch (error) { return Promise.reject(error); }
    const result = this.#queue.then(async () => {
      returnSignal?.throwIfAborted();
      text(source, 200, '操作来源');
      if (!source.trim()) reject('INVALID_SOURCE', '操作来源无效');
      if (!isRecord(request)) reject('INVALID_COMMAND', '请求格式无效');
      if ((!legacyCommand && request.revision !== this.#state.revision)
        || (request.baseSeq !== undefined && request.baseSeq !== this.#state.seq)) reject('STALE_REVISION', '现场已被另一个窗口更新；请刷新后重试，未保存草稿仍保留', 409);
      if (!Array.isArray(request.commands) || request.commands.length < 1 || request.commands.length > 10) reject('INVALID_COMMAND', '操作数量无效');
      // Snapshot restore may replace asset/worksite state, never import or erase
      // runtime attestations. An exported journal must exactly match this store.
      if (imported?.runs !== null && imported?.runs !== undefined
        && runHash(imported.runs) !== runHash(this.#state.runs ?? [])) reject('RUN_RESTORE_CONFLICT', 'Snapshot cannot replace Run evidence');
      if (imported && imported.organization === null && this.#state.organization.folders.length)
        reject('ORGANIZATION_RESTORE_REQUIRED', '恢复快照须显式包含现有文件夹组织');
      if (imported && imported.titles === null && Object.entries(this.#state.titles).some(([id, title]) => !isDefaultTitle(id, title)))
        reject('TITLES_RESTORE_REQUIRED', '恢复快照须显式包含现有业务名称');
      const next = imported ? { ...imported.snapshot, revision: this.#state.revision, seq: this.#state.seq,
        titles: imported.titles ?? normalizeTitles(Object.fromEntries(imported.snapshot.workspace.worksites.map(site =>
          [site.id, Object.hasOwn(this.#state.titles, site.id) ? this.#state.titles[site.id] : defaultTitle(site.id)])), imported.snapshot.workspace),
        organization: imported.organization ?? { version: 1, folders: [] },
        ...(this.#state.runs !== undefined ? { runs: clone(this.#state.runs) } : {}) } : this.read();
      const events = [], results = [];
      for (const command of request.commands) {
        const applied = imported ? { value: true, event: { type: 'snapshot.restored' } }
          : internalReturn === 'claim' ? claimRunDispatch(next, command.runId, command.constraints)
          : internalReturn === 'settle' ? settleRunDispatch(next, command.runId, command.claimId, command.outcome)
          : internalReturn ? returnRun(next, command.runId, command.evidence, applyCommand)
          : command?.type === 'run.prepare' ? prepareRun(next, command) : applyCommand(next, command);
        results.push(clone(applied.value));
        for (const event of applied.events ?? (applied.event ? [applied.event] : []))
          events.push({ ...clone(event), source, seq: ++next.seq, ts: new Date().toISOString() });
      }
      if (events.length === 0) return { state: this.read(), results };
      next.revision += 1;
      const valid = this.#validate(next);
      const serialized = JSON.stringify(valid);
      if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) reject('STORE_LIMIT', '现场存储已达本轮容量上限');
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
        returnSignal?.throwIfAborted();
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
    return createWorksitePreview(this.read(), worksiteId);
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
