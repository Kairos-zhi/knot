import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import http from 'node:http';
import { KontStore } from '../../../../packages/dsh-plugin/src/store.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const evidence = fileURLToPath(new URL('./', import.meta.url));
const temporary = await mkdtemp('D:/Temp/kont-independent-checker-');
const file = join(temporary, 'data', 'worksites.json');
const token = randomBytes(32).toString('base64url');
const report = { candidate: 'KONT-KERNEL-001-r2', scope: 'independent service + real isolated DSH HTTP, no browser or model', checks: [], runtime: temporary, dshVersion: '0.1.7-rc.2', startupLogs: [] };
const record = (check, details = {}) => { report.checks.push({ check, passed: true, ...details }); console.log(`PASS ${check}`); };
const guarded = async (promise, milliseconds, label) => {
  let timeout;
  try { return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(label)), milliseconds); })]); }
  finally { clearTimeout(timeout); }
};
const scrub = value => String(value).replaceAll(token, '[redacted]').replace(/token=[^\s]+/g, 'token=[redacted]');
let active;
const openStreams = [];
async function launch() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)));
  const child = fork(join(root, 'scripts', 'dev.mjs'), [], { env: { ...env, KONT_RUNTIME_DIR: temporary, KONT_PORT: '0', KONT_DEV_IPC: '1', KONT_AGENT_TOKEN: token, KONT_AGENT_SOURCE: 'agent:independent-checker', DSH_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  let output = '', result;
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => { result = { code, signal }; resolve(result); }));
  const handle = { child, exited, async stop() { if (result) return result; child.send({ type: 'kont:stop' }); return guarded(exited, 15000, 'shutdown deadline'); } };
  active = handle;
  await guarded(new Promise((resolve, reject) => {
    child.on('message', message => { if (message?.type === 'kont:ready') resolve(); });
    child.once('error', reject); child.once('exit', () => reject(new Error(`startup failed: ${scrub(output)}`)));
  }), 30000, 'startup deadline');
  const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)\//);
  assert.ok(match, 'official DSH bound an ephemeral loopback port');
  assert.doesNotMatch(output, /opening the default browser/);
  report.startupLogs.push(scrub(output));
  return { ...handle, base: match[1] };
}
async function jsonRequest(base, path, command, extraHeaders = {}, authenticated = true) {
  const response = await fetch(`${base}${path}`, { method: command === undefined ? 'GET' : 'POST', headers: { ...(authenticated ? { authorization: `Bearer ${token}` } : {}), ...(command === undefined ? {} : { 'content-type': 'application/json' }), ...extraHeaders }, ...(command === undefined ? {} : { body: JSON.stringify(command) }) });
  return { status: response.status, body: await response.json() };
}
async function hostileHost(base) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${base}/kont/snapshot`, { headers: { host: 'evil.example', authorization: `Bearer ${token}` } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
    request.once('error', reject);
  });
}
async function stream(base, since) {
  const controller = new AbortController();
  const response = await fetch(`${base}/kont/events?since=${since}`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader(); let data = '';
  const session = { controller, reader, async until(predicate) { for (let i = 0; i < 100 && !predicate(data); i++) { const chunk = await guarded(reader.read(), 5000, 'SSE event deadline'); if (chunk.done) break; data += new TextDecoder().decode(chunk.value); } assert.ok(predicate(data), `SSE expected condition missing: ${data}`); return data; }, async close() { controller.abort(); await reader.cancel().catch(() => {}); } };
  openStreams.push(session); return session;
}
try {
  const manifestPath = join(root, 'evidence/local/20261021-kernel-adapter/candidate-manifest.json');
  const manifestBytes = await readFile(manifestPath); const manifest = JSON.parse(manifestBytes);
  const manifestHash = createHash('sha256').update(manifestBytes).digest('hex').toUpperCase();
  assert.equal(manifestHash, '1113A019F5634A4C7AF64E855F2AA0119959809075C9313474D0BB5136B6643C');
  for (const entry of [...manifest.files, ...manifest.builtFiles]) assert.equal(createHash('sha256').update(await readFile(join(root, entry.path))).digest('hex').toUpperCase(), entry.sha256, entry.path);
  record('27 frozen source/build hashes and manifest identity', { manifestHash });
  const workspace = { activeWorksiteId: 'legacy', worksites: [{ id: 'legacy', assetId: null, conversationId: null, draft: '保存的问题', agentId: null, checkedIds: ['seed-a'], excludedIds: ['seed-b'] }, { id: 'second', assetId: null, conversationId: null, draft: '', agentId: null, checkedIds: ['seed-b'], excludedIds: [] }], presentations: [] };
  const fixture = { schemaVersion: 4, assets: [
    { id: 'seed-a', title: '原材料', summary: '原文', src: 'checker:source', chain_id: 'chain-a', position: { x: 15, y: 22 }, blocks: [{ id: 'b1', source: 'manual', timestamp: '2026-10-21T00:00:00.000Z', provenance: [], content: '原文' }, { id: 'b2', source: 'generated', timestamp: '2026-10-21T00:01:00.000Z', provenance: ['seed-b', 'historic-ref'], content: '生成判断' }] },
    { id: 'seed-b', title: '另一个材料', summary: '二号', src: 'checker:source2', chain_id: 'chain-b', blocks: [{ id: 'b3', source: 'manual', timestamp: '2026-10-21T00:02:00.000Z', provenance: [], content: '二号' }] },
  ], edges: [{ sourceNodeID: 'seed-a', targetNodeID: 'seed-b', sourcePortID: 'out', targetPortID: 'in', data: { fixed: true, meaning: 'preserve-extension' } }], workspace };
  let store = await new KontStore(file).init();
  await store.restoreSnapshot(fixture, 0, 'human:checker');
  assert.deepEqual(store.snapshot(), fixture);
  assert.equal(store.preview('legacy').materials.length, 1);
  assert.equal(store.preview('second').materials[0].id, 'seed-b');
  await store.command({ type: 'worksite.supply', worksiteId: 'legacy', assetId: 'seed-b', mode: 'suggest' }, 'agent:checker');
  assert.deepEqual(store.preview('legacy').materials.map(asset => asset.id), ['seed-a']);
  record('legacy schema-4 import preserves generated multi-block/provenance/position/fixed/extensions and manual exclusion/site isolation');
  const beforeInvalid = await readFile(file, 'utf8');
  await assert.rejects(store.restoreSnapshot({ ...fixture, edges: [{ sourceNodeID: 'seed-a', targetNodeID: 'missing' }] }));
  await assert.rejects(store.mutate({ revision: store.read().revision, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: 'should roll back' }, { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'absent', mode: 'connect' }] }));
  assert.equal(await readFile(file, 'utf8'), beforeInvalid);
  record('invalid snapshot and failing mixed transaction preserve exact persisted bytes');
  await store.close(); store = undefined;
  await assert.rejects(access(`${file}.lock`), { code: 'ENOENT' });
  let running = await launch();
  let current = await jsonRequest(running.base, '/kont/snapshot');
  assert.equal(current.status, 200); assert.equal(current.body.ok, true); assert.deepEqual(current.body.snapshot, fixture);
  const initialSeq = current.body.seq;
  assert.equal((await jsonRequest(running.base, '/kont/snapshot', undefined, {}, false)).status, 401);
  assert.equal((await jsonRequest(running.base, '/kont/snapshot', undefined, { authorization: 'Bearer invalid' }, false)).status, 401);
  assert.equal((await jsonRequest(running.base, '/kont/snapshot', undefined, { origin: 'http://evil.example' })).status, 403);
  assert.equal(await hostileHost(running.base), 403);
  record('real DSH plugin loads persisted schema-4 state; unauthenticated/bad-token/malicious-Origin/Host rejected');
  const feed = await stream(running.base, initialSeq);
  const timestamp = '2026-10-21T01:00:00.000Z';
  const manual = { id: 'manual-1', source: 'manual', timestamp, provenance: [], content: '程序输入' };
  for (const id of ['live-a', 'live-b']) {
    const result = await jsonRequest(running.base, '/kont/command', { type: 'knot.create', id, data: { title: id, summary: '程序输入', src: 'checker:runtime', chain_id: 'live', blocks: [manual] }, source: 'spoofed-source' });
    assert.equal(result.status, 200); assert.equal(result.body.ok, true); assert.equal(result.body.value, id);
  }
  assert.equal((await jsonRequest(running.base, '/kont/command', { type: 'rope.connect', sourceNodeID: 'live-a', targetNodeID: 'live-b', fixed: true, source: 'forged' })).body.ok, true);
  const generated = { id: 'generated-2', source: 'generated', timestamp, provenance: ['seed-a', 'live-b'], content: '追加生成内容' };
  assert.equal((await jsonRequest(running.base, '/kont/command', { type: 'knot.update', id: 'live-a', patch: { blocks: [manual, generated] } })).body.ok, true);
  current = await jsonRequest(running.base, '/kont/snapshot');
  assert.deepEqual(current.body.snapshot.assets.find(asset => asset.id === 'live-a').blocks, [manual, generated]);
  assert.equal(current.body.snapshot.edges.find(edge => edge.sourceNodeID === 'live-a').data.fixed, true);
  const eventsText = await feed.until(data => (data.match(/^data:/gm) || []).length >= 4);
  const events = eventsText.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  assert.deepEqual(events.map(event => event.type), ['knot.created', 'knot.created', 'rope.connected', 'knot.updated']);
  assert.deepEqual(events.map(event => event.seq), [initialSeq + 1, initialSeq + 2, initialSeq + 3, initialSeq + 4]);
  assert.ok(events.every(event => event.source === 'agent:independent-checker'));
  record('browser-free real HTTP create/connect/append uses old command shapes; SSE ordered durable facts with trusted source mapping', { eventTypes: events.map(event => event.type), seqs: events.map(event => event.seq) });
  await feed.close();
  const beforeBadHttp = current.body.seq;
  const stale = await jsonRequest(running.base, '/kont/command', { type: 'knot.update', id: 'live-a', patch: { title: 'must not happen' }, baseSeq: 0 });
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'STALE_REVISION');
  const invalid = await jsonRequest(running.base, '/kont/command', { type: 'knot.update', id: 'live-a', patch: { blocks: [{ id: 'bad', source: 'invalid' }] } });
  assert.equal(invalid.body.ok, false);
  const unsupported = await jsonRequest(running.base, '/kont/command', { type: 'generate.grow', id: 'live-a' });
  assert.equal(unsupported.body.ok, false); assert.equal(unsupported.body.error.code, 'UNSUPPORTED_COMMAND');
  assert.equal((await jsonRequest(running.base, '/kont/snapshot')).body.seq, beforeBadHttp);
  record('real HTTP stale baseSeq/invalid blocks/unimplemented generation reject without new seq or false success');
  const disconnected = await jsonRequest(running.base, '/kont/command', { type: 'rope.disconnect', from: 'live-a', to: 'live-b' });
  assert.equal(disconnected.body.ok, true);
  const saved = (await jsonRequest(running.base, '/kont/snapshot')).body;
  assert.equal(saved.snapshot.edges.some(edge => edge.sourceNodeID === 'live-a'), false);
  assert.deepEqual(saved.snapshot.assets.find(asset => asset.id === 'seed-a'), fixture.assets[0]);
  assert.deepEqual(await running.stop(), { code: 0, signal: null }); active = undefined;
  await assert.rejects(access(`${file}.lock`), { code: 'ENOENT' });
  running = await launch();
  const restored = (await jsonRequest(running.base, '/kont/snapshot')).body;
  assert.equal(restored.seq, saved.seq); assert.deepEqual(restored.snapshot, saved.snapshot);
  const coldFeed = await stream(running.base, 0);
  const resetText = await coldFeed.until(data => data.includes('event: reset'));
  assert.match(resetText, /"snapshotRequired":true/);
  await coldFeed.close();
  assert.deepEqual(await running.stop(), { code: 0, signal: null }); active = undefined;
  await assert.rejects(access(`${file}.lock`), { code: 'ENOENT' });
  record('real DSH normal shutdown releases own lock; immediate same-directory restart preserves snapshot and seq; cold SSE requests snapshot reset', { persistedSeqBeforeStop: saved.seq, restoredSeqAfterRestart: restored.seq, bothShutdowns: { code: 0, signal: null }, lockAbsentAfterBothStops: true });
  for (const entry of [...manifest.files, ...manifest.builtFiles]) assert.equal(createHash('sha256').update(await readFile(join(root, entry.path))).digest('hex').toUpperCase(), entry.sha256, entry.path);
  record('frozen source/build hashes remain unchanged after independent tests');
  report.result = 'PASS_LIMITED_SLICE'; report.untested = ['real model execution', 'full operation command set', 'product UI acceptance', 'hard-kill stale-lock automatic recovery', 'nonloopback deployment', 'long-duration load'];
} catch (error) {
  report.result = 'REJECT'; report.error = { name: error.name, message: scrub(error.message), stack: scrub(error.stack) }; process.exitCode = 1;
  console.error(scrub(error.stack));
} finally {
  for (const stream of openStreams) await stream.close().catch(() => {});
  if (active) { try { await active.stop(); } catch { active.child.kill(); await active.exited; report.emergencyTermination = true; } }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(evidence, 'independent-check-result.json'), JSON.stringify(report, null, 2));
  // Only this script's newly created runtime is removed; all evidence survives.
  await rm(temporary, { recursive: true, force: true });
}
