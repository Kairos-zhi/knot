import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createProtocolHandler, createHandler } from '../packages/dsh-plugin/src/index.mjs';

const token = 'test-only-token-not-a-real-secret-0000000000';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-protocol-'));
  const store = await new KontStore(join(dir, 'state.json')).init();
  const connection = { requestRejection: req => req.headers['x-browser-test'] === 'yes' ? undefined : 401 };
  const handler = createProtocolHandler(store, connection, { agentToken: token, agentSource: 'agent:test-host' });
  const legacy = createHandler(store, connection);
  const server = createServer((req, res) => req.url.startsWith('/kont/api/workspace') ? legacy(req, res) : handler(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { handler.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); await rm(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const command = body => fetch(`${url}/kont/command`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { store, handler, url, headers, command, port: server.address().port };
}

test('open Agent HTTP and browser compatibility use one kernel with the original command and snapshot envelopes', async t => {
  const { store, url, headers, command } = await fixture(t);
  assert.equal((await fetch(`${url}/kont/snapshot`)).status, 401);
  assert.equal((await command({ type: 'knot.create', id: 'A', data: { title: 'native', summary: 'content', src: 'source', chain_id: 'c' }, source: 'forged' })).status, 200);
  const result = await (await fetch(`${url}/kont/snapshot`, { headers })).json();
  assert.equal(result.ok, true); assert.equal(result.seq, 1);
  assert.equal(result.snapshot.schemaVersion, 4); assert.equal(result.snapshot.assets[0].id, 'A');
  const browser = await fetch(`${url}/kont/api/workspace`, { headers: { 'x-browser-test': 'yes' } });
  assert.deepEqual((await browser.json()).assets, result.snapshot.assets);
  const browserSave = await fetch(`${url}/kont/api/workspace`, { method: 'POST', headers: { 'x-browser-test': 'yes', 'content-type': 'application/json' }, body: JSON.stringify({ revision: 1, commands: [{ type: 'worksite.supply', worksiteId: 'legacy', assetId: 'A', mode: 'connect' }] }) });
  assert.equal(browserSave.status, 200);
  assert.equal(store.preview('legacy').materials[0].id, 'A');
  assert.deepEqual(store.eventsSince(0).events.map(event => event.source), ['agent:test-host', 'human']);
  const stale = await command({ type: 'knot.update', id: 'A', patch: { title: 'stale' }, baseSeq: 0 });
  assert.equal(stale.status, 409); assert.equal((await stale.json()).ok, false);
  assert.equal((await (await command({ type: 'generate.grow', id: 'A' })).json()).error.code, 'UNSUPPORTED_COMMAND');
});

test('correct Bearer still rejects malicious Host, Origin and nonloopback peers', async t => {
  const { url, headers, handler, port } = await fixture(t);
  // fetch normalizes Host, so exercise an actual hostile wire header through node:http.
  const hostileHost = await new Promise((resolve, reject) => {
    const request = httpRequest(`${url}/kont/snapshot`, { headers: { ...headers, host: `evil.test:${port}` } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(hostileHost, 403);
  assert.equal((await fetch(`${url}/kont/snapshot`, { headers: { ...headers, origin: 'https://evil.test' } })).status, 403);
  assert.equal((await fetch(`${url}/kont/snapshot`, { headers: { ...headers, authorization: 'Bearer wrong' } })).status, 401);
  let status;
  await handler({ method: 'GET', url: '/kont/snapshot', headers: { ...headers, host: `127.0.0.1:${port}` }, socket: { remoteAddress: '192.0.2.5', localPort: port } }, { writeHead(code) { status = code; }, end() {} });
  assert.equal(status, 403);
});

test('SSE delivers durable ordered events and releases its subscription on disconnect', async t => {
  const { store, url, headers, command } = await fixture(t);
  let subscriptions = 0;
  const subscribe = store.subscribe.bind(store);
  store.subscribe = listener => { subscriptions++; const dispose = subscribe(listener); return () => { subscriptions--; dispose(); }; };
  const abort = new AbortController();
  const response = await fetch(`${url}/kont/events?since=0`, { headers, signal: abort.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  await reader.read(); // Connection marker is flushed before the first operation.
  const incoming = reader.read();
  assert.equal((await command({ type: 'knot.create', id: 'event-node' })).status, 200);
  const frame = new TextDecoder().decode((await incoming).value);
  assert.match(frame, /"type":"knot.created"/); assert.match(frame, /"seq":1/);
  assert.equal(store.snapshot().assets[0].id, 'event-node');
  assert.equal(subscriptions, 1);
  await reader.cancel(); abort.abort();
  for (let i = 0; subscriptions && i < 20; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(subscriptions, 0);
  assert.equal((await fetch(`${url}/kont/events?since=999`, { headers })).status, 400);
});

test('Run extension HTTP can prepare and read, but cannot forge runtime completion', async t => {
  const { store, url, headers, command } = await fixture(t);
  await command({ type: 'knot.create', id: 'target' });
  const prepared = await (await command({ type: 'run.prepare', requestId: 'synthetic-http-request',
    sessionId: 'synthetic-unverified-session', worksiteId: 'legacy', targetId: 'target' })).json();
  assert.equal(prepared.ok, true); assert.equal(prepared.value.status, 'prepared');
  const before = store.read();
  for (const type of ['run.complete', 'run.return', 'run.bind', 'run.cancel']) {
    const result = await command({ type, runId: prepared.value.runId, status: 'completed', evidence: { accepted: true } });
    assert.equal(result.status, 400); assert.equal((await result.json()).error.code, 'UNSUPPORTED_COMMAND');
  }
  const bypass = await fetch(`${url}/kont/api/workspace`, { method: 'POST',
    headers: { 'x-browser-test': 'yes', 'content-type': 'application/json' },
    body: JSON.stringify({ revision: before.revision, commands: [{ type: 'run.return', runId: prepared.value.runId }] }) });
  assert.equal(bypass.status, 400); assert.deepEqual(store.read(), before);
  const snapshot = await (await fetch(`${url}/kont/snapshot`, { headers })).json();
  assert.equal(snapshot.snapshot.runs[0].runId, prepared.value.runId);
  assert.equal(snapshot.snapshot.runs[0].receipt, null);
  assert.equal(store.eventsSince(1).events[0].type, 'run.prepared');
});
