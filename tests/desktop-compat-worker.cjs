// Executed only by the official installed Electron in RunAsNode mode.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, rm, access, readFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const anchor = process.env.KONT_DESKTOP_ANCHOR || 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json';
const hostRequire = createRequire(anchor);
(async () => {
 const version = hostRequire('@deepseek-ai/dsh/package.json').version;
 assert.equal(version, '0.2.1-rc.2');
 const { Context, Service } = hostRequire('@deepseek-ai/cordis');
 const { WebServer } = hostRequire('@deepseek-ai/dsh-host-webserver');
 const connectionPlugin = hostRequire('@deepseek-ai/dsh-client-connection');
 const { apply } = await import(pathToFileURL(resolve(process.env.KONT_PLUGIN_ENTRY || 'packages/dsh-plugin/src/index.mjs')).href);
 const dir = await mkdtemp('D:/Temp/kont-desktop-compat-');
 process.env.KONT_DATA_DIR = dir;
 process.env.KONT_AGENT_TOKEN = 'isolated-desktop-test-token-00000000000000';
 const ctx = new Context();
 let credential;
 // Public credential contract, isolated memory only. Never reads the desktop profile.
 ctx.provide('credentials', { async modifyRecord(_key, modify) { credential = await modify(credential) || credential; return credential; } });
 try {
  const server = new WebServer(ctx, { host: '127.0.0.1', port: 0, compression: 'none' });
  await server[Service.init]();
  await connectionPlugin.apply(ctx, {});
  await apply(ctx);
  const base = server.getOrigin();
  const authorized = ctx.connection.authenticatedUrl(base);
  let cookie;
  server.register({ kind: 'exact', path: '/', handler(req,res) { if (ctx.connection.authorizeIndex(req,res)) { res.writeHead(200); res.end('isolated'); } } });
  const exchange = await fetch(authorized, { redirect: 'manual' });
  assert.equal(exchange.status, 303);
  cookie = exchange.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/kont/snapshot')).status, 401);
  const headers = { cookie };
  assert.equal((await fetch(base+'/kont/snapshot',{headers})).status,200);
  assert.equal((await fetch(base+'/kont/snapshot',{headers:{...headers,origin:'https://evil.invalid'}})).status,403);
  const created = await fetch(base+'/kont/command',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({type:'knot.create',id:'desktop-test',data:{title:'Desktop compatibility'},position:{x:1,y:2}})});
  assert.equal(created.status,200,await created.text());
  const agentHeaders = { authorization:'Bearer '+process.env.KONT_AGENT_TOKEN };
  const state=await (await fetch(base+'/kont/snapshot',{headers:agentHeaders})).json();
  assert.equal(state.snapshot.schemaVersion,4);
  assert.ok(state.snapshot.assets.some(row=>row.id==='desktop-test'));
  const sse=await fetch(base+'/kont/events?since=0',{headers:agentHeaders});
  const reader=sse.body.getReader(); assert.ok((await reader.read()).value.length); await reader.cancel();
  await ctx.fiber.dispose();
  await assert.rejects(access(join(dir,'worksites.json.lock')),{code:'ENOENT'});
  assert.equal(JSON.parse(await readFile(join(dir,'worksites.json'),'utf8')).seq,1);
  console.log(JSON.stringify({version,cordis:hostRequire('@deepseek-ai/cordis/package.json').version,checks:['actual-webserver','actual-connection-cookie-auth','malicious-origin','shared-human-agent-kernel','schema4','sse-disconnect','awaited-disposal','durable-readback']}));
 } finally { await ctx.fiber.dispose(); await rm(dir,{recursive:true,force:true}); }
})().catch(error=>{ console.error(error); process.exitCode=1; });
