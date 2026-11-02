#!/usr/bin/env node
/**
 * 只读断言（holder 工具）：证明观测过程没有改动源。
 * 用法：
 *   node scripts/readonly-assert.mjs --snapshot   # 采基线
 *   node scripts/readonly-assert.mjs --verify     # 校验
 * 判据：每个源的 mtime+size 不变；knot 仓 git status 无新增改动。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';


// --probe-readonly：正向证明「我们的连接不能写」（比 mtime 可靠：源本身会被 Hermes 写）
if (process.argv.includes('--probe-readonly')) {
  const { DatabaseSync } = await import('node:sqlite');
  const DBs = ['D:/Hermes/state.db','D:/Hermes/profiles/xiaohe/state.db','D:/Hermes/kanban.db'];
  const out = [];
  for (const db of DBs) {
    let con; let wrote = false; let err = null;
    try {
      con = new DatabaseSync(db, { readOnly: true });
      con.exec('CREATE TABLE __ctx_probe(x INTEGER)');
      wrote = true;
    } catch (e) { err = String(e.message || e).slice(0, 80); }
    finally { try { con && con.close(); } catch {} }
    out.push({ db, readOnlyEnforced: !wrote, error: err });
  }
  const ok = out.every(x => x.readOnlyEnforced);
  console.log(JSON.stringify({ ok, checks: out }, null, 2));
  process.exit(ok ? 0 : 1);
}

const HOME = os.homedir();
const BASE = path.join(process.env.LOCALAPPDATA || path.join(HOME,'AppData','Local'), 'knot-ctx-readonly.json');
const SOURCES = [
  'D:/Hermes/logs/gateway.log',
  'D:/Hermes/profiles/xiaohe/logs/gateway.log',
  'D:/Hermes/state.db',
  'D:/Hermes/profiles/xiaohe/state.db',
  'D:/Hermes/kanban.db',
  path.join(HOME,'hermes-sync','activity-log.md'),
  path.join(HOME,'hermes-sync','cron','jobs.json'),
];
function statOf(p){ try{ const s=fs.statSync(p); return {mtimeMs:s.mtimeMs,size:s.size}; }catch{ return null; } }
function dirStamp(p){ try{ return fs.readdirSync(p).length; }catch{ return null; } }
function gitState(){
  try{
    const cwd = path.join(HOME,'hermes-sync','kairos-oracle','knot-flowgram');
    return execSync('git status --porcelain',{cwd,encoding:'utf8'}).trim().split('\n').filter(Boolean).length;
  }catch{ return null; }
}
const snap = {
  at:new Date().toISOString(),
  files:Object.fromEntries(SOURCES.map(p=>[p,statOf(p)])),
  codexToday: dirStamp(path.join(HOME,'.codex','sessions', new Date().toISOString().slice(0,10).replace(/-/g,'/'))),
  gitDirty: gitState(),
};
if (process.argv.includes('--snapshot')) {
  fs.writeFileSync(BASE, JSON.stringify(snap,null,2),'utf-8');
  console.log(JSON.stringify({ok:true, saved:BASE, files:Object.keys(snap.files).length, gitDirty:snap.gitDirty}));
  process.exit(0);
}
let prev; try{ prev=JSON.parse(fs.readFileSync(BASE,'utf-8')); }catch{ console.log(JSON.stringify({ok:false,error:'no snapshot; run --snapshot first'})); process.exit(2); }
const diffs=[];
for(const [p,v] of Object.entries(snap.files)){
  const o=prev.files[p];
  if(!o||!v) { diffs.push({p, reason:'missing'}); continue; }
  if(o.size!==v.size || Math.abs(o.mtimeMs-v.mtimeMs)>1) diffs.push({p, from:o, to:v});
}
if(snap.gitDirty!==prev.gitDirty && snap.gitDirty!==0) diffs.push({reason:'repo dirty changed', from:prev.gitDirty, to:snap.gitDirty});
console.log(JSON.stringify({ok:diffs.length===0, diffs, waited_s:Math.round((Date.parse(snap.at)-Date.parse(prev.at))/1000)},null,2));
process.exit(diffs.length===0?0:1);
