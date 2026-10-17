/** Maker request contract tests: synthetic receiver only; no independent acceptance. */
import { createHeadlessContainer } from './headless';
import { WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { SelectionService } from '@flowgram.ai/free-layout-editor';
import { KnotOperationService, OpResult, KnotEvent } from '../src/services/knot-operation-service';
import { KnotSelectionService } from '../src/services/knot-selection-service';
import { ExpandService } from '../src/services/expand-service';
import { KnotBlock, KnotNode, WorksiteCommand, WorkspaceChange } from '../src/knot-model';
import { LS_KEY, SnapshotStorage, getSnapshotProblem, initializeSnapshotOnce,
  saveSnapshotLocal, serializeCanvas } from '../src/services/asset-persistence';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

type Payload = { worksiteId: string; assetId: string | null; conversationId: string | null;
  draft: string; agentId: string | null;
  checked: Array<{ id: string; title: string; summary: string; blocks: KnotBlock[] }> };
type Adapter = {
  prepareWorksiteRequest(compiler: KnotOperationService, worksiteId: string): OpResult<Payload>;
  dispatchWorksiteRequest<T>(compiler: KnotOperationService, worksiteId: string,
    receiver: (payload: Payload) => T | Promise<T>): Promise<OpResult<{ payload: Payload; response: T }>>;
};
type Rig = { container: ReturnType<typeof createHeadlessContainer>; svc: KnotOperationService;
  selection: KnotSelectionService; visual: SelectionService; expand: ExpandService; doc: any };
type Group = { id: string; title: string; status: 'pass' | 'fail'; assertions: number; error?: string };
const groups: Group[] = [];
const observations: any[] = [];
const storageEvidence: any[] = [];
const resources = new Set<Rig>();
const lines: string[] = [];
let current: Group;
let adapter: Partial<Adapter> = {};
let loadError: string | undefined;
const reportPath = resolve(process.env.KNOT_REQUEST_REPORT ?? join(tmpdir(), 'knot-request-report.json'));
const evidenceRoot = dirname(reportPath);
mkdirSync(evidenceRoot, { recursive: true });
const originalFetch = globalThis.fetch;
let fetchAttempts = 0;
globalThis.fetch = (async () => { fetchAttempts++; throw new Error('real network forbidden by fixture'); }) as typeof fetch;

function log(text: string): void { lines.push(text); console.log(text); }
function assert(condition: unknown, label: string, detail?: unknown): asserts condition {
  current.assertions++; if (!condition) throw new Error(`${label}: ${JSON.stringify(detail)}`);
  log(`  PASS ${label}`);
}
function canonical(value: unknown): string {
  const order = (item: any): any => Array.isArray(item) ? item.map(order)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(k => [k, order(item[k])])) : item;
  return JSON.stringify(order(value));
}
function equal(actual: unknown, wanted: unknown, label: string): void {
  assert(canonical(actual) === canonical(wanted), label, { actual, wanted });
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function ok<T>(result: OpResult<T>, label: string): T { assert(result?.ok, label, result); return result.value; }
function fixture<T>(result: OpResult<T>, label: string): T {
  if (!result?.ok) throw new Error(`${label}: ${JSON.stringify(result)}`); return result.value;
}
function fresh(): Rig {
  const container = createHeadlessContainer(); container.bind(KnotOperationService).toSelf().inSingletonScope();
  const rig = { container, svc: container.get(KnotOperationService), selection: container.get(KnotSelectionService),
    visual: container.get(SelectionService), expand: container.get(ExpandService), doc: container.get(WorkflowDocument) };
  rig.svc.init(); resources.add(rig); return rig;
}
function dispose(rig: Rig): void { rig.svc.dispose(); rig.doc.dispose(); rig.container.unbindAll(); resources.delete(rig); }
function command(rig: Rig, value: WorksiteCommand): void {
  fixture(rig.svc.executeWorksiteCommand(value, { source: 'fixture:request' }), `fixture ${value.type}`);
}
function supply(rig: Rig, site: string, assetId: string, mode: 'connect' | 'exclude' | 'suggest'): void {
  command(rig, { type: 'worksite.supply', worksiteId: site, assetId, mode });
}
function data(id: string, provenance: string[] = []): KnotNode['data'] {
  return { title: `标题-${id}`, summary: `摘要-${id}`, token: 31, src: 'fixture:request', chain_id: `chain-${id}`,
    blocks: [{ id: 'b1', content: `正文首块-${id}`, source: provenance.length ? 'generated' : 'manual',
      provenance: [...provenance], timestamp: '2026-10-04T00:00:00.000Z' },
    { id: 'b2', content: `正文末块-${id}`, source: 'manual', provenance: [], timestamp: '2026-10-04T00:01:00.000Z' }] };
}
function populated(prefix: string) {
  const rig = fresh(); const ids = { a: `${prefix}-association-A`, b: `${prefix}-association-B`, m: `${prefix}-M`, r: `${prefix}-R` };
  for (const id of Object.values(ids)) fixture(rig.svc.createKnot({ id, ...data(id, id === ids.r ? [ids.m] : []) } as any,
    { x: 11, y: 13 }, { source: 'fixture:request' }), `fixture asset ${id}`);
  fixture(rig.svc.connect(ids.m, ids.r, { fixed: true, source: 'fixture:history' }), 'fixture historical edge');
  command(rig, { type: 'worksite.create', id: 'A', assetId: ids.a, conversationId: 'conversation-A' });
  command(rig, { type: 'worksite.create', id: 'B', assetId: ids.b, conversationId: 'conversation-B' });
  command(rig, { type: 'worksite.update', worksiteId: 'A', draft: '请求现场 A：之', agentId: 'agent-A' });
  command(rig, { type: 'worksite.update', worksiteId: 'B', draft: '请求现场 B', agentId: 'agent-B' });
  return { rig, ids };
}
function state(rig: Rig) {
  return { snapshot: serializeCanvas(rig.doc, rig.selection.getWorkspace()), health: getSnapshotProblem(rig.doc) ?? null,
    visual: rig.visual.selection.map(node => node.id), expanded: rig.expand.getExpandedId(), tool: rig.svc.getTool() };
}
function patch(target: any, key: string, fn: (...args: any[]) => any): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value: fn });
  return () => { if (descriptor) Object.defineProperty(target, key, descriptor); else delete target[key]; };
}
function mutate(payload: Payload): void {
  const attempts = [() => { payload.draft = 'receiver/caller draft'; },
    () => { payload.checked[0].title = 'receiver/caller title'; },
    () => { payload.checked[0].blocks[0].content = 'receiver/caller block'; },
    () => { payload.checked[0].blocks[0].provenance.push('receiver/caller parent'); },
    () => { payload.checked.push({ id: 'injected', ...data('injected') } as any); }];
  for (const attempt of attempts) { try { attempt(); } catch { /* Frozen detached payload is valid. */ } }
}

/** Instrument only the public adapter call. Full state projections remain outside content counting. */
async function observe(rig: Rig, worksiteId: unknown, label: string, mode: 'prepare' | 'dispatch' = 'dispatch', receiverMutates = false) {
  const entry = mode === 'prepare' ? adapter.prepareWorksiteRequest : adapter.dispatchWorksiteRequest;
  if (typeof entry !== 'function') assert(false, `${label}: public ${mode} API exists (missing API is RED)`, loadError);
  const before = clone(state(rig)); const nodeReads: Record<string, number> = {};
  const captures: Payload[] = []; const serviceEvents: KnotEvent[] = []; const workspaceChanges: WorkspaceChange[] = [];
  let documentChanges = 0, workspaceNotifications = 0, viewChanges = 0, runCalls = 0, scheduled = 0, compilerCalls = 0;
  const fetchBefore = fetchAttempts; const undo: Array<() => void> = [];
  const offEvent = rig.svc.subscribe(event => serviceEvents.push(clone(event)));
  const offChange = rig.selection.subscribeChanges(change => workspaceChanges.push(clone(change)));
  const offWorkspace = rig.selection.subscribe(() => workspaceNotifications++);
  const offView = rig.expand.onExpandedChange(() => viewChanges++);
  const docSubscription = rig.doc.onContentChange(() => documentChanges++);
  let pending: any, result: any, thrown: unknown, stateUnchanged = false;
  try {
    for (const node of rig.doc.getAllNodes()) {
      const original = node.toJSON; nodeReads[node.id] = 0;
      undo.push(patch(node, 'toJSON', function(this: any, ...args: any[]) { nodeReads[node.id]++; return original.apply(this, args); }));
    }
    const compiler = rig.svc.compileWorksiteInput;
    undo.push(patch(rig.svc, 'compileWorksiteInput', function(this: KnotOperationService, id: string) {
      compilerCalls++; return compiler.call(this, id);
    }));
    for (const key of ['generateFromSelection', 'growKnot']) undo.push(patch(rig.svc, key, () => {
      runCalls++; throw new Error(`forbidden Run entry ${key}`);
    }));
    for (const key of ['setTimeout', 'setInterval', 'queueMicrotask']) undo.push(patch(globalThis, key, () => {
      scheduled++; throw new Error(`forbidden request scheduling ${key}`);
    }));
    pending = mode === 'prepare'
      ? adapter.prepareWorksiteRequest!(rig.svc, worksiteId as string)
      : adapter.dispatchWorksiteRequest!(rig.svc, worksiteId as string, payload => {
        captures.push(clone(payload)); if (receiverMutates) mutate(payload); return { capturedWorksiteId: payload.worksiteId };
      });

  } catch (error) { thrown = error; }
  finally { undo.reverse().forEach(fn => fn()); offEvent(); offChange(); offWorkspace(); offView(); docSubscription.dispose(); }
  stateUnchanged = canonical(before) === canonical(state(rig));
  try { result = await pending; } catch (error) { thrown = error; }
  const receipt = { label, mode, worksiteId, nodeReads, compilerCalls, captures, result,
    serviceEvents, workspaceChanges, documentChanges, workspaceNotifications, viewChanges,
    runCalls, scheduled, fetch: fetchAttempts - fetchBefore, stateUnchanged };
  observations.push(clone(receipt)); log(`  OBSERVE ${label}: ${JSON.stringify({ nodeReads, compilerCalls, receiverCalls: captures.length })}`);
  assert(thrown === undefined && typeof result?.ok === 'boolean' && typeof result?.then !== 'function'
    && receipt.stateUnchanged && compilerCalls === 1 && !serviceEvents.length && !workspaceChanges.length
    && !documentChanges && !workspaceNotifications && !viewChanges && !runCalls && !scheduled && !receipt.fetch,
    `${label}: current compilation in call stack; detached result; no writes, Run, scheduling or network`, { receipt, thrown: String(thrown) });
  return { result: result as OpResult<any>, receipt, captures };
}
type Probe = Awaited<ReturnType<typeof observe>>;
function visits(probe: Probe, wanted: string[], label: string): void {
  equal(Object.entries(probe.receipt.nodeReads).filter(([, n]) => n > 0).map(([id]) => id).sort(), [...wanted].sort(), `${label}: actual content visits`);
}
function dispatched(probe: Probe, label: string): Payload {
  assert(probe.result.ok && probe.captures.length === 1 && canonical(probe.result.value.payload) === canonical(probe.captures[0]),
    `${label}: successful returned payload equals exactly one actual receiver capture`, probe);
  return probe.captures[0];
}
function blocked(probe: Probe, code?: string): void {
  assert(probe.result.ok === false && !('value' in probe.result) && !!probe.result.error.code && !!probe.result.error.message
    && (!code || probe.result.error.code === code) && probe.captures.length === 0,
    `${probe.receipt.label}: error without generated payload or receiver call`, probe.result);
}
async function group(id: string, title: string, run: () => void | Promise<void>): Promise<void> {
  if (process.env.KNOT_REQUEST_ONLY_GROUP && process.env.KNOT_REQUEST_ONLY_GROUP !== id) return;
  current = { id, title, status: 'pass', assertions: 0 }; log(`\n== ${id} ${title} ==`);
  try { await run(); } catch (error) { current.status = 'fail'; current.error = error instanceof Error ? error.stack : String(error); log(current.error ?? 'error'); }
  for (const rig of [...resources]) { try { dispose(rig); } catch (error) { current.status = 'fail'; current.error = `${current.error ?? ''}\ncleanup: ${String(error)}`; } }
  groups.push(current); log(`[${current.status}] ${id}: ${current.assertions} assertions`);
}

async function main(): Promise<void> {
  const moduleFile = resolve(__dirname, '../src/services/knot-worksite-request.ts');
  if (existsSync(moduleFile)) { try { adapter = await import(pathToFileURL(moduleFile).href); } catch (error) { loadError = String(error); } }
  else loadError = `Missing ${moduleFile}`;
  await group('Q1', 'explicit A keeps metadata and ignores association, active B, visual focus and presentation', async () => {
    const { rig, ids } = populated('explicit'); supply(rig, 'B', ids.m, 'connect');
    command(rig, { type: 'presentation.open', id: 'A-view', worksiteId: 'A', kind: 'window' });
    command(rig, { type: 'presentation.update', presentationId: 'A-view', kind: 'icon', closed: true });
    rig.svc.expandKnot(ids.m); rig.svc.focusKnot(ids.m); rig.doc.getNode(ids.m).toJSON();
    command(rig, { type: 'worksite.activate', worksiteId: 'B' });
    const probe = await observe(rig, 'A', 'explicit A empty request'); const payload = dispatched(probe, 'explicit A');
    equal(payload, { worksiteId: 'A', assetId: ids.a, conversationId: 'conversation-A', draft: '请求现场 A：之', agentId: 'agent-A', checked: [] }, 'metadata never supplies associated A, B or visual M');
    visits(probe, [], 'empty A'); equal(rig.selection.getWorkspace().activeWorksiteId, 'B', 'explicit request preserves active B');
  });
  await group('Q2', 'A exclusion removes M from actual dispatch while B is unchanged', async () => {
    const { rig, ids } = populated('exclusion'); supply(rig, 'A', ids.m, 'connect'); supply(rig, 'B', ids.m, 'connect');
    const bBefore = dispatched(await observe(rig, 'B', 'B before A exclusion'), 'B before');
    const mBefore = clone(rig.doc.getNode(ids.m).toJSON());
    supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.m, 'suggest');
    const a = await observe(rig, 'A', 'A excludes M'); equal(dispatched(a, 'excluded A').checked, [], 'actual A payload has no M'); visits(a, [], 'excluded A');
    const b = await observe(rig, 'B', 'B after A exclusion'); equal(dispatched(b, 'B after'), bBefore, 'actual B payload unchanged'); visits(b, [ids.m], 'B still supplies M');
    equal(rig.doc.getNode(ids.m).toJSON(), mBefore, 'M source asset unchanged');
  });
  await group('Q3', 'selected old R carries every block and history but never reads its M parent', async () => {
    const { rig, ids } = populated('history'); supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.r, 'connect');
    const before = clone(rig.svc.getSnapshot()); const probe = await observe(rig, 'A', 'R request'); const payload = dispatched(probe, 'R');
    equal(payload.checked, [{ id: ids.r, title: data(ids.r).title, summary: data(ids.r).summary, blocks: data(ids.r, [ids.m]).blocks }], 'actual payload preserves complete R and provenance M');
    visits(probe, [ids.r], 'R only'); equal(probe.receipt.nodeReads[ids.m], 0, 'historical M content was never accessed');
    equal(rig.svc.getSnapshot(), before, 'R history and fixed M-to-R edge remain unchanged');
  });
  await group('Q4', 'each preparation and dispatch compiles current draft, material contents and selection', async () => {
    const { rig, ids } = populated('current'); supply(rig, 'A', ids.m, 'connect');
    const first = ok((await observe(rig, 'A', 'first prepare', 'prepare')).result, 'initial prepare');
    command(rig, { type: 'worksite.update', worksiteId: 'A', draft: '最新请求草稿' });
    const changed = data(ids.m); changed.blocks![1].content = '最新正文末块';
    ok(rig.svc.updateKnot(ids.m, changed, { source: 'fixture:request' }), 'fixture public material update');
    const nextProbe = await observe(rig, 'A', 'prepare after update', 'prepare'); const next = ok(nextProbe.result, 'updated prepare');
    equal([next.draft, next.checked[0].blocks[1].content], ['最新请求草稿', '最新正文末块'], 'prepare sees current values');
    assert(canonical(first) !== canonical(next), 'earlier payload did not cache current values'); visits(nextProbe, [ids.m], 'current prepare');
    supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.r, 'connect');
    const final = await observe(rig, 'A', 'dispatch after selection update'); equal(dispatched(final, 'current dispatch').checked.map(item => item.id), [ids.r], 'dispatch recompiles current selected R'); visits(final, [ids.r], 'current dispatch');
    let release: ((value: string) => void) | undefined; let captured: Payload | undefined; let compilerCalls = 0;
    const compiler = { compileWorksiteInput(id: string) { compilerCalls++; return rig.svc.compileWorksiteInput(id); } };
    const pending = adapter.dispatchWorksiteRequest!(compiler as any, 'A', payload => {
      captured = clone(payload); return new Promise<string>(resolve => { release = resolve; });
    });
    assert(release && captured && compilerCalls === 1, 'pending receiver was invoked in the initial call stack after one current compile');
    command(rig, { type: 'worksite.update', worksiteId: 'A', draft: '接收替身等待时的新草稿' }); release('synthetic-complete');
    const completed = ok(await pending, 'pending synthetic receiver completes');
    equal([completed.payload, completed.response, compilerCalls], [captured, 'synthetic-complete', 1], 'completion returns receiver-time payload without recompiling changed scene');
  });
  await group('Q5', 'caller and receiver mutations cannot contaminate returned payload or live scene', async () => {
    const { rig, ids } = populated('detached'); supply(rig, 'A', ids.r, 'connect');
    const expected = dispatched(await observe(rig, 'A', 'baseline detached dispatch'), 'baseline'); const before = clone(state(rig));
    const prepared = ok((await observe(rig, 'A', 'caller prepare', 'prepare')).result, 'caller prepare succeeds'); mutate(prepared);
    const receiving = await observe(rig, 'A', 'mutating receiver', 'dispatch', true); const result = ok(receiving.result, 'receiver mutation dispatch succeeds');
    equal(result.payload, expected, 'receiver mutation cannot contaminate returned payload'); mutate(result.payload);
    equal(state(rig), before, 'all returned and receiver payload mutation attempts preserve live scene');
    equal(dispatched(await observe(rig, 'A', 'dispatch after mutation'), 'after mutation'), expected, 'future request has no caller or receiver injection');
  });
  await group('Q6', 'UTF8 disk restore destroys old container and fresh requests preserve A exclusion and B supply', async () => {
    const { rig, ids } = populated('disk'); supply(rig, 'A', ids.m, 'connect'); supply(rig, 'B', ids.m, 'connect');
    supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.r, 'connect');
    const aBefore = dispatched(await observe(rig, 'A', 'A before disk'), 'A before disk');
    const bBefore = dispatched(await observe(rig, 'B', 'B before disk'), 'B before disk');
    const snapshot = clone(rig.svc.getSnapshot()); const directory = mkdtempSync(join(evidenceRoot, 'Q6-UTF8-')); const file = join(directory, 'snapshot.json');
    let reads = 0, writes = 0;
    const storage: SnapshotStorage = { getItem(key) { if (key !== LS_KEY) throw new Error(key); reads++; return existsSync(file) ? readFileSync(file, 'utf8') : null; },
      setItem(key, raw) { if (key !== LS_KEY) throw new Error(key); writeFileSync(`${file}.next`, raw, 'utf8'); renameSync(`${file}.next`, file); writes++; } };
    ok(saveSnapshotLocal(snapshot, storage), 'actual atomic UTF8 file save'); const bytes = readFileSync(file, 'utf8');
    assert(bytes.includes('请求现场 A：之') && !existsSync(`${file}.next`), 'Chinese UTF8 bytes committed through rename');
    dispose(rig); assert(rig.doc.disposed === true, 'old document was destroyed'); const restored = fresh();
    equal(restored.doc.getAllNodes().length, 0, 'fresh container initially has no previous nodes');
    ok(initializeSnapshotOnce(restored.doc, value => restored.svc.restoreSnapshot(value, { source: 'fixture:request-disk' }), storage), 'startup restore reads actual file');
    const a = await observe(restored, 'A', 'fresh restored A'); const b = await observe(restored, 'B', 'fresh restored B');
    equal(dispatched(a, 'fresh A'), aBefore, 'fresh A still excludes M'); visits(a, [ids.r], 'fresh A');
    equal(dispatched(b, 'fresh B'), bBefore, 'fresh B still supplies M'); visits(b, [ids.m], 'fresh B');
    equal([readFileSync(file, 'utf8'), writes], [bytes, 1], 'requests do not rewrite saved bytes');
    storageEvidence.push({ file, reads, writes, oldDocumentDisposed: rig.doc.disposed, freshContainer: true, adapter: 'UTF8 .next + renameSync' });
  });
  await group('Q7', 'compiler failure, real selection transaction and quarantine never build or dispatch a payload', async () => {
    const { rig, ids } = populated('failure'); supply(rig, 'A', ids.r, 'connect');
    for (const bad of [undefined, '', 'missing-site']) { const probe = await observe(rig, bad, `invalid identity ${String(bad)}`); blocked(probe); visits(probe, [], 'invalid identity'); }
    const initial = clone(rig.selection.getWorkspace()); const tx = rig.selection.beginRestoreTransaction(); assert(tx, 'real public selection transaction begins');
    const wanted = clone(initial); wanted.worksites.find(item => item.id === 'A')!.draft = '事务提交的新草稿';
    let finishProbe: ReturnType<typeof observe> | undefined; const off = rig.selection.subscribeChanges(change => {
      if (change.type === 'workspace.restored') finishProbe = observe(rig, 'A', 'real finish notification');
    });
    try {
      const beforeRestore = await observe(rig, 'A', 'transaction begun'); blocked(beforeRestore, 'RESTORE_IN_PROGRESS'); visits(beforeRestore, [], 'transaction begun');
      ok(tx.restore(wanted, 'fixture:request-transaction'), 'owner stages real workspace');
      const staged = await observe(rig, 'A', 'transaction staged'); blocked(staged, 'RESTORE_IN_PROGRESS'); visits(staged, [], 'transaction staged');
      tx.finish(true); assert(finishProbe, 'actual finish callback observed'); const finish = await finishProbe;
      blocked(finish, 'RESTORE_IN_PROGRESS'); visits(finish, [], 'finish callback');
    } finally { off(); tx.finish(false); }
    equal(dispatched(await observe(rig, 'A', 'after finish returns'), 'post transaction').draft, '事务提交的新草稿', 'released transaction permits committed request');
    const before = clone(rig.svc.getSnapshot()); let importProbe: Promise<Probe> | undefined;
    const actualImport = rig.doc.fromJSON; const undoImport = patch(rig.doc, 'fromJSON', function(this: any, json: any) {
      importProbe = observe(rig, 'A', 'actual restore import callback'); return actualImport.call(this, json);
    });
    try { fixture(rig.svc.restoreSnapshot(before, { source: 'fixture:request-import' }), 'actual snapshot restore'); } finally { undoImport(); }
    assert(importProbe, 'actual document import callback observed'); const duringImport = await importProbe;
    blocked(duringImport, 'RESTORE_IN_PROGRESS'); visits(duringImport, [], 'restore import callback');
    let imports = 0; const undo = patch(rig.doc, 'fromJSON', () => { imports++; throw new Error('fixture import and rollback fail'); });
    try { const result = rig.svc.restoreSnapshot(before, { source: 'fixture:request-quarantine' }); assert(result.ok === false && result.error.code === 'ROLLBACK_FAILED', 'real rollback fails'); } finally { undo(); }
    equal(imports, 2, 'actual import and rollback both attempted'); equal(getSnapshotProblem(rig.doc)?.code, 'RECOVERY_REQUIRED', 'actual quarantine exists');
    const quarantined = await observe(rig, 'A', 'actual quarantined request'); blocked(quarantined, 'RECOVERY_REQUIRED'); visits(quarantined, [], 'quarantine');
    ok(rig.svc.restoreSnapshot(before, { source: 'fixture:request-recovery' }), 'explicit recovery releases quarantine');
    const malformed = data(ids.r, [ids.m]); malformed.blocks![0].provenance = null as any;
    ok(rig.svc.updateKnot(ids.r, malformed, { source: 'fixture:request-malformed' }), 'fixture actual malformed material');
    const invalidMaterial = await observe(rig, 'A', 'selected malformed material'); blocked(invalidMaterial); visits(invalidMaterial, [ids.r], 'malformed selected R only');
    // These construction-only controls add no alternate live store or material access.
    let compiles = 0, received = 0;
    const control = { compileWorksiteInput() { compiles++; return { ok: false, error: { code: 'FIXTURE_REJECTED', message: 'synthetic rejection' } } as const; } };
    const invalidReceiver = await adapter.dispatchWorksiteRequest!(control as any, 'A', undefined as any);
    assert(!invalidReceiver.ok && invalidReceiver.error.code === 'INVALID_RECEIVER' && compiles === 0, 'invalid receiver rejects before compilation');
    const propagated = await adapter.dispatchWorksiteRequest!(control as any, 'A', () => { received++; return 'unused'; });
    assert(!propagated.ok && propagated.error.code === 'FIXTURE_REJECTED' && compiles === 1 && received === 0 && !('value' in propagated), 'compiler error propagates without payload or receiver');
    const thrown = adapter.prepareWorksiteRequest!({ compileWorksiteInput() { throw new Error('synthetic compiler fault'); } } as any, 'A');
    assert(!thrown.ok && thrown.error.code === 'REQUEST_PREPARATION_FAILED' && !('value' in thrown), 'compiler throw returns preparation error without payload');
    fixture(rig.svc.updateKnot(ids.r, data(ids.r, [ids.m]), { source: 'fixture:request-valid-again' }), 'repair synthetic malformed fixture');
    const stable = clone(state(rig));
    for (const promiseFailure of [false, true]) {
      let receiverCalls = 0, compileCalls = 0; const compiler = { compileWorksiteInput(id: string) { compileCalls++; return rig.svc.compileWorksiteInput(id); } };
      const failure = await adapter.dispatchWorksiteRequest!(compiler as any, 'A', () => {
        receiverCalls++; if (promiseFailure) return Promise.reject(new Error('synthetic promise rejection')); throw new Error('synthetic receiver throw');
      });
      assert(!failure.ok && failure.error.code === 'REQUEST_RECEIVER_FAILED' && receiverCalls === 1 && compileCalls === 1 && !('value' in failure), 'receiver failure returns error without retry');
    }
    equal(state(rig), stable, 'receiver failures preserve real document and workspace');
  });
  await group('Q8', 'complete extra block metadata survives and receiver/caller payloads share no nested references', async () => {
    const { rig, ids } = populated('extra-metadata'); supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.r, 'connect');
    const updated = data(ids.r, [ids.m]);
    const expectedExtras = { metadata: { nested: { note: '原始嵌套字段：之' }, list: [{ label: '原始数组对象' }, { nested: ['原始数组成员'] }] },
      extraSequence: [{ detail: { value: '原始额外数组字段' } }, ['原始二级数组']] };
    Object.assign(updated.blocks![0], clone(expectedExtras));
    fixture(rig.svc.updateKnot(ids.r, updated, { source: 'fixture:request-extra-metadata' }), 'actual public updateKnot retains plain extra fields');
    const compileBefore = fixture(rig.svc.compileWorksiteInput('A'), 'actual compiler before nested mutations');
    const extras = (block: any) => ({ metadata: block.metadata, extraSequence: block.extraSequence });
    equal(extras(compileBefore.materials[0].blocks[0]), expectedExtras, 'real compiler preserves complete nested object and array metadata');
    const liveBefore = clone(state(rig)); const failures: string[] = [];
    const retain = (probe: () => void): void => { try { probe(); } catch (error) { failures.push(String(error)); log(`  RETAINED ${String(error)}`); } };
    let receiverCalls = 0, receiverPayload: Payload | undefined, receiverAtEntry: Payload | undefined;
    const response = await adapter.dispatchWorksiteRequest!(rig.svc, 'A', payload => {
      receiverCalls++; receiverPayload = payload; receiverAtEntry = clone(payload);
      const block = payload.checked[0].blocks[0] as any;
      block.metadata.nested.note = 'receiver changed nested note';
      block.metadata.list[0].label = 'receiver changed array object';
      block.extraSequence[0].detail.value = 'receiver changed extra array';
      block.extraSequence[1].push('receiver added nested member');
      return 'synthetic-extra-metadata';
    });
    assert(response.ok && receiverCalls === 1 && receiverPayload && receiverAtEntry
      && response.value.response === 'synthetic-extra-metadata', 'one actual receiver and successful local response', response);
    const returned = response.value.payload; const receivedBlock = receiverPayload.checked[0].blocks[0] as any;
    const returnedBlock = returned.checked[0].blocks[0] as any;
    equal(extras(receiverAtEntry.checked[0].blocks[0]), expectedExtras, 'actual receiver entry preserves every extra field');
    const sharedReferences = { metadata: receivedBlock.metadata === returnedBlock.metadata,
      nested: receivedBlock.metadata.nested === returnedBlock.metadata.nested,
      list: receivedBlock.metadata.list === returnedBlock.metadata.list,
      listObject: receivedBlock.metadata.list[0] === returnedBlock.metadata.list[0],
      extraSequence: receivedBlock.extraSequence === returnedBlock.extraSequence,
      extraArrayObject: receivedBlock.extraSequence[0].detail === returnedBlock.extraSequence[0].detail,
      nestedArray: receivedBlock.extraSequence[1] === returnedBlock.extraSequence[1] };
    retain(() => assert(Object.values(sharedReferences).every(shared => !shared), 'receiver and returned payload have no shared nested object/array references', sharedReferences));
    retain(() => equal(extras(returnedBlock), expectedExtras, 'receiver edits cannot change returned payload metadata'));
    const receiverAfterOwnEdits = clone(receiverPayload); const returnedBeforeCallerEdits = clone(returned);
    returnedBlock.metadata.nested.note = 'caller changed returned nested note';
    returnedBlock.metadata.list[0].label = 'caller changed returned array object';
    returnedBlock.extraSequence[0].detail.value = 'caller changed returned extra array';
    returnedBlock.extraSequence[1].push('caller added returned nested member');
    retain(() => equal(receiverPayload, receiverAfterOwnEdits, 'caller edits cannot change the actual receiver object'));
    const compileAfter = fixture(rig.svc.compileWorksiteInput('A'), 'actual compiler after receiver and caller mutations');
    equal(compileAfter, compileBefore, 'later actual compile retains original complete metadata');
    equal(state(rig), liveBefore, 'both nested mutation directions preserve the real scene');
    observations.push({ label: 'Q8 actual nested metadata isolation', worksiteId: 'A', receiverCalls, sharedReferences,
      receiverAtEntry, receiverAfterOwnEdits, receiverAfterCallerEdits: clone(receiverPayload),
      returnedBeforeCallerEdits, returnedAfterCallerEdits: clone(returned), compileBefore, compileAfter, failures });
    if (failures.length) throw new Error(`Nested alias failures retained in both directions:\n${failures.join('\n')}`);
  });
}

main().catch(error => { log(String(error)); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch; const failed = groups.filter(group => group.status === 'fail').length;
  if (failed || fetchAttempts) process.exitCode = 1;
  const summary = { pass: groups.length - failed, fail: failed, assertions: groups.reduce((sum, item) => sum + item.assertions, 0), observations: observations.length, fetchAttempts, exitCode: process.exitCode ?? 0 };
  log(`SUMMARY ${JSON.stringify(summary)}; Maker evidence only`);
  writeFileSync(reportPath, `${JSON.stringify({ role: 'Maker', contract: 'local worksite request adapter', ranAt: new Date().toISOString(), loadError, groups, observations, storageEvidence, summary }, null, 2)}\n`, 'utf8');
  writeFileSync(`${reportPath.replace(/\.json$/i, '')}.log`, `${lines.join('\n')}\n`, 'utf8');
});
