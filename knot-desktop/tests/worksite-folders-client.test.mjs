import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { listRuns } from '../packages/dsh-plugin/src/run-query.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';
import { createWorkstationClient, findNode, response, deferred, settle } from './helpers/workstation-client-fixture.mjs';

const field = client => client.node(n => n.props['aria-label'] === '现场草稿');
const library = client => client.node(n => n.props['aria-label'] === '现场资源库');
const inputMatches = (node, label) => node.type === 'input' && (label.startsWith('folder:') ? node.props['data-folder-id'] === label : node.props['aria-label'] === label);
const input = (client, label) => client.node(n => inputMatches(n, label));
const select = (client, id) => client.node(n => n.type === 'select' && n.props['data-worksite-id'] === id);
const form = (client, label) => client.node(n => n.type === 'form' && findNode(n, child => inputMatches(child, label)));
const submit = (client, label) => form(client, label).props.onSubmit({ preventDefault() {} });
const setInput = (client, label, value) => input(client, label).props.onChange({ target: { value } });
const posts = client => client.requests.filter(r => r.options.method === 'POST');
function all(tree, predicate, found = []) {
  if (!tree || typeof tree !== 'object') return found;
  if (predicate(tree)) found.push(tree);
  (tree.children ?? []).forEach(child => all(child, predicate, found)); return found;
}
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-folder-client-')), file = join(directory, 'state.json');
  let { store } = await prepareSyntheticReadRun(file);
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.mutate({ revision: store.read().revision, commands: [
    { type: 'worksite.create', id: 'two' }, { type: 'worksite.update', worksiteId: 'two', draft: 'second draft', agentId: 'fixture-agent' },
    { type: 'worksite.supply', worksiteId: 'two', assetId: 'audit-target', mode: 'connect' },
    { type: 'presentation.open', id: 'two-view', worksiteId: 'two', kind: 'icon', layout: { x: 7, y: 9 } },
    { type: 'folder.create', id: 'folder:1', title: 'Folder A' }, { type: 'folder.assign', worksiteId: 'two', folderId: 'folder:1' },
  ] });
  let transformRead = options.transformRead ?? (state => state), transformWrite = state => state, intercept = () => undefined;
  const client = await createWorkstationClient(store.read(), request => {
    const custom = intercept(request); if (custom !== undefined) return custom;
    if (request.path === '/kont/api/workspace') return request.options.method === 'POST'
      ? store.mutate(JSON.parse(request.options.body)).then(state => response(transformWrite(state)), error => ({ ok: false, status: error.status, json: async () => ({ code: error.code }) }))
      : response(transformRead(store.read()));
  }, { runResponse: () => listRuns(store.read()) });
  t.after(client.unmount);
  return { client, read: () => store.read(), commit: body => store.mutate(body),
    command: command => store.command(command),
    setRead: fn => { transformRead = fn; }, setWrite: fn => { transformWrite = fn; },
    intercept: fn => { intercept = fn; },
    reopen: async () => { await store.close(); store = await new KontStore(file).init(); } };
}

test('grouped library, create, stable-id rename, assign and unfile persist without switching HUD or changing supplied objects', async t => {
  const { client, read, reopen } = await fixture(t);
  const original = read();
  assert.equal(input(client, 'folder:1').props['aria-label'], '文件夹新名称：Folder A');
  assert.equal(select(client, 'legacy').props['aria-label'], '现场文件夹：第一个工作现场');
  const groups = () => all(library(client), n => n.props.className === 'kont-folder-group');
  assert.deepEqual(groups().map(g => g.props['data-folder-id']), ['folder:1', null]);
  assert.deepEqual(all(library(client), n => n.props.className === 'kont-library-entry').map(n => n.props['data-worksite-id']), ['two', 'legacy']);
  field(client).props.onChange({ target: { value: 'first local draft' } });
  setInput(client, '新文件夹名称', '  Folder B  '); await submit(client, '新文件夹名称');
  assert.equal(read().organization.folders[1].id, 'folder:2');
  assert.equal(read().organization.folders[1].title, 'Folder B'); assert.equal(input(client, '新文件夹名称').props.value, '');
  setInput(client, 'folder:2', 'Renamed'); await submit(client, 'folder:2');
  await select(client, 'two').props.onChange({ target: { value: 'folder:2' } });
  assert.deepEqual(read().organization.folders.map(f => f.worksiteIds), [[], ['two']]);
  await select(client, 'two').props.onChange({ target: { value: '' } });
  assert.deepEqual(read().organization.folders.map(f => f.worksiteIds), [[], []]);
  assert.equal(read().workspace.activeWorksiteId, 'legacy');
  assert.equal(client.node(n => n.props['aria-label'] === '现场输入 HUD').props['data-worksite-id'], 'legacy');
  assert.equal(read().workspace.worksites[0].draft, 'first local draft');
  assert.deepEqual(read().workspace.worksites.map(s => [s.id, s.checkedIds, s.excludedIds, s.agentId]), original.workspace.worksites.map(s => [s.id, s.checkedIds, s.excludedIds, s.agentId]));
  for (const key of ['assets', 'edges', 'runs']) assert.deepEqual(read()[key], original[key]);
  assert.deepEqual(read().workspace.presentations, original.workspace.presentations);
  assert.ok(posts(client).every(r => JSON.parse(r.options.body).commands.every(c => ['worksite.update', 'folder.create', 'folder.rename', 'folder.assign'].includes(c.type))));
  const saved = read(); await reopen(); assert.deepEqual(read(), saved); await client.button('刷新').props.onClick();
  assert.match(JSON.stringify(library(client)), /Renamed/);
  assert.equal(all(library(client), n => n.props.className === 'kont-library-entry').length, 2);
  // Existing title switching and explicit reveal keep their old semantics.
  await client.button('two').props.onClick(); assert.equal(read().workspace.presentations[0].kind, 'icon');
  await client.node(n => n.props['aria-label'] === '唤出现场：two').props.onClick();
  assert.equal(read().workspace.presentations[0].id, 'two-view'); assert.equal(read().workspace.presentations[0].kind, 'window');
});

test('initial missing organization keeps legacy list but disables folder operations; known organization cannot disappear', async t => {
  const missing = state => { delete state.organization; return state; };
  const old = await fixture(t, { transformRead: missing });
  assert.match(JSON.stringify(library(old.client)), /文件夹组织暂不可用/);
  assert.equal(select(old.client, 'legacy').props.disabled, true);
  assert.equal(input(old.client, '新文件夹名称').props.disabled, true);
  setInput(old.client, '新文件夹名称', 'Not sent'); await submit(old.client, '新文件夹名称');
  assert.equal(posts(old.client).length, 0);
  await old.client.button('two').props.onClick(); assert.equal(old.read().workspace.activeWorksiteId, 'two');
  const known = await fixture(t);
  known.setRead(missing); await known.client.button('刷新').props.onClick();
  assert.match(JSON.stringify(library(known.client)), /Folder A/);
  assert.equal(select(known.client, 'two').props.disabled, true);
  assert.match(JSON.stringify(known.client.render()), /暂时无法读取现场/);
});

test('explicit damaged organization is rejected as a whole and unknown extension fields remain untouched', async t => {
  for (const corrupt of [
    state => { state.organization.version = 2; },
    state => { state.organization.folders[0].worksiteIds = ['missing']; },
    state => { state.organization.folders.push({ id: 'other', title: 'Other', worksiteIds: ['two'] }); },
    state => { state.organization.folders[0].worksiteIds = ['two', 'two']; },
    state => { state.organization = null; },
  ]) {
    const f = await fixture(t, { transformRead: state => { corrupt(state); return state; } });
    assert.equal(library(f.client), null); assert.equal(posts(f.client).length, 0);
  }
  const f = await fixture(t, { transformRead: state => { state.organization.future = { keep: true }; return state; } });
  assert.match(JSON.stringify(library(f.client)), /Folder A/);
  assert.equal(posts(f.client).length, 0);
});

test('missing or wrong folder echoes cannot clear title or dirty draft before accepting the response', async t => {
  for (const type of ['create', 'rename', 'assign']) {
    const f = await fixture(t), { client } = f;
    field(client).props.onChange({ target: { value: 'keep local draft' } });
    const original = f.read().organization;
    f.setWrite(state => { state.organization = original; return state; });
    if (type === 'create') { setInput(client, '新文件夹名称', 'Unconfirmed'); await submit(client, '新文件夹名称'); assert.equal(input(client, '新文件夹名称').props.value, 'Unconfirmed'); }
    if (type === 'rename') { setInput(client, 'folder:1', 'Unconfirmed rename'); await submit(client, 'folder:1'); assert.equal(input(client, 'folder:1').props.value, 'Unconfirmed rename'); }
    if (type === 'assign') await select(client, 'two').props.onChange({ target: { value: '' } });
    assert.equal(field(client).props.value, 'keep local draft');
    assert.equal(select(client, 'two').props.value, 'folder:1');
    assert.equal(select(client, 'two').props.disabled, true);
    assert.match(JSON.stringify(client.render()), /保存结果待核对/);
    assert.equal(posts(client).length, 1);
  }
});

test('pending create and rename acknowledgements retain newer local title edits and busy guards block duplicate writes', async t => {
  for (const rename of [false, true]) {
    const f = await fixture(t), { client } = f, gate = deferred(); let body;
    const label = rename ? 'folder:1' : '新文件夹名称';
    f.intercept(r => { if (r.options.method === 'POST') { body = JSON.parse(r.options.body); return gate.promise; } });
    setInput(client, label, 'Captured'); const saving = submit(client, label);
    setInput(client, label, 'Newer local title');
    const count = posts(client).length; await submit(client, label);
    await select(client, 'two').props.onChange({ target: { value: '' } }); assert.equal(posts(client).length, count);
    gate.resolve(response(await f.commit(body))); await saving;
    assert.equal(input(client, label).props.value, 'Newer local title');
    assert.equal(f.read().organization.folders.find(folder => folder.id === (rename ? 'folder:1' : 'folder:2')).title, 'Captured');
  }
});

test('stable create-id collision is rejected by CAS without replay or clearing new-folder text', async t => {
  const f = await fixture(t), { client } = f;
  assert.equal((await f.command({ type: 'folder.create', id: 'folder:2', title: 'Concurrent owner' })).ok, true);
  setInput(client, '新文件夹名称', 'My folder'); await submit(client, '新文件夹名称');
  assert.equal(input(client, '新文件夹名称').props.value, 'My folder');
  assert.match(JSON.stringify(client.render()), /现场已被其他窗口更新/);
  assert.equal(posts(client).length, 1);
  assert.equal(f.read().organization.folders.find(folder => folder.id === 'folder:2').title, 'Concurrent owner');
  await client.button('刷新').props.onClick(); await submit(client, '新文件夹名称');
  assert.equal(f.read().organization.folders.find(folder => folder.id === 'folder:3').title, 'My folder');
});

test('same normalized name and same membership never POST or invalidate the shared Run source', async t => {
  const { client } = await fixture(t);
  client.render(); await settle(); await settle();
  assert.match(JSON.stringify(client.node(n => n.props['aria-label'] === '工作岛运行概览')), /待运行 1/);
  const before = client.requests.length;
  setInput(client, 'folder:1', '  Folder A  ');
  assert.equal(client.node(n => n.type === 'button' && n.props['data-folder-id'] === 'folder:1').props.disabled, true);
  await submit(client, 'folder:1');
  await select(client, 'two').props.onChange({ target: { value: 'folder:1' } });
  await select(client, 'legacy').props.onChange({ target: { value: '' } });
  assert.equal(posts(client).length, 0); assert.equal(client.requests.length, before);
  assert.match(JSON.stringify(client.node(n => n.props['aria-label'] === '工作岛运行概览')), /待运行 1/);
});

test('duplicate human folder titles retain distinct business identities without speaking raw IDs', async t => {
  const { client, read } = await fixture(t);
  setInput(client, '新文件夹名称', 'Folder A'); await submit(client, '新文件夹名称');
  await select(client, 'two').props.onChange({ target: { value: 'folder:2' } });
  assert.deepEqual(read().organization.folders.map(folder => [folder.id, folder.title, folder.worksiteIds]), [
    ['folder:1', 'Folder A', []], ['folder:2', 'Folder A', ['two']],
  ]);
  assert.equal(input(client, 'folder:1').props['aria-label'], '文件夹新名称：Folder A');
  assert.equal(input(client, 'folder:2').props['aria-label'], '文件夹新名称：Folder A');
  assert.equal(select(client, 'two').props.value, 'folder:2');
});

test('late save after component unmount keeps service mutation and does not add cancellation or replay', async t => {
  const f = await fixture(t), { client } = f, gate = deferred(); let body;
  f.intercept(r => { if (r.options.method === 'POST') { body = JSON.parse(r.options.body); return gate.promise; } });
  setInput(client, '新文件夹名称', 'Late save'); const saving = submit(client, '新文件夹名称');
  client.unmountComponent();
  gate.resolve(response(await f.commit(body))); await saving; await settle();
  assert.equal(f.read().organization.folders[1].title, 'Late save');
  // Component unmount does not imply disposal or business cancellation. The
  // provider keeps its existing lifetime behavior; no extra request is sent.
  assert.equal(posts(client).length, 1);
});
