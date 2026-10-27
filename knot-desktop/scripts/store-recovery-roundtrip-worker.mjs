import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const token = 'synthetic-044-agent-token-never-a-real-credential';
const evidence = (run, prompt) => ({ sessionId: run.plannedSessionId, kind: 'synthetic-test', events: [
  ['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
  ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: prompt }] }],
  ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: 'Synthetic 044 output' }] }, stream: [] }],
  ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
].map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) });

// Fixed child only: receives an internally prepared artifact, never a plugin URL.
process.once('message', async message => {
  if (!['a1', 'b', 'a2', 'a3'].includes(message?.phase) || process.env.KONT_SYNTHETIC_044 !== 'yes') return process.exit(2);
  const phase = message.phase, directory = process.env.KONT_DATA_DIR, file = resolve(directory, 'worksites.json');
  const side = phase === 'b' ? 'b' : 'a';
  const plugin = pathToFileURL(resolve(message.artifactDirectory, side, 'packages/dsh-plugin/') + '/');
  let store, server, protocol;
  const disposers = [], routes = new Map(), result = { phase, failures: [], closed: false, lockReleased: false, syntheticSeed: phase === 'a1' };
  const connection = { requestRejection: req => req.headers['x-kont-synthetic-human'] === 'yes' ? undefined : 401 };
  try {
    assert.equal(process.env.KONT_AGENT_TOKEN, token);
    assert.equal(process.env.KONT_AGENT_SOURCE, 'agent:synthetic-044');
    assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.DSH_HOME, undefined);
    const index = await import(new URL('src/index.mjs', plugin));
    if (side === 'b') {
      await index.apply({ connection,
        effect(effect) { const disposer = effect(); assert.equal(typeof disposer, 'function'); disposers.push(disposer); },
        webServer: { register({ path, kind, handler }) { assert.equal(kind, 'exact'); assert.equal(routes.has(path), false); routes.set(path, handler); return () => routes.delete(path); } },
      });
      assert.deepEqual([...routes.keys()].sort(), ['/kont/api/workspace', '/kont/command', '/kont/events', '/kont/snapshot']);
    } else {
      const { KontStore } = await import(new URL('src/store.mjs', plugin));
      store = await new KontStore(file).init();
      protocol = index.createProtocolHandler(store, connection, { agentToken: token, agentSource: 'agent:synthetic-044' });
      routes.set('/kont/api/workspace', index.createHandler(store, connection));
      for (const path of ['/kont/command', '/kont/events', '/kont/snapshot']) routes.set(path, protocol);
      disposers.push(async () => { protocol.dispose(); await store.close(); });
    }
    result.routes = [...routes.keys()].sort();
    server = createServer((req, res) => { const handler = routes.get(new URL(req.url, 'http://localhost').pathname); if (handler) handler(req, res); else { res.writeHead(404); res.end(); } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, value, agent = false) => {
      const response = await fetch(url + path, { method: value === undefined ? 'GET' : 'POST',
        headers: { ...(agent ? { authorization: `Bearer ${token}` } : { 'x-kont-synthetic-human': 'yes' }), ...(value === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal: AbortSignal.timeout(2000) });
      return { status: response.status, value: await response.json() };
    };
    const get = async () => { const r = await request('/kont/api/workspace'); assert.equal(r.status, 200); return r.value; };
    const command = async value => { const r = await request('/kont/command', value, true); assert.equal(r.status, 200); assert.equal(r.value.ok, true); return r.value.value; };
    const mutate = async commands => { const state = await get(); const r = await request('/kont/api/workspace', { revision: state.revision, commands }); assert.equal(r.status, 200); return r.value; };
    assert.equal((await fetch(url + '/kont/api/workspace')).status, 401);
    assert.equal((await fetch(url + '/kont/snapshot')).status, 401);
    if (phase === 'a1') {
      // Synthetic setup only: the claim/return and extra-title seed are internal
      // fixture operations, never capabilities attributed to the old carrier.
      await command({ type: 'knot.create', id: 'target', data: { title: 'Synthetic named target', summary: 'Synthetic initial', blocks: [{ id: 'b'.repeat(214), source: 'manual', timestamp: '2026-10-27T00:00:00Z', provenance: ['history/'.repeat(40)], content: 'Synthetic material' }] } });
      await command({ type: 'worksite.create', id: 'primary', assetId: 'target', conversationId: 'conversation/'.repeat(20) });
      await mutate([{ type: 'worksite.update', worksiteId: 'primary', agentId: 'a'.repeat(214), draft: 'Synthetic A1' },
        { type: 'worksite.supply', worksiteId: 'primary', assetId: 'target', mode: 'connect' },
        { type: 'folder.create', id: 'folder', title: 'Synthetic folder' }, { type: 'folder.create', id: 'empty', title: 'Synthetic empty folder' },
        { type: 'folder.assign', worksiteId: 'primary', folderId: 'folder' },
        { type: 'presentation.open', id: 'presentation', worksiteId: 'primary', kind: 'card', layout: { x: 1, y: 2, width: 400, height: 300 } }]);
      const full = store.snapshot(); full.titles.primary = 'Synthetic human title'; full.titles.extra = 'Synthetic additional title';
      await store.restoreSnapshot(full);
      const run = await command({ type: 'run.prepare', worksiteId: 'primary', targetId: 'target', requestId: 'synthetic-completed-request', sessionId: 'synthetic-completed-session' });
      await store.claimRunDispatch(run.runId, { provider: 'synthetic', model: 'never-called', maxTokens: 1, requestSha256: 'a'.repeat(64) });
      const { runPromptText } = await import(new URL('src/run.mjs', plugin));
      await store.returnRun(run.runId, evidence(run, runPromptText(run.input)));
      await command({ type: 'run.prepare', worksiteId: 'primary', targetId: 'target', requestId: 'synthetic-prepared-request', sessionId: 'synthetic-prepared-session' });
    } else {
      result.before = await get(); result.beforeDiskSha256 = sha(await readFile(file));
      const stable = await readFile(file), prior = result.before;
      const stale = await request('/kont/api/workspace', { revision: prior.revision - 1, commands: [{ type: 'worksite.update', worksiteId: 'primary', draft: 'Forbidden stale' }] });
      assert.equal(stale.status, 409); assert.deepEqual(await get(), prior); assert.deepEqual(await readFile(file), stable);
      const imported = await request('/kont/command', { type: 'snapshot.restore', runs: [] }, true);
      assert.equal(imported.value.ok, false); assert.deepEqual(await readFile(file), stable);
      result.staleAtomic = true; result.publicRunImportRejected = true;
      if (phase === 'b') {
        assert.equal((await fetch(url + '/kont/runs')).status, 404);
        assert.equal((await fetch(url + '/kont/worksites/primary/preview')).status, 404);
        await mutate([{ type: 'worksite.update', worksiteId: 'primary', draft: 'Synthetic B' }, { type: 'folder.rename', folderId: 'folder', title: 'Synthetic B folder' }, { type: 'presentation.update', presentationId: 'presentation', kind: 'icon' }]);
        await command({ type: 'knot.update', id: 'target', patch: { summary: 'Synthetic B target' } });
      } else if (phase === 'a2') {
        const run = store.read().runs.find(run => run.status === 'prepared');
        const { runPromptText } = await import(new URL('src/run.mjs', plugin));
        await assert.rejects(store.returnRun(run.runId, evidence(run, runPromptText(run.input))), { code: 'RUN_TARGET_CHANGED' });
        assert.deepEqual(await readFile(file), stable); result.targetCasAtomic = true;
        await mutate([{ type: 'worksite.update', worksiteId: 'primary', draft: 'Synthetic A2' }]);
      }
    }
    result.after = await get();
    const snapshot = await request('/kont/snapshot', undefined, true); assert.equal(snapshot.status, 200);
    assert.equal(snapshot.value.snapshot.format, 'kont-store-snapshot/v1'); result.snapshot = snapshot.value.snapshot;
    result.fileSha256 = sha(await readFile(file));
    result.environmentIsolated = true;
  } catch { result.failures.push('STAGE_EXECUTION_FAILED'); }
  finally {
    if (server) { server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose)); }
    for (const disposer of disposers.reverse()) { try { await disposer(); } catch { result.failures.push('STAGE_DISPOSE_FAILED'); } }
    if (!result.failures.includes('STAGE_DISPOSE_FAILED')) result.closed = true;
    try { await lstat(`${file}.lock`); result.failures.push('LOCK_RETAINED'); }
    catch (error) { if (error.code === 'ENOENT') result.lockReleased = true; else result.failures.push('LOCK_CHECK_FAILED'); }
    // Only synthetic state crosses the private IPC channel. The public parent
    // report projects hashes/counters/fixed facts, never these state values.
    process.send?.({ kind: 'complete', ...result }, () => process.disconnect?.());
  }
});
