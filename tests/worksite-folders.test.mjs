import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeOrganization } from '../packages/dsh-plugin/src/kernel.mjs';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';

const empty = () => ({ version: 1, folders: [] });
const folder = (id, worksiteIds = []) => ({ id, title: `Folder ${id}`, worksiteIds });
async function fixture(t, synthetic = false) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-folders-')), file = join(directory, 'state.json');
  let store;
  if (synthetic) ({ store } = await prepareSyntheticReadRun(file));
  else store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  return { file, get store() { return store; },
    act: commands => store.mutate({ revision: store.read().revision, commands }),
    reopen: async () => { await store.close(); store = await new KontStore(file).init(); },
    replaceOld: async state => { await store.close(); await writeFile(file, JSON.stringify(state)); store = await new KontStore(file).init(); } };
}
function owned(state) {
  const { organization, seq, revision, ...other } = state;
  return other;
}

test('create, rename, assign, atomic move and unfile use one store without changing any existing object or supply', async t => {
  const f = await fixture(t, true);
  await f.act([{ type: 'worksite.create', id: 'two' }, { type: 'presentation.open', id: 'view-two', worksiteId: 'two', kind: 'card' }]);
  const original = owned(f.store.read()), preview = f.store.preview('legacy');
  const events = []; f.store.subscribe(event => events.push(event));
  await f.act([{ type: 'folder.create', id: 'a', title: '  First  ' }, { type: 'folder.create', id: 'b', title: 'Second' }]);
  assert.equal(f.store.read().organization.folders[0].title, 'First');
  assert.equal((await f.store.command({ type: 'folder.assign', worksiteId: 'legacy', folderId: 'a', baseSeq: f.store.read().seq })).ok, true);
  await f.act([{ type: 'folder.assign', worksiteId: 'legacy', folderId: 'b' }, { type: 'folder.rename', folderId: 'b', title: '  Renamed  ' }]);
  assert.deepEqual(f.store.read().organization.folders.map(x => x.worksiteIds), [[], ['legacy']]);
  await f.act([{ type: 'folder.assign', worksiteId: 'legacy', folderId: null }]);
  assert.deepEqual(f.store.read().organization.folders.map(x => x.worksiteIds), [[], []]);
  assert.deepEqual(owned(f.store.read()), original); assert.deepEqual(f.store.preview('legacy'), preview);
  assert.deepEqual(events.map(e => e.type), ['folder.created', 'folder.created', 'folder.assigned', 'folder.assigned', 'folder.renamed', 'folder.assigned']);
  assert.ok(events.every((event, index) => index === 0 || event.seq === events[index - 1].seq + 1));
  const saved = f.store.read(); await f.reopen(); assert.deepEqual(f.store.read(), saved);
});

test('no-op rename and membership are event-free while failed batches and stale writes preserve bytes', async t => {
  const f = await fixture(t);
  await f.act([{ type: 'folder.create', id: 'a', title: 'A' }]);
  const before = f.store.read(), bytes = await readFile(f.file, 'utf8'), events = [];
  f.store.subscribe(e => events.push(e));
  await f.act([{ type: 'folder.rename', folderId: 'a', title: ' A ' }, { type: 'folder.assign', worksiteId: 'legacy', folderId: null }]);
  assert.deepEqual(f.store.read(), before);
  await assert.rejects(f.act([{ type: 'folder.assign', worksiteId: 'legacy', folderId: 'a' }, { type: 'folder.rename', folderId: 'missing', title: 'No' }]), { code: 'NOT_FOUND' });
  await assert.rejects(f.store.mutate({ revision: before.revision - 1, commands: [{ type: 'folder.rename', folderId: 'a', title: 'Stale' }] }), { code: 'STALE_REVISION' });
  const stale = await f.store.command({ type: 'folder.rename', folderId: 'a', title: 'Stale', baseSeq: before.seq - 1 });
  assert.equal(stale.error.code, 'STALE_REVISION');
  assert.equal(await readFile(f.file, 'utf8'), bytes); assert.deepEqual(f.store.read(), before); assert.deepEqual(events, []);
});

test('invalid organization shape, duplicate membership, references, capacity and accessor reject without aliases', () => {
  const workspace = { worksites: [{ id: 'legacy' }, { id: 'two' }] };
  const good = { version: 1, folders: [folder('a', ['legacy'])] };
  const copy = normalizeOrganization(good, workspace); copy.folders[0].worksiteIds.push('two');
  assert.deepEqual(good.folders[0].worksiteIds, ['legacy']);
  const invalid = [undefined, null, {}, { ...good, version: 2 }, { ...good, extra: true },
    { version: 1, folders: [{ ...folder('a'), extra: true }] }, { version: 1, folders: [folder('a'), folder('a')] },
    { version: 1, folders: [folder('a', ['legacy', 'legacy'])] }, { version: 1, folders: [folder('a', ['legacy']), folder('b', ['legacy'])] },
    { version: 1, folders: [folder('a', ['missing'])] }, { version: 1, folders: [{ ...folder('a'), title: ' ' }] },
    { version: 1, folders: [{ ...folder('a'), title: 'x'.repeat(201) }] }, { version: 1, folders: [{ ...folder('a'), id: 'x'.repeat(201) }] },
    { version: 1, folders: Array.from({ length: 201 }, (_, i) => folder(String(i))) },
    { version: 1, folders: [{ ...folder('a'), worksiteIds: new Array(1) }] }];
  let observed = false;
  invalid.push({ version: 1, get folders() { observed = true; return []; } });
  const arrayExtra = []; Object.defineProperty(arrayExtra, 'hidden', { value: true });
  invalid.push({ version: 1, folders: arrayExtra });
  for (const value of invalid) assert.throws(() => normalizeOrganization(value, workspace), { code: 'INVALID_ORGANIZATION' });
  assert.equal(observed, false);
});

test('invalid folder commands reject and cannot reinterpret organization as asset, supply or focus', async t => {
  const f = await fixture(t); await f.act([{ type: 'folder.create', id: 'a', title: 'A' }]);
  const before = f.store.read();
  for (const command of [
    { type: 'folder.create', id: 'a', title: 'Duplicate' }, { type: 'folder.create', title: 'Missing id' },
    { type: 'folder.create', id: 'bad', title: ' ' }, { type: 'folder.create', id: 'bad', title: 'x'.repeat(201) },
    { type: 'folder.rename', folderId: 'a', title: 'No', checkedIds: ['asset'] },
    { type: 'folder.assign', worksiteId: 'missing', folderId: 'a' },
    { type: 'folder.assign', worksiteId: 'legacy', folderId: 'missing' },
    { type: 'folder.assign', worksiteId: 'legacy' },
  ]) assert.equal((await f.store.command(command)).ok, false);
  assert.deepEqual(f.store.read(), before);
});

test('snapshot exports and restores organization, detached input and retained Run guard', async t => {
  const f = await fixture(t, true);
  await f.act([{ type: 'folder.create', id: 'a', title: 'A' }, { type: 'folder.assign', worksiteId: 'legacy', folderId: 'a' }]);
  const exported = f.store.snapshot(), original = f.store.read();
  await f.store.restoreSnapshot(exported);
  assert.deepEqual(f.store.snapshot(), exported); assert.deepEqual(f.store.read().runs, original.runs);
  const detached = f.store.snapshot(); detached.organization.folders[0].title = 'Captured';
  const saving = f.store.restoreSnapshot(detached);
  detached.organization.folders[0].title = 'Changed later'; detached.organization.folders[0].worksiteIds.push('missing');
  await saving; assert.equal(f.store.read().organization.folders[0].title, 'Captured');
  const noOrganization = f.store.snapshot(); delete noOrganization.organization;
  await assert.rejects(f.store.restoreSnapshot(noOrganization), { code: 'ORGANIZATION_RESTORE_REQUIRED' });
  const invalid = f.store.snapshot(); invalid.organization = null;
  await assert.rejects(f.store.restoreSnapshot(invalid), { code: 'INVALID_ORGANIZATION' });
  const forged = f.store.snapshot(); forged.runs = [];
  await assert.rejects(f.store.restoreSnapshot(forged), { code: 'RUN_RESTORE_CONFLICT' });
  const explicitEmpty = f.store.snapshot(); explicitEmpty.organization = empty();
  await f.store.restoreSnapshot(explicitEmpty); assert.deepEqual(f.store.read().organization, empty());
});

test('missing organization restore is checked in the writer queue including newly added empty folders', async t => {
  const f = await fixture(t);
  const old = f.store.snapshot(); delete old.format; delete old.organization;
  const revision = f.store.read().revision;
  const creation = f.store.mutate({ revision, commands: [{ type: 'folder.create', id: 'empty', title: 'Empty folder' }] });
  const restore = f.store.restoreSnapshot(old, revision + 1);
  await creation;
  await assert.rejects(restore, { code: 'ORGANIZATION_RESTORE_REQUIRED' });
  assert.equal(f.store.read().organization.folders[0].id, 'empty');
});

test('old data without organization reads as empty without eager disk rewrite and accepts existing long worksite references', async t => {
  const f = await fixture(t);
  const legacy = f.store.read(); delete legacy.organization;
  const longId = 'old-site-'.repeat(80);
  legacy.workspace.worksites.push({ ...legacy.workspace.worksites[0], id: longId }); legacy.titles[longId] = 'Historical long-id site';
  await f.replaceOld(legacy);
  const bytes = await readFile(f.file, 'utf8');
  assert.equal(Object.hasOwn(JSON.parse(bytes), 'organization'), false);
  assert.deepEqual(f.store.read().organization, empty());
  assert.equal(await readFile(f.file, 'utf8'), bytes);
  await f.act([{ type: 'folder.create', id: 'a', title: 'A' }, { type: 'folder.assign', worksiteId: longId, folderId: 'a' }]);
  assert.deepEqual(f.store.read().organization.folders[0].worksiteIds, [longId]);
});

test('invalid persisted organization fails closed and preserves original file bytes', async t => {
  const f = await fixture(t); const state = f.store.read(); await f.store.close();
  state.organization = { version: 1, folders: [folder('a', ['missing'])] };
  const bytes = JSON.stringify(state); await writeFile(f.file, bytes);
  await assert.rejects(new KontStore(f.file).init(), { code: 'INVALID_ORGANIZATION' });
  assert.equal(await readFile(f.file, 'utf8'), bytes);
});
