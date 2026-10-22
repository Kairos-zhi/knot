import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDefaultWorkspace, reduceWorkspace, validateWorkspace } from '../lib/workspace-state.js';

export class KontError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const reject = (code, message, status) => { throw new KontError(code, message, status); };
const text = (value, max, name) => {
  if (typeof value !== 'string' || value.length > max) reject('INVALID_INPUT', `${name}格式或长度无效`);
  return value;
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fresh = () => ({ schema: 1, revision: 0, workspace: createDefaultWorkspace(), assets: [], titles: { legacy: '第一个工作现场' } });

/** One writer, one authoritative snapshot. No Session or Agent lifecycle is duplicated here. */
export class KontStore {
  #state; #queue = Promise.resolve(); #lock;
  constructor(file) { this.file = file; }
  async init() {
    await mkdir(dirname(this.file), { recursive: true });
    try { this.#lock = await open(`${this.file}.lock`, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') reject('STORE_LOCKED', '另一个 KONT 进程占用现场存储；先关闭它，异常退出需核对锁文件', 503); throw error; }
    try {
      try { this.#state = this.#validate(JSON.parse(await readFile(this.file, 'utf8'))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; this.#state = fresh(); }
    } catch (error) { await this.close(); throw error; }
    return this;
  }
  #validate(value) {
    if (!object(value) || value.schema !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !Array.isArray(value.assets) || value.assets.length > 500 || !object(value.titles)) reject('INVALID_STORE', '现场存储损坏，已停止写入', 503);
    const ids = new Set();
    for (const asset of value.assets) {
      if (!object(asset) || typeof asset.id !== 'string' || !asset.id || ids.has(asset.id)) reject('INVALID_STORE', '资产身份无效', 503);
      ids.add(asset.id); text(asset.title, 200, '材料标题'); text(asset.summary, 50000, '材料正文');
      if (!Array.isArray(asset.blocks) || asset.blocks.length !== 1 || asset.blocks[0].content !== asset.summary
        || asset.blocks[0].source !== 'manual' || !Array.isArray(asset.blocks[0].provenance)
        || asset.blocks[0].provenance.length !== 0) reject('INVALID_STORE', '材料块无效', 503);
    }
    const validated = validateWorkspace(value.workspace, ids);
    if (!validated.ok || value.workspace.worksites.length > 200) reject('INVALID_STORE', '现场引用无效', 503);
    for (const site of validated.value.worksites) {
      text(site.draft, 50000, '草稿');
      if (!Object.hasOwn(value.titles, site.id)) reject('INVALID_STORE', '现场标题缺失', 503);
      text(value.titles[site.id], 200, '现场标题');
    }
    return { schema: 1, revision: value.revision, workspace: validated.value, assets: structuredClone(value.assets), titles: structuredClone(value.titles) };
  }
  read() { return structuredClone(this.#state); }
  mutate(request) {
    const result = this.#queue.then(async () => {
      if (!object(request) || request.revision !== this.#state.revision) reject('STALE_REVISION', '现场已被另一个窗口更新；请刷新后重试，未保存草稿仍保留', 409);
      if (!Array.isArray(request.commands) || request.commands.length < 1 || request.commands.length > 10) reject('INVALID_COMMAND', '操作数量无效');
      const next = this.read();
      for (const command of request.commands) this.#apply(next, command);
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
      return this.read();
    });
    this.#queue = result.catch(() => {});
    return result;
  }
  #apply(next, command) {
    if (!object(command)) reject('INVALID_COMMAND', '操作格式无效');
    if (command.type === 'asset.add') {
      const title = text(command.title, 200, '材料标题').trim();
      const content = text(command.content, 50000, '材料正文');
      if (!title || !content.trim()) reject('INVALID_INPUT', '请填写材料标题与正文');
      next.assets.push({ id: randomUUID(), title, summary: content, blocks: [{ id: 'b1', source: 'manual', timestamp: new Date().toISOString(), provenance: [], content }] });
      return;
    }
    if (command.type === 'scene.create') {
      const title = text(command.title, 200, '现场标题').trim();
      if (!title) reject('INVALID_INPUT', '请填写现场标题');
      const id = randomUUID();
      this.#reduce(next, { type: 'worksite.create', id });
      next.titles[id] = title;
      this.#reduce(next, { type: 'worksite.activate', worksiteId: id });
      this.#reduce(next, { type: 'presentation.open', id: `view:${id}`, worksiteId: id });
      return;
    }
    this.#reduce(next, command);
  }
  #reduce(next, command) {
    const reduced = reduceWorkspace(next.workspace, command, next.assets.map(asset => asset.id));
    if (!reduced.ok) reject(reduced.error.code, reduced.error.message);
    next.workspace = reduced.value;
  }
  preview(worksiteId) {
    const state = this.read();
    const site = state.workspace.worksites.find(site => site.id === worksiteId);
    if (!site) reject('NOT_FOUND', '现场不存在', 404);
    return { worksiteId: site.id, draft: site.draft, materials: site.checkedIds.filter(id => !site.excludedIds.includes(id)).map(id => {
      const asset = state.assets.find(asset => asset.id === id);
      return { id: asset.id, title: asset.title, summary: asset.summary, blocks: asset.blocks };
    }) };
  }
  async close() {
    await this.#queue;
    if (this.#lock) { await this.#lock.close(); this.#lock = undefined; await unlink(`${this.file}.lock`); }
  }
}
