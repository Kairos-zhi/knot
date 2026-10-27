import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { createHandler, createProtocolHandler } from '../packages/dsh-plugin/src/index.mjs';
import { runPromptText } from '../packages/dsh-plugin/src/run.mjs';
import { createRunStatusView } from '../packages/dsh-plugin/src/run-status-view.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';
import { createWorkstationClient, findNode, response, deferred, settle } from './helpers/workstation-client-fixture.mjs';

const panel = client => client.node(n => n.props['aria-label'] === '本轮运行状态');
const output = client => client.node(n => n.props['aria-label'] === '运行产物');
const locate = client => client.node(n => n.type === 'button' && n.children.includes('查看产物'));
const text = client => JSON.stringify(panel(client));
const hasOutput = tree => findNode(tree, n => n.props['aria-label'] === '运行产物');
function evidence(run) {
  const entries = [
    ['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
    ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(run.input) }] }],
    ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: 'synthetic epoch output' }] }, stream: [] }],
    ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
  ];
  return { kind: 'synthetic-test', sessionId: run.plannedSessionId, events: entries.map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) };
}

async function fixture(t, mode = 'aligned') {
  const directory = await mkdtemp(join(tmpdir(), 'kont-run-epoch-'));
  const { store, run } = await prepareSyntheticReadRun(join(directory, 'state.json'));
  const connection = { requestRejection: req => req.headers['x-human-test'] === 'yes' ? undefined : 401 };
  const human = createHandler(store, connection), protocol = createProtocolHandler(store, connection);
  const server = createServer((req, res) => req.url === '/kont/api/workspace' ? human(req, res) : protocol(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const baseURI = `http://127.0.0.1:${server.address().port}/`;
  const get = async path => {
    const result = await fetch(new URL(path, baseURI), { headers: { 'x-human-test': 'yes' } });
    assert.equal(result.status, 200); return result.json();
  };
  let workspace;
  if (mode === 'mixed-new-output') workspace = await get('kont/api/workspace');
  await store.returnRun(run.runId, evidence(run), 'runtime:synthetic-epoch');
  if (!workspace) workspace = await get('kont/api/workspace');
  if (mode === 'mixed-existing-block') await store.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'newer unrelated draft' });
  let runResponse = () => get('kont/runs'), pendingRun;
  const client = await createWorkstationClient(workspace, request => {
    // Reuse the exact parsed HTTP snapshot object to test same-seq Run source
    // changes without relying on a new asset object to invalidate navigation.
    if (request.path === '/kont/api/workspace') return response(workspace);
  }, { baseURI, runResponse: () => { pendingRun = Promise.resolve().then(runResponse); return pendingRun; } });
  t.after(async () => {
    client.unmount(); protocol.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await store.close(); await rm(directory, { recursive: true, force: true });
  });
  const waitRuns = async (render = true) => {
    if (render) client.render();
    await pendingRun?.catch(() => {}); await settle();
  };
  await waitRuns();
  return { client, store, run, get, get workspace() { return workspace; },
    setRuns: fn => { runResponse = fn; }, waitRuns,
    refreshAssets: async () => { workspace = await get('kont/api/workspace'); await client.button('刷新').props.onClick(); await waitRuns(); } };
}

test('actual Store/HTTP newer completed Run plus older assets is unknown until same-epoch refresh, then actual missing stays historical', async t => {
  const f = await fixture(t, 'mixed-new-output'), { client, store } = f;
  assert.ok(store.read().seq > f.workspace.seq);
  assert.match(text(client), /已完成/); assert.match(text(client), /产物位置待核对/);
  assert.doesNotMatch(text(client), /产物位置已失效/); assert.equal(locate(client).props.disabled, true);
  locate(client).props.onClick(); assert.equal(output(client), null);
  await f.refreshAssets();
  assert.equal(locate(client).props.disabled, false); locate(client).props.onClick();
  assert.match(JSON.stringify(output(client)), /synthetic epoch output/);
  const target = store.read().assets.find(a => a.id === f.run.targetId);
  const blockId = store.read().runs[0].receipt.blockId;
  assert.equal((await store.command({ type: 'knot.update', id: target.id, patch: { blocks: target.blocks.filter(b => b.id !== blockId) } })).ok, true);
  await f.refreshAssets();
  assert.match(text(client), /已完成/); assert.match(text(client), /产物位置已失效，完成记录仍保留/);
  assert.equal(locate(client).props.disabled, true); assert.equal(output(client), null);
});

test('newer Run read with an already-existing same-ID output block still cannot join older assets', async t => {
  const { client, workspace, store } = await fixture(t, 'mixed-existing-block');
  assert.ok(store.read().seq > workspace.seq);
  const blockId = store.read().runs[0].receipt.blockId;
  assert.ok(workspace.assets.some(a => a.blocks?.some(b => b.id === blockId)));
  assert.match(text(client), /产物位置待核对/); assert.doesNotMatch(text(client), /位置已失效/);
  const offered = locate(client); assert.equal(offered.props.disabled, true); offered.props.onClick();
  assert.equal(output(client), null);
});

test('same-seq source loading and success permanently invalidate preview and old callback with the same asset object', async t => {
  const f = await fixture(t), { client } = f;
  const stale = locate(client); stale.props.onClick(); assert.ok(output(client));
  const snapshotObject = f.workspace, body = await f.get('kont/runs'), gate = deferred();
  f.setRuns(() => gate.promise);
  await client.button('刷新').props.onClick();
  assert.equal(f.workspace, snapshotObject); assert.equal(hasOutput(client.render()), null, 'first render hides immediately while source loading');
  gate.resolve(body); await settle(); await settle();
  assert.equal(hasOutput(client.render()), null, 'same seq success must not revive old selection');
  stale.props.onClick(); assert.equal(hasOutput(client.render()), null, 'direct old callback cannot revive it');
  locate(client).props.onClick(); assert.ok(output(client), 'fresh same-epoch action can locate again');
});

test('same-seq source refresh cannot revive preview even when no loading render occurred', async t => {
  const f = await fixture(t), { client } = f;
  const stale = locate(client); stale.props.onClick(); assert.ok(output(client));
  const original = f.workspace;
  await client.button('刷新').props.onClick(); await f.waitRuns(false);
  assert.equal(f.workspace, original);
  assert.equal(hasOutput(client.render()), null, 'synchronous token gate must hide before cleanup effect');
  stale.props.onClick(); assert.equal(output(client), null);
});

test('old navigation and open preview become invalid after a newer Run epoch, then require an explicit fresh same-epoch action', async t => {
  const f = await fixture(t), { client, store } = f;
  const old = locate(client); old.props.onClick(); assert.ok(output(client));
  await store.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'later epoch' });
  await client.button('刷新').props.onClick(); await f.waitRuns();
  assert.match(text(client), /产物位置待核对/); assert.equal(hasOutput(client.render()), null);
  old.props.onClick(); assert.equal(output(client), null);
  await f.refreshAssets(); assert.equal(output(client), null);
  locate(client).props.onClick(); assert.ok(output(client));
  assert.ok(client.requests.every(r => !r.options.method || r.options.method === 'GET'));
});

test('current tuple and block are re-resolved; errors and stale completed callbacks never reopen prior output', async t => {
  const f = await fixture(t), { client } = f;
  const old = locate(client); old.props.onClick(); assert.ok(output(client));
  const same = await f.get('kont/runs');
  f.setRuns(() => ({ ...same, runs: same.runs.map(run => ({ ...run, phase: 'prepared', hasOutput: false, blockId: null })) }));
  await client.button('刷新').props.onClick(); await f.waitRuns();
  assert.match(text(client), /待运行/); assert.equal(locate(client), null);
  old.props.onClick(); assert.equal(output(client), null);
  f.setRuns(() => Promise.reject(new Error('synthetic query failure')));
  await client.button('刷新').props.onClick(); await f.waitRuns();
  assert.match(text(client), /运行状态暂时无法读取/); old.props.onClick(); assert.equal(output(client), null);
});

test('panel keeps phase history but treats older, missing or malformed epochs as unknown, including absent old target title', async () => {
  const source = await readFile(new URL('../packages/dsh-plugin/src/run-status-panel.cjs', import.meta.url), 'utf8'), exports = {};
  runInNewContext(source, { exports, require: name => name === 'react'
    ? { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) }
    : { createRunStatusView } });
  const dto = { runId: 'synthetic-run', requestId: 'synthetic-request', sessionId: 'synthetic-session', worksiteId: 'site', targetId: 'target', phase: 'completed', hasOutput: true, blockId: 'block' };
  for (const [assetSeq, runSeq] of [[2, 3], [3, 2], [undefined, 2], [2, undefined], [NaN, 2], [-1, -1], ['2', 2]]) {
    let calls = 0;
    const tree = exports.RunStatusPanel({ worksiteId: 'site', assets: [], runs: [dto], assetSeq, runSeq, onLocate: () => calls++ });
    const body = JSON.stringify(tree);
    assert.match(body, /已完成/); assert.match(body, /产物位置待核对/); assert.match(body, /运行目标待核对/);
    assert.doesNotMatch(body, /产物位置已失效|目标已移除/);
    const button = findNode(tree, n => n.type === 'button' && n.children.includes('查看产物'));
    assert.equal(button.props.disabled, true); button.props.onClick(); assert.equal(calls, 0);
  }
});
