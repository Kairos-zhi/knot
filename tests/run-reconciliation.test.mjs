import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { bindRunObserver } from '../packages/dsh-plugin/src/run-observer-binding.mjs';
import { runHash, runPromptText } from '../packages/dsh-plugin/src/run.mjs';
import { createProtocolHandler } from '../packages/dsh-plugin/src/index.mjs';
import { parseReadAuditConfig, resolveReadAudit } from '../packages/dsh-plugin/src/read-audit-config.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const bindingOf = run => ({ runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId, inputSha256: run.inputSha256 });
const Session = { create(_id, events) { return {
  requestHeader: () => events.findLast(e => e.type === 'request/header')?.data.header,
  requestContext: () => events.findLast(e => e.type === 'request/context')?.data,
  deriveMessages: () => events.filter(e => ['user/message', 'system/message', 'developer/message'].includes(e.type)).map(e => e.type === 'user/message' ? e.data : e.data.message),
}; } };
// This generator constructs a supported synthetic log. Nothing is filtered or
// resequenced after persistence/read, and no real Session or model is accessed.
function eventsFor(run, extraContext = false) {
  const route = { provider: 'synthetic-provider', model: 'never-called' };
  const message = (id, role, source, text) => ({ id, role, source, content: [{ type: 'text', text }] });
  const entries = [
    ['sandbox/mode', { mode: 'read-only' }], ['approval/policy', { policy: 'ask' }], ['permission/preset', { preset: 'synthetic' }],
    ['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
    ['system/message', { turn: 1, step: 1, message: message('system', 'system', { kind: 'system-prompt' }, 'Synthetic system') }],
    ...(extraContext ? [['user/message', message('context', 'user', { kind: 'runtime-context' }, 'Synthetic extra context')]] : []),
    ['user/message', message('prompt', 'user', { kind: 'user', rpcId: run.requestId }, runPromptText(run.input))],
    ['request/header', { header: { config: { ...route, maxTokens: 64 } }, reason: 'initial', startsSeries: true }],
    ['request/context', { ...route, contextWindow: 8192, systemPromptUpdate: 'in-history' }],
    ['assistant/message', { turn: 1, step: 1, message: message('assistant', 'assistant', { kind: 'model', ...route }, 'Synthetic reconciliation output'), stream: [] }],
    ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
  ];
  return entries.map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq,
    ...(['user/message', 'system/message', 'developer/message', 'assistant/message'].includes(type) ? { surfaceOp: 'append' } : {}) }));
}
function fingerprint(run, state) {
  const cut = state.events.findIndex(e => e.type === 'assistant/message'), prefix = Session.create(run.plannedSessionId, state.events.slice(0, cut));
  return runHash({ version: 1, binding: bindingOf(run), sessionHeader: state.header, requestHeader: prefix.requestHeader(),
    requestContext: prefix.requestContext(), messages: prefix.deriveMessages(),
    permissionFacts: state.events.slice(0, cut).filter(e => ['sandbox/mode', 'approval/policy', 'permission/preset'].includes(e.type)),
    metadata: state.events.slice(0, cut).filter(e => ['working-directory/change', 'agent-preset/selected', 'model/selection'].includes(e.type)) });
}
async function fixture(t, phase = 'uncertain') {
  const directory = await mkdtemp(join(tmpdir(), 'kont-reconcile-046-')), file = join(directory, 'worksites.json');
  const { store, run } = await prepareSyntheticReadRun(file);
  const calls = { stat: 0, open: 0, read: 0, close: 0, returned: 0 }, state = { readAllowed: true, writeAllowed: true, approval: true,
    events: eventsFor(run), header: { version: 4, id: run.plannedSessionId, createdAt: 1792627200000, isSeeded: false, delegationDepth: 0 } };
  if (phase) {
    const claimed = await store.claimRunDispatch(run.runId, { provider: 'synthetic-provider', model: 'never-called', maxTokens: 64, requestSha256: 'a'.repeat(64) });
    if (phase !== 'reserved') await store.settleRunDispatch(run.runId, claimed.run.dispatchClaim.claimId, phase);
  }
  const originalReturn = store.returnRun.bind(store);
  store.returnRun = (...args) => { calls.returned++; state.beforeReturn?.(); return originalReturn(...args); };
  const persistence = {
    async stat() { calls.stat++; return { formatStatus: 'current', revision: 'synthetic-stable', sizeBytes: 4096, header: state.header }; },
    async open(id, access) { calls.open++; return { id, access, header: state.header, inheritedEventCount: 0,
      async read() { calls.read++; await state.readHook?.(); return { events: state.events }; },
      async close() { calls.close++; await state.closeHook?.(); if (state.closeFails) throw Error('PRIVATE_CLOSE_CAUSE'); },
    }; },
  };
  const ctx = { provide(_name, service) { ctx.service = service; return () => { ctx.removed = true; }; } };
  const config = { hostVersion: '0.2.1-rc.2', Session, persistence,
    authorizeRead: binding => state.readAllowed ? { allowed: true, binding, ...(state.approval === true ? { approvedRequestSha256: fingerprint(run, state) } : state.approval ? { approvedRequestSha256: state.approval } : {}) } : { allowed: false },
    authorizeReconcile: binding => state.writeAllowed ? { allowed: true, binding: state.writeBinding ?? binding } : { allowed: false },
    returnRun() { throw Error('Caller override must not be used'); },
  };
  const owner = bindRunObserver(ctx, store, config);
  t.after(async () => { try { await owner.dispose(); } catch {} await store.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, store, file, run, calls, state, ctx, owner, config, service: ctx.service };
}

test('three occupied phases reconcile supported completion exactly once, preserving frozen input/claim and persistent output', async t => {
  for (const phase of ['reserved', 'submitted', 'uncertain']) {
    const f = await fixture(t, phase), before = f.store.read().runs[0];
    if (phase === 'submitted') await assert.rejects(f.store.settleRunDispatch(before.runId, before.dispatchClaim.claimId, 'uncertain'), { code: 'RUN_DISPATCH_CONFLICT' });
    const result = await f.service.reconcile(f.run.runId);
    assert.notEqual(fingerprint(f.run, f.state), before.dispatchClaim.constraints.requestSha256);
    assert.equal(result.run.phase, 'completed'); assert.equal(result.evidenceRevalidated, true); assert.equal(result.modelRunVerified, false);
    const after = f.store.read().runs[0]; assert.deepEqual(after.input, before.input); assert.deepEqual(after.dispatchClaim, before.dispatchClaim);
    const bytes = await readFile(f.file), io = f.calls.open, returned = f.calls.returned;
    const again = await f.service.reconcile(f.run.runId);
    assert.equal(again.evidenceRevalidated, false); assert.equal(f.calls.open, io); assert.equal(f.calls.returned, returned);
    assert.deepEqual(await readFile(f.file), bytes);
    assert.equal(f.store.read().assets.find(a => a.id === f.run.targetId).blocks.filter(block => block.source === 'generated').length, 1);
    assert.equal(f.calls.close, 1); assert.equal(JSON.stringify(result).includes('Synthetic reconciliation output'), false);
    await f.owner.dispose(); await f.store.close();
    const reopened = await new KontStore(f.file).init(), next = bindRunObserver({ provide() { return () => {}; } }, reopened, f.config);
    try {
      const count = f.calls.open; const stored = await next.reconcile(f.run.runId);
      assert.equal(stored.evidenceRevalidated, false); assert.equal(stored.run.phase, 'completed'); assert.equal(f.calls.open, count);
      assert.deepEqual(await readFile(f.file), bytes);
    } finally { await next.dispose(); await reopened.close(); }
  }
});

test('read permission does not imply write permission; observe stays read-only and fingerprint/route/no-claim failures do not write', async t => {
  const f = await fixture(t); const bytes = await readFile(f.file);
  const observation = await f.service.observe(f.run.runId); assert.equal(observation.requestFingerprintApproved, true);
  assert.equal(f.calls.returned, 0); assert.deepEqual(await readFile(f.file), bytes);
  for (const change of [() => { f.state.writeAllowed = false; }, () => { f.state.writeAllowed = true; f.state.readAllowed = false; },
    () => { f.state.readAllowed = true; f.state.writeBinding = { ...bindingOf(f.run), sessionId: 'other' }; }]) {
    change(); const opens = f.calls.open; await assert.rejects(f.service.reconcile(f.run.runId)); assert.equal(f.calls.open, opens);
  }
  f.state.writeBinding = undefined;
  for (const options of [{ events: [] }, { sessionId: 'other' }, { force: true }, null]) {
    const opens = f.calls.open; await assert.rejects(f.service.reconcile(f.run.runId, options), { code: 'DSH_RECONCILE_CONFIG' }); assert.equal(f.calls.open, opens);
  }
  for (const approval of [false, 'b'.repeat(64)]) { f.state.approval = approval; await assert.rejects(f.service.reconcile(f.run.runId), { code: 'DSH_RECONCILE_REQUEST_APPROVAL_REQUIRED' }); }
  f.state.approval = true; f.state.events.find(event => event.type === 'request/header').data.header.config.maxTokens = 65;
  await assert.rejects(f.service.reconcile(f.run.runId), { code: 'DSH_RECONCILE_ROUTE_MISMATCH' });
  assert.equal(f.calls.returned, 0); assert.deepEqual(await readFile(f.file), bytes);
  const none = await fixture(t, null); await assert.rejects(none.service.reconcile(none.run.runId), { code: 'DSH_RECONCILE_NOT_CLAIMED' }); assert.equal(none.calls.open, 0);
});

test('unfinished submitted and unsupported extra context preserve the original claim phase without filtering the evidence', async t => {
  const f = await fixture(t, 'submitted'), before = f.store.read(), bytes = await readFile(f.file);
  f.state.events.at(-1).data.reason.kind = 'aborted';
  await assert.rejects(f.service.reconcile(f.run.runId), { code: 'DSH_NOT_COMPLETED' }); assert.equal(f.calls.returned, 0);
  f.state.events = eventsFor(f.run, true);
  assert.equal((await f.service.observe(f.run.runId)).requestFingerprintApproved, true);
  await assert.rejects(f.service.reconcile(f.run.runId), { code: 'RUN_NOT_COMPLETED' });
  assert.deepEqual(f.store.read(), before); assert.deepEqual(await readFile(f.file), bytes);
  assert.equal(f.store.read().runs[0].dispatchClaim.state, 'submitted'); await f.owner.dispose();
});

test('close-stage and writer-queue same-claim transitions remain eligible; concurrent returns create one product', async t => {
  for (const queued of [false, true]) {
    const f = await fixture(t, 'reserved'); let settled;
    const advance = () => { settled ??= f.store.settleRunDispatch(f.run.runId, f.store.read().runs[0].dispatchClaim.claimId, 'submitted'); };
    if (queued) f.state.beforeReturn = advance; else f.state.closeHook = async () => { advance(); await settled; };
    await f.service.reconcile(f.run.runId); await settled;
    assert.equal(f.store.read().runs[0].dispatchClaim.state, 'submitted'); assert.equal(f.store.read().runs[0].status, 'completed');
  }
  const concurrent = await fixture(t);
  await Promise.all([concurrent.service.reconcile(concurrent.run.runId), concurrent.service.reconcile(concurrent.run.runId)]);
  assert.equal(concurrent.store.read().assets.find(a => a.id === concurrent.run.targetId).blocks.filter(block => block.source === 'generated').length, 1);
});

test('target CAS and changed binding reject atomically; no caller config can replace same-owner returnRun', async t => {
  const f = await fixture(t);
  await f.store.command({ type: 'knot.update', id: f.run.targetId, patch: { summary: 'Changed target' } });
  const before = f.store.read(), bytes = await readFile(f.file);
  await assert.rejects(f.service.reconcile(f.run.runId), { code: 'RUN_TARGET_CHANGED' });
  assert.deepEqual(f.store.read(), before); assert.deepEqual(await readFile(f.file), bytes);
  const other = await fixture(t), originalRead = other.store.read.bind(other.store);
  other.state.closeHook = () => { other.store.read = () => { const state = originalRead(); state.runs[0].dispatchClaim.claimId = 'changed-claim'; return state; }; };
  await assert.rejects(other.service.reconcile(other.run.runId), { code: 'DSH_RECONCILE_BINDING_CHANGED' }); assert.equal(other.calls.returned, 0);
});

test('abort during read/close and disposal drain prevent return; real close failure remains sticky', async t => {
  for (const stage of ['before', 'read', 'close']) {
    const f = await fixture(t), abort = new AbortController();
    if (stage === 'before') abort.abort(); else f.state[`${stage}Hook`] = () => abort.abort();
    await assert.rejects(f.service.reconcile(f.run.runId, { signal: abort.signal }), { code: 'DSH_READ_CANCELLED' }); assert.equal(f.calls.returned, 0);
  }
  const pending = await fixture(t), entered = deferred(), release = deferred();
  pending.state.readHook = async () => { entered.resolve(); await release.promise; };
  const rejected = assert.rejects(pending.service.reconcile(pending.run.runId), { code: 'DSH_READ_CANCELLED' });
  await entered.promise; const disposed = pending.owner.dispose(); release.resolve(); await rejected; await disposed;
  assert.equal(pending.calls.returned, 0); await assert.rejects(pending.service.reconcile(pending.run.runId), { code: 'DSH_OBSERVER_CLOSED' });
  const failed = await fixture(t); failed.state.closeFails = true;
  await assert.rejects(failed.service.reconcile(failed.run.runId), { code: 'DSH_CLOSE_FAILED' }); assert.equal(failed.calls.returned, 0);
  const first = failed.owner.dispose(); assert.equal(failed.owner.dispose(), first); await assert.rejects(first, { code: 'DSH_OBSERVER_DISPOSE_FAILED' }); assert.equal(failed.calls.close, 1);
});

test('writer-stage cancellation can invoke returnRun once but commits nothing', async t => {
  const f = await fixture(t), abort = new AbortController(), bytes = await readFile(f.file), before = f.store.read();
  f.state.beforeReturn = () => queueMicrotask(() => abort.abort());
  await assert.rejects(f.service.reconcile(f.run.runId, { signal: abort.signal }), error => error.name === 'AbortError');
  assert.equal(f.calls.returned, 1); assert.deepEqual(f.store.read(), before); assert.deepEqual(await readFile(f.file), bytes);
});

test('HTTP human/Agent use the same explicit action; default deny, auth/body gates and ordinary body completion behave correctly', async t => {
  const f = await fixture(t), token = 'synthetic-reconciliation-agent-token';
  const protocol = createProtocolHandler(f.store, { requestRejection: req => req.headers['x-human'] === 'yes' ? undefined : 401 }, { agentToken: token, reconcileRun: f.owner.reconcile });
  const server = createServer(protocol); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { protocol.dispose(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const url = `http://127.0.0.1:${server.address().port}/kont/runs/${f.run.runId}/reconcile`;
  const post = (headers, body = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ authorization: `Bearer ${token}`, origin: 'https://evil.test' })).status, 403);
  assert.equal((await post({ 'x-human': 'yes' }, { events: [] })).status, 400); assert.equal(f.calls.open, 0);
  const human = await post({ 'x-human': 'yes' }); assert.equal(human.status, 200); assert.equal((await human.json()).run.phase, 'completed');
  const count = f.calls.open, agent = await post({ authorization: `Bearer ${token}` }); assert.equal(agent.status, 200);
  assert.equal((await agent.json()).evidenceRevalidated, false); assert.equal(f.calls.open, count);
  assert.equal((await fetch(url, { headers: { 'x-human': 'yes' } })).status, 405);
  const disabled = createProtocolHandler(f.store, { requestRejection: () => undefined });
  let status; await disabled({ method: 'POST', url: new URL(url).pathname, headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); } }, { writeHead(code) { status = code; }, end() {} });
  assert.equal(status, 403);
});

test('separate JSON write grants remain default-empty, exact and detached from readonly grants', async t => {
  const f = await fixture(t), grant = bindingOf(f.run);
  assert.deepEqual(parseReadAuditConfig(), { enabled: false, grants: [] });
  for (const reconcileGrants of [null, [{}], [{ ...grant, sessionId: '../escape' }], [{ ...grant, approvedRequestSha256: 'a'.repeat(64) }], [grant, grant]])
    assert.throws(() => parseReadAuditConfig({ readAudit: { enabled: true, reconcileGrants } }));
  const packages = {};
  for (const name of ['dsh-app-boot', 'dsh-session']) {
    const owned = join(f.file + '.packages', name); await mkdir(owned, { recursive: true });
    const manifest = { name: `@deepseek-ai/${name}`, version: '0.2.1-rc.2', main: 'index.cjs' };
    await writeFile(join(owned, 'package.json'), JSON.stringify(manifest));
    if (name === 'dsh-session') await writeFile(join(owned, 'index.cjs'), 'module.exports={Session:{create(){}}};');
    packages[manifest.name] = { ...manifest, dir: owned, manifestPath: join(owned, 'package.json') };
  }
  const ctx = { get: name => name === 'pluginPackages' ? { packageOf: key => packages[key] } : { open() {}, stat() {} } };
  const raw = { readAudit: { enabled: true, grants: [grant], reconcileGrants: [grant] } }, audit = parseReadAuditConfig(raw);
  raw.readAudit.reconcileGrants[0] = { ...grant, sessionId: 'other' };
  const host = await resolveReadAudit(ctx, audit);
  assert.equal(host.authorizeReconcile(grant).allowed, true);
  assert.equal(host.authorizeReconcile({ ...grant, inputSha256: 'b'.repeat(64) }).allowed, false);
  const readOnly = await resolveReadAudit(ctx, parseReadAuditConfig({ readAudit: { enabled: true, grants: [grant] } }));
  assert.equal(readOnly.authorizeReconcile(grant).allowed, false);
});

test('HTTP disconnect aborts the in-flight read without mistaking normal body completion for cancellation', async t => {
  const f = await fixture(t), entered = deferred(), release = deferred(), disconnected = deferred();
  f.state.readHook = async () => { entered.resolve(); await release.promise; };
  const protocol = createProtocolHandler(f.store, { requestRejection: () => undefined }, { reconcileRun: f.owner.reconcile });
  const server = createServer((req, res) => { res.on('close', () => disconnected.resolve()); protocol(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { protocol.dispose(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const abort = new AbortController();
  const rejected = assert.rejects(fetch(`http://127.0.0.1:${server.address().port}/kont/runs/${f.run.runId}/reconcile`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: abort.signal,
  }), error => error.name === 'AbortError');
  await entered.promise; abort.abort(); await rejected; await disconnected.promise; release.resolve(); await f.owner.dispose();
  assert.equal(f.calls.returned, 0); assert.equal(f.calls.close, 1);
});

test('actual enabled apply uses both exact grant lists and returns through the same persisted Store owner', async t => {
  const f = await fixture(t, 'submitted'), before = f.store.read().runs[0], packages = {};
  for (const name of ['dsh-app-boot', 'dsh-session']) {
    const owned = join(f.directory, 'packages', name); await mkdir(owned, { recursive: true });
    const manifest = { name: `@deepseek-ai/${name}`, version: '0.2.1-rc.2', main: 'index.cjs' };
    await writeFile(join(owned, 'package.json'), JSON.stringify(manifest));
    if (name === 'dsh-session') await writeFile(join(owned, 'index.cjs'), `module.exports={Session:{${Session.create.toString()}}};`);
    packages[manifest.name] = { ...manifest, dir: owned, manifestPath: join(owned, 'package.json') };
  }
  await f.owner.dispose(); await f.store.close();
  const binding = bindingOf(f.run), config = { readAudit: { enabled: true, grants: [{ ...binding, approvedRequestSha256: fingerprint(f.run, f.state) }], reconcileGrants: [binding] } };
  const code = `import{createServer}from'node:http';import{once}from'node:events';import{apply}from${JSON.stringify(new URL('../packages/dsh-plugin/src/index.mjs', import.meta.url).href)};
    const events=${JSON.stringify(f.state.events)},header=${JSON.stringify(f.state.header)},packages=${JSON.stringify(packages)},routes=[],disposers=[];let closed=0;
    const persistence={async stat(){return{formatStatus:'current',revision:'synthetic',sizeBytes:4096,header};},async open(id,access){return{id,access,header,inheritedEventCount:0,async read(){return{events};},async close(){closed++;}};}};
    const ctx={get:name=>name==='pluginPackages'?{packageOf:key=>packages[key]}:persistence,
      connection:{requestRejection:r=>r.headers['x-human']==='yes'?undefined:401},
      provide(){return()=>{};},effect(fn){disposers.push(fn());},inject(_names,fn){const p=Promise.resolve().then(()=>fn(ctx));return{await:()=>p};},
      webServer:{register(route){routes.push(route);return()=>{};}}};
    await apply(ctx,${JSON.stringify(config)});
    const server=createServer((req,res)=>{const route=routes.find(r=>r.kind==='exact'?req.url===r.path:req.url.startsWith(r.path));if(route)route.handler(req,res);else{res.writeHead(404);res.end();}});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/kont/runs/'+${JSON.stringify(f.run.runId)}+'/reconcile',{method:'POST',headers:{'x-human':'yes','content-type':'application/json'},body:'{}'});
    const body=await response.json();server.closeAllConnections();await new Promise(r=>server.close(r));for(const dispose of disposers.reverse())await dispose();
    console.log(JSON.stringify({status:response.status,phase:body.run?.phase,revalidated:body.evidenceRevalidated,closed}));`;
  const env = { KONT_DATA_DIR: f.directory, KONT_AGENT_TOKEN: 'synthetic-046-apply-token-never-real', KONT_AGENT_SOURCE: 'agent:synthetic-046', TEMP: f.directory, TMP: f.directory };
  for (const name of ['SystemRoot', 'WINDIR']) if (process.env[name]) env[name] = process.env[name];
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, windowsHide: true, encoding: 'utf8', timeout: 10000 }));
  assert.deepEqual(result, { status: 200, phase: 'completed', revalidated: true, closed: 1 });
  const reopened = await new KontStore(f.file).init();
  try { const run = reopened.read().runs[0]; assert.equal(run.status, 'completed'); assert.deepEqual(run.dispatchClaim, before.dispatchClaim); assert.equal(run.inputSha256, before.inputSha256); }
  finally { await reopened.close(); }
});

test('actual apply with default disabled configuration denies HTTP before Run lookup or Session capability use', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'kont-reconcile-apply-046-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const indexUrl = new URL('../packages/dsh-plugin/src/index.mjs', import.meta.url).href;
  const code = `import{createServer}from'node:http';import{once}from'node:events';import{apply}from${JSON.stringify(indexUrl)};
    const routes=[],disposers=[];let services=0;
    const ctx={connection:{requestRejection:r=>r.headers['x-human']==='yes'?undefined:401},
      effect(fn){disposers.push(fn());},provide(){services++;return()=>{services--;};},
      get(){throw Error('Disabled config must not resolve host capabilities');},
      webServer:{register(route){routes.push(route);return()=>{};}}};
    await apply(ctx,{});
    const server=createServer((req,res)=>{const route=routes.find(r=>r.kind==='exact'?req.url===r.path:req.url.startsWith(r.path));if(route)route.handler(req,res);else{res.writeHead(404);res.end();}});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/kont/runs/not-a-run/reconcile',{method:'POST',headers:{'x-human':'yes','content-type':'application/json'},body:'{}'});
    const body=await response.json();server.closeAllConnections();await new Promise(r=>server.close(r));
    for(const dispose of disposers.reverse())await dispose();console.log(JSON.stringify({status:response.status,code:body.error.code,services}));`;
  const env = { KONT_DATA_DIR: directory, KONT_AGENT_TOKEN: 'synthetic-046-apply-token-never-real', KONT_AGENT_SOURCE: 'agent:synthetic-046', TEMP: directory, TMP: directory };
  for (const name of ['SystemRoot', 'WINDIR']) if (process.env[name]) env[name] = process.env[name];
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, windowsHide: true, encoding: 'utf8', timeout: 10000 }));
  assert.deepEqual(result, { status: 403, code: 'DSH_RECONCILE_DENIED', services: 0 });
});
