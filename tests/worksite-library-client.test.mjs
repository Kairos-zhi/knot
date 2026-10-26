import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createWorkstationClient, findNode, response } from './helpers/workstation-client-fixture.mjs';

async function fixture(t, presentations = []) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-library-'));
  let store = await new KontStore(join(directory, 'state.json')).init();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.mutate({ revision: 0, commands: [
    { type: 'knot.create', id: 'material', data: { title: 'Material', summary: 'body' } },
    { type: 'worksite.create', id: 'two' },
    { type: 'worksite.update', worksiteId: 'two', draft: 'second saved', agentId: 'fixture-agent' },
    { type: 'worksite.supply', worksiteId: 'two', assetId: 'material', mode: 'connect' },
    ...presentations.map(view => ({ type: 'presentation.open', ...view })),
  ] });
  let fail = false;
  const client = await createWorkstationClient(store.read(), request => {
    if (request.path !== '/kont/api/workspace') return undefined;
    if (request.options.method !== 'POST') return response(store.read());
    if (fail) throw new Error('synthetic write failure');
    return store.mutate(JSON.parse(request.options.body)).then(response);
  });
  t.after(client.unmount);
  return { client, read: () => store.read(), fail: () => { fail = true; },
    command: async command => { const result = await store.command(command); assert.equal(result.ok, true); await client.button('刷新').props.onClick(); },
    reopen: async () => { await store.close(); store = await new KontStore(join(directory, 'state.json')).init(); } };
}
const reveal = client => client.node(node => node.props['aria-label'] === '唤出现场：two');
const posts = client => client.requests.filter(request => request.options.method === 'POST');
const field = client => client.node(node => node.props['aria-label'] === '现场草稿');

test('library describes saved presentation, actual supply and local draft without writes or invented activity', async t => {
  const { client, command } = await fixture(t, [{ id: 'view-two', worksiteId: 'two', kind: 'card' }]);
  const library = () => client.node(node => node.props['aria-label'] === '现场资源库');
  assert.match(JSON.stringify(library()), /卡片 · 1 份供给/);
  assert.match(JSON.stringify(library()), /已有保存草稿/);
  assert.equal(posts(client).length, 0);
  field(client).props.onChange({ target: { value: 'local only' } });
  assert.match(JSON.stringify(library()), /本页草稿未保存/);
  await command({ type: 'worksite.supply', worksiteId: 'two', assetId: 'material', mode: 'exclude' });
  assert.match(JSON.stringify(library()), /卡片 · 0 份供给/);
  assert.doesNotMatch(JSON.stringify(library()), /running|运行中|停止/);
});

for (const kind of ['window', 'card', 'icon', 'closed']) {
  test(`reveal reuses ${kind} identity and restores through the durable shared store`, async t => {
    const fixtureValue = await fixture(t, [{ id: 'stable-two', worksiteId: 'two', kind: kind === 'closed' ? 'card' : kind, layout: { x: 19, y: 29, width: 420, height: 300 } }]);
    const { client, read, command, reopen } = fixtureValue;
    if (kind === 'closed') {
      await command({ type: 'presentation.update', presentationId: 'stable-two', closed: true });
      assert.match(JSON.stringify(client.render()), /呈现已关闭/);
    }
    const before = read();
    await reveal(client).props.onClick();
    const after = read();
    assert.equal(after.workspace.activeWorksiteId, 'two');
    assert.equal(after.workspace.presentations.length, before.workspace.presentations.length);
    const view = after.workspace.presentations.find(item => item.id === 'stable-two');
    assert.equal(view.kind, 'window'); assert.equal(view.closed, false);
    assert.deepEqual(view.layout, before.workspace.presentations.find(item => item.id === 'stable-two').layout);
    assert.deepEqual(after.workspace.worksites, before.workspace.worksites);
    assert.deepEqual(after.assets, before.assets);
    assert.deepEqual(after.runs, before.runs);
    assert.equal(field(client).props.value, 'second saved');
    await reopen(); assert.deepEqual(read(), after);
    await client.button('刷新').props.onClick();
    assert.match(JSON.stringify(client.node(node => node.props['aria-label'] === '现场资源库')), /窗口 · 1 份供给/);
  });
}

test('reveal prefers first live presentation and leaves other instances untouched', async t => {
  const { client, command, read } = await fixture(t, [
    { id: 'closed', worksiteId: 'two', kind: 'icon' },
    { id: 'live-first', worksiteId: 'two', kind: 'card' },
    { id: 'live-second', worksiteId: 'two', kind: 'icon' },
  ]);
  await command({ type: 'presentation.update', presentationId: 'closed', closed: true });
  const before = read(); await reveal(client).props.onClick();
  const commands = JSON.parse(posts(client).at(-1).options.body).commands;
  assert.deepEqual(commands, [{ type: 'worksite.activate', worksiteId: 'two' }, { type: 'presentation.update', presentationId: 'live-first', kind: 'window', closed: false }]);
  for (const id of ['closed', 'live-second']) assert.deepEqual(read().workspace.presentations.find(v => v.id === id), before.workspace.presentations.find(v => v.id === id));
});

test('missing presentation opens a stable globally unused identity then reuses it', async t => {
  const { client, read } = await fixture(t, [
    { id: 'view:two', worksiteId: 'legacy', kind: 'window' },
    { id: 'view:two:1', worksiteId: 'legacy', kind: 'icon' },
  ]);
  await reveal(client).props.onClick();
  assert.equal(read().workspace.presentations.find(v => v.worksiteId === 'two').id, 'view:two:2');
  await reveal(client).props.onClick();
  assert.equal(read().workspace.presentations.filter(v => v.worksiteId === 'two').length, 1);
});

test('closed-only library and existing mode controls reuse the same first saved instance', async t => {
  const { client, command, read } = await fixture(t, [
    { id: 'closed-first', worksiteId: 'two', kind: 'card' },
    { id: 'closed-second', worksiteId: 'two', kind: 'icon' },
  ]);
  for (const id of ['closed-first', 'closed-second']) await command({ type: 'presentation.update', presentationId: id, closed: true });
  await client.button('two').props.onClick();
  await client.button('图标').props.onClick();
  assert.equal(read().workspace.presentations[0].id, 'closed-first');
  assert.equal(read().workspace.presentations[0].kind, 'icon');
  assert.equal(read().workspace.presentations[0].closed, false);
  await reveal(client).props.onClick();
  assert.equal(read().workspace.presentations[0].kind, 'window');
  assert.equal(read().workspace.presentations[1].closed, true);
  assert.equal(read().workspace.presentations.length, 2);
});

test('switch keeps compact presentation while reveal atomically saves the old draft and preserves supply isolation', async t => {
  const { client, read } = await fixture(t, [{ id: 'two-icon', worksiteId: 'two', kind: 'icon' }]);
  field(client).props.onChange({ target: { value: 'first local draft' } });
  await client.button('two').props.onClick();
  assert.equal(read().workspace.presentations[0].kind, 'icon');
  assert.equal(read().workspace.worksites.find(s => s.id === 'legacy').draft, 'first local draft');
  await client.button('第一个工作现场').props.onClick();
  field(client).props.onChange({ target: { value: 'first newer draft' } });
  await reveal(client).props.onClick();
  const commands = JSON.parse(posts(client).at(-1).options.body).commands;
  assert.equal(commands[0].type, 'worksite.update');
  assert.equal(commands[0].worksiteId, 'legacy');
  assert.deepEqual(read().workspace.worksites.find(s => s.id === 'two').checkedIds, ['material']);
  assert.deepEqual(read().workspace.worksites.find(s => s.id === 'legacy').checkedIds, []);
  assert.equal(read().workspace.worksites.find(s => s.id === 'legacy').draft, 'first newer draft');
  assert.ok(posts(client).every(p => JSON.parse(p.options.body).commands.every(c => /^(worksite\.(update|activate)|presentation\.(open|update))$/.test(c.type))));
});

test('failed reveal leaves the current target, local draft and presentation intact, requiring explicit refresh', async t => {
  const { client, read, fail } = await fixture(t);
  field(client).props.onChange({ target: { value: 'do not lose' } });
  const before = read(); fail(); await reveal(client).props.onClick();
  assert.deepEqual(read(), before);
  assert.equal(field(client).props.value, 'do not lose');
  assert.equal(reveal(client).props.disabled, true);
  assert.match(JSON.stringify(client.render()), /已保存快照 · 现场待核对/);
  await client.button('刷新').props.onClick();
  assert.equal(field(client).props.value, 'do not lose');
  assert.equal(reveal(client).props.disabled, false);
  assert.equal(posts(client).length, 1);
  assert.ok(findNode(client.render(), n => n.props['aria-label'] === '现场资源库'));
});
