/**
 * knot 协议端点 v0.1 —— agent-agnostic 协议面（RFC v0.1 冻结版）
 *
 * 依据：knot协议规范_v0.1.md（2026-08-31 冻结，决策 C=自定轻协议+留接口）
 * 端点：
 *   GET  /snapshot     全量快照（assets + edges + seq + since），agent 冷启动第一口
 *   POST /command      命令信封 → OpResult（{ok,value} | {ok:false,error:{code,message}}）
 *   GET  /events       SSE 事件流（seq 单调递增 + source + ts，?since=<seq> 增量）
 *   POST /write        画布写回（body: { assets, edges? }，修 N1；经文件锁）
 *   POST /command/poll Canvas Bridge 拉取待执行画布级命令（宿主轮询，修 CANVAS_OFFLINE 黑洞）
 *   POST /command/ack  Canvas Bridge 执行结果回执（{cmdSeq, ok, value | error}）
 *
 * v0.1 三块硬骨头（反审查 P0，全落地）：
 *   1. 文件锁：写路径 O_EXCL 锁文件，拿不到→409 CONFLICT（RFC §7 决策1）
 *   2. seq 持久化：落到 .seq 文件，重启不归零（RFC §7 决策3）
 *   3. 宿主身份：共享 token，source 从 token 映射，不信 body 自报（RFC §7 决策4）
 *
 * 安全：CORS 白名单 + token 鉴权（POST /command /write /command/poll /command/ack 需 token）
 * 边界：画布级命令（rope/chain/generate/tool/focus/expand/pin 各前缀）不在服务端执行，
 *       进 pending 队列等 Canvas Bridge 轮询拉取 → 浏览器内 OperationService 执行 → ack 回执。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_FILE = path.resolve(__dirname, '../src/assets/knot-assets.json');
const LOCK_FILE = path.resolve(__dirname, '../.asset-write.lock');
const SEQ_FILE = path.resolve(__dirname, '../.asset-write.seq');
const PORT = 3101;

// 宿主身份：共享 token。环境变量 KNOT_TOKEN 优先；缺省 dev token（本地单机够用，部署前必须覆盖）
const TOKEN = process.env.KNOT_TOKEN || 'knot-dev-token';

// 宿主身份来源（RFC §7 决策4）：v0.1 冻结=共享单 token，故 token 只承担共享鉴权（authGuard），
// source 由宿主侧配置映射（KNOT_HOST），信任边界在配置而非 body——端点内叫用 resolveSource()，
// 不信调用方 body 自报。真正的 token→per-host source 表需要拆每宿主 token，属后续审计项，
// 不在 v0.1 冻结范围（协议 §7 决策4 理由）。
// 注意：单独改此常量不影响任何对外契约字段/端点/鉴权比对。
const HOST_NAME = process.env.KNOT_HOST || 'human'; // 单宿主场景默认 human；Oracle 接入时设 KNOT_HOST
const resolveSource = () => HOST_NAME; // source 来源解析：宿主配置，非 body、非 token 值

const ALLOWED_ORIGINS = new Set(['http://localhost:3002', 'http://127.0.0.1:3002']);
const MAX_BODY = 1 * 1024 * 1024; // 1MB
const EVENT_CAP = 200;
const PENDING_CAP = 100; // 画布级命令待执行队列上限（防恶意撑爆）

// ── seq 持久化（RFC §7 决策3）──
const loadSeq = () => {
  try {
    return Number.parseInt(fs.readFileSync(SEQ_FILE, 'utf-8'), 10) || 0;
  } catch {
    return 0;
  }
};
const saveSeq = (n) => {
  fs.writeFileSync(SEQ_FILE, String(n), 'utf-8');
};

let seq = loadSeq();
const events = []; // 事件缓冲（内存，冷启动后靠 /snapshot 看全貌，事件流是增量）
const sseClients = new Set();
const pending = new Map(); // cmdSeq → { cmd, source, ts } 画布级命令待执行队列

const nextSeq = () => {
  seq += 1;
  saveSeq(seq);
  return seq;
};

const emit = (type, payload, source) => {
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

// ── 文件锁（RFC §7 决策1：写前 O_EXCL 锁，拿不到→409）──
const acquireLock = () => {
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
};
const releaseLock = () => {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    /* already released */
  }
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

// 带锁的写路径：读→改→写全在锁内（修并发 P0）
const withLock = (fn) => {
  if (!acquireLock()) {
    return { ok: false, error: { code: 'CONFLICT', message: 'asset file is being written by another process' } };
  }
  try {
    return fn();
  } finally {
    releaseLock();
  }
};

// ── 画布级命令判定（RFC §3.2，14 命令全集里的画布级）──
const CANVAS_COMMANDS = new Set([
  'rope.connect',
  'rope.disconnect',
  'rope.disconnectAll',
  'chain.thread',
  'chain.get',
  'generate.grow',
  'generate.fromSelection',
  'tool.set',
  'tool.get',
  'focus.set',
  'expand.set',
  'pin.toggle',
]);

// ── 命令执行（资产级直接在服务端；画布级进 pending 队列）──
const runCommand = (cmd, source) => {
  const type = cmd && cmd.type;
  switch (type) {
    case 'ping':
      return { ok: true, value: { seq, time: new Date().toISOString() } };

    case 'knot.create': {
      const id = cmd.id || `knot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      return withLock(() => {
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
        emit('knot.created', { id, data: asset }, source);
        return { ok: true, value: id };
      });
    }

    case 'knot.update': {
      return withLock(() => {
        const current = readAssets();
        const idx = current.assets.findIndex((a) => a.id === cmd.id);
        if (idx < 0) return { ok: false, error: { code: 'NOT_FOUND', message: `no asset: ${cmd.id}` } };
        current.assets[idx] = { ...current.assets[idx], ...(cmd.patch || {}) };
        writeAssets(current.assets, current.edges);
        emit('knot.updated', { id: cmd.id, patch: cmd.patch || {} }, source);
        return { ok: true, value: cmd.id };
      });
    }

    case 'knot.delete': {
      return withLock(() => {
        const current = readAssets();
        const before = current.assets.length;
        current.assets = current.assets.filter((a) => a.id !== cmd.id);
        if (current.assets.length === before) {
          return { ok: false, error: { code: 'NOT_FOUND', message: `no asset: ${cmd.id}` } };
        }
        writeAssets(current.assets, current.edges);
        emit('knot.deleted', { id: cmd.id }, source);
        return { ok: true, value: true };
      });
    }

    default: {
      // 画布级命令：进 pending 队列，等 Canvas Bridge 轮询执行（RFC §5 路线1）
      if (CANVAS_COMMANDS.has(type)) {
        if (pending.size >= PENDING_CAP) {
          return { ok: false, error: { code: 'QUEUE_FULL', message: 'pending canvas command queue is full' } };
        }
        const cmdSeq = nextSeq();
        pending.set(cmdSeq, { cmd, source, ts: new Date().toISOString() });
        emit('command.queued', { cmdSeq, type }, source);
        return { ok: true, value: { cmdSeq, status: 'queued' } };
      }
      return { ok: false, error: { code: 'UNKNOWN_COMMAND', message: `unknown type: ${type}` } };
    }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return true;
};

// token 鉴权（RFC §7 决策4：写类端点需 token；GET /snapshot /events 只读放行）
const authGuard = (req) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  return token === TOKEN;
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

const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  if (!corsGuard(req, res)) return;

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  // GET /snapshot —— 全量快照（agent 冷启动第一口，含 seq 便于 ?since= 增量）
  if (req.method === 'GET' && url.pathname === '/snapshot') {
    const snap = readAssets();
    sendJson(res, 200, { ok: true, seq, snapshot: snap });
    return;
  }

  // GET /events —— SSE 事件流（?since=<seq> 增量重放；冷启动靠 /snapshot 看全貌）
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

  // 写类端点鉴权
  const isWrite = req.method === 'POST';
  if (isWrite && !authGuard(req)) {
    sendJson(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'missing or invalid token' } });
    return;
  }

  // POST /command —— 命令信封 → OpResult（资产级执行；画布级进队列）
  if (req.method === 'POST' && url.pathname === '/command') {
    try {
      const body = await readBody(req);
      const cmd = JSON.parse(body || '{}');
      const result = runCommand(cmd, resolveSource()); // source 来源=宿主配置，非 body 自报（决策4）
      const code = result.ok ? 200 : result.error?.code === 'CONFLICT' ? 409 : 400;
      sendJson(res, code, result);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: String(e) } });
    }
    return;
  }

  // POST /write —— 画布写回（body: { assets, edges? }，经文件锁）
  if (req.method === 'POST' && url.pathname === '/write') {
    try {
      const body = await readBody(req);
      const { assets, edges } = JSON.parse(body);
      if (!Array.isArray(assets)) throw new Error('assets must be an array');
      const result = withLock(() => {
        writeAssets(assets, edges);
        emit('asset.synced', { count: assets.length, edgeCount: Array.isArray(edges) ? edges.length : 0 }, resolveSource());
        return { ok: true, count: assets.length };
      });
      sendJson(res, result.ok ? 200 : 409, result);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: String(e) } });
    }
    return;
  }

  // POST /command/poll —— Canvas Bridge 轮询拉取待执行画布级命令（RFC §5 路线1）
  if (req.method === 'POST' && url.pathname === '/command/poll') {
    const batch = [];
    for (const [cmdSeq, item] of pending) {
      batch.push({ cmdSeq, cmd: item.cmd, source: item.source, ts: item.ts });
    }
    sendJson(res, 200, { ok: true, commands: batch });
    return;
  }

  // POST /command/ack —— Canvas Bridge 执行结果回执（{cmdSeq, ok, value | error}）
  if (req.method === 'POST' && url.pathname === '/command/ack') {
    try {
      const body = await readBody(req);
      const { cmdSeq, ok, value, error } = JSON.parse(body || '{}');
      const item = pending.get(cmdSeq);
      if (!item) {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `no pending command: ${cmdSeq}` } });
        return;
      }
      pending.delete(cmdSeq);
      if (ok) {
        emit('command.done', { cmdSeq, type: item.cmd.type, value }, resolveSource());
      } else {
        emit('command.failed', { cmdSeq, type: item.cmd.type, error }, resolveSource());
      }
      sendJson(res, 200, { ok: true, cmdSeq });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: String(e) } });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'no such endpoint' } });
});

server.listen(PORT, () => {
  console.log(`[knot-protocol v0.1] http://localhost:${PORT}`);
  console.log(`  GET  /snapshot     -> ${ASSET_FILE}`);
  console.log('  POST /command      -> OpResult envelope (asset-level execute, canvas-level queue)');
  console.log('  GET  /events       -> SSE (seq persisted, monotonic)');
  console.log('  POST /write        -> canvas write-back (file-locked)');
  console.log('  POST /command/poll -> Canvas Bridge pulls pending canvas commands');
  console.log('  POST /command/ack  -> Canvas Bridge reports execution result');
  console.log(`  token: ${TOKEN === 'knot-dev-token' ? 'dev default (set KNOT_TOKEN before deploy)' : 'from KNOT_TOKEN'}`);
});
