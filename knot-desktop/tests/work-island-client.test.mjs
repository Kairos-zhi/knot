import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';
import { listRuns, projectRun } from '../packages/dsh-plugin/src/run-query.mjs';
import { createWorkstationClient, deferred, response, settle } from './helpers/workstation-client-fixture.mjs';

const island = client => client.node(n => n.props['aria-label'] === '工作岛运行概览');
const text = client => JSON.stringify(island(client));
const field = client => client.node(n => n.props['aria-label'] === '现场草稿');
const runReads = client => client.requests.filter(r => r.path === '/kont/runs');
const posts = client => client.requests.filter(r => r.options.method === 'POST');
const returned = client => client.node(n => n.props['aria-label'] === '从工作岛回到现场：two');

async function fixture(t, synthetic = true) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-island-'));
  const file = join(directory, 'state.json');
  let store;
  if (synthetic) ({ store } = await prepareSyntheticReadRun(file));
  else store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.mutate({ revision: store.read().revision, commands: [
    { type: 'worksite.create', id: 'two' },
    { type: 'worksite.update', worksiteId: 'two', draft: 'second saved', agentId: 'synthetic-agent' },
    { type: 'presentation.open', id: 'two-saved-view', worksiteId: 'two', kind: 'icon', layout: { x: 5, y: 6 } },
    ...(synthetic ? [{ type: 'worksite.supply', worksiteId: 'two', assetId: 'audit-target', mode: 'connect' },
      { type: 'run.prepare', worksiteId: 'two', targetId: 'audit-target', requestId: 'synthetic-two-request', sessionId: 'synthetic-two-session' }] : []),
  ] });
  let runResponse = () => listRuns(store.read()), intercept = () => undefined;
  const client = await createWorkstationClient(store.read(), request => {
    const custom = intercept(request); if (custom !== undefined) return custom;
    if (request.path === '/kont/api/workspace') return request.options.method === 'POST'
      ? store.mutate(JSON.parse(request.options.body)).then(response) : response(store.read());
  }, { runResponse: request => runResponse(request) });
  t.after(client.unmount);
  // The fixture runs effects when rendered; this allows the initial shared
  // source response to settle before checking the overview.
  client.render(); await settle(); await settle();
  return { client, read: () => store.read(), command: command => store.command(command), setRuns: fn => { runResponse = fn; }, intercept: fn => { intercept = fn; },
    reopen: async () => { await store.close(); store = await new KontStore(file).init(); } };
}

test('global island consumes the same single run query and shows snapshot ownership beyond the active site', async t => {
  const { client, read } = await fixture(t);
  const original = read();
  assert.equal(runReads(client).length, 1);
  assert.match(text(client), /第一个工作现场/); assert.match(text(client), /two/);
  assert.match(text(client), /待运行 1/); assert.match(text(client), /当前核对快照/);
  assert.doesNotMatch(text(client), /running|运行中|%|取消|停止/);
  for (let i = 0; i < 3; i++) client.render();
  assert.equal(runReads(client).length, 1); assert.equal(posts(client).length, 0);
  assert.deepEqual(read(), original);
});

test('all four projected phases use the existing authoritative labels without invented progress', async t => {
  const { client, read, setRuns } = await fixture(t);
  const base = projectRun(read().runs[0]);
  setRuns(() => ({ ok: true, seq: read().seq, runs: ['prepared', 'submitted', 'uncertain', 'completed'].map((phase, index) => ({
    ...base, runId: `synthetic-phase-${index}`, phase, hasOutput: phase === 'completed', blockId: phase === 'completed' ? 'synthetic-output' : null,
  })) }));
  await client.button('刷新工作岛').props.onClick(); await settle();
  assert.match(text(client), /4 条记录 · 待运行 1 · 已提交 1 · 待核对 1 · 已完成 1/);
  assert.doesNotMatch(text(client), /running|运行中|失败|取消|%/);
});

test('return reuses saved presentation, saves dirty old target atomically and preserves Run and supply state through reopen', async t => {
  const { client, read, reopen } = await fixture(t);
  field(client).props.onChange({ target: { value: 'old target edited' } });
  const before = read();
  await returned(client).props.onClick(); await settle();
  const after = read();
  assert.equal(after.workspace.activeWorksiteId, 'two');
  assert.equal(field(client).props.value, 'second saved');
  assert.equal(client.node(n => n.props['aria-label'] === '现场输入 HUD').props['data-worksite-id'], 'two');
  assert.equal(after.workspace.worksites[0].draft, 'old target edited');
  assert.deepEqual(after.runs, before.runs); assert.deepEqual(after.assets, before.assets);
  assert.deepEqual(after.workspace.worksites.map(s => [s.id, s.checkedIds, s.excludedIds, s.agentId]), before.workspace.worksites.map(s => [s.id, s.checkedIds, s.excludedIds, s.agentId]));
  assert.deepEqual(after.workspace.presentations[0], { ...before.workspace.presentations[0], kind: 'window', closed: false });
  const commands = JSON.parse(posts(client)[0].options.body).commands;
  assert.deepEqual(commands.map(c => c.type), ['worksite.update', 'worksite.activate', 'presentation.update']);
  assert.equal(commands[1].worksiteId, 'two'); assert.equal(commands[2].presentationId, 'two-saved-view');
  await reopen(); assert.deepEqual(read(), after);
});

test('unknown owner remains visible and cannot navigate or disappear as an empty island', async t => {
  const { client, read, setRuns } = await fixture(t);
  const unknown = { ...projectRun(read().runs[0]), worksiteId: 'synthetic-missing-owner' };
  setRuns(() => ({ ok: true, seq: read().seq, runs: [unknown] }));
  await client.button('刷新工作岛').props.onClick(); await settle();
  assert.match(text(client), /运行归属待核对/); assert.doesNotMatch(text(client), /暂无运行记录/);
  const button = client.node(n => n.props['aria-label'] === '运行归属待核对，无法返回现场');
  assert.equal(button.props.disabled, true); button.props.onClick();
  assert.equal(posts(client).length, 0);
});

test('known owner named unknown-owner and unknown attribution have distinct group identities', async t => {
  const { client, read, command, setRuns } = await fixture(t);
  assert.equal((await command({ type: 'worksite.create', id: 'unknown-owner' })).ok, true);
  const base = projectRun(read().runs[0]);
  setRuns(() => ({ ok: true, seq: read().seq, runs: [
    { ...base, runId: 'synthetic-known-owner', worksiteId: 'unknown-owner' },
    { ...base, runId: 'synthetic-unknown-owner', worksiteId: 'missing-site' },
  ] }));
  await client.button('刷新工作岛').props.onClick(); await settle();
  const list = client.node(n => n.props.className === 'kont-island-list');
  assert.deepEqual(list.children.map(n => n.props.key), ['site:unknown-owner', 'unknown-owner']);
  assert.equal(client.node(n => n.props['aria-label'] === '从工作岛回到现场：unknown-owner').props.disabled, false);
  assert.equal(client.node(n => n.props['aria-label'] === '运行归属待核对，无法返回现场').props.disabled, true);
});

test('busy, query error and late old-source response stay neutral until explicit refresh', async t => {
  const { client, read, setRuns } = await fixture(t);
  const old = deferred(); let attempt = 0;
  setRuns(() => ++attempt === 1 ? old.promise : Promise.reject(new Error('synthetic query failure')));
  const refreshing = client.button('刷新工作岛').props.onClick();
  assert.match(text(client), /运行概览待核对/); assert.equal(returned(client), null);
  await refreshing; client.render(); await settle();
  // Workspace changes invalidate the pending source and move the pointer.
  await client.button('two').props.onClick(); client.render(); await settle();
  old.resolve({ ok: true, seq: read().seq, runs: [{ ...projectRun(read().runs[0]), worksiteId: 'late-unknown-owner' }] });
  await settle(); await settle();
  assert.match(text(client), /运行概览待核对/);
  assert.doesNotMatch(text(client), /运行归属待核对/);
  await client.button('刷新').props.onClick(); client.render(); await settle(); await settle();
  assert.match(text(client), /运行概览待核对/); assert.doesNotMatch(text(client), /暂无运行记录|全部完成/);
  setRuns(() => listRuns(read())); await client.button('刷新').props.onClick(); client.render(); await settle(); await settle();
  assert.match(text(client), /待运行 1/);
});

test('only a successful empty query shows no Run records', async t => {
  const { client } = await fixture(t, false);
  assert.match(text(client), /暂无运行记录/); assert.doesNotMatch(text(client), /全部完成|100|%/);
  assert.equal(runReads(client).length, 1); assert.equal(posts(client).length, 0);
});
