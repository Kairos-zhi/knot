import test from 'node:test';
import { historicalFile } from './helpers/historical-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { probeStoreReaderPairing } from '../scripts/store-reader-pairing.mjs';
import { normalizeSnapshot } from '../packages/dsh-plugin/src/kernel.mjs';
import { runPromptText } from '../packages/dsh-plugin/src/run.mjs';

const files = ['src/store.mjs', 'src/kernel.mjs', 'src/run.mjs', 'src/worksite-preview.mjs', 'lib/snapshot.js', 'lib/workspace-state.js', 'lib/knot-model.js'];
const old = 'evidence/local/20261024-desktop-recovery/candidate';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const marker = 'PRIVATE_SYNTHETIC_SENTINEL';
async function fixture(t, long = false) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-pairing-test-')), store = await new KontStore(join(directory, 'state.json')).init();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  const command = async value => { const result = await store.command(value); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
  await command({ type: 'knot.create', id: 'target', data: { title: marker, summary: marker } });
  await command({ type: 'worksite.update', worksiteId: 'legacy', agentId: long ? 'a'.repeat(214) : null, draft: marker });
  await store.mutate({ revision: store.read().revision, commands: [{ type: 'folder.create', id: 'folder', title: marker }, { type: 'folder.create', id: 'empty', title: 'Empty' }, { type: 'folder.assign', worksiteId: 'legacy', folderId: 'folder' }, { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'target', mode: 'connect' }, { type: 'presentation.open', id: 'presentation', worksiteId: 'legacy', kind: 'card', layout: { x: 0, y: 0, width: 400, height: 300 } }] });
  const run = await command({ type: 'run.prepare', worksiteId: 'legacy', targetId: 'target', requestId: 'synthetic-request', sessionId: 'synthetic-session' });
  await store.claimRunDispatch(run.runId, { provider: 'synthetic', model: 'never-called', maxTokens: 1, requestSha256: 'a'.repeat(64) });
  const entries = [ ['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
    ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(run.input) }] }],
    ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: marker }] }, stream: [] }],
    ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }] ];
  await store.returnRun(run.runId, { sessionId: run.plannedSessionId, kind: 'synthetic-test', events: entries.map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) });
  const full = store.snapshot(); full.titles.legacy = marker; full.titles.extra = marker;
  return { full, bytes: Buffer.from(JSON.stringify(full)) };
}
async function isolated(t, { storeSource, oldStoreSource, workerSource, scriptTransform = value => value } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'kont-pairing-source-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ownedTemporary = join(root, 'owned-tmp'); await mkdir(ownedTemporary);
  const put = async (name, bytes) => { const path = join(root, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); };
  let script = await readFile('scripts/store-reader-pairing.mjs', 'utf8');
  // Test-only fixed filesystem scope. No public injection and no global tmp scan.
  script = script.replace("import { tmpdir } from 'node:os';", `const tmpdir = () => ${JSON.stringify(ownedTemporary)};`);
  for (const name of files) {
    const original = await readFile(`packages/dsh-plugin/${name}`);
    const bytes = name === 'src/store.mjs' && storeSource ? Buffer.from(storeSource) : original;
    await put(`packages/dsh-plugin/${name}`, bytes);
    if (!bytes.equals(original)) script = script.replace(sha(original), sha(bytes));
  }
  const manifest = JSON.parse(await historicalFile('017/manifest.json'));
  for (const name of files.filter(p => p !== 'src/worksite-preview.mjs').map(p => `packages/dsh-plugin/${p}`)) {
    const bytes = name === 'packages/dsh-plugin/src/store.mjs' && oldStoreSource ? Buffer.from(oldStoreSource) : await historicalFile('017/' + name);
    await put(`${old}/${name}`, bytes);
    if (oldStoreSource && name === 'packages/dsh-plugin/src/store.mjs') manifest.files.find(f => f.path === name).sha256 = sha(bytes);
  }
  if (oldStoreSource) {
    const bytes = Buffer.from(JSON.stringify(manifest));
    await put(`${old}/manifest.json`, bytes);
    script = script.replace('774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d', sha(bytes));
  } else await put(`${old}/manifest.json`, await historicalFile('017/manifest.json'));
  await put('scripts/store-reader-pairing.mjs', scriptTransform(script));
  await put('scripts/store-reader-pairing-worker.mjs', workerSource ?? await readFile('scripts/store-reader-pairing-worker.mjs'));
  return { root, api: (await import(pathToFileURL(join(root, 'scripts/store-reader-pairing.mjs')).href)).probeStoreReaderPairing };
}
// Test-only fake concrete modules; the public API has no injected reader option.
const fake = (readChange = '', exportChange = '', close = '') => `import{readFile}from'node:fs/promises';
export class KontError extends Error{};export class KontStore{
constructor(file){this.file=file;}async init(){this.input=JSON.parse(await readFile(this.file));return this;}
read(){const {format,...content}=this.input;const value={...content,revision:0,seq:0};${readChange}return value;}
snapshot(){const value=structuredClone(this.input);${exportChange}return value;}
async close(){${close}}}`;

test('fixed actual current/017 readers distinguish read/export metadata loss and long Run rejection without state disclosure', async t => {
  const probeStoreReaderPairing = (await isolated(t)).api;
  for (const long of [false, true]) {
    const { bytes } = await fixture(t, long), before = Buffer.from(bytes), result = await probeStoreReaderPairing(bytes);
    assert.equal(result.readers.length, 2); assert.equal(result.pairCompatible, false);
    assert.equal(result.readExportOnly, true); assert.equal(result.productionDeploymentAccepted, false);
    assert.equal(result.readers[0].readCode, 'PRESERVED'); assert.equal(result.readers[0].exportCode, 'PRESERVED');
    assert.deepEqual(result.readers[0].failures, []);
    assert.equal(result.readers[1].readCode, long ? 'READER_REJECTED' : 'LOSSY_READ');
    assert.equal(result.readers[1].exportCode, long ? 'NOT_RUN' : 'LOSSY_EXPORT');
    assert.deepEqual(result.readers[1].failures, []);
    assert.deepEqual(bytes, before); assert.equal(JSON.stringify(result).includes(marker), false);
    assert.match(result.execution.workerSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.readers[0].files.length, 7); assert.equal(result.readers[1].files.length, 6);
  }
});

test('malformed/future/incomplete full snapshots reject and options cannot supply reader capability', async t => {
  const probeStoreReaderPairing = (await isolated(t)).api;
  const { full, bytes } = await fixture(t);
  for (const input of [null, Buffer.alloc(0), Buffer.alloc(8 * 1024 * 1024 + 1)]) assert.deepEqual((await probeStoreReaderPairing(input)).failures, ['INVALID_ARGUMENTS']);
  for (const supplied of [{ reader: 'fake', report: { allowed: true } }, null, true]) assert.deepEqual((await probeStoreReaderPairing(bytes, supplied)).failures, ['INVALID_ARGUMENTS']);
  const missing = structuredClone(full); delete missing.organization;
  const badRun = structuredClone(full); badRun.runs[0].inputSha256 = 'a'.repeat(64);
  for (const input of [Buffer.from('{'), Buffer.from('{}'), ...[missing, badRun, { ...full, schemaVersion: 999 }, { ...full, format: 'future/v2' }, { ...full, future: marker }, { ...full, revision: 0 }].map(v => Buffer.from(JSON.stringify(v)))]) {
    const result = await probeStoreReaderPairing(input); assert.ok(result.failures.includes('INVALID_FULL_SNAPSHOT'));
    assert.equal(result.pairCompatible, false); assert.equal(JSON.stringify(result).includes(marker), false);
  }
});

test('same schema never overrides current read/export differences or partial metadata capabilities', async t => {
  const { bytes, full } = await fixture(t);
  const core = normalizeSnapshot(full); assert.equal(Object.hasOwn(core, 'titles'), false); assert.equal(Object.hasOwn(core, 'organization'), false);
  for (const [readChange, exportChange, readCode, exportCode] of [
    ['delete value.organization;', '', 'LOSSY_READ', 'PRESERVED'],
    ['delete value.titles;', '', 'LOSSY_READ', 'PRESERVED'],
    ['', 'delete value.organization;', 'PRESERVED', 'LOSSY_EXPORT'],
    ['value.titles.legacy="changed";', 'value.titles.legacy="changed";', 'LOSSY_READ', 'LOSSY_EXPORT'],
  ]) {
    const { api } = await isolated(t, { storeSource: fake(readChange, exportChange) });
    const result = await api(bytes); assert.deepEqual(result.failures, ['CURRENT_READER_LOSSY']);
    assert.equal(result.readers.length, 1); assert.equal(result.readers[0].readCode, readCode); assert.equal(result.readers[0].exportCode, exportCode);
  }
});

test('closure/manifest drift and worker/load failures are infrastructure failures, never invalid source or old-reader rejection', async t => {
  const { bytes } = await fixture(t);
  const pin = await isolated(t); await writeFile(join(pin.root, 'packages/dsh-plugin/src/store.mjs'), 'throw Error("PRIVATE_SYNTHETIC_SENTINEL")');
  assert.deepEqual((await pin.api(bytes)).failures, ['READER_BYTES_MISMATCH']);
  const manifest = await isolated(t); await writeFile(join(manifest.root, old, 'manifest.json'), '{}');
  assert.deepEqual((await manifest.api(bytes)).failures, ['READER_MANIFEST_MISMATCH']);
  for (const options of [{ storeSource: 'throw Error("PRIVATE_SYNTHETIC_SENTINEL");' }, { workerSource: 'process.exit(3);' },
    { scriptTransform: s => s.replace('execArgv: []', 'execArgv: [], execPath: "synthetic-nonexistent-node-043"') }]) {
    const { api } = await isolated(t, options), result = await api(bytes);
    assert.deepEqual(result.failures, ['CURRENT_READER_FAILED']); assert.equal(result.pairCompatible, false);
    assert.equal(result.readers[0].readCode, 'NOT_RUN'); assert.equal(JSON.stringify(result).includes(marker), false);
  }
});

test('timeout and close failures remain failures even after successful observation; close failure withholds cleanup', async t => {
  const { bytes } = await fixture(t);
  const closeFixture = await isolated(t, { storeSource: fake('', '', 'throw Error("PRIVATE_SYNTHETIC_SENTINEL");') });
  const result = await closeFixture.api(bytes); assert.deepEqual(result.failures, ['CURRENT_READER_FAILED']);
  assert.ok(result.readers[0].failures.includes('CLOSE_FAILED')); assert.ok(result.readers[0].failures.includes('CLEANUP_WITHHELD'));
  assert.equal(result.readers[0].readCode, 'PRESERVED');
  assert.equal((await readdir(join(closeFixture.root, 'owned-tmp'))).length, 1);
  const missingState = await isolated(t, { storeSource: fake('', '', 'await(await import("node:fs/promises")).unlink(this.file);throw Error("PRIVATE_SYNTHETIC_SENTINEL");') });
  const missing = await missingState.api(bytes);
  assert.ok(missing.readers[0].failures.includes('CLOSE_FAILED'));
  assert.ok(missing.readers[0].failures.includes('CLEANUP_WITHHELD'));
  assert.ok(missing.readers[0].failures.includes('TEMPORARY_EXECUTION_FAILED'));
  // Each isolated fixture's after-hook owns its entire private root.
  const timeout = await isolated(t, { storeSource: fake('', '', 'setInterval(()=>{},1000);await new Promise(()=>{});'), scriptTransform: s => s.replace('}, 5000);', '}, 1000);') });
  const timed = await timeout.api(bytes); assert.ok(timed.readers[0].failures.includes('TIMEOUT')); assert.equal(timed.pairCompatible, false);
  assert.equal(timed.readers[0].readCode, 'PRESERVED');
});

test('only a concrete fully preserving fixed pair can pass; input Buffer capture prevents aliases', async t => {
  const { bytes } = await fixture(t), before = sha(bytes);
  const { api } = await isolated(t, { storeSource: fake(), oldStoreSource: fake() });
  const pending = api(bytes); bytes.fill(0);
  const result = await pending;
  assert.equal(result.pairCompatible, true); assert.equal(result.sourceSha256, before);
  assert.deepEqual(result.failures, []); assert.equal(result.productionDeploymentAccepted, false);
  assert.ok(result.readers.every(r => r.readCode === 'PRESERVED' && r.exportCode === 'PRESERVED' && !r.failures.length));
});

test('post-capture source drift and cleanup failure remain blocking facts with no raw errors', async t => {
  const { bytes } = await fixture(t);
  const drift = await isolated(t, { scriptTransform: s => s.replace('    await unchanged(captured.inputs);\n    report.pairCompatible', '    await writeFile(captured.inputs.at(-1).path, "drift");\n    await unchanged(captured.inputs);\n    report.pairCompatible') });
  const changed = await drift.api(bytes); assert.deepEqual(changed.failures, ['READER_SOURCE_CHANGED']); assert.equal(changed.pairCompatible, false);
  const cleanup = await isolated(t, { scriptTransform: s => s.replace('await rm(target, { recursive: true, force: true });', 'throw Error("PRIVATE_SYNTHETIC_SENTINEL");') });
  const result = await cleanup.api(bytes);
  assert.ok(result.readers[0].failures.includes('CLEANUP_FAILED')); assert.deepEqual(result.failures, ['CURRENT_READER_FAILED']);
  assert.equal(JSON.stringify(result).includes(marker), false);
  assert.equal((await readdir(join(cleanup.root, 'owned-tmp'))).length, 1);
});
