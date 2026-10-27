import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDshRunObserver } from '../packages/dsh-plugin/src/dsh-run-read.mjs';
import { runHash, runPromptText } from '../packages/dsh-plugin/src/run.mjs';
import { prepareSyntheticReadRun, recordedSyntheticEvents } from './helpers/run-read-fixture.mjs';

// Recorded SYNTHETIC fixtures + intentionally fake seam for adapter failure tests.
// The separate official-worker test exercises actual installed Session + JSONL.
const FakeSession = { create(_id, events) {
  return {
    requestHeader: () => events.findLast(event => event.type === 'request/header')?.data.header,
    requestContext: () => events.findLast(event => event.type === 'request/context')?.data,
    deriveMessages: () => events.filter(event => ['system/message', 'developer/message', 'user/message'].includes(event.type))
      .map(event => event.type === 'user/message' ? event.data : event.data.message),
  };
} };
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-run-read-fake-seam-'));
  const { store, run } = await prepareSyntheticReadRun(join(dir, 'knot.json'));
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const events = recordedSyntheticEvents(run, runPromptText(run.input));
  const header = { version: 4, id: run.plannedSessionId, createdAt: 1792627200000, isSeeded: false, delegationDepth: 0 };
  const calls = { stat: 0, open: 0, read: 0, close: 0, replay: 0 };
  const state = { events, header, revision: 'synthetic-revision', formatStatus: 'current', sizeBytes: 4096,
    grant: { allowed: true, binding: { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId, inputSha256: run.inputSha256 } } };
  const snapshot = () => ({ header: state.header, formatStatus: state.formatStatus, revision: state.revision, sizeBytes: state.sizeBytes });
  const persistence = {
    async stat(id) { calls.stat++; assert.equal(id, run.plannedSessionId); return snapshot(); },
    async open(id, access) {
      calls.open++; assert.equal(id, run.plannedSessionId); assert.equal(access, 'read');
      return { id, header: structuredClone(state.header), access, inheritedEventCount: 0,
        async read(offset, length) { calls.read++; assert.equal(offset, 0); assert.equal(length, 1001); return { events: state.events, eventState: 'detached' }; },
        async close() { calls.close++; },
      };
    },
  };
  const options = { hostVersion: '0.2.1-rc.2', persistence, Session: { create(...args) { calls.replay++; return FakeSession.create(...args); } },
    readRun: id => { assert.equal(id, run.runId); return store.read().runs[0]; }, authorizeRead: () => state.grant };
  return { store, run, state, calls, options, persistence };
}
function referenceFingerprint(run, state) {
  const cut = state.events.findIndex(event => event.type === 'assistant/message');
  const prefix = FakeSession.create(run.plannedSessionId, state.events.slice(0, cut));
  return runHash({ version: 1, binding: { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId, inputSha256: run.inputSha256 },
    sessionHeader: state.header, requestHeader: prefix.requestHeader(), requestContext: prefix.requestContext(), messages: prefix.deriveMessages(),
    permissionFacts: state.events.slice(0, cut).filter(event => ['sandbox/mode', 'approval/policy', 'permission/preset'].includes(event.type)),
    metadata: state.events.slice(0, cut).filter(event => ['working-directory/change', 'agent-preset/selected', 'model/selection'].includes(event.type)) });
}

test('read permission is default-deny and exact binding/version gate precedes every persistence call', async t => {
  const { options, run, state, calls } = await fixture(t);
  for (const patch of [
    { authorizeRead: undefined }, { hostVersion: '0.1.7-rc.2' }, { authorizeRead: () => ({ allowed: false }) },
    { authorizeRead: () => ({ ...state.grant, binding: { ...state.grant.binding, inputSha256: '0'.repeat(64) } }) },
    { authorizeRead: () => ({ ...state.grant, binding: { ...state.grant.binding, requestId: 'other' } }) },
    { authorizeRead: () => ({ ...state.grant, approvedRequestSha256: 'not-a-sha' }) },
  ]) await assert.rejects(createDshRunObserver({ ...options, ...patch }).observe(run.runId));
  assert.equal(calls.open, 0); assert.equal(calls.stat, 0); assert.equal(calls.read, 0);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(createDshRunObserver(options).observe(run.runId, { signal: abort.signal }), { code: 'DSH_READ_CANCELLED' });
  assert.equal(calls.stat, 0);
});

test('missing/mismatch request approval is explicit; reference fingerprint approval never authorizes execution or writes', async t => {
  const { options, run, state, store, calls } = await fixture(t);
  const bytes = await readFile(store.file);
  const observer = createDshRunObserver(options);
  const missing = await observer.observe(run.runId);
  assert.equal(missing.status, 'needs_request_approval'); assert.equal(missing.requestFingerprintApproved, false);
  state.grant.approvedRequestSha256 = '0'.repeat(64);
  assert.equal((await observer.observe(run.runId)).status, 'request_approval_mismatch');
  state.grant.approvedRequestSha256 = referenceFingerprint(run, state);
  const approved = await observer.observe(run.runId);
  assert.equal(approved.status, 'request_fingerprint_approved'); assert.equal(approved.executionAuthorized, false);
  assert.equal(approved.modelRunVerified, false); assert.equal(approved.contentIncluded, false);
  assert.equal(approved.messageCount, 4); assert.notEqual(approved.inputSha256, approved.requestSha256);
  assert.equal(Object.isFrozen(approved), true); assert.equal(Object.isFrozen(approved.binding), true);
  const encoded = JSON.stringify(approved);
  for (const text of ['synthetic system instruction', 'synthetic developer instruction', 'synthetic runtime context', 'synthetic-only output', 'synthetic audit prompt']) assert.equal(encoded.includes(text), false);
  assert.deepEqual(await readFile(store.file), bytes); assert.equal(store.read().runs[0].status, 'prepared');
  assert.equal(calls.close, 3); assert.equal(calls.replay, 6);
});

test('system/developer/runtime context, config route/maxTokens and permission changes invalidate independent request approval', async t => {
  const { options, run, state } = await fixture(t);
  const original = structuredClone(state.events);
  state.grant.approvedRequestSha256 = referenceFingerprint(run, state);
  const changes = [
    events => { events[5].data.message.content[0].text += ' changed'; },
    events => { events[6].data.message.content[0].text += ' changed'; },
    events => { events[7].data.content[0].text += ' changed'; },
    events => { events[9].data.header.config.maxTokens = 128; },
    events => { events[10].data.contextWindow = 16384; },
    events => { events[0].data.mode = 'workspace-write'; },
    events => { events[1].data.policy = 'never'; },
    events => { events[2].data.preset = 'changed-preset'; },
    events => { events[9].data.header.config.model = 'changed'; events[10].data.model = 'changed'; events[11].data.message.source.model = 'changed'; },
  ];
  for (const change of changes) {
    state.events = structuredClone(original); change(state.events);
    const observed = await createDshRunObserver(options).observe(run.runId);
    assert.equal(observed.status, 'request_approval_mismatch'); assert.equal(observed.executionAuthorized, false);
  }
});

test('old/migrated/seeded/oversized/changed identity observations refuse before or after read and close any acquired handle', async t => {
  const { options, run, state, calls, persistence } = await fixture(t);
  const original = structuredClone(state);
  for (const change of [s => { s.formatStatus = 'migration-required'; }, s => { s.header.version = 3; },
    s => { s.header.isSeeded = true; }, s => { s.header.id = 'foreign'; }, s => { s.sizeBytes = 9 * 1024 * 1024; }]) {
    Object.assign(state, structuredClone(original)); change(state);
    await assert.rejects(createDshRunObserver(options).observe(run.runId));
  }
  assert.equal(calls.open, 0);
  Object.assign(state, structuredClone(original));
  const stats = persistence.stat;
  let currentCalls = 0;
  persistence.stat = async (...args) => ({ ...await stats(...args), revision: ++currentCalls === 1 ? 'one' : 'two' });
  await assert.rejects(createDshRunObserver(options).observe(run.runId), { code: 'DSH_OBSERVATION_CHANGED' });
  assert.equal(calls.close, 1);
});

test('narrow field, sequence, cancellation, failure and surface negatives cannot become approved observations', async t => {
  const { options, run, state, calls } = await fixture(t);
  const original = structuredClone(state.events);
  const changes = [
    e => { e[8].data.source.rpcId = 'wrong'; }, e => { e[8].data.role = 'developer'; },
    e => { e[8].data.content[0].text += 'wrong'; }, e => { e[8].surfaceOp = 'replace'; },
    e => { delete e[8].data.id; }, e => { e[8].data.content[0].type = 'image'; },
    e => { e[3].data.turn = 2; }, e => { e[4].data.step = 2; },
    e => { e[9].data.header.config.maxTokens = '64'; }, e => { e[9].data.header.tools = [{ name: 'x' }]; },
    e => { e[10].data.provider = 'wrong'; }, e => { e[11].data.message.source.model = 'wrong'; },
    e => { e[11].data.stream = [{}]; }, e => { e[11].data.message.role = 'user'; },
    e => { e[13].data.reason = { kind: 'aborted', reason: { kind: 'user' } }; },
    e => { e[13].data.reason = { kind: 'interrupted' }; }, e => { e.pop(); },
    e => { e[11].seq = 999; }, e => { e[2].type = 'tool/call'; }, e => { e[2].type = 'session/end-seed'; },
    e => { e.splice(2, 1); e.forEach((event, seq) => { event.seq = seq; }); },
    e => { e[9].data.header.config.apiKey = 'synthetic-never-expose'; },
    e => { const extra = structuredClone(e[6]); e.splice(11, 0, extra); e.forEach((event, seq) => { event.seq = seq; }); },
    e => { [e[9], e[10]] = [e[10], e[9]]; e.forEach((event, seq) => { event.seq = seq; }); },
  ];
  for (const change of changes) {
    state.events = structuredClone(original); change(state.events);
    await assert.rejects(createDshRunObserver(options).observe(run.runId));
  }
  assert.equal(calls.close, changes.length);
  state.events = [...Array(1001)].map((_, seq) => ({ ...original[0], seq }));
  await assert.rejects(createDshRunObserver(options).observe(run.runId), { code: 'DSH_LOG_LIMIT' });
  assert.equal(calls.close, changes.length + 1);
});

test('IO/replay/close exceptions are sanitized, acquired handles close, and cancellation during read/close refuses results', async t => {
  const { options, run, calls, persistence } = await fixture(t);
  const open = persistence.open;
  const privateText = 'C:/private/synthetic-token-and-private-body';
  for (const phase of ['read', 'close', 'replay']) {
    persistence.open = async (...args) => {
      const handle = await open(...args);
      if (phase === 'read') handle.read = async () => { throw new Error(privateText); };
      if (phase === 'close') handle.close = async () => { calls.close++; throw new Error(privateText); };
      return handle;
    };
    const observer = createDshRunObserver({ ...options, ...(phase === 'replay' ? { Session: { create() { throw new Error(privateText); } } } : {}) });
    await assert.rejects(observer.observe(run.runId), error => !String(error).includes(privateText) && ['DSH_READ_FAILED', 'DSH_CLOSE_FAILED'].includes(error.code));
  }
  assert.equal(calls.close, 3);
  for (const phase of ['read', 'close']) {
    const abort = new AbortController();
    persistence.open = async (...args) => {
      const handle = await open(...args);
      const original = handle[phase];
      handle[phase] = async (...args) => { abort.abort(); return original(...args); };
      return handle;
    };
    await assert.rejects(createDshRunObserver(options).observe(run.runId, { signal: abort.signal }), { code: 'DSH_READ_CANCELLED' });
  }
  assert.equal(calls.close, 5);
});
