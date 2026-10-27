import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { projectRun, listRuns, getRun } from '../packages/dsh-plugin/src/run-query.mjs';
import { createProtocolHandler } from '../packages/dsh-plugin/src/index.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';

// SYNTHETIC stored Runs only. No Agent, Provider, model or user Session.
const token = 'synthetic-run-query-token-not-a-real-secret';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-run-query-'));
  const file = join(dir, 'state.json');
  const { store, run } = await prepareSyntheticReadRun(file);
  const handler = createProtocolHandler(store, { requestRejection: req => req.headers['x-browser-test'] === 'yes' ? undefined : 401 }, { agentToken: token });
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { handler.dispose(); server.closeAllConnections(); await new Promise(r => server.close(r)); await store.close(); await rm(dir, { recursive: true, force: true }); });
  const port = server.address().port;
  return { store, run, file, handler, url: `http://127.0.0.1:${port}`, port, headers: { authorization: `Bearer ${token}` } };
}

test('Run projection distinguishes preparation, submission, uncertainty and evidence-backed output without private fields', async t => {
  const { store, run } = await fixture(t);
  const expected = { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId,
    targetId: run.targetId, worksiteId: run.input.worksiteId, phase: 'prepared', hasOutput: false, blockId: null };
  assert.deepEqual(projectRun(run), expected);
  const constraints = { provider: 'synthetic', model: 'never-called', maxTokens: 64, requestSha256: 'a'.repeat(64) };
  const { run: reserved } = await store.claimRunDispatch(run.runId, constraints);
  for (const [state, phase] of [['reserved', 'uncertain'], ['uncertain', 'uncertain'], ['submitted', 'submitted']]) {
    const value = structuredClone(reserved); value.dispatchClaim.state = state;
    assert.deepEqual(projectRun(value), { ...expected, phase });
  }
  const completed = structuredClone(reserved);
  completed.status = 'completed'; completed.receipt = { sessionId: run.plannedSessionId, turn: 1, startSeq: 0,
    promptSeq: 1, endSeq: 3, logSha256: 'b'.repeat(64), outputSha256: 'c'.repeat(64), blockId: 'b_generated', evidenceKind: 'synthetic-test' };
  assert.deepEqual(projectRun(completed), { ...expected, phase: 'completed', hasOutput: true, blockId: 'b_generated' });
  assert.deepEqual(listRuns({ seq: 9 }), { ok: true, seq: 9, runs: [] });
  assert.throws(() => getRun({ seq: 9 }, run.runId), { code: 'NOT_FOUND', status: 404 });
  assert.equal(JSON.stringify(projectRun(reserved)).includes('synthetic audit prompt'), false);
  assert.equal(Object.hasOwn(projectRun(reserved), 'dispatchClaim'), false);
});

test('authenticated list/detail queries share one sequence snapshot and do not write bytes or emit events', async t => {
  const f = await fixture(t), before = await readFile(f.file), seq = f.store.read().seq;
  let events = 0; f.store.subscribe(() => events++);
  const list = await fetch(`${f.url}/kont/runs`, { headers: f.headers });
  assert.equal(list.status, 200); assert.equal(list.headers.get('cache-control'), 'no-store');
  const body = await list.json();
  assert.deepEqual(body, { ok: true, seq, runs: [projectRun(f.run)] });
  const detail = await fetch(`${f.url}/kont/runs/${encodeURIComponent(f.run.runId)}`, { headers: { 'x-browser-test': 'yes' } });
  assert.deepEqual(await detail.json(), { ok: true, seq, run: body.runs[0] });
  // A single encoded identity may contain characters that are path separators
  // only before encoding. Never decode twice or interpret it as another route.
  const read = f.store.read.bind(f.store), encodedState = read();
  encodedState.runs[0].runId = 'run / % synthetic 中文';
  f.store.read = () => structuredClone(encodedState);
  try {
    const encoded = await fetch(`${f.url}/kont/runs/${encodeURIComponent(encodedState.runs[0].runId)}`, { headers: f.headers });
    assert.equal(encoded.status, 200);
    assert.deepEqual((await encoded.json()).run, projectRun(encodedState.runs[0]));
  } finally { f.store.read = read; }
  for (const path of ['/kont/runs/missing', '/kont/runs/', '/kont/runs/missing/extra'])
    assert.equal((await fetch(`${f.url}${path}`, { headers: f.headers })).status, 404);
  const bad = await fetch(`${f.url}/kont/runs/%ZZ`, { headers: f.headers });
  assert.equal(bad.status, 400); assert.equal((await bad.json()).error.code, 'INVALID_RUN_ID');
  assert.deepEqual(await readFile(f.file), before); assert.equal(events, 0);
});

test('Run query routes preserve caller authentication, loopback Host/Origin fence and GET-only methods', async t => {
  const f = await fixture(t);
  for (const path of ['/kont/runs', `/kont/runs/${f.run.runId}`]) {
    assert.equal((await fetch(`${f.url}${path}`)).status, 401);
    assert.equal((await fetch(`${f.url}${path}`, { headers: { authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(`${f.url}${path}`, { headers: { ...f.headers, origin: 'https://evil.test' } })).status, 403);
    const hostile = await new Promise((resolve, reject) => {
      const req = httpRequest(`${f.url}${path}`, { headers: { ...f.headers, host: `evil.test:${f.port}` } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(hostile, 403);
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const response = await fetch(`${f.url}${path}`, { method, headers: f.headers });
      assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET');
    }
    let status;
    await f.handler({ method: 'GET', url: path, headers: { ...f.headers, host: `127.0.0.1:${f.port}` },
      socket: { remoteAddress: '192.0.2.1', localPort: f.port } }, { writeHead(code) { status = code; }, end() {} });
    assert.equal(status, 403);
  }
});
