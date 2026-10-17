import type { WorkflowDocument } from '@flowgram.ai/free-layout-editor';
import { WorkflowLineEntity } from '@flowgram.ai/free-layout-core';
import { assetsToWorkflowJSON, type AssetItem } from './asset-sync';
import type { WorkspaceState } from '../knot-model';
import type { OpResult } from './knot-operation-service';
import { createDefaultWorkspace, validateWorkspace } from './workspace-state';
import { KNOT_INPUT_PORT, KNOT_OUTPUT_PORT } from '../components/knot-edge/ports';

export const LS_KEY = 'knot:canvas:v3';
const WRITE_URL = 'http://localhost:3101/write';

export interface AssetWithPosition extends AssetItem {
  position?: { x: number; y: number };
}
export interface CanvasSnapshot {
  schemaVersion?: 4;
  workspace?: WorkspaceState;
  assets: AssetWithPosition[];
  edges: {
    sourceNodeID: string;
    targetNodeID: string;
    sourcePortID?: string;
    targetPortID?: string;
    data?: { fixed?: boolean } & Record<string, unknown>;
  }[];
}
export interface SnapshotStorage {
  getItem(key: string): string | null;
  /** Replace one value atomically, or throw while retaining the previous value. */
  setItem(key: string, value: string): void;
}
const failure = (code: string, message: string): OpResult<never> => ({ ok: false, error: { code, message } });
// Transaction/health bookkeeping only. Never hold a second copy of document assets.
const snapshotProblems = new WeakMap<WorkflowDocument, { code: string; message: string }>();
export function getSnapshotProblem(document: WorkflowDocument): { code: string; message: string } | undefined {
  const problem = snapshotProblems.get(document);
  return problem ? { ...problem } : undefined;
}
export function setSnapshotProblem(document: WorkflowDocument, problem?: { code: string; message: string }): void {
  if (problem) snapshotProblems.set(document, Object.freeze({ ...problem }));
  else snapshotProblems.delete(document);
}
const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Detach plain input before validation. Accessors, sparse arrays and toJSON hooks are
 * not snapshot data, and must not change values between validation and import. */
function readData(value: unknown, seen = new Set<object>()): any {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new Error('Snapshot must contain finite, acyclic plain data');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new Error('Non-plain snapshot object');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol snapshot fields are unsupported');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(descriptors).some(key => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) throw new Error('Invalid array fields');
      return Array.from({ length: value.length }, (_, index) => {
        const item = descriptors[index];
        if (!item || !('value' in item)) throw new Error('Sparse or accessor array');
        return readData(item.value, seen);
      });
    }
    const result = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!('value' in descriptor)) throw new Error('Accessor snapshot fields are unsupported');
      result[key] = readData(descriptor.value, seen);
    }
    return result;
  } finally { seen.delete(value); }
}

export function serializeCanvas(document: WorkflowDocument, workspace?: WorkspaceState): CanvasSnapshot {
  const assets: AssetWithPosition[] = [];
  document.getAllNodes().forEach(node => {
    const json = node.toJSON() as { type?: string; data?: Partial<AssetItem>; meta?: { position?: { x: number; y: number } } };
    if (json.type !== 'knot') return;
    assets.push({ id: node.id, title: json.data?.title ?? '', summary: json.data?.summary ?? '',
      src: json.data?.src ?? '', chain_id: json.data?.chain_id ?? '',
      position: json.meta?.position, blocks: json.data?.blocks });
  });
  const json = document.toJSON() as { edges?: CanvasSnapshot['edges'] };
  return JSON.parse(JSON.stringify({ assets, edges: json.edges ?? [],
    ...(workspace ? { schemaVersion: 4, workspace } : {}) }));
}

/** The engine's root and line entities share the asset identity namespace. */
export function normalizeCanvasSnapshot(input: unknown): OpResult<CanvasSnapshot> {
  try {
    const value = readData(input);
    if (!isRecord(value) || !Array.isArray(value.assets)) return failure('INVALID_SNAPSHOT', 'Snapshot needs an assets array');
    if (value.schemaVersion !== undefined && value.schemaVersion !== 3 && value.schemaVersion !== 4) {
      return failure('UNSUPPORTED_VERSION', 'Unsupported snapshot schemaVersion');
    }
    if (value.schemaVersion !== 4 && value.workspace !== undefined) return failure('INVALID_SNAPSHOT', 'workspace needs schemaVersion 4');
    const assets = new Set<string>();
    for (const asset of value.assets) {
      if (!isRecord(asset) || !id(asset.id) || !['title', 'summary', 'src', 'chain_id'].every(key => typeof asset[key] === 'string')) {
        return failure('INVALID_SNAPSHOT', 'Invalid asset fields');
      }
      if (asset.id === 'root') return failure('RESERVED_ID', 'root belongs to the engine, not an asset');
      if (assets.has(asset.id)) return failure('DUPLICATE_ID', 'Duplicate asset identity');
      assets.add(asset.id);
      if (asset.position !== undefined && (!isRecord(asset.position) || !finite(asset.position.x) || !finite(asset.position.y))) {
        return failure('INVALID_SNAPSHOT', 'Invalid asset position');
      }
      if (asset.blocks !== undefined) {
        if (!Array.isArray(asset.blocks)) return failure('INVALID_SNAPSHOT', 'blocks must be an array');
        const blockIds = new Set<string>();
        for (const block of asset.blocks) {
          if (!isRecord(block) || !id(block.id) || blockIds.has(block.id)
            || !['manual', 'generated'].includes(block.source) || typeof block.timestamp !== 'string'
            || typeof block.content !== 'string' || !Array.isArray(block.provenance) || !block.provenance.every(id)) {
            return failure('INVALID_SNAPSHOT', 'Invalid or duplicate block');
          }
          blockIds.add(block.id);
        }
      }
    }
    const edges = value.edges === undefined && value.schemaVersion !== 4 ? assetsToWorkflowJSON(value.assets).edges : value.edges;
    if (!Array.isArray(edges)) return failure('INVALID_SNAPSHOT', 'edges must be an array');
    const identities = new Set<string>();
    const engineIds = new Set<string>();
    for (const edge of edges) {
      if (!isRecord(edge) || !id(edge.sourceNodeID) || !id(edge.targetNodeID)
        || (edge.sourcePortID !== undefined && edge.sourcePortID !== KNOT_OUTPUT_PORT.portID)
        || (edge.targetPortID !== undefined && edge.targetPortID !== KNOT_INPUT_PORT.portID)
        || (edge.data !== undefined && (!isRecord(edge.data)
          || (edge.data.fixed !== undefined && typeof edge.data.fixed !== 'boolean')))) {
        return failure('INVALID_SNAPSHOT', 'Invalid edge fields or unsupported ports');
      }
      if (!assets.has(edge.sourceNodeID) || !assets.has(edge.targetNodeID)) return failure('MISSING_REFERENCE', 'Edge references a missing asset');
      const key = JSON.stringify([edge.sourceNodeID, edge.sourcePortID ?? 'out', edge.targetNodeID, edge.targetPortID ?? 'in']);
      const engineId = WorkflowLineEntity.portInfoToLineId({ from: edge.sourceNodeID, to: edge.targetNodeID,
        fromPort: edge.sourcePortID, toPort: edge.targetPortID });
      if (identities.has(key) || engineIds.has(engineId) || assets.has(engineId) || engineId === 'root') {
        return failure('DUPLICATE_ID', 'Colliding node or edge identity');
      }
      identities.add(key); engineIds.add(engineId);
    }
    const workspace = validateWorkspace(value.schemaVersion === 4 ? value.workspace : createDefaultWorkspace(), assets);
    if (!workspace.ok) return workspace;
    return { ok: true, value: JSON.parse(JSON.stringify({ schemaVersion: 4, assets: value.assets, edges, workspace: workspace.value })) };
  } catch (error) { return failure('INVALID_SNAPSHOT', error instanceof Error ? error.message : String(error)); }
}

export function saveSnapshotLocal(snapshot: CanvasSnapshot, storage?: SnapshotStorage): OpResult<void> {
  const checked = normalizeCanvasSnapshot(snapshot);
  if (!checked.ok) return checked;
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = target.getItem(LS_KEY);
    if (raw !== null) {
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return failure('INVALID_STORED_SNAPSHOT', 'Corrupt stored bytes cannot be overwritten automatically'); }
      const previous = normalizeCanvasSnapshot(parsed);
      if (!previous.ok) return previous;
      if (isRecord(parsed) && parsed.schemaVersion === 4 && snapshot.workspace === undefined) {
        return failure('WORKSPACE_REQUIRED', 'A legacy writer cannot strip stored worksite state');
      }
    }
    target.setItem(LS_KEY, JSON.stringify(checked.value));
    return { ok: true, value: undefined };
  } catch (error) { return failure('STORAGE_ERROR', error instanceof Error ? error.message : String(error)); }
}

export function loadSnapshotResult(storage?: SnapshotStorage): OpResult<CanvasSnapshot | null> {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(LS_KEY);
    if (raw === null) return { ok: true, value: null };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return failure('INVALID_SNAPSHOT', 'Stored bytes are not valid JSON'); }
    return normalizeCanvasSnapshot(parsed);
  } catch (error) { return failure('STORAGE_ERROR', error instanceof Error ? error.message : String(error)); }
}
export function loadSnapshotLocal(storage?: SnapshotStorage): CanvasSnapshot | null {
  const result = loadSnapshotResult(storage);
  return result.ok ? result.value : null;
}
// Lifecycle bookkeeping only; all state remains in the existing kernel service.
const initializedOwners = new WeakSet<object>();
export function initializeSnapshotOnce(owner: object, restore: (snapshot: CanvasSnapshot) => OpResult<void>,
  storage?: SnapshotStorage): OpResult<void> {
  if (initializedOwners.has(owner)) return { ok: true, value: undefined };
  const loaded = loadSnapshotResult(storage);
  if (!loaded.ok) return loaded;
  try {
    if (loaded.value) { const result = restore(loaded.value); if (!result.ok) return result; }
    initializedOwners.add(owner);
    return { ok: true, value: undefined };
  } catch (error) { return failure('RESTORE_FAILED', String(error)); }
}

export async function pushSnapshotToAssetFile(snapshot: CanvasSnapshot): Promise<boolean> {
  try {
    const response = await fetch(WRITE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets: snapshot.assets, edges: snapshot.edges }) });
    return (await response.json() as { ok?: boolean }).ok === true;
  } catch { return false; }
}

export function watchCanvas(document: WorkflowDocument, opts?: {
  debounceMs?: number; initialSaveMs?: number; getSnapshot?: () => CanvasSnapshot;
  subscribe?: (listener: () => void) => () => void; storage?: SnapshotStorage;
  onError?: (error: { code: string; message: string }) => void; onSaved?: () => void;
}): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const report = (error: { code: string; message: string }) => { try { opts?.onError?.(error); } catch { /* observer isolation */ } };
  const fire = () => {
    timer = undefined;
    const problem = getSnapshotProblem(document);
    if (problem) { report(problem); return; }
    if (document.disposed) return;
    try {
      const snapshot = opts?.getSnapshot?.() ?? serializeCanvas(document);
      const saved = saveSnapshotLocal(snapshot, opts?.storage);
      if (!saved.ok) { report(saved.error); return; }
      dirty = false;
      try { opts?.onSaved?.(); } catch { /* observer isolation */ }
      // Existing remote writer remains assets/edges-only; local worksite sync is not a remote claim.
      void pushSnapshotToAssetFile(snapshot);
    } catch (error) { report({ code: 'SNAPSHOT_ERROR', message: String(error) }); }
  };
  const schedule = () => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, opts?.debounceMs ?? 1200);
  };
  const subscription = document.onContentChange(schedule);
  const unsubscribe = opts?.subscribe?.(schedule);
  timer = setTimeout(fire, opts?.initialSaveMs ?? 1500);
  return () => {
    if (timer) clearTimeout(timer);
    subscription.dispose(); unsubscribe?.();
    if (dirty && !document.disposed) fire();
  };
}
