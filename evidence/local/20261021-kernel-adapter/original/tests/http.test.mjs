import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createHandler } from '../packages/dsh-plugin/src/index.mjs';

test('HTTP requires the host trust fence and authenticated browser before reads or writes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kont-http-'));
  const store = await new KontStore(join(dir, 'state.json')).init();
  // Isolated HTTP seam; actual DSH authentication is separately checked in the running profile.
  const connection = { requestRejection: req => req.headers['x-test-operator'] === 'yes' ? undefined : 401 };
  const server = createServer(createHandler(store, connection));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); await rm(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  const headers = { 'x-test-operator': 'yes' };
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{}' })).status, 415);
  assert.equal((await fetch(url, { method: 'DELETE', headers })).status, 405);
  const jsonHeaders = { ...headers, 'content-type': 'application/json' };
  assert.equal((await fetch(url, { method: 'POST', headers: jsonHeaders, body: '{' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ revision: 0, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: 'real HTTP save' }] }) })).status, 200);
  assert.equal((await (await fetch(url, { headers })).json()).workspace.worksites[0].draft, 'real HTTP save');
  assert.equal((await fetch(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ revision: 0, commands: [] }) })).status, 409);
  assert.equal((await fetch(url, { method: 'POST', headers: jsonHeaders, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
});
