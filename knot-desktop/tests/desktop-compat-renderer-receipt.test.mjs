import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const key=Symbol.for('kont.renderer.receipt.v1');
async function fixture() {
 const bundle=await readFile(new URL('../packages/dsh-plugin/lib/client.js',import.meta.url),'utf8');
 let definition;
 const window={__ModuleLoader__:{load:row=>{definition=row;}},addEventListener(){},removeEventListener(){}};
 runInNewContext(bundle,{window,document:{createElement:()=>({remove(){}}),head:{appendChild(){}}}});
 const plugin=definition.factory(()=>({}));
 const instance=(failSlot)=>{
  const effects=[],pending=new Map(),installed=new Map();
  const ctx={effect:fn=>{const dispose=fn();effects.push(dispose);return dispose;},slots:{
   inject:(name,callback)=>{pending.set(name,callback);},
   register:(spec)=>{
    const field=spec.name==='main'?'mainRegistered':'sidebarRegistered';
    assert.equal(window[key][field],false,'not ready before register returns');
    if(spec.name===failSlot)throw Error('registration rejected');
    return ()=>installed.delete(spec.name);
   }
  }};
  return {apply:()=>plugin.apply(ctx),declare:name=>{const dispose=pending.get(name)();installed.set(name,dispose);return dispose;},dispose:()=>{[...installed.values()].reverse().forEach(fn=>fn());effects.reverse().forEach(fn=>fn());}};
 };
 return {window,instance};
}

test('renderer receipt follows successful slot registrations, collapse and disposal',async()=>{
 const {window,instance}=await fixture();
 assert.equal(window[key],undefined,'bundle download is not application');
 const first=instance();first.apply();
 assert.deepEqual(JSON.parse(JSON.stringify(window[key])),{module:'@kont/dsh-plugin',version:'0.1.0',active:true,mainRegistered:false,sidebarRegistered:false});
 const descriptor=Object.getOwnPropertyDescriptor(window,key);
 assert.equal(descriptor.set,undefined);assert.equal(descriptor.enumerable,false);assert.ok(Object.isFrozen(window[key]));
 assert.throws(()=>{window[key]={active:true};},TypeError);
 const collapse=first.declare('main'); assert.equal(window[key].mainRegistered,true);assert.equal(window[key].sidebarRegistered,false);
 first.declare('sidebar.panellist');assert.equal(window[key].sidebarRegistered,true);
 collapse();assert.equal(window[key].mainRegistered,false);
 first.dispose();assert.equal(window[key],undefined);
});

test('renderer receipt rejects partial failure and never exposes readiness after reload/disposal',async()=>{
 const {window,instance}=await fixture();
 const old=instance();old.apply();old.declare('main');old.declare('sidebar.panellist');
 const next=instance();next.apply();assert.equal(window[key].mainRegistered,false);
 old.dispose();assert.equal(window[key].active,true,'old disposer must preserve the newer instance');
 next.declare('main');next.declare('sidebar.panellist');next.dispose();assert.equal(window[key],undefined);
 const failing=instance('sidebar.panellist');failing.apply();failing.declare('main');
 assert.throws(()=>failing.declare('sidebar.panellist'),/registration rejected/);
 assert.equal(window[key],undefined,'partial apply failure cannot publish ready');failing.dispose();
 const stopped=instance();stopped.apply();stopped.dispose();stopped.declare('main');assert.equal(window[key],undefined);
});
