/** W3-A behavioral contract. Fixtures only; no model or HTTP calls. */
import { createHeadlessContainer } from './headless';
import { WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { KnotOperationService, OpResult, KnotEvent } from '../src/services/knot-operation-service';
import { KnotSelectionService } from '../src/services/knot-selection-service';
import { WorkspaceState, WorksiteState, WorksiteCommand } from '../src/knot-model';
import {
  LS_KEY, normalizeCanvasSnapshot, saveSnapshotLocal,
  loadSnapshotResult, loadSnapshotLocal, initializeSnapshotOnce,
} from '../src/services/asset-persistence';
import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

type Rig = { container: ReturnType<typeof createHeadlessContainer>; svc: KnotOperationService; selection: KnotSelectionService; doc: any };
type Assertion = { label: string; passed: boolean };
type GroupResult = { id: string; name: string; status: 'pass' | 'fail'; assertions: Assertion[]; error?: string };
const groups: GroupResult[] = [];
let current: GroupResult;
const resources = new Set<Rig>();
const reportPath = process.env.KNOT_WORKSITE_REPORT ? resolve(process.env.KNOT_WORKSITE_REPORT) : undefined;
const evidenceRoot = reportPath ? dirname(reportPath) : mkdtempSync(join(tmpdir(), 'knot-worksite-'));
mkdirSync(evidenceRoot, { recursive: true });
const adapterEvidence: Array<Record<string, unknown>> = [];

function check(condition: unknown, label: string, detail?: unknown): asserts condition {
  current.assertions.push({ label, passed: !!condition });
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${label}`);
  if (!condition) throw new Error(`${label}${detail === undefined ? '' : `\n${JSON.stringify(detail, null, 2)}`}`);
}
function equal(actual: unknown, expected: unknown, label: string): void {
  check(canonical(actual) === canonical(expected), label, { actual, expected });
}
function canonical(input: unknown): string {
  const ordered = (item: any): any => Array.isArray(item) ? item.map(ordered) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(input));
}
function value<T>(result: OpResult<T>, label: string): T {
  check(result?.ok === true, label, result);
  return result.value;
}
function rejected(result: OpResult<unknown>, label: string): void {
  check(result?.ok === false && !!result.error?.code && !!result.error?.message, label, result);
}
function clone<T>(input: T): T { return JSON.parse(JSON.stringify(input)); }
function fresh(): Rig {
  const container = createHeadlessContainer();
  container.bind(KnotOperationService).toSelf().inSingletonScope();
  const rig = { container, svc: container.get(KnotOperationService), selection: container.get(KnotSelectionService), doc: container.get(WorkflowDocument) };
  rig.svc.init();
  resources.add(rig);
  return rig;
}
function dispose(rig: Rig): void {
  (rig.svc as KnotOperationService & { dispose?: () => void }).dispose?.();
  rig.doc.dispose();
  rig.container.unbindAll();
  resources.delete(rig);
}
function asset(rig: Rig, id: string, provenance: string[] = []): string {
  return value(rig.svc.createKnot({ id, title: `标题-${id}`, summary: `材料-${id}`, src: 'fixture:2026-10-03', chain_id: `chain-${id}`,
    blocks: [{ id: 'b1', source: provenance.length ? 'generated' : 'manual', timestamp: '2026-10-03T00:00:00.000Z', provenance, content: `内容-${id}` }],
  } as any, { x: id.length * 17, y: id.length * 23 }, { source: 'fixture' }), `fixture asset ${id}`);
}
function command(rig: Rig, input: WorksiteCommand, source = 'human'): WorkspaceState {
  return value(rig.svc.executeWorksiteCommand(input, { source }), `execute ${input.type}`);
}
function worksite(rig: Rig, id: string): WorksiteState {
  const found = rig.selection.getWorkspace().worksites.find((site) => site.id === id);
  check(found, `worksite ${id} exists`);
  return found;
}
function activeSupply(rig: Rig): string[] {
  return worksite(rig, rig.selection.getWorkspace().activeWorksiteId).checkedIds;
}
function seed(rig: Rig, prefix = 'asset'): { a: string; b: string; result: string } {
  const a = asset(rig, `${prefix}-a`);
  const b = asset(rig, `${prefix}-b`);
  const result = asset(rig, `${prefix}-result`, [a]);
  value(rig.svc.connect(a, result, { fixed: true, source: 'fixture' }), 'fixture fixed edge');
  command(rig, { type: 'worksite.create', id: 'A', assetId: a, conversationId: 'conversation-A' });
  command(rig, { type: 'worksite.create', id: 'B', assetId: b, conversationId: 'conversation-B' });
  return { a, b, result };
}
function activate(rig: Rig, id: string): void { command(rig, { type: 'worksite.activate', worksiteId: id }); }
function supply(rig: Rig, id: string, assetId: string, mode: 'connect' | 'exclude' | 'suggest'): void {
  command(rig, { type: 'worksite.supply', worksiteId: id, assetId, mode });
}
function memoryStorage(initial?: string) {
  const records = new Map<string, string>();
  if (initial !== undefined) records.set(LS_KEY, initial);
  return { getItem(key: string) { return records.get(key) ?? null; }, setItem(key: string, raw: string) { records.set(key, raw); } };
}
async function group(id: string, name: string, run: () => void | Promise<void>): Promise<void> {
  current = { id, name, status: 'pass', assertions: [] };
  console.log(`\n== ${id} ${name} ==`);
  try { await run(); } catch (error) {
    current.status = 'fail';
    current.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(current.error);
  }
  groups.push(current);
  for (const rig of [...resources]) {
    try { dispose(rig); } catch (error) {
      current.status = 'fail';
      current.error = `${current.error ?? ''}\ncleanup: ${error instanceof Error ? error.stack : String(error)}`;
    }
  }
  console.log(`[${current.status.toUpperCase()}] ${id}: ${current.assertions.filter(a => a.passed).length}/${current.assertions.length} assertions`);
}

async function main(): Promise<void> {
  await group('T1', 'different worksites preserve independent inputs and editable state', () => {
    const rig = fresh(); const { a, b } = seed(rig);
    supply(rig, 'A', a, 'connect'); supply(rig, 'A', b, 'exclude');
    command(rig, { type: 'worksite.update', worksiteId: 'A', draft: 'A 的草稿', agentId: 'agent-A' });
    activate(rig, 'A'); const aBefore = clone(worksite(rig, 'A'));
    supply(rig, 'B', b, 'connect'); supply(rig, 'B', a, 'exclude');
    command(rig, { type: 'worksite.update', worksiteId: 'B', draft: 'B 的草稿', agentId: 'agent-B' });
    activate(rig, 'B'); equal(activeSupply(rig), [b], 'B exposes only B supply');
    equal(worksite(rig, 'A'), aBefore, 'editing B did not mutate A');
    equal(worksite(rig, 'B').excludedIds, [a], 'B exclusion is independent');
    activate(rig, 'A'); equal(activeSupply(rig), [a], 'switching back retrieves A supply');
    equal(worksite(rig, 'A').excludedIds, [b], 'A exclusion preserved');
    equal([worksite(rig, 'A').draft, worksite(rig, 'A').agentId], ['A 的草稿', 'agent-A'], 'A draft and Agent restored on switch');
    equal([worksite(rig, 'B').draft, worksite(rig, 'B').agentId], ['B 的草稿', 'agent-B'], 'B draft and Agent remain intact');
  });

  await group('T2', 'one asset and one worksite serve multiple references', () => {
    const rig = fresh(); const { a } = seed(rig);
    command(rig, { type: 'worksite.create', id: 'C', assetId: a, conversationId: 'conversation-C' });
    command(rig, { type: 'presentation.open', id: 'A-window', worksiteId: 'A', kind: 'window' });
    command(rig, { type: 'presentation.open', id: 'A-card', worksiteId: 'A', kind: 'card' });
    command(rig, { type: 'worksite.update', worksiteId: 'A', draft: '两个呈现看到同一份草稿', agentId: 'agent-shared' });
    const state = rig.selection.getWorkspace();
    const aViews = state.presentations.filter(view => view.id.startsWith('A-'));
    equal(aViews.map(view => view.worksiteId), ['A', 'A'], 'both presentations refer to the same worksite ID');
    const resolved = aViews.map(view => state.worksites.find(site => site.id === view.worksiteId));
    check(resolved[0] === resolved[1], 'resolving both references yields one worksite object');
    equal(resolved.map(site => site?.draft), ['两个呈现看到同一份草稿', '两个呈现看到同一份草稿'], 'both references resolve the current draft');
    equal([worksite(rig, 'A').assetId, worksite(rig, 'C').assetId], [a, a], 'different worksites share the original asset ID');
    equal(rig.svc.getSnapshot().assets.filter(item => item.id === a).length, 1, 'shared asset content is serialized once');
    equal(rig.doc.getAllNodes().filter((node: any) => node.id === a).length, 1, 'the engine owns only one asset node');
    const detached = rig.selection.getWorkspace();
    check(detached !== rig.selection.getWorkspace(), 'workspace getter returns an independent snapshot');
    try { detached.worksites.find(site => site.id === 'A')!.draft = 'outside mutation'; } catch { /* A frozen clone is also a valid isolated snapshot. */ }
    equal(worksite(rig, 'A').draft, '两个呈现看到同一份草稿', 'a caller cannot mutate the service through its workspace snapshot');
  });

  await group('T3', 'preview, expansion and visual focus do not authorize inputs', () => {
    const rig = fresh(); const { a, b } = seed(rig); supply(rig, 'A', a, 'connect'); activate(rig, 'A');
    const before = clone(rig.selection.getWorkspace());
    check(rig.doc.getNode(b).toJSON().data.title.length > 0, 'other asset can be read for preview');
    rig.svc.expandKnot(b); rig.svc.focusKnot(b, { source: 'human:preview' });
    equal(rig.selection.getWorkspace(), before, 'preview and visual focus leave active worksite and supply untouched');
    equal(activeSupply(rig), [a], 'active worksite still exposes A supply after visually focusing B asset');
    rig.svc.focusKnot(null); equal(rig.selection.getWorkspace(), before, 'clearing visual focus also leaves workspace untouched');
  });

  await group('T4', 'manual exclusion survives suggestion and recovery while history remains', () => {
    const rig = fresh(); const { a, result } = seed(rig);
    supply(rig, 'A', a, 'connect'); supply(rig, 'B', a, 'connect'); activate(rig, 'A');
    const assetsBefore = clone(rig.svc.getSnapshot().assets); const bBefore = clone(worksite(rig, 'B'));
    supply(rig, 'A', a, 'exclude'); supply(rig, 'A', a, 'suggest');
    equal(worksite(rig, 'A').checkedIds, [], 'excluded asset is absent from future A supply');
    equal(worksite(rig, 'A').excludedIds, [a], 'automatic suggestion cannot undo manual exclusion');
    equal(worksite(rig, 'B'), bBefore, 'A exclusion leaves B intact');
    equal(rig.svc.getSnapshot().assets, assetsBefore, 'asset content and historical provenance are unchanged');
    const restored = fresh(); value(restored.svc.restoreSnapshot(rig.svc.getSnapshot(), { source: 'test:recovery' }), 'recover excluded state');
    supply(restored, 'A', a, 'suggest'); equal(worksite(restored, 'A').excludedIds, [a], 'restore and suggestion preserve exclusion');
    supply(restored, 'A', result, 'connect');
    equal(worksite(restored, 'A').checkedIds, [result], 'selecting an old result does not recursively authorize its parent');
    equal(restored.svc.getSnapshot().assets.find(item => item.id === result)?.blocks?.[0].provenance, [a], 'old provenance remains recorded');
    supply(restored, 'A', a, 'connect'); check(worksite(restored, 'A').checkedIds.includes(a), 'explicit reconnect restores supply');
    check(!worksite(restored, 'A').excludedIds.includes(a), 'explicit reconnect removes the corresponding exclusion');
  });

  await group('T5', 'presentation shape and closure do not change asset or conversation lifetime', () => {
    const rig = fresh(); seed(rig); command(rig, { type: 'presentation.open', id: 'view-1', worksiteId: 'A', kind: 'window', layout: { x: 1, y: 2, width: 300, height: 200 } });
    command(rig, { type: 'presentation.open', id: 'view-2', worksiteId: 'A', kind: 'window' });
    const before = clone(rig.svc.getSnapshot()); const events: KnotEvent[] = []; const off = rig.svc.subscribe(event => events.push(event));
    command(rig, { type: 'presentation.update', presentationId: 'view-1', kind: 'card' });
    command(rig, { type: 'presentation.update', presentationId: 'view-1', kind: 'icon', layout: { x: 11, y: 22 } });
    command(rig, { type: 'presentation.update', presentationId: 'view-1', closed: true });
    const after = rig.svc.getSnapshot(); off();
    equal(after.assets, before.assets, 'window/card/icon/close preserve original asset content');
    equal(after.edges, before.edges, 'presentation operations preserve engine relations');
    equal(after.workspace.worksites, before.workspace.worksites, 'presentation operations preserve conversations and worksite state');
    const view = after.workspace.presentations.find(item => item.id === 'view-1');
    equal([view?.kind, view?.closed, view?.worksiteId], ['icon', true, 'A'], 'closed icon still references A');
    equal(after.workspace.presentations.find(item => item.id === 'view-2')?.closed, false, 'closing one instance leaves the other open');
    check(events.length >= 3, 'presentation changes are publicly observable');
    check(events.every(event => !['knot.created', 'knot.deleted', 'generate.started', 'generate.completed'].includes(event.type) && !/cancel/i.test(event.type)), 'presentation events do not announce asset lifecycle or execution cancellation');
  });

  await group('T6', 'UTF8 file storage restores a fresh engine after destroying the old container', () => {
    let first: Rig | null = fresh(); const { a, b } = seed(first);
    supply(first, 'A', a, 'connect'); supply(first, 'A', b, 'exclude');
    command(first, { type: 'worksite.update', worksiteId: 'A', draft: '落盘草稿：之', agentId: 'agent-durable' });
    command(first, { type: 'presentation.open', id: 'saved-view', worksiteId: 'A', kind: 'card', layout: { x: 17, y: 29, width: 410, height: 260 } });
    activate(first, 'A'); const expected = clone(first.svc.getSnapshot());
    const fileDirectory = mkdtempSync(join(evidenceRoot, 'T6-file-storage-')); const file = join(fileDirectory, 'canvas-snapshot.json');
    let writes = 0; let reads = 0;
    const storage = {
      getItem(key: string): string | null { if (key !== LS_KEY) throw new Error(`unexpected key ${key}`); reads++; return existsSync(file) ? readFileSync(file, 'utf8') : null; },
      setItem(key: string, raw: string): void { if (key !== LS_KEY) throw new Error(`unexpected key ${key}`); writeFileSync(`${file}.next`, raw, 'utf8'); renameSync(`${file}.next`, file); writes++; },
    };
    value(saveSnapshotLocal(expected, storage), 'persist through the file storage adapter');
    check(existsSync(file) && !existsSync(`${file}.next`), 'atomic rename left a committed file and no staging file');
    check(readFileSync(file, 'utf8').includes('落盘草稿：之'), 'actual UTF8 file contains the draft');
    dispose(first); check(first.doc.disposed === true, 'old WorkflowDocument is disposed'); first = null;
    const second = fresh(); equal(second.doc.getAllNodes().length, 0, 'new engine begins without asset nodes');
    const loaded = value(loadSnapshotResult(storage), 'load committed file through public loader');
    equal(loaded, expected, 'loader reconstructed the saved document from disk');
    const initialized = initializeSnapshotOnce(second.doc, snapshot => second.svc.restoreSnapshot(snapshot, { source: 'test:file-recovery' }), storage);
    check(initialized.ok === true, 'initializeSnapshotOnce restored fresh service', initialized);
    equal(second.svc.getSnapshot(), expected, 'fresh engine, workspace and presentations equal the saved snapshot');
    equal(activeSupply(second), [a], 'restored active worksite exposes persisted supply');
    check(writes === 1 && reads >= 2, 'save and startup used storage reads, not the disposed service', { writes, reads });
    adapterEvidence.push({ group: 'T6', adapter: 'Node fs UTF8 getItem/setItem; .next then renameSync', file, writes, reads, destroyedOldDocument: true, freshContainer: true, scope: 'same-process fresh engine/container from filesystem; no HTTP or provider session' });
  });

  await group('T7', 'legacy and v4 formats preserve asset identity, blocks, provenance and fixed edges', () => {
    const origin = fresh(); seed(origin); const snapshot = clone(origin.svc.getSnapshot());
    snapshot.edges[0].data = { ...snapshot.edges[0].data, fixtureTag: 'legacy-edge-annotation' };
    const samples = [{ assets: snapshot.assets, edges: snapshot.edges }, { schemaVersion: 3, assets: snapshot.assets, edges: snapshot.edges }, snapshot];
    for (let i = 0; i < samples.length; i++) {
      const normalized = value(normalizeCanvasSnapshot(samples[i]), `normalize sample ${i}`);
      const target = fresh(); value(target.svc.restoreSnapshot(normalized, { source: 'test:legacy' }), `restore sample ${i}`);
      const saved = target.svc.getSnapshot();
      equal(saved.assets, snapshot.assets, `sample ${i}: ID/content/blocks/provenance/source/position survive real engine roundtrip`);
      equal(saved.edges, snapshot.edges, `sample ${i}: edges and fixed data survive real engine roundtrip`);
      check(saved.edges.some(edge => edge.data?.fixed === true), `sample ${i}: fixed edge exists`);
      check(saved.workspace.worksites.length > 0, `sample ${i}: workspace has a safe usable scope`);
      if (i === 2) equal(saved.workspace, snapshot.workspace, 'v4 workspace references survive alongside original data');
    }
    equal(LS_KEY, 'knot:canvas:v3', 'existing localStorage key remains compatible');
  });

  await group('T8', 'UI and Agent use equivalent rules and the old selection API remains scoped', () => {
    const ui = fresh(); const agent = fresh(); const uiIds = seed(ui); seed(agent);
    const uiEvents: KnotEvent[] = []; const agentEvents: KnotEvent[] = [];
    ui.svc.subscribe(event => uiEvents.push(event)); agent.svc.subscribe(event => agentEvents.push(event));
    const commands: WorksiteCommand[] = [
      { type: 'worksite.activate', worksiteId: 'A' },
      { type: 'worksite.update', worksiteId: 'A', draft: '共享规则', agentId: 'agent-fixture' },
      { type: 'worksite.supply', worksiteId: 'A', assetId: uiIds.a, mode: 'connect' },
      { type: 'presentation.open', id: 'same-view', worksiteId: 'A', kind: 'card', layout: { x: 8, y: 16 } },
    ];
    for (const input of commands) {
      value(ui.selection.execute(input, 'human'), `UI selection entry ${input.type}`);
      value(agent.svc.executeWorksiteCommand(input, { source: 'agent:fixture' }), `Agent operation entry ${input.type}`);
    }
    equal(ui.svc.getSnapshot(), agent.svc.getSnapshot(), 'different entry points yield the same actual document snapshot');
    const facts = (events: KnotEvent[]) => events.map(({ source: _source, seq: _seq, ...event }) => event);
    equal(facts(uiEvents), facts(agentEvents), 'public event facts are equivalent across entry points');
    check(uiEvents.length >= commands.length, 'UI selection path is visible through the operation event bus');
    check(uiEvents.every(event => event.source === 'human') && agentEvents.every(event => event.source === 'agent:fixture'), 'event source records the actual caller');
    const oldA = clone(worksite(ui, 'A')); const oldB = clone(worksite(ui, 'B')); activate(ui, 'B');
    const legacyId = ui.selection.getWorkspace().worksites.find(site => site.id !== 'A' && site.id !== 'B')?.id;
    check(legacyId, 'a separate legacy worksite remains available');
    const empty = ui.selection.getCheckedIds(); check(Object.isFrozen(empty), 'legacy supply snapshot is frozen');
    check(empty === ui.selection.getCheckedIds(), 'legacy getter returns a stable reference without mutations');
    ui.selection.toggle(uiIds.b); equal(ui.selection.getCheckedIds(), [uiIds.b], 'legacy toggle changes the legacy supply snapshot');
    equal(worksite(ui, legacyId).checkedIds, [uiIds.b], 'legacy toggle writes the fixed compatibility worksite');
    equal(worksite(ui, 'A'), oldA, 'legacy toggle does not leak into A');
    equal(worksite(ui, 'B'), oldB, 'legacy toggle does not leak into the currently active B');
    equal(empty, [], 'old frozen snapshot did not change after toggle');
    const valid = clone(ui.selection.getWorkspace()); ui.selection.toggle('missing-private-asset');
    equal(ui.selection.getWorkspace(), valid, 'legacy toggle cannot authorize an asset absent from the actual document');
    activate(ui, 'A'); equal(activeSupply(ui), [uiIds.a], 'activating A retrieves A supply after legacy edit');
    equal(ui.selection.getCheckedIds(), [uiIds.b], 'changing active worksite does not retarget the legacy getter');
  });

  await group('T9', 'invalid snapshots and failed storage do not replace valid state', () => {
    const rig = fresh(); const { a } = seed(rig); supply(rig, 'A', a, 'connect');
    command(rig, { type: 'presentation.open', id: 'good-view', worksiteId: 'A' });
    const valid = clone(rig.svc.getSnapshot()); const storage = memoryStorage(); value(saveSnapshotLocal(valid, storage), 'save last valid snapshot');
    const lastRaw = storage.getItem(LS_KEY);
    const invalid: Array<{ label: string; snapshot: any }> = [
      { label: 'unsupported future schema', snapshot: { ...clone(valid), schemaVersion: 99 } },
      { label: 'malformed v4 workspace', snapshot: { ...clone(valid), workspace: null } },
      { label: 'missing checked asset', snapshot: (() => { const s = clone(valid); s.workspace.worksites[0].checkedIds.push('gone'); return s; })() },
      { label: 'missing presentation worksite', snapshot: (() => { const s = clone(valid); s.workspace.presentations[0].worksiteId = 'gone'; return s; })() },
      { label: 'duplicate asset identity', snapshot: (() => { const s = clone(valid); s.assets.push(clone(s.assets[0])); return s; })() },
      { label: 'non-finite layout', snapshot: (() => { const s = clone(valid); s.workspace.presentations[0].layout.x = NaN; return s; })() },
      { label: 'missing edge endpoint', snapshot: (() => { const s = clone(valid); s.edges[0].targetNodeID = 'gone'; return s; })() },
    ];
    for (const test of invalid) {
      rejected(normalizeCanvasSnapshot(test.snapshot), `${test.label}: normalization rejects explicitly`);
      rejected(rig.svc.restoreSnapshot(test.snapshot, { source: 'test:negative' }), `${test.label}: restore rejects explicitly`);
      equal(rig.svc.getSnapshot(), valid, `${test.label}: current engine and workspace remain intact`);
      rejected(saveSnapshotLocal(test.snapshot, storage), `${test.label}: save rejects explicitly`);
      equal(storage.getItem(LS_KEY), lastRaw, `${test.label}: last valid raw storage remains intact`);
    }
    const forgedWorkspace = clone(valid.workspace); forgedWorkspace.worksites[0].checkedIds.push('outside-document');
    rejected((rig.selection.restoreWorkspace as any)(forgedWorkspace, 'test:external-catalog', ['outside-document']), 'external asset catalog cannot authorize a missing workspace reference');
    equal(rig.svc.getSnapshot(), valid, 'rejected external catalog leaves current document and workspace intact');
    rejected((rig.selection.execute as any)({ type: 'worksite.supply', worksiteId: 'A', assetId: 'outside-document', mode: 'connect' }, 'test:external-catalog', ['outside-document']), 'external asset catalog cannot authorize a missing supply asset');
    equal(rig.svc.getSnapshot(), valid, 'rejected external supply leaves current document and workspace intact');
    const failedStorage = { getItem: storage.getItem, setItem(_key: string, _raw: string) { throw new Error('fixture storage unavailable'); } };
    rejected(saveSnapshotLocal(valid, failedStorage), 'storage failure is reported'); equal(storage.getItem(LS_KEY), lastRaw, 'atomic adapter failure preserved committed data');
    const corrupt = memoryStorage('{bad json'); rejected(loadSnapshotResult(corrupt), 'corrupt JSON load reports a specific failure');
    equal(loadSnapshotLocal(corrupt), null, 'legacy loader safely reports corrupt data as unavailable');
    equal(corrupt.getItem(LS_KEY), '{bad json', 'read failure does not silently rewrite storage');
    const owner = {}; let restoreCalls = 0;
    const first = initializeSnapshotOnce(owner, () => { restoreCalls++; return { ok: true, value: undefined }; }, corrupt);
    check(first.ok === false && restoreCalls === 0, 'bad startup data is rejected before invoking restore', first);
    corrupt.setItem(LS_KEY, lastRaw!);
    const second = initializeSnapshotOnce(owner, () => { restoreCalls++; return { ok: true, value: undefined }; }, corrupt);
    check(second.ok === true && restoreCalls === 1, 'failed initialization can retry after data is repaired', second);
    initializeSnapshotOnce(owner, () => { restoreCalls++; return { ok: true, value: undefined }; }, corrupt);
    equal(restoreCalls, 1, 'successful initialization is applied only once per owner');
  });
  const failed = groups.filter(item => item.status === 'fail').length;
  const summary = { suite: 'Knot W3-A T1-T9', status: failed ? 'fail' : 'pass', groups, groupCount: groups.length,
    assertions: groups.reduce((count, item) => count + item.assertions.length, 0), passedAssertions: groups.reduce((count, item) => count + item.assertions.filter(a => a.passed).length, 0),
    failedGroups: failed, exitCode: failed ? 1 : 0, storageAdapters: adapterEvidence,
    boundaries: ['Maker self-test; independent Checker acceptance pending', 'synthetic assets only', 'no real model, HTTP, provider session or full UI verification'] };
  if (reportPath) writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nT1-T9: ${groups.length - failed} PASS / ${failed} FAIL; ${summary.passedAssertions}/${summary.assertions} assertions`);
  process.exit(summary.exitCode);
}
main().catch(error => { console.error(error instanceof Error ? error.stack : String(error)); process.exit(1); });
