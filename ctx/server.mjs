#!/usr/bin/env node
/**
 * knot-ctx · 第一屏采集服务（M1-A）
 * 只读：所有源只读打开；只写自己的内存与 SSE。
 * 契约见 ../contract/fixture.json 与 ~/hermes-sync/handoff/20261026_第一屏规格_v1.md
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const HOME = os.homedir();
const PORT = Number(process.env.CTX_PORT || 7317);
const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, path.sep));
const PUBLIC = path.join(ROOT, 'public');

const P = {
  gwDefault: 'D:/Hermes/logs/gateway.log',
  gwXiaohe: 'D:/Hermes/profiles/xiaohe/logs/gateway.log',
  dbDefault: 'D:/Hermes/state.db',
  dbXiaohe: 'D:/Hermes/profiles/xiaohe/state.db',
  cronJobs: path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData/Local'), 'hermes', 'cron', 'jobs.json'),
  codexSessions: path.join(HOME, '.codex', 'sessions'),
  handoff: path.join(HOME, 'hermes-sync', 'handoff'),
  tasks: path.join(HOME, 'hermes-sync', 'tasks'),
  knotRepo: path.join(HOME, 'hermes-sync', 'kairos-oracle', 'knot-flowgram'),
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sinceMidnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; };

/* ---------- 1. 通道：网关日志中的 inbound 条数 ---------- */
function countInbound(file, platforms) {
  let text = '';
  try {
    const st = fs.statSync(file);
    const take = Math.min(st.size, 4 * 1024 * 1024);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(take);
    fs.readSync(fd, buf, 0, take, st.size - take);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return null; }
  const day = today();
  const out = Object.fromEntries(platforms.map(p => [p, 0]));
  for (const line of text.split('\n')) {
    if (!line.includes(day) || !line.includes('inbound message: platform=')) continue;
    const m = /platform=([a-z]+)/.exec(line);
    if (m && m[1] in out) out[m[1]]++;
  }
  return out;
}

/* ---------- 2. 子代理：今日会话文件 ---------- */
function countCodexToday() {
  const d = new Date();
  const dir = path.join(P.codexSessions, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).length; } catch { return null; }
}
function countAilyReceiptsToday() {
  const t0 = sinceMidnight() * 1000;
  try {
    return fs.readdirSync(P.tasks).filter(f => f.endsWith('.receipt.json'))
      .filter(f => fs.statSync(path.join(P.tasks, f)).mtimeMs >= t0).length;
  } catch { return null; }
}

/* ---------- 3. 定时 ---------- */
function cronStats() {
  try {
    const raw = JSON.parse(fs.readFileSync(P.cronJobs, 'utf8'));
    const jobs = Array.isArray(raw) ? raw : (raw.jobs || []);
    const interval = jobs.filter(j => (j.schedule || {}).kind === 'interval').length;
    return { total: jobs.length, interval };
  } catch { return { total: null, interval: null }; }
}

/* ---------- 4. 会话库：三工位数字 ---------- */
function sessionStats() {
  const t0 = sinceMidnight();
  const acc = { readFiles: new Set(), skills: new Set(), reads: 0, vision: 0, userMsgs: 0 };
  for (const db of [P.dbDefault, P.dbXiaohe]) {
    let con;
    try { con = new DatabaseSync(db, { readOnly: true }); } catch { continue; }
    try {
      con.exec('PRAGMA query_only=1');
      const rows = con.prepare(
        `SELECT role, tool_name, tool_calls FROM messages WHERE timestamp > ?`
      ).all(t0);
      for (const r of rows) {
        if (r.role === 'user') acc.userMsgs++;
        if (r.tool_name === 'vision_analyze') acc.vision++;
        if (!r.tool_calls) continue;
        let calls; try { calls = JSON.parse(r.tool_calls); } catch { continue; }
        for (const c of calls) {
          const fn = c.function || {}; const name = fn.name;
          let a = {}; try { a = JSON.parse(fn.arguments || '{}'); } catch {}
          if (name === 'read_file' && a.path) { acc.reads++; acc.readFiles.add(a.path); }
          if (name === 'skill_view' && a.name) { acc.skills.add(a.name + (a.file_path ? '#' + a.file_path : '')); }
        }
      }
    } catch {} finally { try { con.close(); } catch {} }
  }
  return acc;
}

/* ---------- 5. 生产：handoff 今日新增 ---------- */
function producedStats() {
  const t0 = sinceMidnight() * 1000;
  let n = 0, bytes = 0;
  try {
    for (const f of fs.readdirSync(P.handoff)) {
      const p = path.join(P.handoff, f);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.isFile() && st.mtimeMs >= t0) { n++; bytes += st.size; }
    }
  } catch {}
  return { files: n, bytes };
}

/* ---------- 6. 出库：knot 仓今日提交 ---------- */
function commitsToday() {
  try {
    const out = execSync('git log --since=midnight --oneline', { cwd: P.knotRepo, encoding: 'utf8' });
    return out.split('\n').filter(Boolean).length;
  } catch { return null; }
}

/* ---------- 7. 待接卡 ---------- */
function pendingCards() {
  const out = [];
  try {
    for (const f of fs.readdirSync(P.tasks)) {
      if (!f.endsWith('.json') || f.includes('.receipt') || f.includes('.claim')) continue;
      let d; try { d = JSON.parse(fs.readFileSync(path.join(P.tasks, f), 'utf8')); } catch { continue; }
      if (d.status !== 'pending') continue;
      const ageMs = Date.now() - fs.statSync(path.join(P.tasks, f)).mtimeMs;
      if (ageMs > 72 * 3600 * 1000) continue;            // 只报 72h 内的待接，旧卡不进第一屏
      const h = Math.max(0, Math.round(ageMs / 3600000));
      out.push({ label: `${d.id.slice(-7)} ${(d.brief || '').slice(0, 8)}`, note: `待接 ${h}h · ${d.to || ''}`.trim() });
    }
  } catch {}
  return out.slice(0, 3);
}

/* ---------- 组装 ---------- */
function snapshot() {
  const dflt = countInbound(P.gwDefault, ['local', 'feishu']) || { local: null, feishu: null };
  const wx = countInbound(P.gwXiaohe, ['weixin']) || { weixin: null };
  const codex = countCodexToday();
  const aily = countAilyReceiptsToday();
  const sub = (codex === null && aily === null) ? null : (codex || 0) + (aily || 0);
  const cron = cronStats();
  const ss = sessionStats();
  const prod = producedStats();
  const commits = commitsToday();
  const pend = pendingCards();

  const sources = [
    { id: 'desktop', label: '桌面 · 你在这里说的话', count: dflt.local, dry: dflt.local === 0 },
    { id: 'weixin', label: '微信 · 网关收进来的', count: wx.weixin, dry: wx.weixin === 0 },
    { id: 'feishu', label: '飞书 · 今天没进来', count: dflt.feishu, dry: dflt.feishu === 0 },
    { id: 'subagent', label: `子代理 · Codex 今日 ${codex ?? '—'} 个会话`, count: sub, dry: sub === 0 },
    { id: 'cron', label: `定时件 · ${cron.total ?? '—'} 个在跑 · ${cron.interval ?? '—'} 个轮询`, count: cron.total, dry: cron.total === 0 },
  ];
  const stations = [
    { id: 'tidy', label: '整理', lines: [`读 ${ss.readFiles.size} 份 · ${ss.skills.size} 个技能`, `会话 ${ss.reads} 次读取`] },
    { id: 'make', label: '生产', lines: [`${prod.files} 个文件 · ${Math.round(prod.bytes / 1024)} KB`, `今日新增`] },
    { id: 'check', label: '核验', lines: [`截图核对 ${ss.vision} 次`, `你的输入 ${ss.userMsgs} 条`] },
  ];
  const gateClosed = (commits === 0) && prod.files > 0;
  return {
    schema_version: 1,
    sources, stations,
    gate: { closed: gateClosed, reason: gateClosed ? '未进仓库 · 0 提交' : '已出库' },
    outlet: { count: commits ?? 0, note: `${commits ?? 0} 次提交` },
    feedback: { count: ss.userMsgs },
    pending: pend,
    updated_at: new Date().toISOString(),
  };
}

/* ---------- SSE ---------- */
const clients = new Set();
let seq = 0;
function broadcast(type, payload) {
  const frame = `id: ${++seq}\ndata: ${JSON.stringify({ seq, type, payload, at: new Date().toISOString() })}\n\n`;
  for (const res of clients) { try { res.write(frame); } catch { clients.delete(res); } }
}
let last = null;
function poll() {
  let s; try { s = snapshot(); } catch (e) { console.error('snapshot failed', e.message); return; }
  if (!last) { last = s; return; }
  for (const src of s.sources) {
    const prev = last.sources.find(x => x.id === src.id);
    if (!prev || prev.count !== src.count) broadcast('source.count', { id: src.id, count: src.count, dry: src.dry });
  }
  if (JSON.stringify(s.gate) !== JSON.stringify(last.gate)) broadcast('gate', s.gate);
  if (JSON.stringify(s.outlet) !== JSON.stringify(last.outlet)) broadcast('outlet', s.outlet);
  if (JSON.stringify(s.stations) !== JSON.stringify(last.stations)) broadcast('station.metrics', { stations: s.stations });
  last = s;
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/api/pipeline') {
    let body;
    try { body = snapshot(); } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.message })); return; }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, seq, clients: clients.size, uptime_s: Math.round(process.uptime()) }));
    return;
  }
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': hello\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  serveFile(res, file);
});

setInterval(poll, 5000).unref?.();
setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch { clients.delete(res); } } }, 15000).unref?.();
poll();

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({ ok: true, listening: `http://127.0.0.1:${PORT}`, root: ROOT }));
});
