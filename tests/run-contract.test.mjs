import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { dshPromptRequest, runPromptText, runHash, inspectDshRun } from '../packages/dsh-plugin/src/run.mjs';

// All runtime events in this file are SYNTHETIC TEST FIXTURES. No model/DSH invocation.
const block = (content, provenance = []) => ({ id: 'b1', source: 'manual', timestamp: '2026-10-22T00:00:00Z', provenance, content });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-run-synthetic-'));
  const file = join(dir, 'state.json');
  const store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  for (const id of ['A', 'B', 'C', 'target']) assert.equal((await store.command({ type: 'knot.create', id,
    data: { title: id, summary: `text ${id}`, blocks: [block(`text ${id}`, id === 'A' ? ['C'] : [])] } })).ok, true);
  for (const command of [
    { type: 'worksite.create', id: 'one', assetId: 'target', conversationId: 'dialogue' },
    { type: 'worksite.create', id: 'two' },
    { type: 'worksite.update', worksiteId: 'one', draft: 'draft one', agentId: 'agent-one' },
    { type: 'worksite.supply', worksiteId: 'one', assetId: 'A', mode: 'connect' },
    { type: 'worksite.supply', worksiteId: 'one', assetId: 'B', mode: 'connect' },
    { type: 'worksite.supply', worksiteId: 'one', assetId: 'B', mode: 'exclude' },
    { type: 'worksite.supply', worksiteId: 'two', assetId: 'C', mode: 'connect' },
  ]) assert.equal((await store.command(command)).ok, true);
  const prepare = { type: 'run.prepare', worksiteId: 'one', targetId: 'target', sessionId: 'synthetic-fresh-session', requestId: 'request-one' };
  return { store, file, dir, prepare };
}
function syntheticEvidence(run, reason = { kind: 'completed' }) {
  const entries = [
    ['turn/start', { turn: 1 }],
    ['step/start', { turn: 1, step: 1 }],
    ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(run.input) }] }],
    ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: 'synthetic result' }] }, stream: [] }],
    ['step/end', { turn: 1, step: 1 }],
    ['turn/end', { turn: 1, reason }],
  ];
  return { sessionId: run.plannedSessionId, kind: 'synthetic-test', events: entries.map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) };
}

test('prepared Run freezes explicit supply and prompt wire, never executes; journal survives restart', async t => {
  const { store, file, prepare } = await fixture(t);
  const baseline = store.read();
  const { value: run, ok } = await store.command(prepare);
  assert.equal(ok, true); assert.equal(run.status, 'prepared'); assert.equal(run.receipt, null);
  assert.deepEqual(run.input.materials.map(item => item.id), ['A']);
  assert.equal(run.input.revision, baseline.revision); assert.equal(run.input.seq, baseline.seq);
  assert.equal(run.input.agentId, 'agent-one'); assert.equal(run.input.conversationId, 'dialogue');
  assert.equal(run.inputSha256, runHash(run.input));
  assert.deepEqual(dshPromptRequest(run), { requestId: run.requestId, sessionId: 'synthetic-fresh-session', mode: 'queue',
    content: [{ type: 'text', text: runPromptText(run.input) }] });
  await store.command({ type: 'knot.update', id: 'A', patch: { summary: 'changed', blocks: [block('new A')] } });
  await store.command({ type: 'worksite.update', worksiteId: 'one', draft: 'changed draft' });
  assert.equal(store.read().runs[0].input.materials[0].blocks[0].content, 'text A');
  const seq = store.read().seq;
  assert.equal((await store.command(prepare)).value.runId, run.runId);
  assert.equal(store.read().seq, seq);
  assert.equal((await store.command({ ...prepare, targetId: 'A' })).error.code, 'RUN_REQUEST_CONFLICT');
  const saved = store.read(); await store.close();
  const reopened = await new KontStore(file).init();
  try { assert.deepEqual(reopened.read(), saved); assert.equal(reopened.eventsSince(0).reset, true); }
  finally { await reopened.close(); }
});

test('synthetic completed log returns one stable generated block atomically; identical retry is a no-op', async t => {
  const { store, file, prepare } = await fixture(t);
  const run = (await store.command(prepare)).value;
  const evidence = syntheticEvidence(run);
  const previous = store.read();
  const result = await store.returnRun(run.runId, evidence);
  assert.equal(result.status, 'completed'); assert.equal(result.receipt.evidenceKind, 'synthetic-test');
  assert.equal(result.receipt.turn, 1); assert.equal(result.receipt.promptSeq, 2);
  const target = store.read().assets.find(item => item.id === 'target');
  assert.equal(target.blocks[0].id, 'b1'); assert.equal(target.blocks[1].id, 'b2');
  assert.deepEqual(target.blocks[1].provenance, ['A']); assert.equal(target.blocks[1].source, 'generated');
  assert.equal(target.blocks[1].content, 'synthetic result');
  assert.equal(store.read().revision, previous.revision + 1); assert.equal(store.read().seq, previous.seq + 2);
  assert.deepEqual(store.eventsSince(previous.seq).events.map(event => event.type), ['knot.updated', 'run.returned']);
  const bytes = await readFile(file, 'utf8');
  assert.deepEqual(await store.returnRun(run.runId, evidence), result);
  assert.equal(await readFile(file, 'utf8'), bytes);
  const changed = structuredClone(evidence); changed.events[3].data.message.content[0].text = 'different';
  await assert.rejects(store.returnRun(run.runId, changed), { code: 'RUN_RETURN_CONFLICT' });
  await store.close(); const reopened = await new KontStore(file).init();
  try { assert.deepEqual(reopened.read().runs[0], result); assert.equal(reopened.read().assets.find(item => item.id === 'target').blocks.length, 2); }
  finally { await reopened.close(); }
});

test('synthetic failure/cancel/unknown/partial/gap/correlation/context cases preserve prepared state and bytes', async t => {
  const { store, file, prepare } = await fixture(t);
  const run = (await store.command(prepare)).value;
  const before = await readFile(file, 'utf8');
  const invalid = [];
  for (const kind of ['aborted', 'blocked', 'error', 'max-tokens', 'interrupted', 'forked', 'unknown']) invalid.push(syntheticEvidence(run, { kind, reason: { kind: 'user' } }));
  const alter = fn => { const evidence = syntheticEvidence(run); fn(evidence); invalid.push(evidence); };
  alter(e => { e.sessionId = 'wrong'; });
  alter(e => { e.events[2].data.source.rpcId = 'wrong'; });
  alter(e => { e.events[2].data.role = 'system'; });
  alter(e => { e.events[2].data.content[0].text += 'extra'; });
  alter(e => { e.events[3].data.turn = 2; });
  alter(e => { e.events[3].data.step = 2; });
  alter(e => { e.events[3].data.message.source.kind = 'user'; });
  alter(e => { e.events[3].data.interrupted = true; });
  alter(e => { e.events[3].data.message.content[0].type = 'image'; });
  alter(e => { e.events[3].seq = 8; });
  alter(e => { e.events.pop(); });
  alter(e => { e.events[3].type = 'assistant/attempt'; });
  alter(e => { e.events[3].type = 'tool/call'; });
  alter(e => { e.events[0].data.turn = 2; });
  alter(e => { e.events.unshift({ type: 'user/message', seq: 0, time: 0, data: { role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'hidden context' }] } }); e.events.forEach((event, seq) => { event.seq = seq; }); });
  alter(e => { e.events[3] = { ...e.events[3], type: 'agent/inbox/spliced', data: { inserted: [{ role: 'user', source: { kind: 'user', rpcId: 'foreign' }, content: [{ type: 'text', text: 'foreign' }] }] } }; });
  alter(e => { e.events.push(...syntheticEvidence(run).events.map(event => ({ ...event, seq: event.seq + 6 }))); });
  for (const evidence of invalid) {
    await assert.rejects(store.returnRun(run.runId, evidence));
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(store.read().runs[0].status, 'prepared');
  }
  assert.throws(() => inspectDshRun(run, { accepted: true }));
  for (const type of ['run.complete', 'run.return', 'run.bind', 'run.cancel']) assert.equal((await store.command({ type, runId: run.runId, evidence: syntheticEvidence(run) })).error.code, 'UNSUPPORTED_COMMAND');
});

test('target CAS rejects changed/deleted asset; snapshot restore preserves journal and rejects forged receipt', async t => {
  const { store, file, prepare } = await fixture(t);
  const run = (await store.command(prepare)).value;
  const exported = store.snapshot();
  await store.restoreSnapshot(exported);
  assert.deepEqual(store.read().runs[0], run);
  const forged = structuredClone(exported); forged.runs[0].input.draft = 'forged';
  const before = await readFile(file, 'utf8');
  await assert.rejects(store.restoreSnapshot(forged));
  const erased = structuredClone(exported); erased.runs = [];
  await assert.rejects(store.restoreSnapshot(erased), { code: 'RUN_RESTORE_CONFLICT' });
  assert.equal(await readFile(file, 'utf8'), before);
  await store.command({ type: 'knot.update', id: 'target', patch: { summary: 'user changed target' } });
  await assert.rejects(store.returnRun(run.runId, syntheticEvidence(run)), { code: 'RUN_TARGET_CHANGED' });
  const withoutTarget = { assets: exported.assets.filter(item => item.id !== 'target'), edges: [] };
  await store.restoreSnapshot(withoutTarget);
  assert.deepEqual(store.read().runs[0], run);
  await assert.rejects(store.returnRun(run.runId, syntheticEvidence(run)), { code: 'RUN_TARGET_CHANGED' });
});

test('failed return persistence cannot emit or expose a generated block; corrupted Run input is rejected on reopen', async t => {
  const { store, file, prepare } = await fixture(t);
  const run = (await store.command(prepare)).value;
  const before = store.read(); const bytes = await readFile(file, 'utf8');
  const events = []; store.subscribe(event => events.push(event));
  const backup = `${file}.backup`; await rename(file, backup); await mkdir(file);
  await assert.rejects(store.returnRun(run.runId, syntheticEvidence(run)));
  assert.deepEqual(store.read(), before); assert.deepEqual(events, []);
  assert.equal(await readFile(backup, 'utf8'), bytes);
  await rm(file, { recursive: true }); await rename(backup, file);
  await store.close();
  const corrupt = JSON.parse(bytes); corrupt.runs[0].input.materials[0].blocks[0].content = 'tampered';
  const corruptBytes = JSON.stringify(corrupt); await writeFile(file, corruptBytes);
  await assert.rejects(new KontStore(file).init());
  assert.equal(await readFile(file, 'utf8'), corruptBytes);
});
