import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createHandler, createProtocolHandler } from '../packages/dsh-plugin/src/index.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';

const format = 'kont-store-snapshot/v1';
async function fixture(t, named = true, synthetic = true) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-store-snapshot-')), file = join(directory, 'state.json');
  let store;
  if (synthetic) ({ store } = await prepareSyntheticReadRun(file));
  else store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  let first, second;
  if (named) {
    first = (await store.command({ type: 'scene.create', title: '研究现场' })).value;
    second = (await store.command({ type: 'scene.create', title: '写作现场' })).value;
    await store.mutate({ revision: store.read().revision, commands: [
      { type: 'folder.create', id: 'research', title: '研究' },
      { type: 'folder.assign', worksiteId: first, folderId: 'research' },
      { type: 'worksite.update', worksiteId: first, draft: '保留问题', agentId: 'synthetic-agent' },
    ] });
  }
  return { file, first, second, get store() { return store; },
    reopen: async () => { await store.close(); store = await new KontStore(file).init(); } };
}
const unmarked = snapshot => { const value = structuredClone(snapshot); delete value.format; return value; };

test('complete Store export has an independent version and preserves named sites, organization and journal on restore/reopen', async t => {
  const f = await fixture(t);
  const exported = f.store.snapshot(), original = f.store.read();
  assert.equal(exported.format, format); assert.equal(exported.schemaVersion, 4);
  assert.equal(exported.titles[f.first], '研究现场'); assert.equal(exported.titles[f.second], '写作现场');
  assert.deepEqual(exported.organization, original.organization); assert.deepEqual(exported.runs, original.runs);
  assert.equal(Object.hasOwn(exported, 'revision'), false); assert.equal(Object.hasOwn(exported, 'seq'), false);
  await f.store.command({ type: 'worksite.update', worksiteId: f.first, draft: 'temporary local change' });
  const before = f.store.read(), events = []; f.store.subscribe(e => events.push(e));
  await f.store.restoreSnapshot(exported, before.revision);
  assert.deepEqual(f.store.snapshot(), exported);
  assert.equal(f.store.read().revision, before.revision + 1); assert.equal(f.store.read().seq, before.seq + 1);
  assert.deepEqual(events.map(e => e.type), ['snapshot.restored']);
  const restored = f.store.read(); await f.reopen(); assert.deepEqual(f.store.read(), restored);
});

test('explicit Canvas core projection is distinct and cannot erase non-default Store names', async t => {
  const f = await fixture(t);
  const core = f.store.coreSnapshot();
  assert.deepEqual(Object.keys(core).sort(), ['assets', 'edges', 'schemaVersion', 'workspace']);
  for (const key of ['titles', 'organization', 'runs', 'format']) assert.equal(Object.hasOwn(core, key), false);
  // A legacy body that omits only the title table used to reset names to IDs.
  const withoutTitles = unmarked(f.store.snapshot()); delete withoutTitles.titles;
  const before = f.store.read(), bytes = await readFile(f.file, 'utf8');
  await assert.rejects(f.store.restoreSnapshot(withoutTitles), { code: 'TITLES_RESTORE_REQUIRED' });
  assert.deepEqual(f.store.read(), before); assert.equal(await readFile(f.file, 'utf8'), bytes);
  // The core-only projection also retains the existing organization guard.
  await assert.rejects(f.store.restoreSnapshot(core), { code: 'ORGANIZATION_RESTORE_REQUIRED' });
});

test('real loopback human and Agent snapshot Reads expose identical named business metadata without auth expansion', async t => {
  const f = await fixture(t);
  const token = 'synthetic-store-snapshot-token-not-a-real-secret';
  const connection = { requestRejection: req => req.headers['x-human-test'] === 'yes' ? undefined : 401 };
  const human = createHandler(f.store, connection), protocol = createProtocolHandler(f.store, connection, { agentToken: token });
  const server = createServer((req, res) => req.url === '/kont/api/workspace' ? human(req, res) : protocol(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { protocol.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const bytes = await readFile(f.file, 'utf8');
  const h = await fetch(`${url}/kont/snapshot`, { headers: { 'x-human-test': 'yes' } });
  const a = await fetch(`${url}/kont/snapshot`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(h.status, 200); assert.equal(a.status, 200);
  const humanBody = await h.json(), agentBody = await a.json();
  assert.deepEqual(agentBody, humanBody); assert.deepEqual(agentBody.snapshot, f.store.snapshot());
  assert.equal(agentBody.snapshot.titles[f.first], '研究现场'); assert.equal(agentBody.snapshot.titles[f.second], '写作现场');
  const workspace = await (await fetch(`${url}/kont/api/workspace`, { headers: { 'x-human-test': 'yes' } })).json();
  for (const key of ['assets', 'edges', 'workspace', 'titles', 'organization', 'runs']) assert.deepEqual(agentBody.snapshot[key], workspace[key]);
  assert.equal((await fetch(`${url}/kont/snapshot`)).status, 401);
  assert.equal((await fetch(`${url}/kont/snapshot`, { headers: { authorization: `Bearer ${token}`, origin: 'https://foreign.test' } })).status, 403);
  assert.equal(await readFile(f.file, 'utf8'), bytes);
});

test('full snapshots reject missing core/metadata, unknown formats, partial titles and explicit bad fields atomically', async t => {
  const f = await fixture(t), original = f.store.snapshot(), bytes = await readFile(f.file, 'utf8'), events = [];
  f.store.subscribe(e => events.push(e));
  const cases = [];
  for (const key of ['schemaVersion', 'assets', 'edges', 'workspace', 'titles', 'organization', 'runs']) {
    const input = structuredClone(original); delete input[key]; cases.push(input);
  }
  for (const marker of [null, 1, 'kont-store-snapshot/v2']) cases.push({ ...original, format: marker });
  for (const titles of [null, undefined, [], {}, { [f.first]: 'Only one' }, { ...original.titles, [f.first]: { malformed: true } }]) cases.push({ ...original, titles });
  cases.push({ ...original, organization: null }, { ...original, futureBusiness: true }, { ...original, runs: undefined });
  for (const input of cases) await assert.rejects(f.store.restoreSnapshot(input));
  let touched = false;
  const getter = structuredClone(original); Object.defineProperty(getter.titles, f.first, { enumerable: true, get() { touched = true; return 'Not ordinary data'; } });
  await assert.rejects(f.store.restoreSnapshot(getter), { code: 'INVALID_SNAPSHOT' }); assert.equal(touched, false);
  assert.deepEqual(f.store.snapshot(), original); assert.equal(await readFile(f.file, 'utf8'), bytes); assert.deepEqual(events, []);
});

test('unmarked metadata inputs preserve explicit titles while missing metadata follows guarded legacy migration', async t => {
  const f = await fixture(t);
  const legacy = unmarked(f.store.snapshot()); await f.store.restoreSnapshot(legacy);
  assert.deepEqual(f.store.snapshot().titles, legacy.titles);
  const partial = structuredClone(legacy); delete partial.titles[f.first];
  await assert.rejects(f.store.restoreSnapshot(partial), { code: 'INVALID_TITLES' });
  const unnamed = await fixture(t, false, false);
  const core = unnamed.store.coreSnapshot();
  await unnamed.store.restoreSnapshot(core);
  assert.equal(unnamed.store.read().titles.legacy, '第一个工作现场');
  assert.deepEqual(unnamed.store.read().organization, { version: 1, folders: [] });
});

test('queued missing-title restoration checks actual target names and captures full input without aliases', async t => {
  const f = await fixture(t, false, false);
  const legacy = unmarked(f.store.snapshot()); delete legacy.titles;
  const revision = f.store.read().revision;
  const creation = f.store.mutate({ revision, commands: [{ type: 'scene.create', title: '刚命名的现场' }] });
  const rejection = assert.rejects(f.store.restoreSnapshot(legacy, revision + 1), { code: 'TITLES_RESTORE_REQUIRED' });
  await creation; await rejection;
  const complete = f.store.snapshot(), captured = structuredClone(complete);
  const restore = f.store.restoreSnapshot(complete);
  for (const id of Object.keys(complete.titles)) complete.titles[id] = '外部后改';
  complete.organization.folders.push({ id: 'external', title: 'Not captured', worksiteIds: [] });
  await restore; assert.deepEqual(f.store.snapshot(), captured);
  const output = f.store.snapshot(); output.titles.legacy = 'Output alias'; output.workspace.worksites[0].draft = 'Output alias';
  assert.deepEqual(f.store.snapshot(), captured);
});

test('full journal is required and cannot be imported into another Run owner; stale restores keep CAS and events', async t => {
  const f = await fixture(t), other = await fixture(t, false, false);
  const complete = f.store.snapshot(), before = f.store.read(), bytes = await readFile(f.file, 'utf8');
  const omitted = structuredClone(complete); delete omitted.runs;
  await assert.rejects(f.store.restoreSnapshot(omitted), { code: 'RUN_RESTORE_CONFLICT' });
  await assert.rejects(other.store.restoreSnapshot(complete), { code: 'RUN_RESTORE_CONFLICT' });
  const forged = structuredClone(complete); forged.runs = [];
  await assert.rejects(f.store.restoreSnapshot(forged), { code: 'RUN_RESTORE_CONFLICT' });
  await assert.rejects(f.store.restoreSnapshot(complete, before.revision - 1), { code: 'STALE_REVISION' });
  assert.deepEqual(f.store.read(), before); assert.equal(await readFile(f.file, 'utf8'), bytes);
});

test('init honors full markers and rejects unknown or incomplete disk formats without rewriting', async t => {
  const f = await fixture(t), complete = f.store.snapshot(); await f.store.close();
  const cases = [
    { ...complete, format: 'kont-store-snapshot/v2' }, { ...complete, format: null },
    { ...complete, titles: {} }, { ...complete, organization: null },
  ];
  for (const key of ['assets', 'workspace', 'titles', 'organization', 'runs']) { const value = structuredClone(complete); delete value[key]; cases.push(value); }
  for (const input of cases) {
    const bytes = JSON.stringify(input); await writeFile(f.file, bytes);
    await assert.rejects(new KontStore(f.file).init());
    assert.equal(await readFile(f.file, 'utf8'), bytes);
  }
  await writeFile(f.file, JSON.stringify(complete));
  await f.reopen(); assert.deepEqual(f.store.snapshot(), complete);
});

test('legacy disk partial titles only fill truly missing names without eager rewrite; explicit malformed table fails closed', async t => {
  const f = await fixture(t), legacy = f.store.read(); await f.store.close();
  delete legacy.titles[f.second]; const bytes = JSON.stringify(legacy); await writeFile(f.file, bytes);
  await f.reopen();
  assert.equal(f.store.read().titles[f.first], '研究现场'); assert.equal(f.store.read().titles[f.second], f.second);
  assert.equal(await readFile(f.file, 'utf8'), bytes);
  await f.store.close(); legacy.titles = null; const malformed = JSON.stringify(legacy); await writeFile(f.file, malformed);
  await assert.rejects(new KontStore(f.file).init(), { code: 'INVALID_TITLES' });
  assert.equal(await readFile(f.file, 'utf8'), malformed);
});
