import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { KontStore } from '../../packages/dsh-plugin/src/store.mjs';
import { createProtocolHandler } from '../../packages/dsh-plugin/src/index.mjs';

export const sourceCommit='08a2a5340edab920ce942173ba63b2c5bc369eb4';
const relative='knot-flowgram-app/scripts/asset-write-server.mjs';
export const token='protocol-equivalence-test-only-token-000000000';
export const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
export const assemblyPatches=[
 ['const PORT = 3101;','const PORT = 0;'],
 ['server.listen(PORT, () => {',`server.listen(PORT, '127.0.0.1', () => {\n  console.log('TEST_READY:' + server.address().port);`],
];
export async function fixture(t) {
 const fixed=await readFile(new URL('../fixtures/asset-write-server.upstream.mjs',import.meta.url));
 assert.equal(createHash('sha256').update(fixed).digest('hex'),'91b5e9470f87ee8dcb7deef0a5c19e519bb11749f031143006ef5daad215a246','source fixture must retain pinned upstream bytes');
 const original=fixed.toString('utf8');
 let adapted=original;
 for(const [before,after] of assemblyPatches){assert.equal(adapted.split(before).length,2,'assembly patch must match once');adapted=adapted.replace(before,after);}
 const dir=await mkdtemp(join(tmpdir(),'kont-protocol-equivalence-'));
 await mkdir(join(dir,'scripts'));await mkdir(join(dir,'src/assets'),{recursive:true});
 await writeFile(join(dir,'scripts/asset-write-server.mjs'),adapted);
 // The original script's only input asset is a JSON document. Use an empty
 // test document at its unchanged relative path; never copy production assets.
 await writeFile(join(dir,'src/assets/knot-assets.json'),JSON.stringify({assets:[],edges:[],note:''}));
 let child,server,store,handler;
 async function stopSource(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}}
 async function startSource(){
  child=spawn(process.execPath,[join(dir,'scripts/asset-write-server.mjs')],{cwd:dir,env:{...process.env,KNOT_TOKEN:token,KNOT_HOST:'agent:equivalence'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  return new Promise((resolve,reject)=>{
   let output='';const timeout=setTimeout(()=>reject(Error('source readiness timed out')),5000);
   child.stdout.on('data',chunk=>{output+=chunk;const match=/TEST_READY:(\d+)/.exec(output);if(match){clearTimeout(timeout);resolve(`http://127.0.0.1:${match[1]}`);}});
   child.once('error',error=>{clearTimeout(timeout);reject(error);});
   child.once('exit',code=>{clearTimeout(timeout);reject(Error(`source exited ${code}`));});
  });
 }
 async function stopCurrent(){if(handler)handler.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(store)await store.close();}
 async function startCurrent(){
  store=await new KontStore(join(dir,'current.json')).init();
  handler=createProtocolHandler(store,{requestRejection:()=>401},{agentToken:token,agentSource:'agent:equivalence'});
  server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  return `http://127.0.0.1:${server.address().port}/kont`;
 }
 t.after(async()=>{await stopSource();await stopCurrent();await rm(dir,{recursive:true,force:true});});
 const pair={source:await startSource(),current:await startCurrent(),original,
  sourceInfo:{commit:sourceCommit,script:relative,sha256:createHash('sha256').update(fixed).digest('hex'),assemblyPatches,assetFixture:{assets:[],edges:[],note:''}},
  async restart(){await stopSource();await stopCurrent();pair.source=await startSource();pair.current=await startCurrent();}};
 return pair;
}
export async function command(base,body,extra={}){const response=await fetch(base+'/command',{method:'POST',headers:{...headers,...extra},body:typeof body==='string'?body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
export async function snapshot(base){return (await fetch(base+'/snapshot',{headers})).json();}
export async function frames(base,since=0,minimumFrames=1){
 const response=await fetch(`${base}/events?since=${since}`,{headers,signal:AbortSignal.timeout(5000)});
 if(response.status!==200)return {status:response.status,body:await response.json()};
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='';
 try { while(text.split('\n\n').length-1<minimumFrames){const chunk=await reader.read();if(chunk.done)break;text+=decoder.decode(chunk.value,{stream:true});} }
 finally {await reader.cancel();}
 return {status:response.status,text,events:text.split('\n\n').filter(row=>row.includes('data: ')&&!row.includes('event: reset')).map(row=>JSON.parse(row.split('\n').find(line=>line.startsWith('data: ')).slice(6)))};
}
