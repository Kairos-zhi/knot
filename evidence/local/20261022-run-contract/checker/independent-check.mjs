// Independent Checker probes; every event and asset below is synthetic.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { KontStore } from '../../../../packages/dsh-plugin/src/store.mjs';
import { dshPromptRequest, runPromptText, inspectDshRun } from '../../../../packages/dsh-plugin/src/run.mjs';
import { openArchive } from '../../../../scripts/desktop-host-archive.mjs';

const root = new URL('../../../../', import.meta.url);
const dir = new URL('./', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const candidate = JSON.parse(await readFile(new URL('../maker/manifest.json', import.meta.url)));
for (const item of candidate.files) {
  const bytes = await readFile(new URL(item.path, root));
  assert.equal(bytes.length, item.bytes); assert.equal(hash(bytes), item.sha256);
}
const archivePath = 'D:/DSH-Desktop/app/resources/app.asar';
const archiveHash = createHash('sha256');
for await (const chunk of createReadStream(archivePath)) archiveHash.update(chunk);
assert.equal(archiveHash.digest('hex'), '47874618bf5b3011fcaac10cd4c85f69da333e70d4f99b921207c78d0999512a');
const archive = await openArchive(archivePath);
const sourceManifest = JSON.parse(await readFile(new URL('../research/manifest.json', import.meta.url)));
for (const item of sourceManifest) assert.equal(hash(await archive.read(item.path)), item.sha256);
const host = (await archive.read('dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.host.js')).toString();
const declaration = name => {
  const at = host.indexOf(`"name": "${name}"`);
  assert.ok(at >= 0);
  const match = host.slice(at).match(/"declaration":\s*("(?:[^"\\]|\\.)*")/);
  return JSON.parse(match[1]);
};
const promptDeclaration = declaration('SessionPromptRequest');
assert.match(promptDeclaration, /requestId: SessionRequestId/);
assert.match(promptDeclaration, /sessionId: SessionId/);
assert.match(promptDeclaration, /mode: 'queue' \| 'steer'/);
assert.doesNotMatch(declaration('SessionFollowRequest'), /afterSeq|resumeCursor/);
assert.match(declaration('MessageBase'), /readonly id: MessageId/);
const controller = (await archive.read('dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js')).toString();
assert.ok(controller.includes('agent.cancel({ kind: "user" }, { keepInbox: true })'));
assert.ok(controller.includes('source.rpcId === requestId'));
await archive.close();

const runtime = new URL(`synthetic-${Date.now()}/`, dir); await mkdir(runtime);
const stateFile = new URL('state.json', runtime);
let store = await new KontStore(stateFile.pathname.replace(/^\/([A-Za-z]:)/, '$1')).init();
try {
  for (const id of ['source', 'excluded', 'target']) assert.equal((await store.command({ type: 'knot.create', id,
    data: { title: id, summary: `${id}-synthetic` } })).ok, true);
  assert.equal((await store.command({ type: 'worksite.supply', worksiteId: 'legacy', assetId: 'source', mode: 'connect' })).ok, true);
  assert.equal((await store.command({ type: 'worksite.supply', worksiteId: 'legacy', assetId: 'excluded', mode: 'exclude' })).ok, true);
  const cmd = { type: 'run.prepare', worksiteId: 'legacy', targetId: 'target', sessionId: 'checker-synthetic-session', requestId: 'checker-synthetic-request' };
  const [one, two] = await Promise.all([store.command(cmd), store.command(cmd)]);
  assert.equal(one.ok, true); assert.equal(two.value.runId, one.value.runId);
  assert.equal(store.read().runs.length, 1);
  const run = one.value;
  assert.deepEqual(run.input.materials.map(item => item.id), ['source']);
  assert.deepEqual(Object.keys(dshPromptRequest(run)).sort(), ['content', 'mode', 'requestId', 'sessionId']);
  const ev = (type, data) => ({ type, data });
  const evidence = { sessionId: run.plannedSessionId, kind: 'synthetic-test', events: [
    ev('working-directory/change', { cwd: 'synthetic-only' }),
    ev('turn/start', { turn: 1 }), ev('step/start', { turn: 1, step: 1 }),
    ev('user/message', { id: 'synthetic-user', role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(run.input) }] }),
    ev('assistant/message', { turn: 1, step: 1, message: { id: 'synthetic-assistant-a', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: 'first' }] } }),
    ev('assistant/message', { turn: 1, step: 1, message: { id: 'synthetic-assistant-b', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: 'second' }] } }),
    ev('step/end', { turn: 1, step: 1 }), ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
  ].map((item, seq) => ({ ...item, seq, time: 1792627200000 + seq })) };
  const baseline = store.read(); const observed = [], observedStates = [];
  store.subscribe(event => { observed.push(event); observedStates.push(store.read().runs[0].status); });
  // Commit must freeze the caller's evidence before yielding to its writer queue.
  const firstReturn = store.returnRun(run.runId, evidence);
  const sameReturn = store.returnRun(run.runId, structuredClone(evidence));
  evidence.events[4].data.message.content[0].text = 'mutated-after-call';
  const [returned, replay] = await Promise.all([firstReturn, sameReturn]);
  assert.deepEqual(returned, replay);
  assert.equal(store.read().assets.find(item => item.id === 'target').blocks.at(-1).content, 'first\nsecond');
  assert.equal(store.read().revision, baseline.revision + 1);
  assert.equal(store.read().seq, baseline.seq + 2);
  assert.deepEqual(observed.map(item => item.type), ['knot.updated', 'run.returned']);
  assert.deepEqual(observedStates, ['completed', 'completed']);
  const saved = store.read(); await store.close();
  store = await new KontStore(stateFile.pathname.replace(/^\/([A-Za-z]:)/, '$1')).init();
  assert.deepEqual(store.read(), saved); assert.equal(store.eventsSince(0).reset, true);
  const omittedJournal = store.snapshot(); delete omittedJournal.runs;
  await store.restoreSnapshot(omittedJournal);
  assert.deepEqual(store.read().runs, saved.runs);
  const invalid = structuredClone(evidence); invalid.events[4].data.message.content[0].text = 'first';
  invalid.events[0] = { ...invalid.events[0], type: 'assistant/attempt', data: {} };
  assert.throws(() => inspectDshRun(run, invalid), { code: 'RUN_EVIDENCE_UNSUPPORTED' });
} finally { await store.close(); }
const result = { task: 'KONT-RUN-004', role: 'independent Checker', at: new Date().toISOString(),
  candidateFiles: candidate.files.length, candidateHashesMatch: true, installedArchiveUnchanged: true,
  installedMembersMatch: sourceManifest.length, wireDeclarationsChecked: ['SessionPromptRequest', 'SessionFollowRequest', 'MessageBase'],
  independentProbes: ['parallel duplicate preparation', 'explicit supply isolation', 'wire key projection', 'metadata and MessageBase.id compatible projection', 'ordered multi-message text join', 'caller payload frozen before queue', 'parallel duplicate return single transaction', 'postcommit event observers', 'completed cold readback and cursor reset', 'restore omission preserves journal', 'attempt rejection'],
  modelRequests: 0, syntheticOnly: true, verdict: 'PROBES_PASS', limitations: ['Association projection, not full DSH schema validation', 'No connected DSH adapter/authenticity proof or model execution'] };
await writeFile(new URL('independent-result.json', dir), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
