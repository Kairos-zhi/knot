import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { createHandler, createProtocolHandler } from '../packages/dsh-plugin/src/index.mjs';

const token = 'synthetic-folder-token-not-a-real-secret';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'kont-folder-protocol-')), file = join(directory, 'state.json');
  const store = await new KontStore(file).init();
  const connection = { requestRejection: req => req.headers['x-human-test'] === 'yes' ? undefined : 401 };
  const human = createHandler(store, connection);
  const protocol = createProtocolHandler(store, connection, { agentToken: token, agentSource: 'agent:synthetic-folder' });
  const server = createServer((req, res) => req.url === '/kont/api/workspace' ? human(req, res) : protocol(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    protocol.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await store.close(); await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (path, body, headers = {}) => fetch(url + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { store, file, send };
}

test('real HTTP human and Agent folder operations are equivalent and reads export the same owned extension', async t => {
  const human = await fixture(t), agent = await fixture(t);
  const humanEvents = [], agentEvents = [];
  human.store.subscribe(e => humanEvents.push(e)); agent.store.subscribe(e => agentEvents.push(e));
  for (const command of [
    { type: 'folder.create', id: 'a', title: '  First  ' },
    { type: 'folder.create', id: 'b', title: 'Second' },
    { type: 'folder.assign', worksiteId: 'legacy', folderId: 'a' },
    { type: 'folder.rename', folderId: 'a', title: 'Renamed' },
    { type: 'folder.assign', worksiteId: 'legacy', folderId: 'b' },
    { type: 'folder.assign', worksiteId: 'legacy', folderId: null },
  ]) {
    const h = await human.send('/kont/api/workspace', { revision: human.store.read().revision, commands: [command] }, { 'x-human-test': 'yes' });
    const a = await agent.send('/kont/command', { ...command, baseSeq: agent.store.read().seq }, { authorization: `Bearer ${token}` });
    assert.equal(h.status, 200); assert.equal(a.status, 200); assert.equal((await a.json()).ok, true);
    assert.deepEqual(human.store.read(), agent.store.read());
  }
  assert.ok(humanEvents.every(e => e.source === 'human'));
  assert.ok(agentEvents.every(e => e.source === 'agent:synthetic-folder'));
  assert.deepEqual(humanEvents.map(({ source, ts, ...e }) => e), agentEvents.map(({ source, ts, ...e }) => e));
  const bytes = await readFile(agent.file, 'utf8');
  const exported = await agent.send('/kont/snapshot', null, { authorization: `Bearer ${token}` });
  assert.equal(exported.status, 200); assert.equal(exported.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await exported.json()).snapshot.organization, agent.store.read().organization);
  const workspace = await agent.send('/kont/api/workspace', null, { 'x-human-test': 'yes' });
  assert.deepEqual((await workspace.json()).organization, agent.store.read().organization);
  assert.equal(await readFile(agent.file, 'utf8'), bytes);
});

test('folder HTTP keeps authentication, origin and CAS fences without introducing a restore or supply transport', async t => {
  const f = await fixture(t);
  const command = { type: 'folder.create', id: 'a', title: 'A' };
  assert.equal((await f.send('/kont/command', command)).status, 401);
  assert.equal((await f.send('/kont/command', command, { authorization: `Bearer ${token}`, origin: 'https://foreign.test' })).status, 403);
  assert.equal((await f.send('/kont/api/workspace', { revision: 0, commands: [command] })).status, 401);
  assert.deepEqual(f.store.read().organization, { version: 1, folders: [] });
  const accepted = await f.send('/kont/command', { ...command, baseSeq: 0 }, { authorization: `Bearer ${token}` });
  assert.equal(accepted.status, 200);
  const before = f.store.read(), bytes = await readFile(f.file, 'utf8');
  const stale = await f.send('/kont/command', { type: 'folder.rename', folderId: 'a', title: 'Stale', baseSeq: 0 }, { authorization: `Bearer ${token}` });
  assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'STALE_REVISION');
  const invalid = await f.send('/kont/api/workspace', { revision: before.revision, commands: [
    { type: 'folder.assign', worksiteId: 'legacy', folderId: 'a' }, { type: 'folder.rename', folderId: 'a', title: 'No', supply: ['secret'] },
  ] }, { 'x-human-test': 'yes' });
  assert.equal(invalid.status, 400);
  const restore = await f.send('/kont/command', { type: 'snapshot.restore', snapshot: f.store.snapshot() }, { authorization: `Bearer ${token}` });
  assert.equal(restore.status, 400); assert.equal((await restore.json()).error.code, 'UNSUPPORTED_COMMAND');
  assert.deepEqual(f.store.read(), before); assert.equal(await readFile(f.file, 'utf8'), bytes);
});
