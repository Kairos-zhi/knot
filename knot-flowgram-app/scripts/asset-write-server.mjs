/**
 * knot 协议端点（v2）—— 资产事实源的对外协议口
 *
 * 从「只写黑洞」升级为三轮审计条款 3 的协议端点：
 *   GET  /snapshot     全量快照（assets + edges + seq），不开浏览器可感知
 *   POST /command      命令信封 → OpResult（{ok:true,value} | {ok:false,error:{code,message}}）
 *   GET  /events       SSE 事件流（seq 单调递增 + source + ts，?since=<seq> 重放历史）
 *   POST /write        兼容画布写回（画布 → 资产文件；body 可带 edges，修 N1）
 *
 * 安全：CORS 收窄为白名单（无 Origin 头放行=本地 curl/脚本；有 Origin 必须命中白名单）。
 * 命令执行范围（v1）：资产级 knot.create/update/delete + ping；画布级命令
 * （rope.connect/disconnect、chain.thread、generate.grow）在画布桥接接入前
 * 返回 CANVAS_OFFLINE 明确错误——document 在浏览器内，服务端不僭越执行。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_FILE = path.resolve(__dirname, '../src/assets/knot-assets.json');
const PORT = 3101;
const ALLOWED_ORIGINS = new Set(['http://localhost:3002', 'http://127.0.0.1:3002']);
const MAX_BODY = 1 * 1024 * 1024; // 1MB
const EVENT_CAP = 200;

// ── 状态（仅协议层状态；资产事实=文件，不维护第二份资产状态）──
let seq = 0;
const events = [];
const sseClients = new Set();

const nextSeq = () => ++seq;
const emit = (type, payload, source = 'human') => {
  const e = { type, ...payload, source, seq: nextSeq(), ts: new Date().toISOString() };
  events.push(e);
  if (events.length > EVENT_CAP) events.shift();
  const chunk = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(chunk);
    } catch {
      sseClients.delete(res);
    }
  }
  return e;
};

// ── 资产文件读写（文件=事实源，每次读写全量，不缓存）──
const readAssets = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(ASSET_FILE, 'utf-8'));
    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
  } catch {
    return { assets: [], edges: [], note: '' };
  }
};

const writeAssets = (assets, edges, note) => {
  const payload = {
    note: note || 'knot 资产清单（画布写回 · 双向同步：结=资产本体）',
    assets,
  };
  if (Array.isArray(edges)) payload.edges = edges;
  fs.writeFileSync(ASSET_FILE, JSON.stringify(payload, null, 2), 'utf-8');
};

// ── 命令执行 ──
const runCommand = (cmd) => {
  const type = cmd && cmd.type;
  switch (type) {
    case 'ping':
      return { ok: true, value: { seq, time: new Date().toISOString() } };

    case 'knot.create': {
      const id =
        cmd.id || `knot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const current = readAssets();
      const data = cmd.data || {};
      const asset = {
        id,
        title: data.title ?? '',
        summary: data.summary ?? '',
        src: data.src ?? '',
        chain_id: data.chain_id ?? '',
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        ...(cmd.position ? { position: cmd.position } : {}),
      };
      current.assets.push(asset);
      writeAssets(current.assets, current.edges);
      emit('knot.created', { id, data: asset }, cmd.source);
      return { ok: true, value: id };
    }

    case 'knot.update': {
      const current = readAssets();
      const idx = current.assets.findIndex((a) => a.id === cmd.id);
      if (idx < 0) return { ok: false, error: { code: 'NOT_FOUND', message: `no asset: ${cmd.id}` } };
      current.assets[idx] = { ...current.assets[idx], ...(cmd.patch || {}) };
      writeAssets(current.assets, current.edges);
      emit('knot.updated', { id: cmd.id, patch: cmd.patch || {} }, cmd.source);
      return { ok: true, value: cmd.id };
    }

    case 'knot.delete': {
      const current = readAssets();
      const before = current.assets.length;
      current.assets = current.assets.filter((a) => a.id !== cmd.id);
      if (current.assets.length === before) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `no asset: ${cmd.id}` } };
      }
      writeAssets(current.assets, current.edges);
      emit('knot.deleted', { id: cmd.id }, cmd.source);
      return { ok: true, value: true };
    }

    case 'rope.connect':
    case 'rope.disconnect':
    case 'chain.thread':
    case 'generate.grow':
      return {
        ok: false,
        error: {
          code: 'CANVAS_OFFLINE',
          message:
            'canvas bridge not connected — this command must execute inside the running canvas (OperationService bridge, v2)',
        },
      };

    default:
      return { ok: false, error: { code: 'UNKNOWN_COMMAND', message: `unknown type: ${type}` } };
  }
};

// ── CORS 守卫：有 Origin 必须命中白名单，无 Origin（curl/脚本）放行 ──
const corsGuard = (req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        error: { code: 'ORIGIN_DENIED', message: `origin not allowed: ${origin}` },
      }),
    );
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin || 'http://localhost:3002');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      body += c;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  if (!corsGuard(req, res)) return;

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  // GET /snapshot —— 全量快照（不开浏览器可感知画布资产态）
  if (req.method === 'GET' && url.pathname === '/snapshot') {
    const snap = readAssets();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, seq, snapshot: snap }));
    return;
  }

  // GET /events —— SSE 事件流（?since=<seq> 重放历史）
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    const since = Number.parseInt(url.searchParams.get('since') || '0', 10);
    for (const e of events) {
      if (e.seq > since) res.write(`data: ${JSON.stringify(e)}\n\n`);
    }
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // POST /command —— 命令信封 → OpResult
  if (req.method === 'POST' && url.pathname === '/command') {
    try {
      const body = await readBody(req);
      const cmd = JSON.parse(body || '{}');
      const result = runCommand(cmd);
      const code = result.ok ? 200 : 400;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: String(e) } }));
    }
    return;
  }

  // POST /write —— 兼容画布写回（body: { assets, edges? }）
  if (req.method === 'POST' && url.pathname === '/write') {
    try {
      const body = await readBody(req);
      const { assets, edges } = JSON.parse(body);
      if (!Array.isArray(assets)) throw new Error('assets must be an array');
      writeAssets(assets, edges);
      emit('asset.synced', { count: assets.length, edgeCount: Array.isArray(edges) ? edges.length : 0 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: assets.length }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: String(e) } }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'no such endpoint' } }));
});

server.listen(PORT, () => {
  console.log(`[knot-protocol] http://localhost:${PORT}`);
  console.log(`  GET  /snapshot  -> ${ASSET_FILE}`);
  console.log('  POST /command   -> OpResult envelope');
  console.log('  GET  /events    -> SSE (seq monotonic)');
  console.log('  POST /write     -> legacy canvas write-back (CORS allowlisted)');
});
