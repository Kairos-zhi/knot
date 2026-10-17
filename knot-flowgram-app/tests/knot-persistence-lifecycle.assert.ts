/** Persistence lifecycle contract with a real headless engine and UTF8 files. */
import { createHeadlessContainer } from './headless';
import { WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { KnotOperationService, OpResult, KnotEvent } from '../src/services/knot-operation-service';
import { KnotSelectionService } from '../src/services/knot-selection-service';
import { WorksiteCommand } from '../src/knot-model';
import { CanvasSnapshot, LS_KEY, SnapshotStorage, initializeSnapshotOnce, normalizeCanvasSnapshot, saveSnapshotLocal, watchCanvas } from '../src/services/asset-persistence';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

type Rig = { container: ReturnType<typeof createHeadlessContainer>; svc: KnotOperationService; selection: KnotSelectionService; doc: any };
type GroupResult = { id: string; name: string; status: 'pass' | 'fail'; assertions: Array<{ label: string; passed: boolean }>; error?: string };
type FileStorage = SnapshotStorage & { file: string; writes: number; reads: number };
const groups: GroupResult[] = [];
const resources = new Set<Rig>();
const watchers = new Set<() => void>();
const storageEvidence: Array<Record<string, unknown>> = [];
let current: GroupResult;
const reportPath = process.env.KNOT_PERSISTENCE_REPORT ? resolve(process.env.KNOT_PERSISTENCE_REPORT) : undefined;
const evidenceRoot = reportPath ? dirname(reportPath) : mkdtempSync(join(tmpdir(), 'knot-persistence-'));
mkdirSync(evidenceRoot, { recursive: true });
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
function value<T>(result: OpResult<T>, label: string): T { check(result?.ok === true, label, result); return result.value; }
function errorCode(result: OpResult<unknown>, expected: string, label: string): void { check(result?.ok === false && result.error.code === expected, label, result); }
function pause(ms: number): Promise<void> { return new Promise(resolvePause => setTimeout(resolvePause, ms)); }
function fresh(): Rig {
  const container = createHeadlessContainer(); container.bind(KnotOperationService).toSelf().inSingletonScope();
  const rig = { container, svc: container.get(KnotOperationService), selection: container.get(KnotSelectionService), doc: container.get(WorkflowDocument) };
  rig.svc.init(); resources.add(rig); return rig;
}
function dispose(rig: Rig): void { rig.svc.dispose(); rig.doc.dispose(); rig.container.unbindAll(); resources.delete(rig); }
function asset(rig: Rig, id: string): string {
  return value(rig.svc.createKnot({ id, title: `标题 ${id}`, summary: `人工材料 ${id}`, src: 'fixture:persistence', chain_id: `chain-${id}`,
    blocks: [{ id: 'b1', source: 'manual', timestamp: '2026-10-04T00:00:00.000Z', provenance: [], content: `人工块 ${id}` }],
  } as any, { x: id.length * 7, y: id.length * 9 }, { source: 'fixture' }), `create manual fixture ${id}`);
}
function command(rig: Rig, input: WorksiteCommand): void { value(rig.svc.executeWorksiteCommand(input, { source: 'fixture' }), `execute ${input.type}`); }
function populated(prefix: string): Rig {
  const rig = fresh(); const a = asset(rig, `${prefix}-a`); const b = asset(rig, `${prefix}-b`);
  value(rig.svc.connect(a, b, { fixed: true, source: 'fixture' }), `connect ${prefix} manual fixtures`);
  command(rig, { type: 'worksite.create', id: `${prefix}-site`, assetId: a, conversationId: `${prefix}-conversation` });
  command(rig, { type: 'worksite.activate', worksiteId: `${prefix}-site` });
  command(rig, { type: 'worksite.supply', worksiteId: `${prefix}-site`, assetId: a, mode: 'connect' });
  command(rig, { type: 'worksite.supply', worksiteId: `${prefix}-site`, assetId: b, mode: 'exclude' });
  command(rig, { type: 'worksite.update', worksiteId: `${prefix}-site`, draft: `持久草稿：之 ${prefix}`, agentId: `${prefix}-agent` });
  command(rig, { type: 'presentation.open', id: `${prefix}-view`, worksiteId: `${prefix}-site`, kind: 'card', layout: { x: 13, y: 29, width: 320, height: 180 } });
  return rig;
}
function fileStorage(label: string, raw?: string): FileStorage {
  const directory = mkdtempSync(join(evidenceRoot, `${label}-`));
  const adapter: FileStorage = {
    file: join(directory, 'canvas-snapshot.json'), writes: 0, reads: 0,
    getItem(key: string): string | null {
      if (key !== LS_KEY) throw new Error(`unexpected key ${key}`);
      adapter.reads++;
      return existsSync(adapter.file) ? readFileSync(adapter.file, 'utf8') : null;
    },
    setItem(key: string, next: string): void {
      if (key !== LS_KEY) throw new Error(`unexpected key ${key}`);
      writeFileSync(`${adapter.file}.next`, next, 'utf8'); renameSync(`${adapter.file}.next`, adapter.file); adapter.writes++;
    },
  };
  if (raw !== undefined) adapter.setItem(LS_KEY, raw);
  storageEvidence.push({ group: current.id, file: adapter.file, adapter: 'Node fs UTF8 getItem/setItem; .next then atomic rename' });
  return adapter;
}
function mounted(rig: Rig, storage: FileStorage, extra?: { onSaved?: () => void; onError?: (error: { code: string; message: string }) => void;
  subscribe?: (listener: () => void) => () => void; initialSaveMs?: number }): () => void {
  const off = watchCanvas(rig.doc, { debounceMs: 20, initialSaveMs: 20, storage, getSnapshot: () => rig.svc.getSnapshot(),
    subscribe: listener => rig.selection.subscribe(listener), ...extra });
  let stopped = false;
  const cleanup = () => { if (stopped) return; stopped = true; watchers.delete(cleanup); off(); };
  watchers.add(cleanup); return cleanup;
}
function diskSnapshot(storage: FileStorage): CanvasSnapshot { return JSON.parse(readFileSync(storage.file, 'utf8')); }
async function group(id: string, name: string, run: () => void | Promise<void>): Promise<void> {
  current = { id, name, status: 'pass', assertions: [] }; console.log(`\n== ${id} ${name} ==`);
  try { await run(); } catch (error) { current.status = 'fail'; current.error = error instanceof Error ? error.stack ?? error.message : String(error); console.error(current.error); }
  groups.push(current);
  for (const cleanup of [...watchers]) {
    try { cleanup(); } catch (error) { current.status = 'fail'; current.error = `${current.error ?? ''}\nwatcher cleanup: ${String(error)}`; }
  }
  for (const rig of [...resources]) {
    try { dispose(rig); } catch (error) { current.status = 'fail'; current.error = `${current.error ?? ''}\nengine cleanup: ${String(error)}`; }
  }
  console.log(`[${current.status.toUpperCase()}] ${id}: ${current.assertions.filter(assertion => assertion.passed).length}/${current.assertions.length} assertions`);
}

async function main(): Promise<void> {
  await group('L1', 'a first watcher save and remount each persist current full state once', async () => {
    const rig = populated('first'); const expected = clone(rig.svc.getSnapshot()); const storage = fileStorage('L1-first-remount');
    let saved = 0; let subscriptions = 0; let unsubscriptions = 0; const errors: Array<{ code: string; message: string }> = [];
    const subscribe = (listener: () => void) => {
      subscriptions++; const off = rig.selection.subscribe(listener);
      return () => { unsubscriptions++; off(); };
    };
    const firstOff = mounted(rig, storage, { subscribe, onSaved: () => saved++, onError: error => errors.push(error) });
    await pause(40);
    equal([storage.writes, saved], [1, 1], 'initial timer commits one file and one saved callback without a mutation');
    equal(diskSnapshot(storage), expected, 'first watcher file contains assets, fixed edges, workspace and presentations');
    check(readFileSync(storage.file, 'utf8').includes('持久草稿：之'), 'actual watcher file preserves UTF8 draft text');
    check(!existsSync(`${storage.file}.next`), 'atomic file adapter leaves no unfinished staging file');
    firstOff(); equal(storage.writes, 1, 'clean unmount does not save the already committed state twice');
    const secondOff = mounted(rig, storage, { subscribe, onSaved: () => saved++, onError: error => errors.push(error) });
    await pause(40);
    equal([storage.writes, saved], [2, 2], 'remounted watcher commits current state once');
    equal(diskSnapshot(storage), expected, 'remount does not replay or alter the restored workspace');
    secondOff(); equal([subscriptions, unsubscriptions], [2, 2], 'every mount removes its public workspace subscription');
    equal(errors, [], 'initial and remounted saves report no persistence errors');
  });

  await group('L2', 'dirty cleanup flushes once and cancels pending timers and subscriptions', async () => {
    const rig = populated('dirty'); const storage = fileStorage('L2-dirty-cleanup'); let saved = 0; let unsubscriptions = 0;
    const off = mounted(rig, storage, { initialSaveMs: 40, onSaved: () => saved++, subscribe: listener => {
      const unsubscribe = rig.selection.subscribe(listener); return () => { unsubscriptions++; unsubscribe(); };
    } });
    value(rig.svc.updateKnot('dirty-a', { summary: 'cleanup 前的最终人工内容' }, { source: 'fixture' }), 'real document change schedules a pending save');
    command(rig, { type: 'worksite.update', worksiteId: 'dirty-site', draft: 'cleanup 前最终草稿：之' });
    const expected = clone(rig.svc.getSnapshot()); off();
    equal([storage.writes, saved, unsubscriptions], [1, 1, 1], 'dirty teardown synchronously flushes one complete snapshot and removes subscription');
    equal(diskSnapshot(storage), expected, 'cleanup flush uses the latest document and workspace values');
    const bytes = readFileSync(storage.file); await pause(40);
    equal([storage.writes, saved], [1, 1], 'cancelled debounce and initial timers never publish a second save');
    check(readFileSync(storage.file).equals(bytes), 'pending timer cancellation preserves the exact cleanup bytes');
    asset(rig, 'dirty-after-unmount'); command(rig, { type: 'worksite.update', worksiteId: 'dirty-site', draft: '卸载后的草稿' });
    await pause(40);
    equal([storage.writes, saved], [1, 1], 'document and workspace edits after unmount cannot revive the watcher');
    check(readFileSync(storage.file).equals(bytes), 'detached subscriptions leave the committed file untouched');
  });

  await group('L3', 'clean teardown before the initial save cancels that timer completely', async () => {
    const rig = populated('cancel'); const storage = fileStorage('L3-cancel-initial'); let saved = 0;
    const off = mounted(rig, storage, { onSaved: () => saved++ }); off(); await pause(40);
    equal([storage.writes, saved], [0, 0], 'clean immediate teardown does not flush or leave an initial timer');
    check(!existsSync(storage.file), 'no file was created by a cancelled initial save');
  });

  await group('L4', 'successful initialization is once per owner and a new owner reads current disk bytes', () => {
    const origin = populated('owner-old'); const firstExpected = clone(origin.svc.getSnapshot());
    const storage = fileStorage('L4-owner-current'); value(saveSnapshotLocal(firstExpected, storage), 'seed the first valid file');
    const first = fresh(); const firstEvents: KnotEvent[] = []; first.svc.subscribe(event => firstEvents.push(event)); let firstRestoreCalls = 0;
    const initializeFirst = () => initializeSnapshotOnce(first.svc, snapshot => {
      firstRestoreCalls++; return first.svc.restoreSnapshot(snapshot, { source: 'fixture:first-owner' });
    }, storage);
    value(initializeFirst(), 'first owner restores the committed file'); const readsAfterFirst = storage.reads;
    value(initializeFirst(), 'same owner repeated initialization succeeds'); value(initializeFirst(), 'same owner third initialization succeeds');
    equal([firstRestoreCalls, storage.reads], [1, readsAfterFirst], 'successful same-owner initialization neither re-reads nor replays restore');
    equal(firstEvents.filter(event => event.type === 'snapshot.restored').length, 1, 'same owner publishes one actual restore-success fact');
    const changed = populated('owner-current'); const currentExpected = clone(changed.svc.getSnapshot());
    value(saveSnapshotLocal(currentExpected, storage), 'replace file with a later independently valid snapshot');
    value(initializeFirst(), 'initialized owner remains stable after external byte replacement');
    equal(first.svc.getSnapshot(), firstExpected, 'same owner is not silently reset by a later mount');
    dispose(first); check(first.doc.disposed === true, 'previous owner document was actually destroyed');
    const second = fresh(); let secondRestoreCalls = 0;
    value(initializeSnapshotOnce(second.svc, snapshot => { secondRestoreCalls++; return second.svc.restoreSnapshot(snapshot, { source: 'fixture:new-owner' }); }, storage),
      'new owner initializes from the current independent file');
    equal(secondRestoreCalls, 1, 'new owner gets its own successful initialization');
    equal(second.svc.getSnapshot(), currentExpected, 'new container reconstructs the latest assets, edges, workspace and presentations from disk');
    equal(diskSnapshot(storage), currentExpected, 'initialization reads without rewriting current committed bytes');
  });

  await group('L5', 'returned or thrown restore failures do not consume the owner retry', () => {
    const origin = populated('retry-first'); const initial = clone(origin.svc.getSnapshot());
    const storage = fileStorage('L5-restore-retry'); value(saveSnapshotLocal(initial, storage), 'seed retry file');
    const target = fresh(); const empty = clone(target.svc.getSnapshot()); let calls = 0;
    const failed = initializeSnapshotOnce(target.svc, () => { calls++; return { ok: false, error: { code: 'RESTORE_FAILED', message: 'fixture returned failure' } }; }, storage);
    errorCode(failed, 'RESTORE_FAILED', 'returned initialization failure is explicit');
    equal(target.svc.getSnapshot(), empty, 'returned failure does not fabricate a restore');
    const thrown = initializeSnapshotOnce(target.svc, () => { calls++; throw new Error('fixture restore throws'); }, storage);
    errorCode(thrown, 'RESTORE_FAILED', 'throwing initialization failure is explicit and remains retryable');
    const next = populated('retry-current'); const nextExpected = clone(next.svc.getSnapshot());
    value(saveSnapshotLocal(nextExpected, storage), 'repair target bytes with the current valid snapshot');
    value(initializeSnapshotOnce(target.svc, snapshot => { calls++; return target.svc.restoreSnapshot(snapshot, { source: 'fixture:retry-success' }); }, storage),
      'same owner retries successfully after both kinds of restore failure');
    equal(calls, 3, 'each failed attempt really invoked restore and successful retry invoked it again');
    equal(target.svc.getSnapshot(), nextExpected, 'retry reads the repaired current bytes instead of caching the failed snapshot');
    const readsAfterSuccess = storage.reads;
    value(initializeSnapshotOnce(target.svc, () => { calls++; throw new Error('must not replay'); }, storage), 'successful retry now consumes initialization once');
    equal([calls, storage.reads], [3, readsAfterSuccess], 'successful retry prevents all later replay and disk reads for that owner');
  });

  await group('L6', 'corrupt startup bytes remain intact and the same owner retries after explicit repair', () => {
    const storage = fileStorage('L6-load-retry', '{不是有效 JSON'); const bytes = readFileSync(storage.file);
    const target = fresh(); let calls = 0;
    const initialize = () => initializeSnapshotOnce(target.svc, snapshot => { calls++; return target.svc.restoreSnapshot(snapshot, { source: 'fixture:load-retry' }); }, storage);
    errorCode(initialize(), 'INVALID_SNAPSHOT', 'corrupt startup load reports failure before restore');
    equal(calls, 0, 'bad bytes never invoke the actual restore path');
    check(readFileSync(storage.file).equals(bytes), 'startup failure preserves the exact corrupt evidence bytes');
    const origin = populated('load-repaired'); const expected = clone(origin.svc.getSnapshot());
    value(normalizeCanvasSnapshot(expected), 'repair candidate is fully valid before external file replacement');
    storage.setItem(LS_KEY, JSON.stringify(expected));
    value(initialize(), 'same failed owner can retry from explicitly repaired bytes');
    equal(calls, 1, 'repaired load reaches real restore once'); equal(target.svc.getSnapshot(), expected, 'repaired UTF8 bytes recover all state');
    value(initialize(), 'repaired successful owner can be mounted again'); equal(calls, 1, 'successful repaired owner does not replay restore');
  });

  const failed = groups.filter(item => item.status === 'fail').length;
  const summary = { suite: 'Knot persistence lifecycle', status: failed ? 'fail' : 'pass', groupCount: groups.length, groups,
    assertions: groups.reduce((count, item) => count + item.assertions.length, 0), passedAssertions: groups.reduce((count, item) => count + item.assertions.filter(assertion => assertion.passed).length, 0),
    failedGroups: failed, exitCode: failed ? 1 : 0, storageAdapters: storageEvidence, preventedHttpCalls,
    boundaries: ['Maker self-test only; independent Checker acceptance pending', 'real headless engine and manual fixture assets', 'actual UTF8 filesystem adapters',
      'short real timers; no fake timer implementation', 'fetch stubbed; no real HTTP/model/provider session', 'same-process remount and fresh-container lifecycle; no full browser UI claim'] };
  if (reportPath) { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8'); }
  console.log(`\nPersistence lifecycle: ${groups.length - failed} PASS / ${failed} FAIL; ${summary.passedAssertions}/${summary.assertions} assertions`);
  globalThis.fetch = originalFetch;
  process.exit(summary.exitCode);
}
main().catch(error => { globalThis.fetch = originalFetch; console.error(error instanceof Error ? error.stack : String(error)); process.exit(1); });
