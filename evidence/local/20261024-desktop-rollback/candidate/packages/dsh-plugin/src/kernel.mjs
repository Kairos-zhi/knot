import { randomUUID } from 'node:crypto';
import { normalizeCanvasSnapshot } from '../lib/snapshot.js';
import { reduceWorkspace } from '../lib/workspace-state.js';

export class KontError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export const reject = (code, message, status) => { throw new KontError(code, message, status); };
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const text = (value, max, name) => {
  if (typeof value !== 'string' || value.length > max) reject('INVALID_INPUT', `${name}格式或长度无效`);
  return value;
};
const id = value => typeof value === 'string' && value.trim().length > 0;
const only = (value, keys) => Object.keys(value).every(key => keys.includes(key));
export function normalizeSnapshot(snapshot) {
  const result = normalizeCanvasSnapshot(snapshot);
  if (!result.ok) reject(result.error.code, result.error.message, 400);
  return result.value;
}
const event = (type, details) => ({ type, ...details });

/** Narrow Headless adapter over the frozen Knot model and validation rules.
 * This is the sole operation path for browser and external protocol callers.
 * Original renderer/tool/generation commands remain explicitly unsupported.
 */
export function applyCommand(next, command) {
  if (!isRecord(command) || !id(command.type)) reject('INVALID_COMMAND', '操作格式无效');
  switch (command.type) {
    case 'knot.create': {
      const assetId = command.id ?? `knot_${randomUUID()}`;
      if (!id(assetId)) reject('INVALID_ID', 'Invalid asset identity');
      if (assetId === 'root') reject('RESERVED_ID', 'root belongs to the engine');
      if (next.assets.some(asset => asset.id === assetId)) reject('DUPLICATE_ID', 'Asset identity already exists');
      const data = command.data ?? {};
      if (!isRecord(data)) reject('INVALID_COMMAND', 'knot.create data must be an object');
      const asset = { id: assetId, title: data.title ?? '', summary: data.summary ?? '', src: data.src ?? '', chain_id: data.chain_id ?? '',
        ...(data.blocks !== undefined ? { blocks: structuredClone(data.blocks) } : {}),
        ...(command.position !== undefined ? { position: structuredClone(command.position) } : {}) };
      next.assets.push(asset);
      return { value: assetId, event: event('knot.created', { id: assetId, data: asset }) };
    }
    case 'knot.update': {
      const asset = next.assets.find(asset => asset.id === command.id);
      if (!asset) reject('NOT_FOUND', `no asset: ${command.id}`);
      if (!isRecord(command.patch) || !only(command.patch, ['title', 'summary', 'src', 'chain_id', 'blocks', 'position', 'token'])) reject('INVALID_COMMAND', 'Unsupported knot patch fields');
      Object.assign(asset, structuredClone(command.patch));
      return { value: command.id, event: event('knot.updated', { id: command.id, patch: structuredClone(command.patch) }) };
    }
    case 'rope.connect':
    case 'rope.disconnect': {
      const fromId = command.fromId ?? command.from ?? command.sourceNodeID;
      const toId = command.toId ?? command.to ?? command.targetNodeID;
      if (!id(fromId) || !id(toId)) reject('INVALID_COMMAND', `${command.type} requires fromId and toId`);
      if (!next.assets.some(asset => asset.id === fromId) || !next.assets.some(asset => asset.id === toId)) reject('NOT_FOUND', 'Rope endpoint does not exist');
      const index = next.edges.findIndex(edge => edge.sourceNodeID === fromId && edge.targetNodeID === toId);
      if (command.type === 'rope.connect') {
        if (command.fixed !== undefined && typeof command.fixed !== 'boolean') reject('INVALID_COMMAND', 'fixed must be boolean');
        if (index >= 0) {
          if (!command.fixed || next.edges[index].data?.fixed) return { value: true };
          next.edges[index].data = { ...next.edges[index].data, fixed: true };
        } else next.edges.push({ sourceNodeID: fromId, targetNodeID: toId, sourcePortID: 'out', targetPortID: 'in', ...(command.fixed ? { data: { fixed: true } } : {}) });
        return { value: true, event: event('rope.connected', { fromId, toId, fixed: !!command.fixed }) };
      }
      if (index < 0) reject('NOT_FOUND', 'Rope does not exist');
      next.edges.splice(index, 1);
      return { value: true, event: event('rope.disconnected', { fromId, toId }) };
    }
    case 'asset.add': { // Compatibility adapter for the discarded first UI candidate.
      const title = text(command.title, 200, '材料标题').trim();
      const content = text(command.content, 50000, '材料正文');
      if (!title || !content.trim()) reject('INVALID_INPUT', '请填写材料标题与正文');
      return applyCommand(next, { type: 'knot.create', data: { title, summary: content, blocks: [{ id: 'b1', source: 'manual', timestamp: new Date().toISOString(), provenance: [], content }] } });
    }
    case 'scene.create': { // Compatibility adapter; never a parallel model.
      const title = text(command.title, 200, '现场标题').trim();
      if (!title) reject('INVALID_INPUT', '请填写现场标题');
      const worksiteId = randomUUID();
      applyCommand(next, { type: 'worksite.create', id: worksiteId });
      next.titles[worksiteId] = title;
      applyCommand(next, { type: 'worksite.activate', worksiteId });
      applyCommand(next, { type: 'presentation.open', id: `view:${worksiteId}`, worksiteId });
      return { value: worksiteId, event: event('worksite.changed', { command: { type: 'worksite.create', id: worksiteId } }) };
    }
    default: {
      if (command.type.startsWith('worksite.') || command.type.startsWith('presentation.')) {
        const result = reduceWorkspace(next.workspace, command, next.assets.map(asset => asset.id));
        if (!result.ok) reject(result.error.code, result.error.message);
        next.workspace = result.value;
        if (command.type === 'worksite.create') next.titles[command.id] = command.id;
        return { value: structuredClone(next.workspace), event: event(command.type.startsWith('presentation.') ? 'presentation.changed' : 'worksite.changed', { command: structuredClone(command) }) };
      }
      reject('UNSUPPORTED_COMMAND', `This Headless slice does not implement: ${command.type}`);
    }
  }
}
