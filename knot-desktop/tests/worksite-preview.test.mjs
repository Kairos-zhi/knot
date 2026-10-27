import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createWorksitePreview } from '../packages/dsh-plugin/src/worksite-preview.mjs';
import { createProtocolHandler, apply } from '../packages/dsh-plugin/src/index.mjs';

const token = 'synthetic-preview-token-never-a-real-secret';
const worksiteId = '现场 / %2F 中文';
const previewPath = `/kont/worksites/${encodeURIComponent(worksiteId)}/preview`;
const asset = id => ({ id, title: `title ${id}`, summary: `summary ${id}`, src: 'local:test', chain_id: '',
  blocks: [{ id: `block-${id}`, source: 'generated', timestamp: '2026-10-25T00:00:00Z',
    content: `body ${id}`, provenance: ['original-source'], metadata: { version: 2, nested: { retained: true } } }] });

function suppliedState() {
  return { seq: 17, assets: ['first', 'second', 'excluded', 'other', 'suggested'].map(asset), workspace: { worksites: [
    { id: worksiteId, draft: '继续这个问题', checkedIds: ['second', 'excluded', 'first'], excludedIds: ['excluded'], suggestedIds: ['suggested'] },
    { id: 'other-site', draft: 'private draft', checkedIds: ['other'], excludedIds: [] },
  ] } };
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-worksite-preview-'));
  const file = join(dir, 'state.json');
  const store = await new KontStore(file).init();
  await store.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'persisted' });
  const handler = createProtocolHandler(store, { requestRejection: req => req.headers['x-browser-test'] === 'yes' ? undefined : 401 }, { agentToken: token });
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    handler.dispose(); server.closeAllConnections(); await new Promise(done => server.close(done)); await store.close();
    // Only delete the exact fixture directory created above, under the temp root.
    const target = resolve(dir), withinTemp = relative(resolve(tmpdir()), target);
    assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp));
    assert.ok(withinTemp.startsWith('kont-worksite-preview-'));
    await rm(target, { recursive: true, force: true });
  });
  const port = server.address().port;
  return { store, file, handler, port, url: `http://127.0.0.1:${port}`, headers: { authorization: `Bearer ${token}` } };
}

test('preview preserves supply order and full blocks while excluding other, suggested and excluded materials', () => {
  const state = suppliedState(), before = structuredClone(state);
  const preview = createWorksitePreview(state, worksiteId);
  assert.deepEqual(preview, { worksiteId, draft: '继续这个问题', materials: [state.assets[1], state.assets[0]].map(({ id, title, summary, blocks }) => ({ id, title, summary, blocks })) });
  assert.deepEqual(state, before);
  preview.materials[0].blocks[0].metadata.nested.retained = false;
  preview.materials[0].blocks[0].provenance.push('changed');
  preview.materials[0].title = 'changed'; preview.materials.push({ id: 'extra' });
  assert.deepEqual(state, before, 'all returned objects are detached');
  state.assets[0].blocks[0].content = 'changed input';
  assert.equal(preview.materials[1].blocks[0].content, 'body first');
  assert.throws(() => createWorksitePreview(state, 'missing'), { code: 'NOT_FOUND', status: 404 });
  state.workspace.worksites[0].checkedIds.push('missing');
  assert.throws(() => createWorksitePreview(state, worksiteId), { code: 'INVALID_STORE', status: 503 });
});

test('legacy blocks fallback and empty supply keep the existing preview shape', () => {
  const state = suppliedState();
  delete state.assets[0].blocks;
  state.workspace.worksites[0].checkedIds = ['first'];
  const preview = createWorksitePreview(state, worksiteId);
  assert.deepEqual(preview.materials[0].blocks.map(block => block.content), ['title first', 'summary first']);
  assert.ok(preview.materials[0].blocks.every(block => block.source === 'manual' && Array.isArray(block.provenance)));
  state.workspace.worksites[0].checkedIds = [];
  assert.deepEqual(createWorksitePreview(state, worksiteId), { worksiteId, draft: '继续这个问题', materials: [] });
});

test('store preview delegates one read and keeps NOT_FOUND compatibility', async t => {
  const { store } = await fixture(t), state = suppliedState();
  let reads = 0; store.read = () => { reads++; return state; };
  assert.deepEqual(store.preview(worksiteId), createWorksitePreview(state, worksiteId));
  assert.equal(reads, 1);
  assert.throws(() => store.preview('missing'), { code: 'NOT_FOUND', status: 404 });
  assert.equal(reads, 2);
});

test('HTTP preview uses one sequence snapshot, one decoded identity, browser or Agent authentication and no writes/events', async t => {
  const f = await fixture(t), before = await readFile(f.file);
  let events = 0; f.store.subscribe(() => events++);
  const persisted = f.store.read();
  const response = await fetch(`${f.url}/kont/worksites/legacy/preview`, { headers: { 'x-browser-test': 'yes' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true, seq: persisted.seq, preview: f.store.preview('legacy') });
  const state = suppliedState(); let reads = 0;
  f.store.read = () => { reads++; return reads === 1 ? state : { ...state, seq: 999, assets: [] }; };
  const encoded = await fetch(`${f.url}${previewPath}`, { headers: f.headers });
  assert.equal(encoded.status, 200);
  assert.deepEqual(await encoded.json(), { ok: true, seq: 17, preview: createWorksitePreview(state, worksiteId) });
  assert.equal(reads, 1);
  assert.deepEqual(await readFile(f.file), before); assert.equal(events, 0);
});

test('route negatives reject malformed IDs, missing/extra paths and unsupported methods before reading', async t => {
  const f = await fixture(t); let reads = 0;
  f.store.read = () => { reads++; return suppliedState(); };
  for (const path of ['/kont/worksites', '/kont/worksites/', '/kont/worksites//preview', '/kont/worksites/id',
    '/kont/worksites/id/preview/extra', '/kont/worksites/id/extra/preview', '/kont/worksites/id/preview/', '/kont/worksites-other/id/preview']) {
    assert.equal((await fetch(`${f.url}${path}`, { headers: f.headers })).status, 404, path);
  }
  for (const id of ['%ZZ', '%E0%A4', '%FF']) {
    const response = await fetch(`${f.url}/kont/worksites/${id}/preview`, { headers: f.headers });
    assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INVALID_WORKSITE_ID');
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    const response = await fetch(`${f.url}${previewPath}`, { method, headers: f.headers });
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET');
  }
  assert.equal(reads, 0);
  const missing = await fetch(`${f.url}/kont/worksites/missing/preview`, { headers: f.headers });
  assert.equal(missing.status, 404); assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  // A double-encoded slash is an identity containing "%2F", never decoded again.
  const doubleEncoded = await fetch(`${f.url}/kont/worksites/${encodeURIComponent(encodeURIComponent(worksiteId))}/preview`, { headers: f.headers });
  assert.equal(doubleEncoded.status, 404);
});

test('authentication, Host, Origin and remote address are checked before the store is read', async t => {
  const f = await fixture(t); let reads = 0;
  f.store.read = () => { reads++; throw new Error('unauthorized read'); };
  for (const headers of [{}, { authorization: 'Bearer wrong' }, { ...f.headers, origin: 'https://evil.test' }]) {
    const response = await fetch(`${f.url}${previewPath}`, { headers });
    assert.equal(response.status, headers.origin ? 403 : 401);
  }
  const hostile = await new Promise((done, reject) => {
    const req = httpRequest(`${f.url}${previewPath}`, { headers: { ...f.headers, host: `evil.test:${f.port}` } }, res => { res.resume(); done(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostile, 403);
  let status;
  await f.handler({ method: 'GET', url: previewPath, headers: { ...f.headers, host: `127.0.0.1:${f.port}` },
    socket: { remoteAddress: '192.0.2.1', localPort: f.port } }, { writeHead(code) { status = code; }, end() {} });
  assert.equal(status, 403); assert.equal(reads, 0);
});

test('plugin registers only the bounded worksite prefix and releases its isolated store', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kont-worksite-preview-'));
  const previousDirectory = process.env.KONT_DATA_DIR, previousToken = process.env.KONT_AGENT_TOKEN;
  const disposers = [], routes = [];
  process.env.KONT_DATA_DIR = dir; process.env.KONT_AGENT_TOKEN = token;
  try {
    await apply({ connection: { requestRejection: () => 401 },
      webServer: { register(route) { routes.push(route); return () => {}; } },
      effect(effect) { disposers.push(effect()); }, provide() { return () => {}; } });
    assert.deepEqual(routes.filter(route => route.path.startsWith('/kont/worksites')).map(({ kind, path }) => ({ kind, path })),
      [{ kind: 'prefix', path: '/kont/worksites/' }]);
  } finally {
    for (const dispose of disposers.reverse()) await dispose?.();
    if (previousDirectory === undefined) delete process.env.KONT_DATA_DIR; else process.env.KONT_DATA_DIR = previousDirectory;
    if (previousToken === undefined) delete process.env.KONT_AGENT_TOKEN; else process.env.KONT_AGENT_TOKEN = previousToken;
    const target = resolve(dir), withinTemp = relative(resolve(tmpdir()), target);
    assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp) && withinTemp.startsWith('kont-worksite-preview-'));
    await rm(target, { recursive: true, force: true });
  }
});
