import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { compileRunInput, validateRun, runHash, runPromptText, validateDispatchConstraints } from '../packages/dsh-plugin/src/run.mjs';
import { projectRun, listRuns, getRun } from '../packages/dsh-plugin/src/run-query.mjs';
import { createRunStatusView } from '../packages/dsh-plugin/src/run-status-view.mjs';
import { parseReadAuditConfig } from '../packages/dsh-plugin/src/read-audit-config.mjs';

// SYNTHETIC ONLY: opaque references grant no Agent resolution or Session read.
const ref = name => ` ${name}/中文%${'x'.repeat(214)} `;
const refs = Object.fromEntries(['target', 'material', 'block', 'history', 'agent', 'conversation', 'worksite'].map(k => [k, ref(k)]));
async function fixture(t, long = true) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-reference-domains-')), file = join(dir, 'state.json');
  let store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const target = long ? refs.target : 'old-target', material = long ? refs.material : 'old-material';
  const command = async c => { const result = await store.command(c); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
  await command({ type: 'knot.create', id: target, data: { title: 'Target', summary: 'initial' } });
  await command({ type: 'knot.create', id: material, data: { title: 'Material', summary: 'text', blocks: [{ id: long ? refs.block : 'b1', source: 'manual', timestamp: '2026-10-26T00:00:00Z', content: 'text', provenance: [long ? refs.history : 'history'] }] } });
  await command({ type: 'worksite.create', id: 'one', assetId: target, conversationId: long ? refs.conversation : null });
  await command({ type: 'worksite.update', worksiteId: 'one', agentId: long ? refs.agent : null, draft: 'synthetic draft' });
  await command({ type: 'worksite.supply', worksiteId: 'one', assetId: material, mode: 'connect' });
  return { file, target, material, command, get store() { return store; }, reopen: async () => { await store.close(); store = await new KontStore(file).init(); } };
}
const prepare = (f, extra = {}) => ({ type: 'run.prepare', worksiteId: 'one', targetId: f.target, requestId: 'synthetic-reference-request', sessionId: 'synthetic-reference-session', ...extra });
const evidence = run => ({ sessionId: run.plannedSessionId, kind: 'synthetic-test', events: [
  ['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
  ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(run.input) }] }],
  ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: 'synthetic output' }] }, stream: [] }],
  ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
].map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) });

test('Core opaque references retain literal values through persisted preview, prepare, query, view and synthetic return', async t => {
  const f = await fixture(t); await f.reopen();
  const preview = f.store.preview('one');
  assert.equal(preview.materials[0].id, refs.material);
  assert.equal(preview.materials[0].blocks[0].id, refs.block);
  assert.deepEqual(preview.materials[0].blocks[0].provenance, [refs.history]);
  preview.materials[0].blocks[0].provenance.push('not-supplied');
  const input = compileRunInput(f.store.read(), 'one');
  assert.equal(input.agentId, refs.agent); assert.equal(input.conversationId, refs.conversation); assert.equal(input.assetId, refs.target);
  assert.deepEqual(input.materials.map(m => m.id), [refs.material]);
  assert.deepEqual(input.materials[0].blocks[0].provenance, [refs.history]);
  const run = await f.command(prepare(f));
  assert.equal(run.inputSha256, runHash(run.input));
  const dto = projectRun(run);
  assert.equal(dto.targetId, refs.target);
  assert.deepEqual(listRuns(f.store.read()).runs, [dto]);
  assert.deepEqual(getRun(f.store.read(), run.runId).run, dto);
  assert.equal(createRunStatusView(dto).targetReference.assetId, refs.target);
  const done = await f.store.returnRun(run.runId, evidence(run));
  const output = f.store.read().assets.find(a => a.id === refs.target).blocks.at(-1);
  assert.deepEqual(output.provenance, [refs.material]);
  assert.equal(createRunStatusView(projectRun(done)).outputReference.blockId, output.id);
  const bytes = await readFile(f.file); await f.store.returnRun(run.runId, evidence(run));
  assert.deepEqual(await readFile(f.file), bytes);
  await f.reopen(); assert.deepEqual(f.store.read().runs[0], done);
});

test('legal full snapshot with a long worksite and explicit short title reaches Run without claiming ordinary create support', async t => {
  const f = await fixture(t), before = await readFile(f.file);
  const denied = await f.store.command({ type: 'worksite.create', id: refs.worksite });
  assert.equal(denied.ok, false); assert.deepEqual(await readFile(f.file), before);
  const full = f.store.snapshot(), site = full.workspace.worksites.find(s => s.id === 'one');
  site.id = refs.worksite; full.titles[refs.worksite] = 'Short title'; delete full.titles.one;
  if (full.workspace.activeWorksiteId === 'one') full.workspace.activeWorksiteId = refs.worksite;
  await f.store.restoreSnapshot(full);
  const run = await f.command(prepare(f, { worksiteId: refs.worksite }));
  assert.equal(f.store.preview(refs.worksite).worksiteId, refs.worksite);
  assert.equal(run.input.worksiteId, refs.worksite);
  assert.equal(createRunStatusView(getRun(f.store.read(), run.runId).run).targetReference.worksiteId, refs.worksite);
  await f.reopen(); assert.equal(f.store.read().runs[0].input.worksiteId, refs.worksite);
});

test('Run identities, routes and Session address guards remain bounded; invalid input and target CAS failures stay atomic', async t => {
  const f = await fixture(t), before = f.store.read(), bytes = await readFile(f.file); let events = 0;
  f.store.subscribe(() => events++);
  for (const patch of [{ requestId: 'r'.repeat(201) }, { sessionId: 's'.repeat(201) }, { targetId: ' ' }, { worksiteId: 42 }]) {
    assert.equal((await f.store.command(prepare(f, patch))).ok, false);
    assert.deepEqual(f.store.read(), before); assert.deepEqual(await readFile(f.file), bytes); assert.equal(events, 0);
  }
  const run = await f.command(prepare(f));
  for (const field of ['runId', 'requestId', 'plannedSessionId']) assert.throws(() => validateRun({ ...run, [field]: 'x'.repeat(201) }));
  for (const field of ['assetId', 'agentId', 'conversationId', 'worksiteId']) for (const value of [' ', 42, undefined]) {
    const bad = structuredClone(run); bad.input[field] = value; bad.inputSha256 = runHash(bad.input);
    assert.throws(() => validateRun(bad));
  }
  for (const field of ['provider', 'model']) assert.throws(() => validateDispatchConstraints({ provider: 'synthetic', model: 'never-called', maxTokens: 1, requestSha256: 'a'.repeat(64), [field]: 'x'.repeat(201) }));
  for (const sessionId of [refs.conversation, '../escape', 's'.repeat(201)]) assert.throws(() => parseReadAuditConfig({ readAudit: { enabled: true, grants: [{ runId: run.runId, requestId: run.requestId, sessionId, inputSha256: run.inputSha256 }] } }));
  const claimed = (await f.store.claimRunDispatch(run.runId, { provider: 'synthetic', model: 'never-called', maxTokens: 1, requestSha256: 'a'.repeat(64) })).run;
  const badClaim = structuredClone(claimed); badClaim.dispatchClaim.claimId = 'c'.repeat(201); assert.throws(() => validateRun(badClaim));
  await f.command({ type: 'knot.update', id: f.target, patch: { summary: 'changed' } });
  const changed = f.store.read(), changedBytes = await readFile(f.file), eventCount = events;
  await assert.rejects(f.store.returnRun(run.runId, evidence(run)));
  assert.deepEqual(f.store.read(), changed); assert.deepEqual(await readFile(f.file), changedBytes); assert.equal(events, eventCount);
});

test('receipt block references are opaque data; completed projections preserve them without changing identity bindings', async t => {
  const f = await fixture(t), run = await f.command(prepare(f));
  const done = await f.store.returnRun(run.runId, evidence(run));
  const synthetic = structuredClone(done); synthetic.receipt.blockId = refs.block;
  assert.equal(validateRun(synthetic).receipt.blockId, refs.block);
  assert.equal(createRunStatusView(projectRun(synthetic)).outputReference.blockId, refs.block);
  synthetic.receipt.sessionId = refs.conversation; assert.throws(() => validateRun(synthetic));
});

test('existing short-reference completed journal and hashes are byte-stable under validate/query/view/close/reopen', async t => {
  const f = await fixture(t, false), run = await f.command(prepare(f));
  await f.store.claimRunDispatch(run.runId, { provider: 'synthetic', model: 'never-called', maxTokens: 1, requestSha256: 'a'.repeat(64) });
  const completed = await f.store.returnRun(run.runId, evidence(run));
  const fixed = JSON.stringify(completed), hashes = [completed.inputSha256, completed.targetSha256, completed.input.materials[0].sha256, completed.dispatchClaim.constraintsSha256, completed.receipt.logSha256, completed.receipt.outputSha256];
  const bytes = await readFile(f.file);
  for (let i = 0; i < 2; i++) {
    const record = f.store.read().runs[0]; assert.equal(JSON.stringify(validateRun(record)), fixed);
    createRunStatusView(getRun(f.store.read(), record.runId).run); listRuns(f.store.read());
    assert.deepEqual([record.inputSha256, record.targetSha256, record.input.materials[0].sha256, record.dispatchClaim.constraintsSha256, record.receipt.logSha256, record.receipt.outputSha256], hashes);
    assert.deepEqual(await readFile(f.file), bytes); await f.reopen(); assert.deepEqual(await readFile(f.file), bytes);
  }
});
