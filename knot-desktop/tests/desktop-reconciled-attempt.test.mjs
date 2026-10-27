import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,copyFile,writeFile,readFile,rm,access } from 'node:fs/promises';
import { join,resolve,dirname,basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const parent='928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9';
async function removeFixture(root,prefix){const target=resolve(root);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith(prefix));await rm(target,{recursive:true,force:true});}
// Synthetic eligibility only. Official installation is separately tested.
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'kont-reconciled-'));t.after(()=>removeFixture(root,'kont-reconciled-'));await mkdir(join(root,'scripts'));
 for(const n of ['desktop-install-execution.mjs','desktop-host-client.mjs'])await copyFile('scripts/'+n,join(root,'scripts',n));
 await writeFile(join(root,'marker'),'b');
 await writeFile(join(root,'scripts/desktop-recovery-preflight.mjs'),`import{resolve}from'node:path';import{fileURLToPath}from'node:url';const root=fileURLToPath(new URL('../',import.meta.url)),plans=new WeakSet();export async function prepareDesktopRecoveryPreflight(){const p={expiresAt:Date.now()+300000,upgrade:{spec:'file:'+resolve(root,'evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle').replaceAll('\\\\','/'),manifestSha256:'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8'},recovery:{manifestSha256:'774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d'},data:{sourceSha256:'a'.repeat(64),productionDeploymentAccepted:false},deploymentReady:false};plans.add(p);return p}export function createRecoveryPreflightManager(e,{plan}){if(!plans.has(plan))throw Error('UNISSUED');return{inspectUpgrade:async()=>e('SYNTHETIC')}}`);
 await writeFile(join(root,'scripts/desktop-reconciled-evidence.mjs'),`import{readFile}from'node:fs/promises';export async function prepareFixedReconciledEvidence(){return{parentDescriptorSha256:'${parent}',originalDataSha256:'a'.repeat(64),evidenceSha256:(await readFile(new URL('../marker',import.meta.url),'utf8')).repeat(64)}}export async function recheckFixedReconciledEvidence(e){if(JSON.stringify(e)!==JSON.stringify(await prepareFixedReconciledEvidence()))throw Error('SYNTHETIC_DRIFT')}`);
 const api=await import(pathToFileURL(join(root,'scripts/desktop-install-execution.mjs')));
 const prepare=async()=>{const plan=await api.prepareReconciledDeploymentApproval();const declaration={approved:true,kind:'synthetic-test',action:'upgrade',descriptorSha256:plan.descriptorSha256,expiresAt:plan.expiresAt,statement:'SYNTHETIC ONLY'};return{plan,declaration,approval:api.approveDeployment(plan,declaration)}};
 const ledger=join(root,'.runtime/desktop-install/synthetic-test');return{root,api,prepare,ledger,link:join(ledger,parent+'.remediation.claim.json')};
}
test('synthetic child: authorization required, stable descriptor and permanent single successor across changed evidence',async t=>{
 const f=await fixture(t),a=await f.prepare(),b=await f.prepare();assert.equal(a.plan.descriptorSha256,b.plan.descriptorSha256);
 assert.throws(()=>f.api.approveDeployment(a.plan,{...a.declaration,approved:false}),{code:'APPROVAL_BINDING'});
 assert.throws(()=>f.api.approveDeployment(a.plan,{...a.declaration,action:'recovery'}),{code:'APPROVAL_BINDING'});
 await assert.rejects(f.api.executeApprovedUpgrade({...a.approval},{evaluate(){assert.fail()}}),{code:'UNISSUED_APPROVAL'});
 let calls=0;const evaluate=async(e,m)=>{calls++;f.api.consumeInstallationTransportPermit(m.dispatchPermit,m.approval);return{changed:true,application:'restart-required',packageResult:{exitCode:0}}};
 const r=await Promise.all([a,b].map(x=>f.api.executeApprovedUpgrade(x.approval,{evaluate})));assert.equal(calls,1);assert.equal(r.filter(x=>x.acquired).length,1);
 const old=await readFile(f.link);await writeFile(join(f.root,'marker'),'c');const c=await f.prepare();assert.notEqual(c.plan.descriptorSha256,a.plan.descriptorSha256);
 assert.equal((await f.api.executeApprovedUpgrade(c.approval,{evaluate})).code,'PARENT_SUCCESSOR_EXISTS');assert.deepEqual(await readFile(f.link),old);assert.equal(calls,1);
});
test('synthetic child: partial child claim retains permanent parent link',async t=>{
 const f=await fixture(t),a=await f.prepare();await mkdir(f.ledger,{recursive:true});await mkdir(join(f.ledger,a.plan.descriptorSha256+'.claim.json'));
 assert.equal((await f.api.executeApprovedUpgrade(a.approval,{evaluate(){assert.fail()}})).code,'RESERVATION_EXISTS');await access(f.link);
 assert.equal((await f.api.executeApprovedUpgrade((await f.prepare()).approval,{evaluate(){assert.fail()}})).code,'PARENT_SUCCESSOR_EXISTS');
});
test('synthetic child: parent/child byte tampering blocked at permit and manager boundary; timeout cannot replay',async t=>{
 for(const phase of ['parent-before','child-before','parent-after','child-after','timeout']){
 const f=await fixture(t),a=await f.prepare();const result=await f.api.executeApprovedUpgrade(a.approval,{timeoutMs:20,evaluate:async(e,m)=>{
 if(phase==='timeout')return new Promise(()=>{});
 const path=phase.startsWith('parent')?f.link:join(f.ledger,a.plan.descriptorSha256+'.claim.json');
 if(phase.endsWith('after'))f.api.consumeInstallationTransportPermit(m.dispatchPermit,m.approval);
 await writeFile(path,'{}');assert.throws(()=>phase.endsWith('before')?f.api.consumeInstallationTransportPermit(m.dispatchPermit,m.approval):f.api.getInstallationTransportAuthorization(m.approval),{code:'TRANSPORT_RESERVATION_CHANGED'});return null;
 }});assert.equal(result.state,'uncertain');assert.equal((await f.api.executeApprovedUpgrade((await f.prepare()).approval,{evaluate(){assert.fail()}})).code,'PARENT_SUCCESSOR_EXISTS');
 }
});
test('writer guard: mocked CIM zero/writer/error fail closed without exposing command lines',async t=>{
 const root=await mkdtemp(join(tmpdir(),'kont-writer-'));t.after(()=>removeFixture(root,'kont-writer-'));let source=await readFile('scripts/desktop-reconciled-evidence.mjs','utf8');source=source.replace("from 'node:child_process'","from './fake-process.mjs'").replace("from './desktop-pnpm-store.mjs'","from './fake-store.mjs'");
 await writeFile(join(root,'fake-store.mjs'),'export function resolveDesktopProfileStore(){throw Error("NOT_CALLED")}');
 await writeFile(join(root,'fake-process.mjs'),"import{promisify}from'node:util';export function execFile(){};execFile[promisify.custom]=async()=>{if(globalThis.writerMode==='error')throw Error('PRIVATE');return{stdout:globalThis.writerMode}};");
 await writeFile(join(root,'guard.mjs'),source);const api=await import(pathToFileURL(join(root,'guard.mjs')));
 globalThis.writerMode='0';assert.equal((await api.assertNoOfficialPackageWriter()).officialPackageWriterCount,0);
 globalThis.writerMode='1';await assert.rejects(api.assertNoOfficialPackageWriter(),{code:'OFFICIAL_PACKAGE_WRITER_PRESENT'});
 globalThis.writerMode='error';await assert.rejects(api.assertNoOfficialPackageWriter(),{code:'PACKAGE_WRITER_CHECK_UNAVAILABLE'});delete globalThis.writerMode;
});
