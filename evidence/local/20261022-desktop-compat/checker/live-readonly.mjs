import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname,join } from 'node:path';
import { connectDesktopManager } from '../../../../scripts/desktop-host-debug.mjs';
const output={at:new Date().toISOString(),readOnly:true,modelCalls:0};
const manager=await connectDesktopManager('http://127.0.0.1:19221');
try {
 output.bundles=(await manager.listBundles()).filter(p=>p.name==='@kont/desktop-bundle'); output.plugins=(await manager.listPlugins()).filter(p=>p.moduleName==='@kont/dsh-plugin'); output.client=await manager.readClientStatus();
 assert(output.plugins.some(p=>p.moduleName==='@kont/dsh-plugin'&&p.fiberPhase==='active'&&p.enabled));
 assert(output.client.present&&output.client.active&&output.client.mainRegistered&&output.client.sidebarRegistered);
 const data=await readFile('D:/DSH-Desktop/kont-data/worksites.json');
 const hash=createHash('sha256').update(data).digest('hex');
 const previous=JSON.parse(await readFile(new URL('../controller/real-desktop-verification.json',import.meta.url)));
 assert.equal(hash,previous.stateSha256);
 const token=(await readFile('D:/DSH-Desktop/kont-data/agent-token','utf8')).trim();
 const headers={authorization:`Bearer ${token}`};
 const response=await fetch('http://127.0.0.1:3584/kont/snapshot',{headers});assert.equal(response.status,200);
 const current=await response.json();assert.equal(current.seq,8);assert.equal(current.snapshot.schemaVersion,4);
 assert.deepEqual(current.snapshot.assets.map(a=>a.id),['desktop-check-A','desktop-check-B']);assert.deepEqual(current.snapshot.edges,[]);
 const site=current.snapshot.workspace.worksites.find(s=>s.id==='legacy');
 assert.deepEqual(site.checkedIds,['desktop-check-A']);assert.deepEqual(site.excludedIds,['desktop-check-B']);assert.equal(site.draft,'桌面接入核验现场（非模型运行）');
 const blocks=current.snapshot.assets[0].blocks;assert.equal(blocks.length,2);assert.equal(blocks[0].source,'manual');assert.deepEqual(blocks[1].provenance,['desktop-check-B']);
 assert.deepEqual(JSON.parse(data).workspace,current.snapshot.workspace);
 assert.equal((await fetch('http://127.0.0.1:3584/kont/snapshot')).status,401);
 const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),5000);
 try {const stream=await fetch('http://127.0.0.1:3584/kont/events?since=0',{headers,signal:abort.signal});assert.equal(stream.status,200);const reader=stream.body.getReader();let text='';while(!text.includes('snapshotRequired')){const row=await reader.read();assert(!row.done);text+=new TextDecoder().decode(row.value);}assert.match(text,/event: reset/);assert.match(text,/"seq":8/);assert.match(text,/"snapshotRequired":true/);await reader.cancel();output.coldSse={reset:true,seq:8,snapshotRequired:true};} finally {clearTimeout(timeout);abort.abort();}
 const req=createRequire('D:/DSH-Desktop/home/profiles/desktop/package.json');const bundle=req.resolve('@kont/desktop-bundle/package.json');const plugin=createRequire(bundle).resolve('@kont/dsh-plugin/package.json');
 const receipt=JSON.parse(await readFile(new URL('../maker/receipt.json',import.meta.url)));
 output.installHashes=[];
 for(const row of receipt.files.filter(r=>r.path.startsWith('packages/'))){const root=row.path.startsWith('packages/dsh-plugin/')?dirname(plugin):dirname(bundle);const suffix=row.path.replace(/^packages\/(dsh-plugin|desktop-bundle)\//,'');const actual=createHash('sha256').update(await readFile(join(root,suffix))).digest('hex');assert.equal(actual.toUpperCase(),row.sha256);output.installHashes.push({file:row.path,match:true});}
 for(const file of ['src/index.mjs','src/kernel.mjs','src/store.mjs','lib/knot-model.js','lib/snapshot.js','lib/workspace-state.js'])assert.deepEqual(await readFile(join(dirname(plugin),file)),await readFile(new URL('../../../../packages/dsh-plugin/'+file,import.meta.url)));
 output.seq=8;output.stateSha256=hash;output.fixtureAssets=2;output.passed=true;
} finally {manager.close();}
await writeFile(new URL('./live-readonly-result.json',import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify(output));
