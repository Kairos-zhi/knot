import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { listRuns } from '../packages/dsh-plugin/src/run-query.mjs';
import { runPromptText } from '../packages/dsh-plugin/src/run.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';
import { createWorkstationClient, response, deferred, settle } from './helpers/workstation-client-fixture.mjs';

const registered = client => client.node(n => n.props['aria-label'] === '登记现场呈现');
const field = client => client.node(n => n.props['aria-label'] === '现场草稿');
const posts = client => client.requests.filter(r => r.options.method === 'POST');
const modeButtons = client => ['展开', '卡片', '图标'].map(label => client.button(label));
function all(tree, predicate, found = []) {
  if (!tree || typeof tree !== 'object') return found;
  if (predicate(tree)) found.push(tree);
  (tree.children ?? []).forEach(child => all(child, predicate, found)); return found;
}
function assertHud(client) {
  const columns = client.node(n => n.props.className === 'kont-columns');
  assert.equal(columns.children[1].props['aria-label'], '现场输入 HUD');
  assert.equal(columns.children[1].props.key, 'worksite-hud');
  assert.equal(all(client.render(), n => n.props['aria-label'] === '现场草稿').length, 1);
}
function syntheticEvidence(run) {
  const entries = [
    ['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
    ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(run.input) }] }],
    ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: 'synthetic independent inspector output' }] }, stream: [] }],
    ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
  ];
  return { kind: 'synthetic-test', sessionId: run.plannedSessionId, events: entries.map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) };
}
async function fixture(t, views = [], completed = false) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-presentation-')), file = join(directory, 'state.json');
  let { store, run } = await prepareSyntheticReadRun(file);
  if (completed) await store.returnRun(run.runId, syntheticEvidence(run), 'runtime:synthetic-test');
  await store.mutate({ revision: store.read().revision, commands: [
    { type: 'worksite.create', id: 'two' },
    { type: 'worksite.update', worksiteId: 'legacy', agentId: 'fixture-agent' },
    { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'audit-target', mode: 'connect' },
    ...views.map(({ closed, ...view }) => ({ type: 'presentation.open', ...view })),
  ] });
  for (const view of views.filter(v => v.closed)) await store.command({ type: 'presentation.update', presentationId: view.id, closed: true });
  let fail = false, intercept = () => undefined;
  const client = await createWorkstationClient(store.read(), request => {
    const custom = intercept(request); if (custom !== undefined) return custom;
    if (request.path === '/kont/api/workspace') {
      if (request.options.method !== 'POST') return response(store.read());
      if (fail) return Promise.reject(new Error('synthetic failure'));
      return store.mutate(JSON.parse(request.options.body)).then(response);
    }
  }, { runResponse: () => listRuns(store.read()) });
  t.after(async () => { client.unmount(); await store.close(); await rm(directory, { recursive: true, force: true }); });
  client.render(); await settle(); await settle();
  return { client, read: () => store.read(), fail: () => { fail = true; }, intercept: fn => { intercept = fn; },
    commit: body => store.mutate(body),
    command: command => store.command(command),
    reopen: async () => { await store.close(); store = await new KontStore(file).init(); } };
}
const view = (id, kind = 'card', closed = false, worksiteId = 'legacy') => ({ id, worksiteId, kind, closed, layout: { x: 17, y: 23, width: 400, height: 300 } });

test('no presentation and all-closed states never render an unregistered window or material controls; mount and activation do not open one', async t => {
  for (const views of [[], [view('closed', 'window', true)]]) {
    const f = await fixture(t, views), { client } = f;
    const initial = f.read();
    assert.equal(registered(client), null);
    assert.equal(all(client.render(), n => Object.hasOwn(n.props, 'data-presentation-id')).length, 0);
    assert.ok(modeButtons(client).every(button => button.props['aria-pressed'] === false));
    assert.equal(client.node(n => n.type === 'input' && n.props.type === 'checkbox'), null);
    assert.equal(client.node(n => n.props['aria-label'] === '材料标题'), null);
    assert.match(JSON.stringify(client.node(n => n.props['aria-label'] === '现场呈现状态')), views.length ? /呈现已关闭/ : /尚未唤出/);
    assert.match(JSON.stringify(client.node(n => n.props['aria-label'] === '现场资源库')), views.length ? /呈现已关闭/ : /尚未唤出/);
    assertHud(client); client.render(); await client.remountComponent();
    assert.equal(posts(client).length, 0); assert.deepEqual(f.read(), initial);
    await client.button('two').props.onClick();
    assert.equal(registered(client), null); assertHud(client);
    await client.button('第一个工作现场').props.onClick();
    assert.equal(registered(client), null);
    assert.ok(posts(client).every(r => JSON.parse(r.options.body).commands.every(c => c.type === 'worksite.activate')));
    assert.deepEqual(f.read().workspace.presentations, initial.workspace.presentations);
  }
});

test('explicit mode actions reopen the first closed identity with layout, draft, supply and Run preserved through restart', async t => {
  for (const [label, kind] of [['展开', 'window'], ['卡片', 'card'], ['图标', 'icon']]) {
    const f = await fixture(t, [view('first-closed', 'icon', true), view('second-closed', 'card', true)]), { client } = f;
    const before = f.read(); field(client).props.onChange({ target: { value: 'local continuation' } });
    assert.equal(client.button(label).props['aria-label'], `唤出为${kind === 'window' ? '窗口' : label}：第一个工作现场`);
    await client.button(label).props.onClick();
    assert.equal(registered(client).props['data-presentation-id'], 'first-closed');
    const after = f.read();
    assert.deepEqual(after.workspace.presentations[0], { ...before.workspace.presentations[0], kind, closed: false });
    assert.deepEqual(after.workspace.presentations[1], before.workspace.presentations[1]);
    assert.equal(after.workspace.worksites[0].draft, 'local continuation');
    assert.deepEqual(after.workspace.worksites.map(s => [s.id, s.agentId, s.checkedIds, s.excludedIds]), before.workspace.worksites.map(s => [s.id, s.agentId, s.checkedIds, s.excludedIds]));
    assert.deepEqual(after.assets, before.assets); assert.deepEqual(after.runs, before.runs); assertHud(client);
    await f.reopen(); assert.deepEqual(f.read(), after);
  }
});

test('explicit reveal without an instance allocates one stable collision-free identity and repeated actions reuse it', async t => {
  const f = await fixture(t, [view('view:legacy', 'card', false, 'two')]), { client } = f;
  assert.equal(registered(client), null); await client.button('图标').props.onClick();
  assert.equal(registered(client).props['data-presentation-id'], 'view:legacy:1');
  await client.button('展开').props.onClick(); await client.button('卡片').props.onClick();
  assert.equal(f.read().workspace.presentations.filter(p => p.worksiteId === 'legacy').length, 1);
  assert.equal(registered(client).props['data-presentation-id'], 'view:legacy:1');
  assertHud(client);
});

test('multiple live instances use first-live array order consistently with the library, leaving other identities untouched', async t => {
  const f = await fixture(t, [view('closed-first', 'window', true), view('live-first', 'card'), view('live-second', 'window')]), { client } = f;
  assert.equal(registered(client).props['data-presentation-id'], 'live-first');
  assert.equal(client.button('卡片').props['aria-pressed'], true); assert.equal(client.button('展开').props['aria-pressed'], false);
  const before = f.read().workspace.presentations;
  await client.button('图标').props.onClick();
  assert.equal(registered(client).props['data-presentation-id'], 'live-first');
  assert.deepEqual(f.read().workspace.presentations.filter(p => p.id !== 'live-first'), before.filter(p => p.id !== 'live-first'));
  assertHud(client);
});

test('HUD and same-epoch Run inspector remain independent of missing live presentation', async t => {
  const { client, read } = await fixture(t, [], true);
  assert.equal(registered(client), null); assertHud(client);
  const runPanel = client.node(n => n.props['aria-label'] === '本轮运行状态');
  assert.match(JSON.stringify(runPanel), /已完成/);
  const locate = client.node(n => n.type === 'button' && n.children.includes('查看产物'));
  assert.equal(locate.props.disabled, false); locate.props.onClick();
  const inspector = client.node(n => n.props['aria-label'] === '运行产物');
  assert.match(JSON.stringify(inspector), /synthetic independent inspector output/);
  assert.equal(Object.hasOwn(inspector.props, 'data-presentation-id'), false);
  assert.equal(registered(client), null); assert.equal(read().workspace.presentations.length, 0);
  assert.equal(posts(client).length, 0);
});

test('pending or failed reveal stays a marked snapshot with no implicit live instance and preserves HUD edits', async t => {
  const f = await fixture(t), { client } = f, gate = deferred(); let body;
  f.intercept(request => { if (request.options.method === 'POST') { body = JSON.parse(request.options.body); return gate.promise; } });
  field(client).props.onChange({ target: { value: 'captured local draft' } });
  const revealing = client.button('展开').props.onClick();
  assert.equal(registered(client), null); assert.ok(modeButtons(client).every(button => button.props.disabled));
  assert.match(JSON.stringify(client.render()), /已保存快照 · 现场待核对/); assertHud(client);
  gate.resolve(response(await f.commit(body))); await revealing;
  assert.equal(registered(client).props['data-presentation-id'], 'view:legacy');
  const failed = await fixture(t); failed.fail(); field(failed.client).props.onChange({ target: { value: 'keep text' } });
  await failed.client.button('展开').props.onClick();
  assert.equal(registered(failed.client), null); assert.equal(field(failed.client).props.value, 'keep text');
  assert.ok(modeButtons(failed.client).every(button => button.props['aria-pressed'] === false));
  assert.match(JSON.stringify(failed.client.render()), /已保存快照 · 现场待核对/); assertHud(failed.client);
});
