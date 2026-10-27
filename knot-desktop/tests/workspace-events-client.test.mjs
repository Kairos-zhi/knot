import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createProtocolHandler } from '../packages/dsh-plugin/src/index.mjs';
import { createWorkstationClient, deferred, response } from './helpers/workstation-client-fixture.mjs';

function workspace() {
  return { revision: 1, seq: 4, assets: [], titles: { one: 'Known site' }, workspace: {
    activeWorksiteId: 'one', worksites: [{ id: 'one', draft: 'saved', checkedIds: [], excludedIds: [] }], presentations: [],
  } };
}
const field = client => client.node(node => node.props['aria-label'] === '现场草稿');
const edit = (client, value) => field(client).props.onChange({ target: { value } });
const save = client => client.button('保存草稿').props.onClick();
const refresh = client => client.button('刷新').props.onClick();
const activeStreams = client => client.eventStreams.filter(stream => !stream.closed);

test('one same-origin stream starts at the accepted sequence and a higher event only asks for manual reconciliation', async t => {
  const client = await createWorkstationClient(workspace()); t.after(client.unmount);
  assert.equal(activeStreams(client).length, 1);
  const stream = activeStreams(client)[0], url = new URL(stream.url);
  assert.equal(url.origin, 'http://127.0.0.1:9000'); assert.equal(url.pathname, '/kont/events');
  assert.equal(url.searchParams.get('since'), '4'); assert.equal(stream.options.withCredentials, true);
  edit(client, 'local draft'); const before = client.requests.length;
  stream.notify('message', { seq: 4, content: 'PRIVATE_EVENT_BODY' }, '4');
  stream.notify('message', { seq: 3, content: 'PRIVATE_EVENT_BODY' }, '3');
  assert.equal(client.button('保存草稿').props.disabled, false);
  stream.notify('message', { seq: 5, type: 'unknown-type', content: 'PRIVATE_EVENT_BODY' }, '5');
  assert.equal(stream.closed, true); assert.equal(activeStreams(client).length, 0);
  assert.match(JSON.stringify(client.render()), /现场有新变化，请刷新核对/);
  assert.doesNotMatch(JSON.stringify(client.render()), /PRIVATE_EVENT_BODY|unknown-type/);
  assert.equal(field(client).props.value, 'local draft');
  await save(client); assert.equal(client.requests.length, before, 'notification cannot fetch, save or replay');
});

test('reset at equal sequence accepts an inherited prior frame id and stale callbacks cannot overwrite recovery', async t => {
  const data = workspace();
  const client = await createWorkstationClient(data); t.after(client.unmount);
  const old = activeStreams(client)[0], count = client.requests.length;
  old.notify('reset', { seq: 4, snapshotRequired: true, body: 'PRIVATE_RESET' }, '3');
  assert.match(JSON.stringify(client.render()), /现场有新变化/);
  assert.equal(client.requests.length, count);
  data.seq = 8; await refresh(client);
  assert.equal(activeStreams(client).length, 1); assert.equal(new URL(activeStreams(client)[0].url).searchParams.get('since'), '8');
  old.notify('message', { seq: 99 }, '99'); old.notify('error', 'PRIVATE_OLD_ERROR');
  assert.doesNotMatch(JSON.stringify(client.render()), /现场有新变化|监听中断|PRIVATE_/);
});

test('malformed frames or disconnection close immediately with a fixed error and no native reconnect', async t => {
  for (const [type, value, id] of [['message', '{broken', ''], ['message', { seq: -1 }, '-1'],
    ['message', { seq: 4.5 }, '4.5'], ['message', { seq: 5 }, '6'], ['reset', { seq: 4 }, ''], ['error', 'PRIVATE_ERROR', '']]) {
    const client = await createWorkstationClient(workspace()); t.after(client.unmount);
    const stream = activeStreams(client)[0], requests = client.requests.length;
    stream.notify(type, value, id);
    assert.equal(stream.closed, true); assert.equal(client.eventStreams.length, 1);
    assert.match(JSON.stringify(client.render()), /现场变化监听中断，请刷新核对/);
    assert.doesNotMatch(JSON.stringify(client.render()), /PRIVATE_|broken/);
    await save(client); assert.equal(client.requests.length, requests);
  }
});

test('missing or throwing EventSource is an explicit recovery barrier instead of silently claiming a live snapshot', async t => {
  for (const EventSource of [undefined, class { constructor() { throw new Error('PRIVATE_CONSTRUCTOR'); } }]) {
    const client = await createWorkstationClient(workspace(), () => undefined, { EventSource }); t.after(client.unmount);
    assert.match(JSON.stringify(client.render()), /现场变化监听中断/);
    assert.doesNotMatch(JSON.stringify(client.render()), /PRIVATE_CONSTRUCTOR/);
    assert.equal(client.button('保存草稿').props.disabled, true);
    assert.equal(client.button('刷新').props.disabled, false);
    await save(client); assert.equal(client.requests.filter(request => request.options.method === 'POST').length, 0);
  }
});

test('local write closes the old stream and resubscribes at its acknowledged sequence without mistaking its own echo', async t => {
  const data = workspace(), gate = deferred();
  const client = await createWorkstationClient(data, request => request.options.method === 'POST' ? gate.promise : undefined);
  t.after(client.unmount);
  const old = activeStreams(client)[0]; edit(client, 'captured'); const saving = save(client);
  assert.equal(old.closed, true); assert.equal(activeStreams(client).length, 0);
  old.notify('message', { seq: 5, source: 'human', private: 'PRIVATE_OWN_ECHO' }, '5');
  data.revision++; data.seq++; data.workspace.worksites[0].draft = 'captured';
  gate.resolve(response(structuredClone(data))); await saving;
  assert.equal(activeStreams(client).length, 1);
  assert.equal(new URL(activeStreams(client)[0].url).searchParams.get('since'), '5');
  assert.match(JSON.stringify(client.render()), /已保存 · 2/);
  assert.doesNotMatch(JSON.stringify(client.render()), /现场有新变化|PRIVATE_OWN_ECHO/);
  activeStreams(client)[0].notify('message', { seq: 6 }, '6');
  assert.match(JSON.stringify(client.render()), /现场有新变化/, 'a later backlog event still requires manual reconciliation');
});

test('manual refresh failure stays closed; accepted refresh restores one stream and never replays writes', async t => {
  const data = workspace(); let failRead = false;
  const client = await createWorkstationClient(data, request => {
    if (request.path === '/kont/api/workspace' && failRead) throw new Error('PRIVATE_READ_FAILURE');
  });
  t.after(client.unmount);
  edit(client, 'retained'); activeStreams(client)[0].notify('error', 'PRIVATE_DISCONNECT');
  failRead = true; await refresh(client); assert.equal(activeStreams(client).length, 0);
  await save(client); assert.equal(client.requests.filter(request => request.options.method === 'POST').length, 0);
  failRead = false; data.seq = 7; await refresh(client);
  assert.equal(activeStreams(client).length, 1); assert.equal(field(client).props.value, 'retained');
  assert.equal(new URL(activeStreams(client)[0].url).searchParams.get('since'), '7');
  assert.equal(client.requests.filter(request => request.options.method === 'POST').length, 0);
});

test('component/plugin cleanup and pending responses cannot reopen streams; true remount restarts from known seq', async t => {
  for (const operation of ['component', 'plugin', 'pending-refresh', 'pending-save']) {
    const data = workspace(), gate = deferred(); let pending = false;
    const client = await createWorkstationClient(data, request => {
      if (pending && request.path === '/kont/api/workspace') return gate.promise;
    });
    if (operation !== 'plugin') t.after(client.unmount);
    const stream = activeStreams(client)[0];
    let action;
    if (operation === 'pending-refresh') { pending = true; action = refresh(client); }
    if (operation === 'pending-save') { edit(client, 'captured'); pending = true; action = save(client); data.workspace.worksites[0].draft = 'captured'; }
    if (operation === 'plugin') client.unmount(); else client.unmountComponent();
    assert.equal(stream.closed, true);
    if (action) { gate.resolve(response(structuredClone(data))); await action; }
    stream.notify('message', { seq: 99 }, '99'); stream.notify('reset', { seq: 99, snapshotRequired: true }); stream.notify('error', 'PRIVATE_LATE');
    assert.equal(activeStreams(client).length, 0, operation);
    if (operation === 'component' || operation === 'pending-refresh') {
      await client.remountComponent();
      assert.equal(activeStreams(client).length, 1, operation);
      assert.equal(new URL(activeStreams(client)[0].url).searchParams.get('since'), String(data.seq));
    }
  }
});

test('notification invalidates an already visible supply preview without a new business request', async t => {
  const data = workspace();
  const client = await createWorkstationClient(data, request => request.path.endsWith('/preview')
    ? response({ ok: true, seq: 4, preview: { worksiteId: 'one', draft: 'saved', materials: [] } }) : undefined);
  t.after(client.unmount);
  await client.button('查看本轮供给').props.onClick();
  assert.ok(client.node(node => node.props['aria-label'] === '本轮供给预览'));
  const before = client.requests.length; activeStreams(client)[0].notify('message', { seq: 5 }, '5');
  assert.equal(client.node(node => node.props['aria-label'] === '本轮供给预览'), null);
  assert.equal(client.requests.length, before);
});

test('notification aborts pending preview, and remount with an unresolved workspace error cannot reopen a stream', async t => {
  const data = workspace(), gate = deferred();
  const client = await createWorkstationClient(data, request => request.path.endsWith('/preview') ? gate.promise : undefined);
  t.after(client.unmount);
  const reading = client.button('查看本轮供给').props.onClick();
  const request = client.requests.find(request => request.path.endsWith('/preview'));
  activeStreams(client)[0].notify('message', { seq: 5 }, '5');
  assert.equal(request.options.signal.aborted, true);
  gate.resolve(response({ ok: true, seq: 4, preview: { worksiteId: 'one', draft: 'saved', materials: [] } })); await reading;
  assert.equal(client.node(node => node.props['aria-label'] === '本轮供给预览'), null);
  const before = client.requests.length;
  await client.remountComponent();
  assert.equal(activeStreams(client).length, 0);
  assert.equal(client.requests.length, before);
  data.seq = 5; await refresh(client);
  assert.equal(activeStreams(client).length, 1);
});

test('isolated real HTTP SSE confirms authenticated replay, reset framing, cursor refusal and disconnect release', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kont-workspace-events-')), file = join(dir, 'state.json');
  let store = await new KontStore(file).init();
  await store.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'cold-start synthetic' });
  await store.close(); store = await new KontStore(file).init();
  await store.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'backlog synthetic' });
  let subscriptions = 0;
  const subscribe = store.subscribe.bind(store);
  store.subscribe = listener => { subscriptions++; const dispose = subscribe(listener); return () => { subscriptions--; dispose(); }; };
  const handler = createProtocolHandler(store, { requestRejection: req => req.headers['x-synthetic-browser'] === 'yes' ? undefined : 401 });
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    handler.dispose(); server.closeAllConnections(); await new Promise(done => server.close(done)); await store.close();
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-workspace-events-'));
    await rm(target, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`, headers = { 'x-synthetic-browser': 'yes' };
  assert.equal((await fetch(`${base}/kont/events?since=1`)).status, 401);
  assert.equal((await fetch(`${base}/kont/events?since=3`, { headers })).status, 400);
  async function frame(since) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const result = await fetch(`${base}/kont/events?since=${since}`, { headers, signal: controller.signal });
      assert.match(result.headers.get('content-type'), /text\/event-stream/);
      const reader = result.body.getReader(); let text = '';
      while (!text.includes('data: ')) text += new TextDecoder().decode((await reader.read()).value);
      await reader.cancel(); controller.abort(); return text;
    } finally { clearTimeout(timer); }
  }
  const replay = await frame(1);
  assert.match(replay, /id: 2\ndata: /); assert.match(replay, /"seq":2/);
  const reset = await frame(0);
  assert.match(reset, /event: reset\ndata: {"seq":2,"snapshotRequired":true}/);
  assert.doesNotMatch(reset, /id: /);
  for (let n = 0; subscriptions && n < 30; n++) await new Promise(done => setTimeout(done, 5));
  assert.equal(subscriptions, 0);
});
