import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { KontStore, KontError } from './store.mjs';
import { bindRunObserver } from './run-observer-binding.mjs';
import { parseReadAuditConfig, resolveReadAudit, readAuditInject } from './read-audit-config.mjs';
import { DshReadError } from './dsh-run-read.mjs';
import { listRuns, getRun } from './run-query.mjs';
import { createWorksitePreview } from './worksite-preview.mjs';
export const name = 'kont-worksite';
export const inject = ['webServer', 'connection'];

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function readJson(req) {
  if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') throw new KontError('JSON_REQUIRED', 'content-type must be application/json', 415);
  let bytes = 0; const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) { req.resume(); throw new KontError('BODY_LIMIT', 'Request body too large', 413); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new KontError('INVALID_JSON', '请求不是有效 JSON'); }
}
/** Agent transports may omit cookies, but never the loopback Host/Origin fence. */
function trustedLocalAgent(req) {
  const host = req.headers.host;
  if (typeof host !== 'string' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  try {
    const authority = new URL(`http://${host}`);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(authority.hostname) || authority.username || authority.password
      || authority.pathname !== '/' || authority.search || authority.hash || Number(authority.port || 80) !== req.socket.localPort) return false;
    return req.headers.origin === undefined || req.headers.origin === authority.origin;
  } catch { return false; }
}
function caller(req, connection, options) {
  if (req.headers.authorization !== undefined) {
    const supplied = req.headers.authorization;
    const expected = options.agentToken ? `Bearer ${options.agentToken}` : '';
    if (!expected || typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return { refusal: 401 };
    if (!trustedLocalAgent(req)) return { refusal: 403 };
    return { source: options.agentSource || 'agent:local' };
  }
  const refusal = connection.requestRejection(req);
  return refusal === undefined ? { source: 'human' } : { refusal };
}

/** Same protocol command types/OpResult envelope, namespaced under /kont to
 * coexist with DSH. This slice supports direct execution, not Bridge queues. */
export function createProtocolHandler(store, connection, options = {}) {
  const streams = new Set();
  const handler = async (req, res) => {
    const protocolError = (status, code, message) => sendJson(res, status, { ok: false, error: { code, message } });
    try {
      const identity = caller(req, connection, options);
      if (identity.refusal !== undefined) { protocolError(identity.refusal, identity.refusal === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', 'Request rejected'); return; }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/kont/worksites/')) {
        if (req.method !== 'GET') {
          res.setHeader('allow', 'GET');
          protocolError(405, 'METHOD_NOT_ALLOWED', 'GET required');
          return;
        }
        // Match the encoded path first: an encoded slash belongs to the ID.
        const match = /^\/kont\/worksites\/([^/]+)\/preview$/.exec(url.pathname);
        if (!match) {
          throw new KontError('NOT_FOUND', 'Unknown KONT route', 404);
        }
        let worksiteId;
        try {
          worksiteId = decodeURIComponent(match[1]);
        } catch {
          throw new KontError('INVALID_WORKSITE_ID', 'Invalid encoded worksite identity');
        }
        // Sequence and supply must describe the same snapshot, even if another
        // client changes the worksite immediately after this read.
        const state = store.read();
        const preview = createWorksitePreview(state, worksiteId);
        sendJson(res, 200, { ok: true, seq: state.seq, preview });
        return;
      }
      if (url.pathname === '/kont/runs' || url.pathname.startsWith('/kont/runs/')) {
        if (req.method !== 'GET') { res.setHeader('allow', 'GET'); protocolError(405, 'METHOD_NOT_ALLOWED', 'GET required'); return; }
        const state = store.read();
        if (url.pathname === '/kont/runs') { sendJson(res, 200, listRuns(state)); return; }
        const encoded = url.pathname.slice('/kont/runs/'.length);
        if (!encoded || encoded.includes('/')) throw new KontError('NOT_FOUND', 'Unknown KONT route', 404);
        let runId;
        try { runId = decodeURIComponent(encoded); }
        catch { throw new KontError('INVALID_RUN_ID', 'Invalid encoded Run identity'); }
        sendJson(res, 200, getRun(state, runId)); return;
      }
      if (url.pathname === '/kont/snapshot') {
        if (req.method !== 'GET') { res.setHeader('allow', 'GET'); protocolError(405, 'METHOD_NOT_ALLOWED', 'GET required'); return; }
        sendJson(res, 200, { ok: true, seq: store.read().seq, snapshot: store.snapshot() }); return;
      }
      if (url.pathname === '/kont/command') {
        if (req.method !== 'POST') { res.setHeader('allow', 'POST'); protocolError(405, 'METHOD_NOT_ALLOWED', 'POST required'); return; }
        const result = await store.command(await readJson(req), identity.source);
        sendJson(res, result.ok ? 200 : result.error.code === 'STALE_REVISION' ? 409 : 400, result); return;
      }
      if (url.pathname === '/kont/events') {
        if (req.method !== 'GET') { res.setHeader('allow', 'GET'); protocolError(405, 'METHOD_NOT_ALLOWED', 'GET required'); return; }
        const raw = url.searchParams.get('since') ?? '0';
        if (!/^\d+$/.test(raw)) throw new KontError('INVALID_CURSOR', '事件游标无效');
        const backlog = store.eventsSince(Number(raw));
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
        const write = event => res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
        res.write(': connected\n\n');
        if (backlog.reset) res.write(`event: reset\ndata: ${JSON.stringify({ seq: backlog.seq, snapshotRequired: true })}\n\n`);
        else backlog.events.forEach(write);
        const unsubscribe = store.subscribe(write);
        const heartbeat = setInterval(() => { res.write(': keepalive\n\n'); }, 15000);
        heartbeat.unref();
        const cleanup = () => { clearInterval(heartbeat); unsubscribe(); streams.delete(res); };
        streams.add(res); res.on('close', cleanup);
        return;
      }
      protocolError(404, 'NOT_FOUND', 'Unknown KONT route');
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      protocolError(error instanceof KontError ? error.status : 500, error instanceof KontError ? error.code : 'STORAGE_ERROR', error instanceof KontError ? error.message : 'Operation failed; prior data preserved');
    }
  };
  handler.dispose = () => { for (const res of streams) res.end(); streams.clear(); };
  return handler;
}
export function createHandler(store, connection) {
  return async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const refusal = connection.requestRejection(req);
      if (refusal !== undefined) { res.writeHead(refusal); res.end(); return; }
      if (req.method === 'GET') { send(200, store.read()); return; }
      if (req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); send(405, { code: 'METHOD_NOT_ALLOWED' }); return; }
      if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') { send(415, { code: 'JSON_REQUIRED' }); return; }
      let bytes = 0; const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { req.resume(); send(413, { code: 'BODY_LIMIT' }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { send(400, { code: 'INVALID_JSON', message: '请求不是有效 JSON' }); return; }
      send(200, await store.mutate(body));
    } catch (error) {
      send(error instanceof KontError ? error.status : 500, { code: error instanceof KontError ? error.code : 'STORAGE_ERROR', message: error instanceof KontError ? error.message : '现场保存失败，原有数据保留' });
    }
  };
}
export async function apply(ctx, config = {}) {
  const audit = parseReadAuditConfig(config);
  if (!process.env.KONT_DATA_DIR) throw new Error('KONT_DATA_DIR must name an isolated data directory');
  const dataDirectory = resolve(process.env.KONT_DATA_DIR);
  await mkdir(dataDirectory, { recursive: true });
  const tokenPath = resolve(dataDirectory, 'agent-token');
  let agentToken = process.env.KONT_AGENT_TOKEN;
  if (!agentToken) {
    try { agentToken = (await readFile(tokenPath, 'utf8')).trim(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      agentToken = randomBytes(32).toString('base64url');
      await writeFile(tokenPath, `${agentToken}\n`, { flag: 'wx', mode: 0o600 });
    }
  }
  if (agentToken.length < 32 || /\s/.test(agentToken)) throw new Error('KONT agent token is invalid');
  const store = await new KontStore(resolve(dataDirectory, 'worksites.json')).init();
  const protocol = createProtocolHandler(store, ctx.connection, { agentToken, agentSource: process.env.KONT_AGENT_SOURCE || 'agent:local' });
  let observerOwner, storageDisposal;
  const bindObserverOwner = (scope, options) => {
    if (storageDisposal) throw new DshReadError('DSH_OBSERVER_CLOSED');
    if (observerOwner && !observerOwner.released) throw new DshReadError('DSH_OBSERVER_OWNER_BUSY');
    const binding = bindRunObserver(scope, store, options);
    let disposal;
    const owner = { released: false, dispose() {
      if (!disposal) disposal = binding.dispose().then(() => { owner.released = true; });
      return disposal;
    } };
    observerOwner = owner;
    return owner;
  };
  // Cordis awaits effect disposers; an async event listener is not a shutdown
  // barrier and could let the process exit before the lock was unlinked.
  const disposeStorage = () => {
    if (!storageDisposal) storageDisposal = (async () => {
      protocol.dispose();
      await observerOwner?.dispose();
      await store.close();
    })();
    return storageDisposal;
  };
  ctx.effect(() => disposeStorage, 'kont-worksite.storage');
  try {
    if (audit.enabled) {
      if (readAuditInject.some(name => !ctx.get(name))) throw new DshReadError('DSH_HOST_CAPABILITY_MISSING');
      const dependency = ctx.inject(readAuditInject, async scope => {
        const owner = bindObserverOwner(scope, await resolveReadAudit(scope, audit));
        scope.effect(() => () => owner.dispose(), 'kont-worksite.read-audit');
      });
      await dependency.await();
    } else bindObserverOwner(ctx);
  }
  catch (error) { await disposeStorage(); throw error; }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/kont/api/workspace', handler: createHandler(store, ctx.connection) }));
  for (const path of ['/kont/snapshot', '/kont/command', '/kont/events']) ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler: protocol }));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/kont/runs', handler: protocol }));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/kont/worksites/', handler: protocol }));
}
