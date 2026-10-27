import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createActualRequestGate } from '../packages/dsh-plugin/src/run-request-gate.mjs';
import { runHash, runPromptText } from '../packages/dsh-plugin/src/run.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';

// Pure SYNTHETIC request-boundary units. Actual official AgentLoop integration
// remains in run-integrated-official-worker.cjs; these stubs are never a real Run.
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-request-gate-synthetic-'));
  const { store, run: prepared } = await prepareSyntheticReadRun(join(dir, 'state.json'));
  const constraints = { provider: 'synthetic', model: 'never-called', maxTokens: 64, requestSha256: 'a'.repeat(64) };
  const { run } = await store.claimRunDispatch(prepared.runId, constraints);
  const claim = run.dispatchClaim;
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const config = { provider: constraints.provider, model: constraints.model, maxTokens: 64, reasoningEffort: 'off' };
  const options = { ...config, sessionId: run.plannedSessionId, toolHistory: { tools: [], updates: [] },
    messages: [{ id: 'synthetic-message', role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(run.input) }] }] };
  const header = { config: { ...config } }, context = { provider: config.provider, model: config.model };
  const session = { id: run.plannedSessionId, header: { id: run.plannedSessionId, version: 4, createdAt: 0, isSeeded: false },
    requestHeader: () => header, requestContext: () => context };
  const binding = { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId, inputSha256: run.inputSha256,
    claimId: claim.claimId, constraintsSha256: claim.constraintsSha256 };
  const original = { version: 1, binding, options: structuredClone(options), sessionHeader: session.header,
    requestHeader: structuredClone(header), requestContext: structuredClone(context) };
  // Compute the expected fingerprint independently of the observer's supplied
  // hash, before mutations, instead of authorizing whatever it sees.
  const expectedHash = runHash(original);
  const authorizeRequest = snapshot => {
    assert.equal(Object.isFrozen(snapshot.request.options.messages), true);
    return { approved: true, ...binding, requestSha256: expectedHash, ...config };
  };
  const base = { run, auditDirectory: join(dir, 'audit'), authorizeRequest };
  return { base, options, session, header, context, binding, expectedHash, dir };
}

test('SYNTHETIC actual request approval records complete independent fingerprint and receipt; only once', async t => {
  const f = await fixture(t), gate = createActualRequestGate(f.base);
  const audit = await gate.approve(f.options, f.session);
  assert.equal(audit.requestSha256, f.expectedHash);
  const disk = JSON.parse(await readFile(audit.auditFile));
  assert.equal(disk.requestSha256, runHash(disk.request));
  assert.deepEqual(disk.request.options, f.options);
  assert.deepEqual(disk.request.binding, f.binding);
  assert.equal(disk.receipt.requestSha256, f.expectedHash);
  assert.equal(disk.generationStarted, 'not-attested');
  await assert.rejects(gate.approve(f.options, f.session), { code: 'REQUEST_REPLAY' });
});

test('SYNTHETIC message/header/context and route/tools changes cannot reuse original request approval', async t => {
  const changes = [
    f => { f.options.messages[0].content[0].text += ' changed'; },
    f => { f.header.config.maxTokens = 63; },
    f => { f.context.contextWindow = 999; },
    f => { f.options.provider = 'other'; },
    f => { f.options.model = 'other'; },
    f => { f.options.maxTokens = 128; },
    f => { f.options.reasoningEffort = 'high'; },
    f => { f.options.tools = [{ name: 'forbidden' }]; },
    f => { f.options.toolHistory.updates.push({ type: 'forbidden' }); },
  ];
  for (const change of changes) {
    const f = await fixture(t); change(f);
    const gate = createActualRequestGate(f.base);
    await assert.rejects(gate.approve(f.options, f.session));
    assert.equal(gate.status(), null);
  }
});

test('SYNTHETIC default deny, wrong claim receipt, byte/token caps, and audit write failure stay closed', async t => {
  const configurations = [
    { authorizeRequest: undefined },
    { authorizeRequest: () => ({ approved: true }) },
    { maxInputBytes: 1 },
    { maxOutputTokens: 32 },
  ];
  for (const patch of configurations) {
    const f = await fixture(t), gate = createActualRequestGate({ ...f.base, ...patch });
    await assert.rejects(gate.approve(f.options, f.session)); assert.equal(gate.status(), null);
  }
  const f = await fixture(t), gate = createActualRequestGate(f.base);
  const saved = await gate.approve(f.options, f.session);
  const bytes = await readFile(saved.auditFile);
  const collision = createActualRequestGate(f.base);
  await assert.rejects(collision.approve(f.options, f.session), { code: 'EEXIST' });
  assert.deepEqual(await readFile(saved.auditFile), bytes); assert.equal(collision.status(), null);
});

test('SYNTHETIC cancellation interrupts pending authorization and late approval cannot admit a stream', async t => {
  const f = await fixture(t), abort = new AbortController();
  let resolve, called;
  const started = new Promise(r => { called = r; });
  const gate = createActualRequestGate({ ...f.base, signal: abort.signal, authorizeRequest: snapshot => {
    called(); return new Promise(r => { resolve = () => r(f.base.authorizeRequest(snapshot)); });
  } });
  const pending = gate.approve(f.options, f.session);
  await started; abort.abort();
  await assert.rejects(pending, { code: 'REQUEST_CANCELLED' });
  resolve(); await new Promise(r => setImmediate(r));
  assert.equal(gate.status(), null);
  await assert.rejects(gate.approve(f.options, f.session), { code: 'REQUEST_CANCELLED' });
});

test('SYNTHETIC request mutation during authorization or after audit rejects before downstream stream', async t => {
  for (const change of [
    f => { f.options.messages[0].content[0].text += ' changed during await'; },
    f => { f.options.provider = 'changed-during-await'; },
    f => { f.options.tools = [{ name: 'changed-during-await' }]; },
    f => { f.header.config.maxTokens = 63; },
  ]) {
    const f = await fixture(t);
    let release, started;
    const ready = new Promise(r => { started = r; });
    const gate = createActualRequestGate({ ...f.base, authorizeRequest: snapshot => {
      started(); return new Promise(r => { release = () => r(f.base.authorizeRequest(snapshot)); });
    } });
    let streams = 0;
    const pending = (async () => { const grant = await gate.approve(f.options, f.session); grant.verify(); streams++; })();
    await ready; change(f); release();
    await assert.rejects(pending, { code: 'REQUEST_CHANGED' });
    assert.equal(streams, 0);
  }
  const f = await fixture(t), gate = createActualRequestGate(f.base);
  const approval = await gate.approve(f.options, f.session);
  f.options.messages[0].content[0].text += ' after audit';
  assert.throws(approval.verify, { code: 'REQUEST_CHANGED' });
});
