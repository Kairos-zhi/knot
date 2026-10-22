import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, command, snapshot, frames, headers } from './helpers/protocol-source-fixture.mjs';

const canvas=['rope.connect','rope.disconnect','rope.disconnectAll','chain.thread','chain.get','generate.grow','generate.fromSelection','tool.set','tool.get','focus.set','expand.set','pin.toggle'];
const sharedDirect=['ping','knot.create','knot.update'];
const directInsteadOfBridge=['rope.connect','rope.disconnect'];
const unsupported=['knot.delete','rope.disconnectAll','chain.thread','chain.get','generate.grow','generate.fromSelection','tool.set','tool.get','focus.set','expand.set','pin.toggle'];
const asset={title:'contract',summary:'summary',src:'fixture:source',chain_id:'fixture-chain',blocks:[{id:'b1',source:'manual',timestamp:'2026-01-01T00:00:00.000Z',provenance:[],content:'first'}]};
// Deliberately compare the source server's document surface. New schemaVersion,
// workspace, titles and persistence metadata have no source-server equivalent.
const documentOf=envelope=>({ok:envelope.ok,seq:envelope.seq,assets:envelope.snapshot.assets,edges:envelope.snapshot.edges});
const eventOf=({ts,...event})=>{assert.ok(Number.isFinite(Date.parse(ts)));return event;};

test('pinned source server and KONT share deterministic direct command, document and SSE semantics',async t=>{
 const pair=await fixture(t);t.diagnostic(JSON.stringify(pair.sourceInfo));
 const before=await Promise.all([pair.source,pair.current].map(snapshot));
 assert.deepEqual(documentOf(before[0]),documentOf(before[1]));
 assert.equal(before[0].snapshot.schemaVersion,undefined);assert.equal(before[1].snapshot.schemaVersion,4);
 for(const cmd of [{type:'knot.create',id:'equivalent-A',data:asset,position:{x:10,y:20},source:'forged'},{type:'knot.update',id:'equivalent-A',patch:{title:'updated',blocks:[...asset.blocks,{...asset.blocks[0],id:'b2',content:'second'}]},source:'forged'}]){
  const result=await Promise.all([pair.source,pair.current].map(base=>command(base,cmd)));
  assert.deepEqual(result[0],result[1]);assert.deepEqual(result[0],{status:200,body:{ok:true,value:'equivalent-A'}});
 }
 const state=await Promise.all([pair.source,pair.current].map(snapshot));
 assert.deepEqual(documentOf(state[0]),documentOf(state[1]));assert.equal(state[0].seq,2);
 const ping=await Promise.all([pair.source,pair.current].map(base=>command(base,{type:'ping'})));
 for(const row of ping){assert.equal(row.status,200);assert.equal(row.body.value.seq,2);assert.ok(Number.isFinite(Date.parse(row.body.value.time)));}
 const stream=await Promise.all([pair.source,pair.current].map(base=>frames(base,0,3)));
 assert.deepEqual(stream[0].events.map(eventOf),stream[1].events.map(eventOf));
 assert.equal(stream[0].events.length,2);assert.deepEqual(stream[0].events.map(e=>e.source),['agent:equivalence','agent:equivalence']);
 assert.equal(stream[0].text.includes('id: '),false);assert.match(stream[1].text,/id: 1/,'KONT adds SSE id framing');
 const incremental=await Promise.all([pair.source,pair.current].map(base=>frames(base,1,2)));
 assert.deepEqual(incremental[0].events.map(eventOf),incremental[1].events.map(eventOf));assert.equal(incremental[0].events.length,1);
});

test('shared errors retain boundaries while authentication, validation and revision differences stay explicit',async t=>{
 const pair=await fixture(t);
 for(const base of [pair.source,pair.current]){
  assert.equal((await command(base,{type:'ping'},{authorization:'Bearer wrong'})).status,401);
  const missing=await command(base,{type:'knot.update',id:'missing',patch:{title:'x'}});
  assert.equal(missing.status,400);assert.equal(missing.body.error.code,'NOT_FOUND');assert.equal((await snapshot(base)).seq,0);
 }
 assert.equal((await fetch(pair.source+'/snapshot')).status,200);assert.equal((await fetch(pair.current+'/snapshot')).status,401);
 assert.equal((await fetch(pair.source+'/snapshot',{headers:{...headers,origin:'http://127.0.0.1:3002'}})).status,200);
 assert.equal((await fetch(pair.current+'/snapshot',{headers:{...headers,origin:'http://127.0.0.1:3002'}})).status,403,'KONT fences Origin to its actual loopback authority');
 const invalid=await Promise.all([pair.source,pair.current].map(base=>command(base,'{broken')));
 assert.deepEqual(invalid.map(row=>[row.status,row.body.error.code]),[[400,'BAD_REQUEST'],[400,'INVALID_JSON']]);
 const unknown=await Promise.all([pair.source,pair.current].map(base=>command(base,{type:'nonexistent'})));
 assert.deepEqual(unknown.map(row=>[row.status,row.body.error.code]),[[400,'UNKNOWN_COMMAND'],[400,'UNSUPPORTED_COMMAND']]);
 for(const base of [pair.source,pair.current])assert.equal((await command(base,{type:'knot.create',id:'A',data:asset})).status,200);
 const duplicate=await Promise.all([pair.source,pair.current].map(base=>command(base,{type:'knot.create',id:'A',data:asset})));
 assert.equal(duplicate[0].status,200);assert.equal(duplicate[1].body.error.code,'DUPLICATE_ID');
 const stale=await Promise.all([pair.source,pair.current].map(base=>command(base,{type:'knot.update',id:'A',patch:{title:'stale'},baseSeq:0})));
 assert.equal(stale[0].status,200,'original server ignores baseSeq');assert.deepEqual([stale[1].status,stale[1].body.error.code],[409,'STALE_REVISION']);
});

test('source enumeration has 16 named commands; 3 direct equivalents, 2 changed execution modes and 11 unsupported',async t=>{
 const pair=await fixture(t);
 const declaredCanvas=[...pair.original.match(/const CANVAS_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map(row=>row[1]);
 const declaredDirect=[...pair.original.matchAll(/case '([^']+)':/g)].map(row=>row[1]);
 assert.deepEqual(declaredCanvas,canvas);assert.deepEqual(declaredDirect,['ping','knot.create','knot.update','knot.delete']);
 assert.equal(new Set([...declaredCanvas,...declaredDirect]).size,16);
 assert.deepEqual([...sharedDirect,...directInsteadOfBridge,...unsupported].sort(),[...declaredCanvas,...declaredDirect].sort());
 for(const base of [pair.source,pair.current])for(const id of ['A','B'])assert.equal((await command(base,{type:'knot.create',id,data:asset})).status,200);
 for(const type of canvas){
  const source=await command(pair.source,{type,fromId:'A',toId:'B'});
  assert.equal(source.status,200);assert.equal(source.body.value.status,'queued');assert.ok(Number.isInteger(source.body.value.cmdSeq));
  const current=await command(pair.current,{type,fromId:'A',toId:'B'});
  if(directInsteadOfBridge.includes(type))assert.deepEqual(current,{status:200,body:{ok:true,value:true}});
  else assert.deepEqual([current.status,current.body.error.code],[400,'UNSUPPORTED_COMMAND']);
 }
 assert.deepEqual((await command(pair.source,{type:'knot.delete',id:'A'})).body,{ok:true,value:true});
 assert.equal((await command(pair.current,{type:'knot.delete',id:'A'})).body.error.code,'UNSUPPORTED_COMMAND');
 const sourceEvents=(await frames(pair.source,0,16)).events;
 const queued=sourceEvents.filter(e=>Number.isInteger(e.cmdSeq));
 assert.equal(queued.length,12);
 assert.deepEqual(queued.map(e=>e.type),canvas,'original payload.type overwrites command.queued event type');
 assert.equal((await frames(pair.current,0,5)).events.some(e=>Number.isInteger(e.cmdSeq)),false);
 assert.equal((await snapshot(pair.source)).seq,27,'source allocates cmdSeq and a second event seq for each queued command');
 assert.equal((await snapshot(pair.current)).seq,4,'current slice sequences only its two creates and two executed rope changes');
});

test('SSE cursor validation and cold-start reset are intentional differences, not normalized away',async t=>{
 const pair=await fixture(t);
 for(const base of [pair.source,pair.current])await command(base,{type:'knot.create',id:'cold',data:asset});
 for(const cursor of ['invalid','999']){
  assert.equal((await frames(pair.source,cursor)).status,200);
  const current=await frames(pair.current,cursor);assert.equal(current.status,400);assert.equal(current.body.error.code,'INVALID_CURSOR');
 }
 await pair.restart();
 const state=await Promise.all([pair.source,pair.current].map(snapshot));assert.deepEqual(documentOf(state[0]),documentOf(state[1]));assert.equal(state[0].seq,1);
 const cold=await Promise.all([frames(pair.source,0),frames(pair.current,0,2)]);
 assert.equal(cold[0].events.length,0);assert.doesNotMatch(cold[0].text,/event: reset/);
 assert.match(cold[1].text,/event: reset/);assert.match(cold[1].text,/"snapshotRequired":true/);
});
