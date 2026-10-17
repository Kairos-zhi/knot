/** Recovery integrity and public subscriber contract. No private emit calls. */
import { createHeadlessContainer } from './headless';
import { WorkflowDocument, WorkflowLinesManager } from '@flowgram.ai/free-layout-core';
import { KnotOperationService, OpResult, KnotEvent } from '../src/services/knot-operation-service';
import { KnotSelectionService } from '../src/services/knot-selection-service';
import { WorksiteCommand } from '../src/knot-model';
import { CanvasSnapshot, LS_KEY, SnapshotStorage, getSnapshotProblem, normalizeCanvasSnapshot, serializeCanvas, watchCanvas } from '../src/services/asset-persistence';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

type Rig = { container: ReturnType<typeof createHeadlessContainer>; svc: KnotOperationService; selection: KnotSelectionService; doc: any; lines: WorkflowLinesManager };
type GroupResult = { id: string; name: string; status: 'pass' | 'fail'; assertions: Array<{ label: string; passed: boolean }>; error?: string };
const groups: GroupResult[] = [];
const resources = new Set<Rig>();
let current: GroupResult;
const reportPath = process.env.KNOT_RECOVERY_REPORT ? resolve(process.env.KNOT_RECOVERY_REPORT) : undefined;
const evidenceRoot = reportPath ? dirname(reportPath) : mkdtempSync(join(tmpdir(), 'knot-recovery-'));
mkdirSync(evidenceRoot, { recursive: true });
const storageEvidence: Array<Record<string, unknown>> = [];
const originalFetch = globalThis.fetch;
let preventedHttpCalls = 0;
globalThis.fetch = (async () => {
  preventedHttpCalls++;
  return { json: async () => ({ ok: true }) } as Response;
}) as typeof fetch;
function check(condition: unknown, label: string, detail?: unknown): asserts condition {
  current.assertions.push({ label, passed: !!condition });
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${label}`);
  if (!condition) throw new Error(`${label}${detail === undefined ? '' : `\n${JSON.stringify(detail, null, 2)}`}`);
}
function canonical(input: unknown): string {
  const ordered = (item: any): any => Array.isArray(item) ? item.map(ordered) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(input));
}
function equal(actual: unknown, expected: unknown, label: string): void { check(canonical(actual) === canonical(expected), label, { actual, expected }); }
function clone<T>(input: T): T { return JSON.parse(JSON.stringify(input)); }
function pause(ms: number): Promise<void> { return new Promise(resolvePause => setTimeout(resolvePause, ms)); }
function snapshotThrows(rig: Rig, expected: string, label: string): void {
  let thrown: unknown;
  try { rig.svc.getSnapshot(); } catch (error) { thrown = error; }
  check(thrown instanceof Error && thrown.message.includes(expected), label, String(thrown));
}
function fileStorage(label: string): SnapshotStorage & { file: string; writes: number; reads: number } {
  const directory = mkdtempSync(join(evidenceRoot, `${label}-`));
  const adapter = {
    file: join(directory, 'canvas-snapshot.json'), writes: 0, reads: 0,
    getItem(key: string): string | null {
      if (key !== LS_KEY) throw new Error(`unexpected key ${key}`);
      adapter.reads++;
      return existsSync(adapter.file) ? readFileSync(adapter.file, 'utf8') : null;
    },
    setItem(key: string, raw: string): void {
      if (key !== LS_KEY) throw new Error(`unexpected key ${key}`);
      writeFileSync(`${adapter.file}.next`, raw, 'utf8');
      renameSync(`${adapter.file}.next`, adapter.file);
      adapter.writes++;
    },
  };
  return adapter;
}
function value<T>(result: OpResult<T>, label: string): T { check(result?.ok === true, label, result); return result.value; }
function errorCode(result: OpResult<unknown>, expected: string, label: string): void { check(result?.ok === false && result.error.code === expected, label, result); }
function fresh(): Rig {
  const container = createHeadlessContainer(); container.bind(KnotOperationService).toSelf().inSingletonScope();
  const rig = { container, svc: container.get(KnotOperationService), selection: container.get(KnotSelectionService), doc: container.get(WorkflowDocument), lines: container.get(WorkflowLinesManager) };
  rig.svc.init(); resources.add(rig); return rig;
}
function dispose(rig: Rig): void { (rig.svc as KnotOperationService & { dispose?: () => void }).dispose?.(); rig.doc.dispose(); rig.container.unbindAll(); resources.delete(rig); }
function asset(rig: Rig, id: string): string {
  return value(rig.svc.createKnot({ id, title: `Title ${id}`, summary: `Content ${id}`, src: 'fixture:recovery', chain_id: id,
    blocks: [{ id: 'b1', source: 'manual', timestamp: '2026-10-03T00:00:00.000Z', provenance: [], content: `块 ${id}` }],
  } as any, { x: id.length * 11, y: id.length * 13 }, { source: 'fixture' }), `create fixture ${id}`);
}
function command(rig: Rig, input: WorksiteCommand, source = 'fixture'): void { value(rig.svc.executeWorksiteCommand(input, { source }), `execute ${input.type}`); }
function populated(prefix: string): Rig {
  const rig = fresh(); const a = asset(rig, `${prefix}-a`); const b = asset(rig, `${prefix}-b`);
  value(rig.svc.connect(a, b, { fixed: true, source: 'fixture' }), `connect ${prefix} fixtures`);
  command(rig, { type: 'worksite.create', id: `${prefix}-site`, assetId: a, conversationId: `${prefix}-conversation` });
  command(rig, { type: 'worksite.activate', worksiteId: `${prefix}-site` });
  command(rig, { type: 'worksite.supply', worksiteId: `${prefix}-site`, assetId: a, mode: 'connect' });
  command(rig, { type: 'worksite.supply', worksiteId: `${prefix}-site`, assetId: b, mode: 'exclude' });
  command(rig, { type: 'worksite.update', worksiteId: `${prefix}-site`, draft: `草稿 ${prefix}`, agentId: `${prefix}-agent` });
  command(rig, { type: 'presentation.open', id: `${prefix}-view`, worksiteId: `${prefix}-site`, kind: 'card', layout: { x: 50, y: 60, width: 320, height: 240 } });
  return rig;
}
async function group(id: string, name: string, run: () => void | Promise<void>): Promise<void> {
  current = { id, name, status: 'pass', assertions: [] }; console.log(`\n== ${id} ${name} ==`);
  try { await run(); } catch (error) { current.status = 'fail'; current.error = error instanceof Error ? error.stack ?? error.message : String(error); console.error(current.error); }
  groups.push(current);
  for (const rig of [...resources]) {
    try { dispose(rig); } catch (error) { current.status = 'fail'; current.error = `${current.error ?? ''}\ncleanup: ${error instanceof Error ? error.stack : String(error)}`; }
  }
  console.log(`[${current.status.toUpperCase()}] ${id}: ${current.assertions.filter(a => a.passed).length}/${current.assertions.length} assertions`);
}

async function main(): Promise<void> {
  await group('D1', 'reserved engine IDs and asset/line collisions fail before state changes', () => {
    const rig = populated('before'); const before = clone(rig.svc.getSnapshot()); const facts: KnotEvent[] = []; rig.svc.subscribe(event => facts.push(event));
    const rootSnapshot = clone(before); rootSnapshot.assets.push({ ...clone(rootSnapshot.assets[0]), id: 'root' });
    errorCode(normalizeCanvasSnapshot(rootSnapshot), 'RESERVED_ID', 'normalizer pre-rejects an asset using the engine root ID');
    let imports = 0; const original = rig.doc.fromJSON.bind(rig.doc);
    rig.doc.fromJSON = (json: any) => { imports++; return original(json); };
    try {
      errorCode(rig.svc.restoreSnapshot(rootSnapshot, { source: 'test:reserved' }), 'RESERVED_ID', 'reserved root restore is rejected');
      equal(imports, 0, 'reserved root is rejected before calling fromJSON');
      equal(rig.svc.getSnapshot(), before, 'reserved root rejection leaves the full before state intact');
      errorCode(rig.svc.createKnot({ id: 'root', title: 'invalid' } as any), 'RESERVED_ID', 'native createKnot also rejects the engine root ID');
      equal(rig.svc.getSnapshot(), before, 'native root rejection leaves before state intact');
      const engineLine = rig.lines.getAllAvailableLines()[0]; check(engineLine && engineLine.id, 'actual engine line ID is available');
      const collision = clone(before); collision.assets.push({ ...clone(collision.assets[0]), id: engineLine.id });
      errorCode(normalizeCanvasSnapshot(collision), 'DUPLICATE_ID', 'normalizer rejects an asset colliding with generated engine line identity');
      errorCode(rig.svc.restoreSnapshot(collision, { source: 'test:collision' }), 'DUPLICATE_ID', 'line collision restore is rejected');
      equal(imports, 0, 'line collision is rejected before calling fromJSON');
      equal(rig.svc.getSnapshot(), before, 'line collision rejection leaves before state intact');
      check(facts.every(event => event.type !== 'snapshot.restored'), 'no restore-success fact is published for preflight failure');
    } finally { rig.doc.fromJSON = original; }
  });

  await group('D2', 'a throwing public subscriber cannot hide successful operations from later subscribers', () => {
    const rig = fresh(); let throwCalls = 0; const later: KnotEvent[] = [];
    const firstOff = rig.svc.subscribe(() => { throwCalls++; throw new Error('fixture first subscriber throws'); });
    const laterOff = rig.svc.subscribe(event => later.push(event));
    try {
      const a = asset(rig, 'event-a'); const b = asset(rig, 'event-b');
      value(rig.svc.updateKnot(a, { summary: 'updated successfully' }, { source: 'test:throwing-subscriber' }), 'update succeeds despite first listener exception');
      value(rig.svc.connect(a, b, { source: 'test:throwing-subscriber' }), 'connect succeeds despite first listener exception');
      command(rig, { type: 'worksite.create', id: 'events-site', assetId: a });
      command(rig, { type: 'presentation.open', id: 'events-view', worksiteId: 'events-site' });
      rig.svc.focusKnot(a, { source: 'test:throwing-subscriber' });
      const snapshot = clone(rig.svc.getSnapshot()); value(rig.svc.restoreSnapshot(snapshot, { source: 'test:throwing-subscriber' }), 'restore succeeds despite first listener exception');
      for (const expected of ['knot.created', 'knot.updated', 'rope.connected', 'worksite.changed', 'presentation.changed', 'focus.changed', 'snapshot.restored']) {
        check(later.some(event => event.type === expected), `later subscriber receives ${expected}`);
      }
      equal(throwCalls, later.length, 'later observer sees every event offered to the throwing subscriber');
      check(later.every(event => event.type !== 'command.failed'), 'subscriber exceptions do not turn committed operations into command failures');
      equal(rig.svc.getSnapshot(), snapshot, 'committed state is intact despite observer failures');
    } finally { firstOff(); laterOff(); }
  });

  await group('D3', 'reentrant focus from an earlier subscriber preserves increasing sequence for a later observer', () => {
    const rig = fresh(); const later: KnotEvent[] = []; let reentries = 0;
    const firstOff = rig.svc.subscribe(event => {
      if (event.source === 'fixture:reentry') return;
      reentries++; rig.svc.focusKnot(null, { source: 'fixture:reentry' });
    });
    const laterOff = rig.svc.subscribe(event => later.push(event));
    try {
      const a = asset(rig, 'reentrant-a'); const b = asset(rig, 'reentrant-b');
      value(rig.svc.updateKnot(a, { title: 'reentrant update' }), 'update during reentrant observation succeeds');
      value(rig.svc.connect(a, b), 'connect during reentrant observation succeeds');
      command(rig, { type: 'worksite.create', id: 'reentrant-site', assetId: a });
      command(rig, { type: 'presentation.open', id: 'reentrant-view', worksiteId: 'reentrant-site' });
      rig.svc.setTool('hand');
      const snapshot = clone(rig.svc.getSnapshot()); value(rig.svc.restoreSnapshot(snapshot, { source: 'fixture:outer-restore' }), 'restore during reentrant observation succeeds');
      check(reentries >= 7, 'public callbacks reentered multiple kinds of successful operations', reentries);
      const seqs = later.map(event => event.seq);
      check(seqs.every((seq, i) => Number.isInteger(seq) && (i === 0 || seq > seqs[i - 1])), 'later subscriber sees strictly increasing global seq', later);
      equal(new Set(seqs).size, seqs.length, 'later subscriber never receives the same seq twice');
      check(new Set(later.filter(event => event.source !== 'fixture:reentry').map(event => event.type)).size >= 7, 'ordering is exercised over asset, rope, workspace, presentation, tool and restore events');
      equal(later.filter(event => event.type === 'focus.changed' && event.source === 'fixture:reentry').length, reentries, 'later observer receives every nested focus exactly once');
      equal(rig.svc.getSnapshot(), snapshot, 'reentrant visual focus does not alter restored workspace state');
    } finally { firstOff(); laterOff(); }
  });

  await group('D4', 'a snapshot.restored subscriber exception does not rollback valid new state', () => {
    const rig = populated('old'); const incoming = populated('new'); const expected = clone(incoming.svc.getSnapshot());
    let throws = 0; const later: KnotEvent[] = [];
    rig.svc.subscribe(event => { if (event.type === 'snapshot.restored') { throws++; throw new Error('fixture restore observer throws'); } });
    rig.svc.subscribe(event => later.push(event));
    value(rig.svc.restoreSnapshot(expected, { source: 'test:D4' }), 'valid restore remains successful');
    equal(throws, 1, 'throwing restore listener actually ran');
    equal(rig.svc.getSnapshot(), expected, 'full new assets, edges, workspace and presentations remain committed');
    check(rig.doc.getNode('new-a') && !rig.doc.getNode('old-a'), 'actual engine contains new identities and removed old identities');
    equal(later.filter(event => event.type === 'snapshot.restored').length, 1, 'later listener sees one restore-success fact');
    check(later.every(event => event.type !== 'command.failed'), 'observer error does not publish a command failure');
  });

  await group('D5', 'public workspace-restored callbacks cannot mutate an in-progress restore', async () => {
    const rig = populated('reentry-before'); const incoming = populated('reentry-after');
    const before = clone(rig.svc.getSnapshot()); const wanted = clone(incoming.svc.getSnapshot());
    const events: KnotEvent[] = []; const attempts: Array<{ entry: string; result: OpResult<unknown> }> = [];
    let callbackCalls = 0;
    const workspaceOff = rig.selection.subscribeChanges(change => {
      if (change.type !== 'workspace.restored') return;
      callbackCalls++;
      if (callbackCalls !== 1) return;
      attempts.push({ entry: 'createKnot', result: rig.svc.createKnot({ id: 'reentry-injected', title: 'must not commit' } as any,
        { x: 1, y: 2 }, { source: 'fixture:restore-reentry' }) });
      attempts.push({ entry: 'restoreSnapshot', result: rig.svc.restoreSnapshot(before, { source: 'fixture:restore-reentry' }) });
      attempts.push({ entry: 'selection.execute', result: rig.selection.execute({ type: 'worksite.update', worksiteId: 'reentry-after-site',
        draft: 'must not replace target draft' }, 'fixture:restore-reentry') });
    });
    const eventOff = rig.svc.subscribe(event => events.push(event));
    try {
      value(rig.svc.restoreSnapshot(wanted, { source: 'test:D5' }), 'outer restore succeeds while callbacks try three public mutation paths');
      equal(callbackCalls, 1, 'workspace-restored callback ran exactly once');
      equal(attempts.map(attempt => attempt.entry), ['createKnot', 'restoreSnapshot', 'selection.execute'], 'all public reentry paths were actually attempted');
      for (const attempt of attempts) errorCode(attempt.result, 'RESTORE_IN_PROGRESS', `${attempt.entry} rejects during the restore transaction`);
      equal(rig.svc.getSnapshot(), wanted, 'full assets, edges, workspace and presentations equal the outer target');
      check(!rig.doc.getNode('reentry-injected') && !rig.doc.getNode('reentry-before-a'), 'actual engine contains neither callback injection nor nested restore state');
      await pause(30);
      equal(rig.svc.getSnapshot(), wanted, 'deferred engine synchronization does not alter the committed target');
      const successful = events.filter(event => event.type === 'workspace.restored' || event.type === 'snapshot.restored');
      equal(successful.map(event => event.type), ['workspace.restored', 'snapshot.restored'], 'workspace then snapshot success facts are each published exactly once');
      check(successful.every(event => event.source === 'test:D5'), 'restore-success facts retain the outer source');
      check(events.every((event, index) => index === 0 || event.seq > events[index - 1].seq), 'all observers receive strictly increasing event sequence through reentry failures', events);
      check(events.every(event => event.type !== 'knot.created'), 'rejected callback creation emits no asset success fact');
    } finally { workspaceOff(); eventOff(); }
  });

  await group('D6', 'invalid restore sources fail before document replacement and cannot quarantine healthy state', () => {
    const rig = populated('source-before'); const incoming = populated('source-incoming');
    const before = clone(rig.svc.getSnapshot()); const wanted = clone(incoming.svc.getSnapshot());
    const events: KnotEvent[] = []; rig.svc.subscribe(event => events.push(event));
    let imports = 0; let clears = 0;
    const originalImport = rig.doc.fromJSON.bind(rig.doc); const originalClear = rig.doc.clear.bind(rig.doc);
    rig.doc.fromJSON = (json: any) => { imports++; return originalImport(json); };
    rig.doc.clear = () => { clears++; return originalClear(); };
    try {
      for (const source of ['', '  ', 0, false, {}, ['fixture']]) {
        errorCode(rig.svc.restoreSnapshot(wanted, { source } as any), 'INVALID_SOURCE', `reject invalid restore source ${JSON.stringify(source)}`);
        equal(imports, 0, 'source is rejected before fromJSON');
        equal(clears, 0, 'source is rejected before clear');
        equal(rig.svc.getSnapshot(), before, 'invalid source keeps full healthy before state');
        equal(getSnapshotProblem(rig.doc), undefined, 'invalid source cannot enter recovery quarantine');
      }
      check(events.every(event => event.type === 'command.failed' && event.error.code === 'INVALID_SOURCE'), 'only explicit invalid-source failures were published');
      check(events.every(event => event.source === 'restore'), 'invalid caller source is not forwarded into public facts');
      value(rig.svc.createKnot({ id: 'source-after', title: 'still healthy' } as any), 'native write still works after rejected restore sources');
      command(rig, { type: 'worksite.update', worksiteId: 'source-before-site', draft: 'still writable' });
    } finally { rig.doc.fromJSON = originalImport; rig.doc.clear = originalClear; }
  });

  await group('I1', 'silent partial import is detected and a complete rollback restores before state', () => {
    const rig = populated('before-import'); const incoming = populated('after-import');
    const before = clone(rig.svc.getSnapshot()); const wanted = clone(incoming.svc.getSnapshot()); const events: KnotEvent[] = [];
    rig.svc.subscribe(event => events.push(event)); let calls = 0;
    const original = rig.doc.fromJSON.bind(rig.doc);
    rig.doc.fromJSON = (json: any) => {
      calls++; const next = clone(json);
      if (calls === 1) {
        const omitted = next.nodes[0].id; next.nodes = next.nodes.filter((node: any) => node.id !== omitted);
        next.edges = next.edges.filter((edge: any) => edge.sourceNodeID !== omitted && edge.targetNodeID !== omitted);
      }
      return original(next);
    };
    try {
      errorCode(rig.svc.restoreSnapshot(wanted, { source: 'test:silent-import' }), 'RESTORE_FAILED', 'silent missing imported asset returns RESTORE_FAILED');
      check(calls >= 2, 'failed restore attempted a rollback through the engine');
      equal(rig.svc.getSnapshot(), before, 'rollback restored all previous identities/content/edges/workspace/presentations');
      check(events.every(event => event.type !== 'snapshot.restored'), 'incomplete import did not publish restore-success');
      check(events.some(event => event.type === 'command.failed' && event.error.code === 'RESTORE_FAILED'), 'public failure fact identifies import integrity failure');
    } finally { rig.doc.fromJSON = original; }
  });

  await group('I2', 'a silently incomplete rollback quarantines both watcher paths until explicit valid recovery', async () => {
    const rig = populated('before-rollback'); const incoming = populated('after-rollback');
    const before = clone(rig.svc.getSnapshot()); const wanted: CanvasSnapshot = clone(incoming.svc.getSnapshot()); const events: KnotEvent[] = [];
    rig.svc.subscribe(event => events.push(event)); let calls = 0;
    const original = rig.doc.fromJSON.bind(rig.doc);
    rig.doc.fromJSON = (json: any) => {
      calls++; const next = clone(json); const omitted = next.nodes[0].id;
      next.nodes = next.nodes.filter((node: any) => node.id !== omitted);
      next.edges = next.edges.filter((edge: any) => edge.sourceNodeID !== omitted && edge.targetNodeID !== omitted);
      return original(next);
    };
    const defaultStorage = fileStorage('I2-default-watcher'); const operationStorage = fileStorage('I2-operation-watcher');
    defaultStorage.setItem(LS_KEY, JSON.stringify({ assets: before.assets, edges: before.edges }));
    operationStorage.setItem(LS_KEY, JSON.stringify(before));
    const defaultBytes = readFileSync(defaultStorage.file); const operationBytes = readFileSync(operationStorage.file);
    const defaultWrites = defaultStorage.writes; const operationWrites = operationStorage.writes;
    const defaultErrors: Array<{ code: string; message: string }> = []; const operationErrors: Array<{ code: string; message: string }> = [];
    let defaultSaved = 0; let operationSaved = 0; let getSnapshotCalls = 0;
    let defaultOff: (() => void) | undefined; let operationOff: (() => void) | undefined;
    try {
      errorCode(rig.svc.restoreSnapshot(wanted, { source: 'test:silent-rollback' }), 'ROLLBACK_FAILED', 'silent missing rollback asset returns ROLLBACK_FAILED');
      check(calls >= 2, 'rollback was actually attempted after import mismatch');
      const rawPartial = serializeCanvas(rig.doc, rig.selection.getWorkspace());
      check(canonical(rawPartial) !== canonical(before) && rawPartial.assets.length < before.assets.length, 'raw engine serialization proves a genuinely incomplete before-state');
      value(normalizeCanvasSnapshot(serializeCanvas(rig.doc)), 'partial raw document is a legal legacy snapshot that a default writer could otherwise persist');
      snapshotThrows(rig, 'RECOVERY_REQUIRED', 'public operation snapshot refuses to expose the quarantined partial state');
      equal(getSnapshotProblem(rig.doc)?.code, 'RECOVERY_REQUIRED', 'document quarantine exposes the explicit persistence problem');
      errorCode(rig.svc.createKnot({ id: 'quarantine-injected', title: 'must not commit' } as any), 'RECOVERY_REQUIRED', 'native asset creation is rejected while recovery is required');
      errorCode(rig.selection.execute({ type: 'worksite.update', worksiteId: 'before-rollback-site', draft: 'must not commit' }, 'fixture:quarantine'),
        'RECOVERY_REQUIRED', 'direct public workspace execution is rejected while recovery is required');
      equal(serializeCanvas(rig.doc, rig.selection.getWorkspace()), rawPartial, 'rejected quarantine writes leave the actual partial document and workspace intact');
      check(events.every(event => event.type !== 'snapshot.restored'), 'incomplete rollback never publishes restore-success');
      check(events.some(event => event.type === 'command.failed' && event.error.code === 'ROLLBACK_FAILED'), 'public failure fact distinguishes rollback integrity failure');
      defaultOff = watchCanvas(rig.doc, { debounceMs: 20, initialSaveMs: 20, storage: defaultStorage,
        onError: error => defaultErrors.push(error), onSaved: () => defaultSaved++ });
      operationOff = watchCanvas(rig.doc, { debounceMs: 20, initialSaveMs: 20, storage: operationStorage,
        getSnapshot: () => { getSnapshotCalls++; return rig.svc.getSnapshot(); },
        subscribe: listener => rig.selection.subscribe(listener), onError: error => operationErrors.push(error), onSaved: () => operationSaved++ });
      await pause(40);
      equal(defaultStorage.writes, defaultWrites, 'default serialize watcher did not write while quarantined');
      equal(operationStorage.writes, operationWrites, 'operation getSnapshot watcher did not write while quarantined');
      check(readFileSync(defaultStorage.file).equals(defaultBytes), 'independent default-watcher file retains the exact committed UTF8 bytes');
      check(readFileSync(operationStorage.file).equals(operationBytes), 'independent operation-watcher file retains the exact committed UTF8 bytes');
      check(defaultErrors.length >= 1 && defaultErrors.every(error => error.code === 'RECOVERY_REQUIRED'), 'default watcher reports RECOVERY_REQUIRED explicitly', defaultErrors);
      check(operationErrors.length >= 1 && operationErrors.every(error => error.code === 'RECOVERY_REQUIRED'), 'operation watcher reports RECOVERY_REQUIRED explicitly', operationErrors);
      equal([defaultSaved, operationSaved, getSnapshotCalls], [0, 0, 0], 'quarantine is checked before callbacks can serialize or claim successful persistence');
      const invalidRecovery = clone(wanted); invalidRecovery.assets.push(clone(invalidRecovery.assets[0]));
      errorCode(rig.svc.restoreSnapshot(invalidRecovery, { source: 'test:invalid-recovery' }), 'DUPLICATE_ID', 'invalid explicit recovery is still rejected in preflight');
      snapshotThrows(rig, 'RECOVERY_REQUIRED', 'invalid recovery does not clear quarantine');
      rig.doc.fromJSON = original;
      value(rig.svc.restoreSnapshot(wanted, { source: 'test:valid-recovery' }), 'later explicit valid recovery succeeds through the actual engine');
      equal(getSnapshotProblem(rig.doc), undefined, 'valid recovery clears the document quarantine');
      equal(rig.svc.getSnapshot(), wanted, 'valid recovery restores the complete requested snapshot');
      await pause(40);
      equal(defaultStorage.writes, defaultWrites + 1, 'default watcher resumes writing after explicit valid recovery');
      equal(operationStorage.writes, operationWrites + 1, 'operation watcher resumes writing after explicit valid recovery');
      equal([defaultSaved, operationSaved], [1, 1], 'each watcher publishes one real post-recovery saved callback');
      equal(JSON.parse(readFileSync(operationStorage.file, 'utf8')), wanted, 'operation file contains all recovered workspace and presentation state');
      const defaultRecovered = JSON.parse(readFileSync(defaultStorage.file, 'utf8')) as CanvasSnapshot;
      equal(defaultRecovered.assets, wanted.assets, 'default serialization file contains the recovered assets');
      equal(defaultRecovered.edges, wanted.edges, 'default serialization file contains the recovered edges');
      equal(events.filter(event => event.type === 'snapshot.restored').map(event => event.source), ['test:valid-recovery'], 'only the later valid recovery publishes a snapshot-success fact');
      storageEvidence.push({ group: 'I2', adapter: 'Node fs UTF8; .next then atomic rename',
        files: [defaultStorage.file, operationStorage.file], writesDuringQuarantine: [0, 0], writesAfterExplicitRecovery: [1, 1],
        rawPartialIsLegalLegacySnapshot: true, publicSnapshotRejected: 'RECOVERY_REQUIRED' });
    } finally { rig.doc.fromJSON = original; defaultOff?.(); operationOff?.(); }
  });

  const failed = groups.filter(item => item.status === 'fail').length;
  const summary = { suite: 'Knot recovery integrity and public event behavior', status: failed ? 'fail' : 'pass', groupCount: groups.length, groups,
    assertions: groups.reduce((count, item) => count + item.assertions.length, 0), passedAssertions: groups.reduce((count, item) => count + item.assertions.filter(a => a.passed).length, 0),
    failedGroups: failed, exitCode: failed ? 1 : 0, storageAdapters: storageEvidence, preventedHttpCalls,
    boundaries: ['Maker self-test only; independent Checker acceptance pending', 'real headless engine with synthetic assets', 'subscriber and importer fault injection', 'actual UTF8 file adapters', 'fetch stubbed; no real HTTP/model/provider session'] };
  if (reportPath) { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8'); }
  console.log(`\nRecovery/events: ${groups.length - failed} PASS / ${failed} FAIL; ${summary.passedAssertions}/${summary.assertions} assertions`);
  globalThis.fetch = originalFetch;
  process.exit(summary.exitCode);
}
main().catch(error => { globalThis.fetch = originalFetch; console.error(error instanceof Error ? error.stack : String(error)); process.exit(1); });
