import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createWorkstationClient, deferred, response } from './helpers/workstation-client-fixture.mjs';

const hud = client => client.node(n => n.props['aria-label'] === '现场输入 HUD');
const draft = client => client.node(n => n.props['aria-label'] === '现场草稿');
const posts = client => client.requests.filter(r => r.options.method === 'POST');
function matches(tree, predicate, path = [], found = []) {
  if (!tree || typeof tree !== 'object') return found;
  if (predicate(tree)) found.push({ tree, path });
  (tree.children ?? []).forEach((child, index) => matches(child, predicate, [...path, index], found));
  return found;
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-hud-'));
  const file = join(directory, 'state.json');
  let store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.mutate({ revision: 0, commands: [
    { type: 'knot.create', id: 'one-material', data: { title: 'First material', summary: 'first body' } },
    { type: 'knot.create', id: 'two-material', data: { title: 'Second material', summary: 'second body' } },
    { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'one-material', mode: 'connect' },
    { type: 'worksite.create', id: 'two' },
    { type: 'worksite.update', worksiteId: 'two', draft: 'second draft', agentId: 'fixture-agent-真实标识' },
    { type: 'worksite.supply', worksiteId: 'two', assetId: 'two-material', mode: 'connect' },
  ] });
  let intercept = () => undefined;
  const client = await createWorkstationClient(store.read(), request => {
    const result = intercept(request);
    if (result !== undefined) return result;
    if (request.path === '/kont/api/workspace') return request.options.method === 'POST'
      ? store.mutate(JSON.parse(request.options.body)).then(response) : response(store.read());
    if (request.path.endsWith('/preview')) return response({ ok: true, seq: store.read().seq, preview: store.preview(decodeURIComponent(request.path.split('/')[3])) });
  });
  t.after(client.unmount);
  return { client, read: () => store.read(), intercept: fn => { intercept = fn; },
    commit: body => store.mutate(body),
    reopen: async () => { await store.close(); store = await new KontStore(file).init(); } };
}

test('three modes keep one keyed HUD in the same tree position and edits survive durable reopen', async t => {
  const { client, read, reopen } = await fixture(t);
  const identity = () => matches(client.render(), n => n.props['aria-label'] === '现场输入 HUD');
  const originalPath = identity()[0].path;
  for (const [index, mode] of ['卡片', '图标', '展开'].entries()) {
    await client.button(mode).props.onClick();
    assert.equal(identity().length, 1);
    assert.deepEqual(identity()[0].path, originalPath);
    assert.equal(identity()[0].tree.props.key, 'worksite-hud');
    assert.equal(matches(client.render(), n => n.props['aria-label'] === '现场草稿').length, 1);
    draft(client).props.onChange({ target: { value: `mode draft ${index}` } });
    await client.button('保存草稿').props.onClick();
    assert.equal(read().workspace.worksites[0].draft, `mode draft ${index}`);
    assert.match(JSON.stringify(hud(client)), /目标现场：第一个工作现场/);
    assert.match(JSON.stringify(hud(client)), /本轮已选 1 份材料/);
    assert.match(JSON.stringify(hud(client)), /First material/);
    assert.doesNotMatch(JSON.stringify(hud(client)), /Second material/);
  }
  const before = read(); await reopen(); assert.deepEqual(read(), before);
  await client.button('刷新').props.onClick();
  assert.equal(draft(client).props.value, 'mode draft 2');
});

test('compact HUD saves before preview without changing target or supply and uses the existing server projection', async t => {
  const { client, read } = await fixture(t);
  await client.button('图标').props.onClick();
  draft(client).props.onChange({ target: { value: 'icon question' } });
  const before = read().workspace;
  await client.button('查看本轮供给').props.onClick();
  assert.equal(read().workspace.activeWorksiteId, before.activeWorksiteId);
  assert.deepEqual(read().workspace.worksites[0].checkedIds, before.worksites[0].checkedIds);
  assert.equal(read().workspace.worksites[0].draft, 'icon question');
  assert.match(JSON.stringify(hud(client)), /first body/);
  assert.equal(client.requests.filter(r => r.path.endsWith('/preview')).length, 1);
  assert.ok(posts(client).every(r => JSON.parse(r.options.body).commands.every(c => ['worksite.update', 'presentation.open', 'presentation.update'].includes(c.type))));
});

test('HUD follows resource-library targets with isolated drafts, real Agent identity and supplies', async t => {
  const { client, read } = await fixture(t);
  await client.button('卡片').props.onClick();
  draft(client).props.onChange({ target: { value: 'first local' } });
  assert.match(JSON.stringify(hud(client)), /尚未选择 Agent/);
  await client.node(n => n.props['aria-label'] === '唤出现场：two').props.onClick();
  assert.equal(hud(client).props['data-worksite-id'], 'two');
  assert.equal(draft(client).props.value, 'second draft');
  assert.match(JSON.stringify(hud(client)), /已选 Agent 标识：fixture-agent-真实标识/);
  assert.match(JSON.stringify(hud(client)), /Second material/);
  assert.doesNotMatch(JSON.stringify(hud(client)), /First material|在线|可调用/);
  draft(client).props.onChange({ target: { value: 'second local' } });
  await client.button('第一个工作现场').props.onClick();
  assert.equal(draft(client).props.value, 'first local');
  assert.equal(read().workspace.worksites.find(s => s.id === 'two').draft, 'second local');
  assert.equal(read().workspace.presentations.find(v => v.worksiteId === 'legacy').kind, 'card');
});

test('failed compact save leaves editable draft and neutral snapshot state behind explicit refresh barrier', async t => {
  const { client, read, intercept } = await fixture(t);
  await client.button('图标').props.onClick();
  draft(client).props.onChange({ target: { value: 'keep me' } });
  const before = read();
  intercept(r => r.options.method === 'POST' ? Promise.reject(new Error('synthetic failure')) : undefined);
  await client.button('保存草稿').props.onClick();
  assert.deepEqual(read(), before); assert.equal(draft(client).props.value, 'keep me');
  assert.match(JSON.stringify(hud(client)), /已保存快照 · 现场待核对/);
  assert.equal(client.button('保存草稿').props.disabled, true);
  assert.equal(client.button('查看本轮供给').props.disabled, true);
  draft(client).props.onChange({ target: { value: 'newer after failure' } });
  await client.button('刷新').props.onClick();
  assert.equal(draft(client).props.value, 'newer after failure');
  assert.equal(client.button('保存草稿').props.disabled, false);
});

test('pending HUD save keeps newer edits and repeated mode/reveal requests cannot duplicate the write', async t => {
  const { client, intercept, commit } = await fixture(t);
  await client.button('卡片').props.onClick();
  draft(client).props.onChange({ target: { value: 'captured' } });
  const pending = deferred(); let body;
  intercept(r => { if (r.options.method === 'POST') { body = JSON.parse(r.options.body); return pending.promise; } });
  const saving = client.button('保存草稿').props.onClick();
  assert.equal(draft(client).props.disabled, true);
  assert.match(JSON.stringify(hud(client)), /现场待核对/);
  const count = posts(client).length;
  // Programmatic callback checks exercise the busy guard; no input is simulated.
  draft(client).props.onChange({ target: { value: 'newer' } });
  await client.button('图标').props.onClick();
  await client.node(n => n.props['aria-label'] === '唤出现场：two').props.onClick();
  assert.equal(posts(client).length, count);
  pending.resolve(response(await commit(body))); await saving;
  assert.equal(draft(client).props.value, 'newer');
  assert.equal(hud(client).props['data-worksite-id'], 'legacy');
  assert.equal(client.button('保存草稿').props.disabled, false);
});

test('HUD distinguishes explicit unselected Agent, raw identity and unknown selection without availability claims', async t => {
  for (const [agentId, label] of [[null, '尚未选择 Agent'], ['raw-agent', '已选 Agent 标识：raw-agent'], [undefined, 'Agent 选择待核对'], [{ private: 'do not render' }, 'Agent 选择待核对'], ['  ', 'Agent 选择待核对']]) {
    const data = { revision: 1, seq: 1, titles: { one: 'One' }, assets: [], workspace: {
      activeWorksiteId: 'one', presentations: [], worksites: [{ id: 'one', draft: '', agentId, checkedIds: [], excludedIds: [] }],
    } };
    const client = await createWorkstationClient(data); t.after(client.unmount);
    assert.match(JSON.stringify(hud(client)), new RegExp(label));
    assert.doesNotMatch(JSON.stringify(hud(client)), /在线|可调用|do not render/);
    assert.equal(posts(client).length, 0);
  }
});
