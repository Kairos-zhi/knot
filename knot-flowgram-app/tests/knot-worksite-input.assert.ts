/**
 * PREPARATION ONLY, 2026-10-04. Do not install in the current W3-A candidate.
 * Copy unchanged to tests/knot-worksite-input.assert.ts in the separately cloned,
 * independently accepted W3-A baseline before running it with that app's tsx.
 * Imports intentionally target that future tests/ location; this prep directory
 * is not a runnable application. Missing compileWorksiteInput is a RED result.
 *
 * Synthetic fixtures in the real headless WorkflowDocument. No private service
 * state, private emit, alternate asset catalog, real HTTP, or provider session.
 * KNOT_INPUT_REPORT selects the JSON receipt; a sibling .log is also written.
 * A PASS report is Maker evidence, never independent acceptance.
 */
import { createHeadlessContainer } from './headless';
import { WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { SelectionService } from '@flowgram.ai/free-layout-editor';
import { KnotOperationService, OpResult, KnotEvent } from '../src/services/knot-operation-service';
import { KnotSelectionService } from '../src/services/knot-selection-service';
import { ExpandService } from '../src/services/expand-service';
import { getBlocks, KnotBlock, KnotNode, WorksiteCommand, WorkspaceChange, WorkspaceState } from '../src/knot-model';
import {
  LS_KEY, SnapshotStorage, getSnapshotProblem,
  initializeSnapshotOnce, loadSnapshotResult, saveSnapshotLocal, serializeCanvas,
} from '../src/services/asset-persistence';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/** Deliberately local until the new public API is implemented. */
type CompiledWorksiteInput = {
  worksiteId: string;
  assetId: string | null;
  conversationId: string | null;
  draft: string;
  agentId: string | null;
  materials: Array<{ id: string; title: string; summary: string; blocks: KnotBlock[] }>;
};
type Compiler = KnotOperationService & {
  compileWorksiteInput(worksiteId: string): OpResult<CompiledWorksiteInput>;
};
type Rig = {
  container: ReturnType<typeof createHeadlessContainer>;
  svc: KnotOperationService;
  selection: KnotSelectionService;
  visualSelection: SelectionService;
  expand: ExpandService;
  doc: any;
};
type GroupResult = {
  id: string; name: string; status: 'pass' | 'fail';
  assertions: Array<{ label: string; passed: boolean }>; error?: string;
};
type ReadReceipt = {
  label: string; inputIdentity: string; nodeToJSON: Record<string, number>;
  serviceEvents: KnotEvent[]; workspaceChanges: WorkspaceChange[];
  workspaceNotifications: number; documentChanges: number; expansionChanges: number;
  fetchCalls: number; generationEntrypointCalls: number; scheduledTasks: number;
  stateUnchanged: boolean;
};
const groups: GroupResult[] = [];
let current: GroupResult;
const resources = new Set<Rig>();
const readEvidence: ReadReceipt[] = [];
const storageEvidence: Array<Record<string, unknown>> = [];
const logs: string[] = [];
const reportPath = process.env.KNOT_INPUT_REPORT ? resolve(process.env.KNOT_INPUT_REPORT) : undefined;
const evidenceRoot = reportPath ? dirname(reportPath) : mkdtempSync(join(tmpdir(), 'knot-input-'));
const logPath = reportPath ? `${reportPath.replace(/\.json$/i, '')}.log` : join(evidenceRoot, 'knot-input.log');
mkdirSync(evidenceRoot, { recursive: true });

const originalFetch = globalThis.fetch;
const fetchAttempts: Array<{ input: string; method: string }> = [];
// No request reaches a network. The guard remains installed for the whole suite.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  fetchAttempts.push({ input: String(input), method: init?.method ?? 'GET' });
  return new Response(JSON.stringify({ ok: true, fixture: 'blocked-real-network' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

function log(message: string): void { logs.push(message); console.log(message); }
function check(condition: unknown, label: string, detail?: unknown): asserts condition {
  current.assertions.push({ label, passed: !!condition });
  log(`  ${condition ? 'PASS' : 'FAIL'} ${label}`);
  if (!condition) throw new Error(`${label}${detail === undefined ? '' : `\n${JSON.stringify(detail, null, 2)}`}`);
}
function canonical(input: unknown): string {
  const ordered = (item: any): any => Array.isArray(item) ? item.map(ordered)
    : item !== null && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(input));
}
function equal(actual: unknown, expected: unknown, label: string): void {
  check(canonical(actual) === canonical(expected), label, { actual, expected });
}
function clone<T>(input: T): T { return JSON.parse(JSON.stringify(input)); }
function value<T>(result: OpResult<T>, label: string): T {
  check(result?.ok === true, label, result);
  return result.value;
}
function rejected(result: OpResult<unknown>, label: string, code?: string): void {
  check(result?.ok === false && typeof result.error?.code === 'string' && !!result.error.code.trim()
    && typeof result.error?.message === 'string' && !!result.error.message.trim()
    && (code === undefined || result.error.code === code), label, result);
}
function fresh(): Rig {
  const container = createHeadlessContainer();
  container.bind(KnotOperationService).toSelf().inSingletonScope();
  const rig: Rig = {
    container, svc: container.get(KnotOperationService), selection: container.get(KnotSelectionService),
    visualSelection: container.get(SelectionService), expand: container.get(ExpandService),
    doc: container.get(WorkflowDocument),
  };
  rig.svc.init(); resources.add(rig); return rig;
}
function dispose(rig: Rig): void {
  rig.svc.dispose(); rig.doc.dispose(); rig.container.unbindAll(); resources.delete(rig);
}
function command(rig: Rig, input: WorksiteCommand): WorkspaceState {
  return value(rig.svc.executeWorksiteCommand(input, { source: 'fixture:input' }), `fixture ${input.type}`);
}
function supply(rig: Rig, worksiteId: string, assetId: string, mode: 'connect' | 'exclude' | 'suggest'): void {
  command(rig, { type: 'worksite.supply', worksiteId, assetId, mode });
}
function site(rig: Rig, worksiteId: string) {
  const found = rig.selection.getWorkspace().worksites.find(item => item.id === worksiteId);
  check(found, `fixture worksite ${worksiteId} exists`); return found;
}
function data(id: string, provenance?: string[], legacy = false): KnotNode['data'] {
  return {
    title: `标题-${id}`, summary: `摘要-${id}`, token: 73, src: 'fixture:2026-10-04', chain_id: `chain-${id}`,
    ...(legacy ? {} : { blocks: [
      { id: 'b1', source: provenance ? 'generated' as const : 'manual' as const,
        timestamp: '2026-10-04T00:00:00.000Z', provenance: provenance ? [...provenance] : [], content: `首块-${id}` },
      { id: 'b2', source: 'manual' as const, timestamp: '2026-10-04T00:01:00.000Z', provenance: [], content: `尾块-${id}` },
    ] }),
  };
}
function asset(rig: Rig, id: string, input = data(id)): string {
  return value(rig.svc.createKnot({ id, ...input } as any, { x: id.length * 11, y: id.length * 17 },
    { source: 'fixture:input' }), `fixture asset ${id}`);
}
function populated(prefix: string) {
  const rig = fresh();
  const ids = { a: `${prefix}-association-A`, b: `${prefix}-association-B`, m: `${prefix}-M`, r: `${prefix}-R`, l: `${prefix}-legacy` };
  asset(rig, ids.a); asset(rig, ids.b); asset(rig, ids.m); asset(rig, ids.r, data(ids.r, [ids.m]));
  asset(rig, ids.l, data(ids.l, undefined, true));
  value(rig.svc.connect(ids.m, ids.r, { fixed: true, source: 'fixture:history' }), 'fixture historical M to R edge');
  command(rig, { type: 'worksite.create', id: 'A', assetId: ids.a, conversationId: 'conversation-A' });
  command(rig, { type: 'worksite.create', id: 'B', assetId: ids.b, conversationId: 'conversation-B' });
  command(rig, { type: 'worksite.update', worksiteId: 'A', draft: '现场 A 的草稿：之', agentId: 'agent-A' });
  command(rig, { type: 'worksite.update', worksiteId: 'B', draft: '现场 B 的草稿', agentId: 'agent-B' });
  return { rig, ids };
}
function material(id: string, input = data(id)) {
  return { id, title: input.title, summary: input.summary, blocks: clone(getBlocks(input)) };
}

/** Whole-state checks are intentionally OUTSIDE the node content access window.
 * serializeCanvas is the public raw projection: unlike getSnapshot, it remains
 * usable while a genuine restore/quarantine health marker blocks normal reads.
 */
function state(rig: Rig) {
  return {
    canvas: serializeCanvas(rig.doc, rig.selection.getWorkspace()),
    health: getSnapshotProblem(rig.doc) ?? null,
    tool: rig.svc.getTool(), expandedId: rig.expand.getExpandedId(),
    visualSelectionIds: rig.visualSelection.selection.map(node => node.id),
  };
}
function patchPublic(target: any, name: string, replacement: (...args: any[]) => any): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, writable: true, value: replacement });
  return () => { if (descriptor) Object.defineProperty(target, name, descriptor); else delete target[name]; };
}

/** The only call under content instrumentation is the public compiler itself. */
function read(rig: Rig, identity: unknown, label: string) {
  const before = state(rig);
  const fn = (rig.svc as Compiler).compileWorksiteInput;
  check(typeof fn === 'function', `${label}: public compileWorksiteInput exists (missing method is RED)`);
  const nodeToJSON: Record<string, number> = {};
  const undo: Array<() => void> = [];
  const serviceEvents: KnotEvent[] = [];
  const workspaceChanges: WorkspaceChange[] = [];
  let workspaceNotifications = 0; let documentChanges = 0; let expansionChanges = 0;
  let generationEntrypointCalls = 0; let scheduledTasks = 0;
  const fetchBefore = fetchAttempts.length;
  const offEvents = rig.svc.subscribe(event => serviceEvents.push(clone(event)));
  const offChanges = rig.selection.subscribeChanges(change => workspaceChanges.push(clone(change)));
  const offWorkspace = rig.selection.subscribe(() => workspaceNotifications++);
  const offExpansion = rig.expand.onExpandedChange(() => expansionChanges++);
  const documentSubscription = rig.doc.onContentChange(() => documentChanges++);
  let result: unknown; let thrown: unknown;
  try {
    // Wrap each real node, including any unselected node; never substitute its JSON.
    for (const node of rig.doc.getAllNodes()) {
      const original = node.toJSON;
      nodeToJSON[node.id] = 0;
      undo.push(patchPublic(node, 'toJSON', function (this: any, ...args: any[]) {
        nodeToJSON[node.id]++; return original.apply(this, args);
      }));
    }
    // These are public execution entrypoints, not private state or module hooks.
    for (const entry of ['generateFromSelection', 'growKnot']) {
      undo.push(patchPublic(rig.svc, entry, () => {
        generationEntrypointCalls++; throw new Error(`read attempted public generation entrypoint ${entry}`);
      }));
    }
    // Current imported generate/grow mocks also schedule delays. Blocking task
    // scheduling stops them safely; no deferred task is allowed to escape a read.
    for (const entry of ['setTimeout', 'setInterval', 'queueMicrotask']) {
      undo.push(patchPublic(globalThis, entry, () => {
        scheduledTasks++; throw new Error(`read attempted scheduling via ${entry}`);
      }));
    }
    result = fn.call(rig.svc, identity as string);
  } catch (error) { thrown = error; }
  finally {
    undo.reverse().forEach(restore => restore());
    offEvents(); offChanges(); offWorkspace(); offExpansion(); documentSubscription.dispose();
  }
  const after = state(rig);
  const receipt: ReadReceipt = {
    label, inputIdentity: typeof identity === 'string' ? identity : `<${typeof identity}>`, nodeToJSON,
    serviceEvents, workspaceChanges, workspaceNotifications, documentChanges, expansionChanges,
    fetchCalls: fetchAttempts.length - fetchBefore, generationEntrypointCalls, scheduledTasks,
    stateUnchanged: canonical(before) === canonical(after),
  };
  readEvidence.push(receipt);
  log(`  READ ${label}: node.toJSON=${JSON.stringify(nodeToJSON)}`);
  check(thrown === undefined, `${label}: returns an OpResult instead of throwing`, String(thrown));
  check(result !== null && typeof result === 'object' && typeof (result as any).ok === 'boolean'
    && typeof (result as any).then !== 'function', `${label}: synchronous OpResult envelope`, result);
  equal(after, before, `${label}: full document/workspace/health/view state unchanged`);
  equal(serviceEvents, [], `${label}: no service event, including command.failed or generation events`);
  equal(workspaceChanges, [], `${label}: no workspace change event`);
  equal([workspaceNotifications, documentChanges, expansionChanges], [0, 0, 0], `${label}: no write or view notifications`);
  equal([receipt.fetchCalls, generationEntrypointCalls, scheduledTasks], [0, 0, 0], `${label}: no fetch, generation entry or task scheduling`);
  return { result: result as OpResult<CompiledWorksiteInput>, receipt };
}
function onlyRead(receipt: ReadReceipt, selected: string[], label: string): void {
  const visited = Object.entries(receipt.nodeToJSON).filter(([, count]) => count > 0).map(([id]) => id).sort();
  equal(visited, [...selected].sort(), `${label}: actual node.toJSON visits only selected materials`);
  selected.forEach(id => check(receipt.nodeToJSON[id] >= 1, `${label}: actual ${id}.toJSON was called`));
}
function compiled(rig: Rig, id: string, label: string) {
  const probe = read(rig, id, label); return { input: value(probe.result, `${label}: compilation succeeds`), receipt: probe.receipt };
}
async function group(id: string, name: string, run: () => void | Promise<void>): Promise<void> {
  current = { id, name, status: 'pass', assertions: [] }; log(`\n== ${id} ${name} ==`);
  try { await run(); } catch (error) {
    current.status = 'fail'; current.error = error instanceof Error ? error.stack ?? error.message : String(error);
    log(current.error);
  }
  for (const rig of [...resources]) {
    try { dispose(rig); } catch (error) {
      current.status = 'fail'; current.error = `${current.error ?? ''}\ncleanup: ${String(error)}`; log(current.error);
    }
  }
  groups.push(current);
  log(`[${current.status.toUpperCase()}] ${id}: ${current.assertions.filter(item => item.passed).length}/${current.assertions.length} assertions`);
}

async function main(): Promise<void> {
  await group('C1', 'association identities are metadata; an empty selection compiles no asset content', () => {
    const { rig, ids } = populated('association');
    command(rig, { type: 'worksite.activate', worksiteId: 'B' });
    const probe = compiled(rig, 'A', 'explicit A with no checked materials');
    equal(probe.input, { worksiteId: 'A', assetId: ids.a, conversationId: 'conversation-A', draft: '现场 A 的草稿：之', agentId: 'agent-A', materials: [] }, 'compiled value preserves A metadata and has no automatic associated asset');
    onlyRead(probe.receipt, [], 'empty selection');
    equal(rig.selection.getWorkspace().activeWorksiteId, 'B', 'reading explicit A does not activate A');
  });

  await group('C2', 'selected order and complete blocks use getBlocks compatibility without reading other assets', () => {
    const { rig, ids } = populated('order');
    const emptyId = 'order-empty-blocks'; const emptyData = { ...data(emptyId), blocks: [] };
    asset(rig, emptyId, emptyData);
    // Deliberately differs from document insertion order.
    supply(rig, 'A', ids.r, 'connect'); supply(rig, 'A', ids.l, 'connect'); supply(rig, 'A', emptyId, 'connect'); supply(rig, 'A', ids.m, 'connect');
    supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.m, 'suggest');
    const probe = compiled(rig, 'A', 'ordered R then legacy');
    equal(probe.input.materials, [material(ids.r, data(ids.r, [ids.m])), material(ids.l, data(ids.l, undefined, true)), material(emptyId, emptyData)], 'materials retain selected order, original id/title/summary, all blocks and provenance');
    onlyRead(probe.receipt, [ids.r, ids.l, emptyId], 'ordered materials');
    equal(probe.input.materials[1].blocks.map(block => block.id), ['b_title', 'b_summary'], 'legacy asset uses the existing title/summary block compatibility');
    equal(probe.input.materials[2].blocks.map(block => block.id), ['b_title', 'b_summary'], 'an empty blocks array uses the same existing getBlocks compatibility');
  });

  await group('C3', 'A excludes M without changing B input, original M, or historical R', () => {
    const { rig, ids } = populated('isolation');
    supply(rig, 'A', ids.m, 'connect'); supply(rig, 'B', ids.m, 'connect');
    const beforeAssets = clone(rig.svc.getSnapshot().assets); const beforeEdges = clone(rig.svc.getSnapshot().edges);
    const beforeB = clone(site(rig, 'B')); const bInput = compiled(rig, 'B', 'B before A exclusion').input;
    supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.m, 'suggest');
    const aProbe = compiled(rig, 'A', 'A after M exclusion');
    equal(aProbe.input.materials, [], 'A excludes M from future input'); onlyRead(aProbe.receipt, [], 'excluded A material');
    const bProbe = compiled(rig, 'B', 'B after A exclusion'); equal(bProbe.input, bInput, 'B compiled input remains byte-equivalent');
    onlyRead(bProbe.receipt, [ids.m], 'B still selects M');
    equal(site(rig, 'B'), beforeB, 'B workspace state is unchanged by A exclusion');
    equal(rig.svc.getSnapshot().assets, beforeAssets, 'M contents and old R provenance remain unchanged');
    equal(rig.svc.getSnapshot().edges, beforeEdges, 'historical M to R relation remains unchanged');
    equal(site(rig, 'A').excludedIds, [ids.m], 'suggestion does not remove A manual exclusion');
  });

  await group('C4', 'explicit old result R retains provenance M while only reading R content', () => {
    const { rig, ids } = populated('history');
    supply(rig, 'A', ids.m, 'connect'); supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.r, 'connect');
    const probe = compiled(rig, 'A', 'old R selected, source M excluded');
    equal(probe.input.materials, [material(ids.r, data(ids.r, [ids.m]))], 'R blocks retain historical provenance M without adding M material');
    onlyRead(probe.receipt, [ids.r], 'provenance does not authorize content access');
    equal(probe.receipt.nodeToJSON[ids.m], 0, 'actual M node.toJSON was never visited during compiler call');
    equal([site(rig, 'A').checkedIds, site(rig, 'A').excludedIds], [[ids.r], [ids.m]], 'read does not reconnect historical M');
  });

  await group('C5', 'preview, visual focus, presentation shape/closure and active-site switches leave explicit A input stable', () => {
    const { rig, ids } = populated('views'); supply(rig, 'A', ids.r, 'connect');
    command(rig, { type: 'presentation.open', id: 'A-view', worksiteId: 'A', kind: 'window' });
    command(rig, { type: 'presentation.open', id: 'A-other-view', worksiteId: 'A', kind: 'card' });
    const expected = compiled(rig, 'A', 'A before visual changes').input;
    const actions: Array<{ label: string; act: () => void }> = [
      { label: 'preview unrelated M', act: () => { check(rig.doc.getNode(ids.m).toJSON().data.title === data(ids.m).title, 'preview uses actual unrelated M'); } },
      { label: 'expand unrelated M', act: () => rig.svc.expandKnot(ids.m) },
      { label: 'focus unrelated M', act: () => rig.svc.focusKnot(ids.m, { source: 'fixture:preview' }) },
      { label: 'clear visual focus', act: () => rig.svc.focusKnot(null) },
      { label: 'present as card', act: () => { command(rig, { type: 'presentation.update', presentationId: 'A-view', kind: 'card' }); } },
      { label: 'present as icon', act: () => { command(rig, { type: 'presentation.update', presentationId: 'A-view', kind: 'icon' }); } },
      { label: 'close one presentation', act: () => { command(rig, { type: 'presentation.update', presentationId: 'A-view', closed: true }); } },
      { label: 'activate B', act: () => { command(rig, { type: 'worksite.activate', worksiteId: 'B' }); } },
      { label: 'activate A again', act: () => { command(rig, { type: 'worksite.activate', worksiteId: 'A' }); } },
    ];
    for (const action of actions) {
      action.act(); const probe = compiled(rig, 'A', `A after ${action.label}`);
      equal(probe.input, expected, `${action.label}: explicit A value remains stable`);
      onlyRead(probe.receipt, [ids.r], `${action.label}: supply remains R`);
    }
  });

  await group('C6', 'repeated reads and caller mutation of returned input cannot mutate live state', () => {
    const { rig, ids } = populated('detached'); supply(rig, 'A', ids.r, 'connect');
    const before = clone(state(rig)); const first = compiled(rig, 'A', 'first detached read').input;
    const expected = clone(first); const second = compiled(rig, 'A', 'second detached read').input;
    equal(second, expected, 'repeated read returns the same current value');
    const attempts = [
      () => { first.draft = 'caller changed draft'; },
      () => { first.materials[0].title = 'caller changed title'; },
      () => { first.materials[0].blocks[0].content = 'caller changed content'; },
      () => { first.materials[0].blocks[0].provenance.push('caller-parent'); },
      () => { first.materials.push(material('caller-injected')); },
    ];
    attempts.forEach(attempt => { try { attempt(); } catch { /* A frozen detached value is valid. */ } });
    equal(state(rig), before, 'caller mutation attempts leave real document and workspace unchanged');
    const third = compiled(rig, 'A', 'read after caller mutation'); equal(third.input, expected, 'later input does not contain caller mutations');
    onlyRead(third.receipt, [ids.r], 'read after caller mutation');
  });

  await group('C7', 'invalid and missing worksite identities return explicit errors without fallback or content access', () => {
    const { rig, ids } = populated('bad-id'); supply(rig, 'B', ids.m, 'connect');
    command(rig, { type: 'worksite.activate', worksiteId: 'B' });
    const attempts: Array<{ label: string; identity: unknown }> = [
      { label: 'undefined identity', identity: undefined }, { label: 'null identity', identity: null },
      { label: 'numeric identity', identity: 12 }, { label: 'object identity', identity: {} },
      { label: 'array identity', identity: ['B'] }, { label: 'empty identity', identity: '' },
      { label: 'whitespace identity', identity: '   ' }, { label: 'missing worksite', identity: 'no-such-worksite' },
    ];
    for (const attempt of attempts) {
      const probe = read(rig, attempt.identity, attempt.label); rejected(probe.result, `${attempt.label}: clear failure`);
      onlyRead(probe.receipt, [], attempt.label);
    }
    equal(rig.selection.getWorkspace().activeWorksiteId, 'B', 'failed explicit reads never fall back to or retarget active B');
  });

  await group('C8', 'a real selected node removed from the document fails closed before engine reconciliation', () => {
    const { rig, ids } = populated('gone'); supply(rig, 'A', ids.m, 'connect');
    const removed = rig.doc.getNode(ids.m); check(removed, 'actual M node exists before raw engine deletion');
    rig.doc.removeNode(removed);
    // IMPORTANT: no await, timer tick, reconcile, or service delete before reads.
    check(!rig.doc.getNode(ids.m), 'real document no longer owns M');
    equal(site(rig, 'A').checkedIds, [ids.m], 'selected reference still exists in the current synchronous call stack');
    const deletedState = clone(state(rig));
    for (let n = 1; n <= 2; n++) {
      const probe = read(rig, 'A', `missing selected M read ${n}`);
      rejected(probe.result, `missing selected M read ${n}: explicit fail-closed error`);
      check(probe.result.ok === false && /MISSING|REFERENCE|ASSET|NOT_FOUND|selected|材料|资产|引用|不存在/i.test(`${probe.result.error.code} ${probe.result.error.message}`), 'error identifies a missing material/reference instead of success with empty data');
      onlyRead(probe.receipt, [], `missing selected M read ${n}`);
      equal(state(rig), deletedState, 'failed read does not reconcile, repair or retarget the stale reference');
    }
    // group cleanup disposes service and cancels its engine bridge timer.
  });

  await group('C9', 'malformed selected node data returns an error without fixing or fabricating blocks', () => {
    const variants: Array<{ label: string; patch: Partial<KnotNode['data']> }> = [
      { label: 'non-string title', patch: { title: 7 } as any },
      { label: 'non-array blocks', patch: { blocks: {} } as any },
      { label: 'invalid provenance', patch: { blocks: [{ ...data('bad').blocks![0], provenance: null }] } as any },
      { label: 'duplicate block identity', patch: { blocks: [data('bad').blocks![0], data('bad').blocks![0]] } },
    ];
    for (const variant of variants) {
      const { rig, ids } = populated(`malformed-${variant.label.replace(/ /g, '-')}`);
      supply(rig, 'A', ids.m, 'connect');
      value(rig.svc.updateKnot(ids.m, variant.patch, { source: 'fixture:malformed-material' }), `fixture public update ${variant.label}`);
      const probe = read(rig, 'A', variant.label); rejected(probe.result, `${variant.label}: explicit content/structure failure`);
      onlyRead(probe.receipt, [ids.m], variant.label);
      dispose(rig);
    }
  });

  await group('C10', 'reads reject a genuine restoring health marker during a public document import callback', () => {
    const { rig, ids } = populated('restore-before'); supply(rig, 'A', ids.r, 'connect');
    const incoming = populated('restore-after'); supply(incoming.rig, 'A', incoming.ids.r, 'connect');
    const wanted = clone(incoming.rig.svc.getSnapshot()); let callbacks = 0; let observationFailure: unknown;
    const outerEvents: KnotEvent[] = []; const offEvents = rig.svc.subscribe(event => outerEvents.push(clone(event)));
    const original = rig.doc.fromJSON;
    const undo = patchPublic(rig.doc, 'fromJSON', function (this: any, json: unknown) {
      callbacks++;
      if (callbacks === 1) {
        try {
          equal(getSnapshotProblem(rig.doc)?.code, 'RESTORE_IN_PROGRESS', 'real restore exposes getSnapshotProblem barrier during import');
          for (let n = 1; n <= 2; n++) {
            const probe = read(rig, 'A', `in-progress import read ${n}`);
            rejected(probe.result, `in-progress import read ${n}: explicit health failure`, 'RESTORE_IN_PROGRESS');
            onlyRead(probe.receipt, [], `in-progress import read ${n}`);
          }
        } catch (error) { observationFailure = error; }
      }
      return original.call(this, json);
    });
    try {
      value(rig.svc.restoreSnapshot(wanted, { source: 'fixture:restore-health' }), 'outer valid restore succeeds');
      check(callbacks === 1, 'real engine import callback was observed exactly once', callbacks);
      check(observationFailure === undefined, 'all in-progress read assertions completed', String(observationFailure));
      equal(outerEvents.map(event => event.type), ['workspace.restored', 'snapshot.restored'], 'compiler reads produced no buffered command.failed or write events');
      equal(getSnapshotProblem(rig.doc), undefined, 'committed restore clears health barrier');
      equal(rig.svc.getSnapshot(), wanted, 'outer restore still commits the wanted document and workspace');
      onlyRead(compiled(rig, 'A', 'read after genuine restore').receipt, [incoming.ids.r], 'post-restore compiler');
    } finally { undo(); offEvents(); }
  });

  await group('C11', 'reads reject the still-locked workspace-restored callback even after the document marker clears', () => {
    const { rig } = populated('notification-before');
    const incoming = populated('notification-after'); supply(incoming.rig, 'A', incoming.ids.r, 'connect');
    const wanted = clone(incoming.rig.svc.getSnapshot()); let callbacks = 0; let observationFailure: unknown;
    const outerEvents: KnotEvent[] = []; const offEvents = rig.svc.subscribe(event => outerEvents.push(clone(event)));
    const offWorkspace = rig.selection.subscribeChanges(change => {
      if (change.type !== 'workspace.restored') return;
      callbacks++;
      try {
        equal(getSnapshotProblem(rig.doc), undefined, 'marker has cleared before public workspace-restored notification');
        for (let n = 1; n <= 2; n++) {
          const probe = read(rig, 'A', `restore notification read ${n}`);
          rejected(probe.result, `restore notification read ${n}: transaction remains unavailable`, 'RESTORE_IN_PROGRESS');
          onlyRead(probe.receipt, [], `restore notification read ${n}`);
        }
      } catch (error) { observationFailure = error; }
    });
    try {
      value(rig.svc.restoreSnapshot(wanted, { source: 'fixture:restore-notification' }), 'outer restore succeeds despite observing locked read attempts');
      equal(callbacks, 1, 'public workspace-restored callback actually ran once');
      check(observationFailure === undefined, 'all locked-notification read assertions completed', String(observationFailure));
      equal(outerEvents.map(event => event.type), ['workspace.restored', 'snapshot.restored'], 'locked reads produced no buffered failure events');
      equal(rig.svc.getSnapshot(), wanted, 'locked reads did not alter the restored target');
    } finally { offWorkspace(); offEvents(); }
  });

  await group('C12', 'a genuine failed rollback quarantines compiler reads until explicit successful recovery', () => {
    const { rig, ids } = populated('quarantine-before'); supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.r, 'connect');
    const before = clone(rig.svc.getSnapshot()); const expectedInput = compiled(rig, 'A', 'before quarantine').input;
    const incoming = populated('quarantine-after'); const wanted = clone(incoming.rig.svc.getSnapshot());
    let imports = 0;
    const undo = patchPublic(rig.doc, 'fromJSON', () => { imports++; throw new Error('fixture import and rollback import both fail'); });
    try { rejected(rig.svc.restoreSnapshot(wanted, { source: 'fixture:double-import-fault' }), 'actual failed rollback returns error', 'ROLLBACK_FAILED'); }
    finally { undo(); }
    equal(imports, 2, 'the actual engine import and rollback import both attempted and failed');
    const problem = getSnapshotProblem(rig.doc);
    check(problem?.code === 'RECOVERY_REQUIRED' && !!problem.message, 'actual rollback failure sets getSnapshotProblem quarantine', problem);
    const quarantinedState = clone(state(rig));
    for (let n = 1; n <= 2; n++) {
      const probe = read(rig, 'A', `quarantined read ${n}`);
      rejected(probe.result, `quarantined read ${n}: propagates explicit health error`, 'RECOVERY_REQUIRED');
      onlyRead(probe.receipt, [], `quarantined read ${n}`);
      equal(state(rig), quarantinedState, 'repeated quarantine read neither repairs nor clears health state');
    }
    value(rig.svc.restoreSnapshot(before, { source: 'fixture:explicit-recovery' }), 'explicit valid recovery succeeds');
    equal(getSnapshotProblem(rig.doc), undefined, 'successful explicit recovery clears quarantine');
    const recovered = compiled(rig, 'A', 'after explicit quarantine recovery'); equal(recovered.input, expectedInput, 'recovery preserves excluded M and selected R input');
    onlyRead(recovered.receipt, [ids.r], 'recovered input');
  });

  await group('C13', 'atomic UTF8 file save destroys the old container and constrains fresh restored input by persisted exclusion', () => {
    const first = populated('durable'); const { ids } = first;
    supply(first.rig, 'A', ids.m, 'connect'); supply(first.rig, 'B', ids.m, 'connect');
    supply(first.rig, 'A', ids.m, 'exclude'); supply(first.rig, 'A', ids.r, 'connect');
    command(first.rig, { type: 'worksite.activate', worksiteId: 'A' });
    command(first.rig, { type: 'presentation.open', id: 'durable-view', worksiteId: 'A', kind: 'icon', layout: { x: 31, y: 47 } });
    const expected = clone(first.rig.svc.getSnapshot());
    const expectedA = compiled(first.rig, 'A', 'A before file save').input;
    const expectedB = compiled(first.rig, 'B', 'B before file save').input;
    const directory = mkdtempSync(join(evidenceRoot, 'C13-file-storage-')); const file = join(directory, 'canvas-snapshot.json');
    let writes = 0; let reads = 0;
    const storage: SnapshotStorage = {
      getItem(key: string): string | null {
        if (key !== LS_KEY) throw new Error(`unexpected key ${key}`);
        reads++; return existsSync(file) ? readFileSync(file, 'utf8') : null;
      },
      setItem(key: string, raw: string): void {
        if (key !== LS_KEY) throw new Error(`unexpected key ${key}`);
        writeFileSync(`${file}.next`, raw, 'utf8'); renameSync(`${file}.next`, file); writes++;
      },
    };
    value(saveSnapshotLocal(expected, storage), 'save real snapshot through injected atomic file adapter');
    check(existsSync(file) && !existsSync(`${file}.next`), 'atomic rename committed file and consumed staging file');
    check(readFileSync(file, 'utf8').includes('现场 A 的草稿：之'), 'actual UTF8 bytes retain Chinese draft');
    const bytes = readFileSync(file, 'utf8');
    dispose(first.rig); check(first.rig.doc.disposed === true, 'old real WorkflowDocument is destroyed');
    const second = fresh(); equal(second.doc.getAllNodes().length, 0, 'new headless engine starts with no prior asset nodes');
    const loaded = value(loadSnapshotResult(storage), 'public loader reads committed file');
    check(loaded !== null, 'committed file supplies a snapshot'); equal(loaded, expected, 'disk snapshot matches saved document and workspace');
    value(initializeSnapshotOnce(second.doc, snapshot => second.svc.restoreSnapshot(snapshot, { source: 'fixture:file-recovery' }), storage), 'public startup initializer restores a fresh service');
    equal(second.svc.getSnapshot(), expected, 'fresh engine and workspace exactly recover persisted state');
    equal([site(second, 'A').checkedIds, site(second, 'A').excludedIds], [[ids.r], [ids.m]], 'fresh restored A retains manual M exclusion and R selection');
    const a = compiled(second, 'A', 'fresh restored A'); equal(a.input, expectedA, 'fresh A compilation still excludes M'); onlyRead(a.receipt, [ids.r], 'fresh A only reads R');
    const b = compiled(second, 'B', 'fresh restored B'); equal(b.input, expectedB, 'fresh B input still includes its M'); onlyRead(b.receipt, [ids.m], 'fresh B only reads M');
    equal(readFileSync(file, 'utf8'), bytes, 'compiler reads leave committed storage bytes unchanged');
    check(writes === 1 && reads >= 3, 'save/load/startup used actual file adapter reads with exactly one write', { writes, reads });
    storageEvidence.push({ group: 'C13', file, reads, writes, atomicAdapter: 'UTF8 .next write then renameSync', destroyedOldDocument: true, freshContainer: true, scope: 'same-process disk roundtrip; no session/runtime/network synchronization' });
  });

  await group('C14', 'a standalone public selection restore transaction blocks input until finish and its notifications return', () => {
    const { rig, ids } = populated('standalone');
    supply(rig, 'A', ids.m, 'exclude'); supply(rig, 'A', ids.r, 'connect');
    const before = clone(rig.selection.getWorkspace()); const wanted = clone(before);
    const target = wanted.worksites.find(item => item.id === 'A')!;
    target.draft = '独立 selection 事务的新草稿'; target.checkedIds = [ids.l];
    const events: KnotEvent[] = []; const changes: WorkspaceChange[] = [];
    const offEvents = rig.svc.subscribe(event => events.push(clone(event)));
    const offChanges = rig.selection.subscribeChanges(change => changes.push(clone(change)));
    const failures: Array<{ label: string; error: string }> = [];
    const retainFailure = (label: string, run: () => void): void => {
      try { run(); } catch (error) {
        const detail = error instanceof Error ? error.stack ?? error.message : String(error);
        failures.push({ label, error: detail }); log(`  RETAINED ${label}: ${detail}`);
      }
    };
    const blockedRead = (label: string): void => {
      // Keep both failure modes in red: a successful result AND unauthorized
      // node content visits. Continue through all three real transaction phases.
      let probe: ReturnType<typeof read> | undefined;
      retainFailure(`${label}: read-only envelope/state`, () => { probe = read(rig, 'A', label); });
      if (probe) {
        const observed = probe;
        retainFailure(`${label}: restoring error`, () => rejected(observed.result, `${label}: standalone transaction returns RESTORE_IN_PROGRESS`, 'RESTORE_IN_PROGRESS'));
        retainFailure(`${label}: content access`, () => onlyRead(observed.receipt, [], label));
      }
    };
    const transaction = rig.selection.beginRestoreTransaction();
    check(transaction, 'public standalone selection transaction begins');
    let finished = false; let notifications = 0;
    const offNotification = rig.selection.subscribeChanges(change => {
      if (change.type !== 'workspace.restored') return;
      notifications++;
      retainFailure('standalone finish notification facts', () => {
        equal(getSnapshotProblem(rig.doc), undefined, 'standalone finish notification has no document health marker');
        equal(rig.selection.getWorkspace(), wanted, 'finish notification resolves the staged real-reference workspace');
      });
      blockedRead('standalone finish notification');
    });
    try {
      equal(getSnapshotProblem(rig.doc), undefined, 'begin has no operation document restore marker');
      const controlBefore = clone(state(rig));
      // disconnectAll on a real asset with no incident edges passes the
      // operation's blockedWrite guard and removes zero edges. This proves the
      // operation restore barrier is inactive without inspecting private fields.
      equal(value(rig.svc.disconnectAll(ids.l, { source: 'fixture:standalone-noop-control' }), 'public zero-edge disconnect confirms operation restore barrier is inactive'), 0, 'public operation control removed zero edges');
      equal(state(rig), controlBefore, 'public operation control changes no state');
      equal(events, [], 'public operation control emits no event');
      blockedRead('standalone after begin');
      value(transaction.restore(wanted, 'fixture:standalone-owner'), 'owner restores valid changed draft and checked IDs through public handle');
      equal(rig.selection.getWorkspace(), wanted, 'staged standalone workspace changes A draft and actual checked asset reference');
      equal(getSnapshotProblem(rig.doc), undefined, 'staged standalone restore still has no document marker');
      equal([events, changes], [[], []], 'standalone restore buffers its own notifications before finish');
      blockedRead('standalone after handle restore');
      transaction.finish(true); finished = true;
      equal(notifications, 1, 'finish(true) actually dispatches one real workspace-restored callback');
      equal(changes.map(change => change.type), ['workspace.restored'], 'only the owner transaction publishes one workspace change');
      equal(events.map(event => event.type), ['workspace.restored'], 'compiler attempts publish no extra event around standalone finish');
      const after = compiled(rig, 'A', 'standalone after finish returns');
      equal(after.input, { worksiteId: 'A', assetId: ids.a, conversationId: 'conversation-A', draft: target.draft, agentId: target.agentId,
        materials: [material(ids.l, data(ids.l, undefined, true))] }, 'after finish returns, compiler reads the committed new input');
      onlyRead(after.receipt, [ids.l], 'committed standalone input');
      equal(rig.selection.getWorkspace(), wanted, 'post-finish compilation preserves committed transaction state');
      if (failures.length) throw new Error(`Standalone transaction read failures retained across all phases:\n${JSON.stringify(failures, null, 2)}`);
    } finally {
      offNotification(); offChanges(); offEvents();
      if (!finished) {
        // finish(false) discards notifications; the owner restores before first.
        transaction.restore(before, 'fixture:standalone-owner-cleanup'); transaction.finish(false);
      }
    }
  });
}

main().catch(error => { log(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; })
  .finally(() => {
    // Cover any accidental fetch outside a compiler probe as well.
    if (fetchAttempts.length > 0) { log(`FAIL suite attempted ${fetchAttempts.length} synthetic-blocked fetch call(s)`); process.exitCode = 1; }
    globalThis.fetch = originalFetch;
    const failed = groups.filter(groupResult => groupResult.status === 'fail').length;
    if (failed > 0) process.exitCode = 1;
    log(`\nSUMMARY ${groups.length - failed} PASS / ${failed} FAIL; fetch=${fetchAttempts.length}; no independent acceptance`);
    const report = {
      contract: 'Knot read-only worksite input compiler', preparedOn: '2026-10-04', ranAt: new Date().toISOString(),
      scope: 'Maker behavioral evidence only; preparation becomes runnable after copy to a separately cloned accepted W3-A app/tests',
      groups, readEvidence, storageEvidence, fetchAttempts,
      summary: { pass: groups.length - failed, fail: failed, exitCode: process.exitCode ?? 0 }, logPath,
    };
    if (reportPath) { writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); log(`JSON ${reportPath}`); }
    writeFileSync(logPath, `${logs.join('\n')}\n`, 'utf8');
    console.log(`LOG ${logPath}`);
  });
