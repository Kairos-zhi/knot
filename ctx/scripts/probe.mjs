#!/usr/bin/env node
/**
 * 采集自检（M1-A 缺件补齐，按 a2a-20261026-001 卡面输出契约）
 *
 * 卡规定输出：{ sources:{每源计数}, cross_check:{与源文件独立统计一致}, lag_ms_p95, dup }
 * 另附：契约形状、/health、/events 首帧、源可读性。
 *
 * 交叉核对是**独立实现**：不复用 server.mjs 的函数，按卡面口径各写一遍再对账。
 * 只读最后 4MB 日志这一口径刻意与 server 保持一致，否则会误报。
 *
 * 只读；临时服务默认 7399，用完即停。退出码 0 = 全部一致且契约成立。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const HOME = os.homedir();
const SELF_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, path.sep));
const ROOT = path.dirname(SELF_DIR);
const PORT = Number(process.env.PROBE_PORT || 7399);
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

const FILES = {
  gwDefault: 'D:/Hermes/logs/gateway.log',
  gwXiaohe: 'D:/Hermes/profiles/xiaohe/logs/gateway.log',
  dbDefault: 'D:/Hermes/state.db',
  dbXiaohe: 'D:/Hermes/profiles/xiaohe/state.db',
  cronJobs: path.join(LOCALAPPDATA, 'hermes', 'cron', 'jobs.json'),
};
const DIRS = {
  codexSessions: path.join(HOME, '.codex', 'sessions'),
  handoff: path.join(HOME, 'hermes-sync', 'handoff'),
  tasks: path.join(HOME, 'hermes-sync', 'tasks'),
};

const ymd = (d = new Date()) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const midnightMs = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* ---------- 独立统计 ---------- */
function tailInbound(file, platforms) {
  let text;
  try {
    const st = fs.statSync(file);
    const take = Math.min(st.size, 4 * 1024 * 1024);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(take);
    fs.readSync(fd, buf, 0, take, st.size - take);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return null; }
  const out = Object.fromEntries(platforms.map(p => [p, 0]));
  const today = day();
  for (const line of text.split('\n')) {
    if (!line.includes(today) || !line.includes('inbound message: platform=')) continue;
    const m = /platform=([a-z]+)/.exec(line);
    if (m && m[1] in out) out[m[1]]++;
  }
  return out;
}
function codexTodayCount() {
  try { return fs.readdirSync(path.join(DIRS.codexSessions, ymd())).filter(f => f.endsWith('.jsonl')).length; }
  catch { return null; }
}
function receiptTodayCount() {
  const t0 = midnightMs();
  try {
    return fs.readdirSync(DIRS.tasks).filter(f => f.endsWith('.receipt.json'))
      .filter(f => fs.statSync(path.join(DIRS.tasks, f)).mtimeMs >= t0).length;
  } catch { return null; }
}
function cronTotals() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILES.cronJobs, 'utf8'));
    const jobs = Array.isArray(raw) ? raw : (raw.jobs || []);
    return { total: jobs.length, interval: jobs.filter(j => (j.schedule || {}).kind === 'interval').length };
  } catch { return { total: null, interval: null }; }
}

function independent() {
  const dflt = tailInbound(FILES.gwDefault, ['local', 'feishu']) || { local: null, feishu: null };
  const wx = tailInbound(FILES.gwXiaohe, ['weixin']) || { weixin: null };
  const codex = codexTodayCount();
  const aily = receiptTodayCount();
  const sub = (codex === null && aily === null) ? null : (codex || 0) + (aily || 0);
  const cron = cronTotals();
  return {
    desktop: dflt.local, weixin: wx.weixin, feishu: dflt.feishu,
    subagent: sub, cron: cron.total,
    parts: { codex_sessions_today: codex, aily_receipts_today: aily, cron_interval: cron.interval },
  };
}

/* ---------- 源可读性 ---------- */
function sourceCheck() {
  const out = [];
  for (const [id, p] of Object.entries(FILES)) out.push({ id, path: p, kind: 'file', ok: fs.existsSync(p) });
  for (const [id, p] of Object.entries(DIRS)) out.push({ id, path: p, kind: 'dir', ok: fs.existsSync(p) });
  return out;
}

/* ---------- 契约形状 ---------- */
const ENUM = ['desktop', 'weixin', 'feishu', 'subagent', 'cron'];
function contractCheck(v) {
  const bad = [];
  const need = (c, m) => { if (!c) bad.push(m); };
  need(v && v.schema_version === 1, 'schema_version');
  need(Array.isArray(v.sources) && v.sources.length === 5, 'sources.length');
  for (const s of v.sources || []) {
    need(ENUM.includes(s.id), `id ${s && s.id}`);
    need(typeof s.label === 'string' && s.label.length > 0, `label ${s && s.id}`);
    need(s.count === null || typeof s.count === 'number', `count ${s && s.id}`);
    need(typeof s.dry === 'boolean', `dry ${s && s.id}`);
  }
  need(Array.isArray(v.stations) && v.stations.length === 3, 'stations.length');
  for (const t of v.stations || []) {
    need(typeof t.id === 'string' && typeof t.label === 'string', `station ${t && t.id}`);
    need(Array.isArray(t.lines) && t.lines.length === 2 && t.lines.every(x => typeof x === 'string'), `lines ${t && t.id}`);
  }
  need(v.gate && typeof v.gate.closed === 'boolean' && typeof v.gate.reason === 'string', 'gate');
  need(v.outlet && typeof v.outlet.count === 'number' && typeof v.outlet.note === 'string', 'outlet');
  need(v.feedback && typeof v.feedback.count === 'number', 'feedback');
  need(Array.isArray(v.pending) && v.pending.every(p => typeof p.label === 'string' && typeof p.note === 'string'), 'pending');
  need(typeof v.updated_at === 'string' && !Number.isNaN(Date.parse(v.updated_at)), 'updated_at');
  return bad;
}

async function json(url, ms = 15000) {
  const t0 = performance.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  const body = await res.json();
  return { status: res.status, body, ms: performance.now() - t0 };
}

function waitListening(child, ms = 20000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('no listening within 20s')), ms);
    child.stdout.on('data', d => { buf += d; if (buf.includes('listening')) { clearTimeout(timer); resolve(buf.trim().split('\n').pop()); } });
    child.stderr.on('data', d => { buf += d; });
    child.on('exit', c => { clearTimeout(timer); reject(new Error(`server exited ${c}: ${buf.slice(0, 240)}`)); });
  });
}

const t0 = Date.now();
const report = { at: new Date().toISOString(), node: process.version, port: PORT, sources: {}, cross_check: null, lag_ms_p95: null, dup: null, contract: null, health: null, sse: null };
const failures = [];

report.sources_readable = sourceCheck();
for (const s of report.sources_readable) if (!s.ok) failures.push(`source ${s.id} missing`);

let child = null;
try {
  child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT, env: { ...process.env, CTX_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  report.listen = await waitListening(child);

  const samples = [];
  let last = null;
  for (let i = 0; i < 5; i++) {
    const r = await json(`http://127.0.0.1:${PORT}/api/pipeline`);
    if (r.status !== 200) { failures.push(`pipeline ${r.status}`); break; }
    last = r.body;
    samples.push(r.ms);
    await new Promise(res => setTimeout(res, 120));
  }
  const times = samples.slice().sort((a, b) => a - b);
  report.lag_ms_p95 = Math.round(times[Math.max(0, Math.ceil(times.length * 0.95) - 1)] ?? 0);
  report.sources = Object.fromEntries((last?.sources || []).map(s => [s.id, s.count]));

  const ind = independent();
  const diffs = ENUM.filter(k => report.sources[k] !== ind[k])
    .map(k => ({ source: k, api: report.sources[k], independent: ind[k] }));
  report.cross_check = { consistent: diffs.length === 0, diffs, independent: ind };

  const apiSum = ['desktop', 'weixin', 'feishu'].reduce((a, k) => a + (report.sources[k] ?? 0), 0);
  const indSum = ['desktop', 'weixin', 'feishu'].reduce((a, k) => a + (ind[k] ?? 0), 0);
  report.dup = apiSum - indSum;

  if (!report.cross_check.consistent) failures.push(...diffs.map(d => `cross_check ${d.source}: api=${d.api} ind=${d.independent}`));
  if (report.dup !== 0) failures.push(`dup=${report.dup}`);

  const problems = last ? contractCheck(last) : ['no snapshot'];
  if (problems.length) failures.push(...problems.map(p => `contract: ${p}`));
  report.contract = { problems, gate: last?.gate, outlet: last?.outlet, pending_n: (last?.pending || []).length };

  const health = await json(`http://127.0.0.1:${PORT}/health`);
  if (health.status !== 200 || health.body.ok !== true) failures.push(`health ${health.status}`);
  report.health = health.body;

  report.sse = await new Promise(resolve => {
    const ac = new AbortController();
    const timer = setTimeout(() => { ac.abort(); resolve('timeout'); }, 4000);
    fetch(`http://127.0.0.1:${PORT}/events`, { signal: ac.signal })
      .then(async res => { const chunk = await res.body.getReader().read(); clearTimeout(timer); ac.abort(); resolve(new TextDecoder().decode(chunk.value || new Uint8Array()).split('\n')[0]); })
      .catch(e => { clearTimeout(timer); resolve(e.name === 'AbortError' ? 'aborted' : 'error:' + e.name); });
  });
  if (!String(report.sse).includes(': hello')) failures.push(`sse: ${report.sse}`);
} catch (e) {
  failures.push(`service: ${e.message}`);
} finally {
  if (child && !child.killed) { try { child.kill(); } catch {} }
}

report.ok = failures.length === 0;
report.failures = failures;
report.elapsed_ms = Date.now() - t0;
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
