import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, cp, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

// Real official manager/pnpm and fixed 014 package bytes; authority, 018 and
// reconciliation evidence are explicitly SYNTHETIC in this private module root.
test('synthetic reconciled child installs once via official manager with existing store/file/link dependencies, preserving its failed parent', async t => {
  const root = await mkdtemp('D:/Temp/kont-official-install-test-');
  t.after(async () => { const target = resolve(root); assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(basename(target).startsWith('kont-official-install-test-')); await rm(target, { recursive: true, force: true }); });
  await mkdir(join(root, 'scripts'));
  for (const name of ['desktop-install-execution.mjs', 'desktop-quiescent-install.mjs', 'desktop-pnpm-store.mjs',
    'desktop-install-transport-policy.mjs', 'desktop-host-client.mjs', 'prepare-desktop-candidate.mjs'])
    await copyFile(join('scripts', name), join(root, 'scripts', name));
  await cp(resolve('evidence/local/20261024-desktop-package/candidate'),
    join(root, 'evidence/local/20261024-desktop-package/candidate'), { recursive: true });
  await writeFile(join(root, 'scripts/desktop-recovery-preflight.mjs'), `
    import{fileURLToPath}from'node:url';import{resolve}from'node:path';
    const root=fileURLToPath(new URL('../',import.meta.url)),plans=new WeakSet();
    export async function prepareDesktopRecoveryPreflight(){const p={expiresAt:Date.now()+300000,upgrade:{spec:'file:'+resolve(root,'evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle').replaceAll('\\\\','/'),manifestSha256:'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8'},recovery:{manifestSha256:'774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d'},data:{sourceSha256:'a'.repeat(64),productionDeploymentAccepted:false},deploymentReady:false};plans.add(p);return p;}
    export function createRecoveryPreflightManager(evaluate,{plan}){if(!plans.has(plan))throw Error('SYNTHETIC_UNISSUED_PLAN');return{inspectUpgrade:async()=>evaluate('SYNTHETIC_018_NO_PRODUCTION_FENCE')};}
  `);
  await writeFile(join(root, 'scripts/desktop-reconciled-evidence.mjs'), `
    import{readFile}from'node:fs/promises';import{resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
    const root=fileURLToPath(new URL('../',import.meta.url));
    export async function prepareFixedReconciledEvidence(){const e=JSON.parse(await readFile(resolve(root,'synthetic-evidence.json'),'utf8'));for(const[k,h]of Object.entries(e.parentRecordHashes)){const bytes=await readFile(resolve(root,'.runtime/desktop-install/synthetic-test',e.parentDescriptorSha256+'.'+k+'.json'));if(createHash('sha256').update(bytes).digest('hex')!==h)throw Error('SYNTHETIC_PARENT_DRIFT');}return e;}
    export async function recheckFixedReconciledEvidence(expected){if(JSON.stringify(await prepareFixedReconciledEvidence())!==JSON.stringify(expected))throw Error('SYNTHETIC_RECONCILIATION_DRIFT');}
  `);
  const worker = `
    const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{createRequire}=require('node:module'),{join,dirname}=require('node:path'),{pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
    (async()=>{const root=${JSON.stringify(root)},profile=join(root,'profile'),runtime='D:/DSH-Desktop/app/resources/runtime/primary-runtime/dependencies';
    const sha=b=>createHash('sha256').update(b).digest('hex');await fs.mkdir(profile);
    for(const kind of ['file','link']){const dir=join(root,'keep-'+kind);await fs.mkdir(dir);await fs.writeFile(join(dir,'package.json'),JSON.stringify({name:'@local/keep-'+kind,version:'1.0.0',main:'index.cjs'}));await fs.writeFile(join(dir,'index.cjs'),'module.exports="SYNTHETIC_KEEP_'+kind+'";');}
    const dependencies={'@local/keep-file':'file:../keep-file','@local/keep-link':'link:../keep-link'},selection=['@local/keep-file'];
    await fs.writeFile(join(profile,'package.json'),JSON.stringify({name:'synthetic-reconciled-profile',private:true,dependencies,dsh:{profile:{bundles:selection}}}));await fs.writeFile(join(profile,'cordis.patch.yml'),'[]\\n');
    const seed=spawnSync(join(runtime,'node/bin/node.exe'),[join(runtime,'pnpm/bin/pnpm.cjs'),'install','--offline','--ignore-scripts','--config.auto-install-peers=false','--store-dir',join(root,'existing-store')],{cwd:profile,env:{...process.env,HOME:root,USERPROFILE:root},encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(seed.status,0,seed.stderr||seed.stdout);
    const official=createRequire('D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json'),yaml=official('yaml');
    const storeBefore=yaml.parse(await fs.readFile(join(profile,'node_modules/.modules.yaml'),'utf8')).storeDir;
    const apiUrl=pathToFileURL(join(root,'scripts/desktop-install-execution.mjs')).href,api=await import(apiUrl);
    const initial=await api.prepareDeploymentApproval(),parent='928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9';
    const ledger=join(root,'.runtime/desktop-install/synthetic-test');await fs.mkdir(ledger,{recursive:true});
    const parentRecords={claim:{state:'reserved',approvalHash:parent},transport:{approvalHash:parent,attemptedAt:'SYNTHETIC_PREVIOUS_ATTEMPT'},result:{approvalHash:parent,state:'uncertain',managerReceipt:{changed:false,application:'failed',packageResult:{exitCode:1}}}};
    const parentRecordHashes={};for(const[k,v]of Object.entries(parentRecords)){const bytes=Buffer.from(JSON.stringify(v));await fs.writeFile(join(ledger,parent+'.'+k+'.json'),bytes,{flag:'wx'});parentRecordHashes[k]=sha(bytes);}
    await fs.writeFile(join(ledger,initial.descriptorSha256+'.claim.json'),JSON.stringify({state:'reserved',syntheticInitialDescriptor:true}),{flag:'wx'});
    const binding={parentDescriptorSha256:parent,originalDataSha256:'a'.repeat(64),parentRecordHashes,syntheticAuthority:true,failureReviewSha256:'b'.repeat(64),repairManifestSha256:'c'.repeat(64)};
    await fs.writeFile(join(root,'synthetic-evidence.json'),JSON.stringify({...binding,evidenceSha256:sha(JSON.stringify(binding))}));
    const approve=plan=>api.approveDeployment(plan,{approved:true,kind:'synthetic-test',action:'upgrade',descriptorSha256:plan.descriptorSha256,expiresAt:plan.expiresAt,statement:'SYNTHETIC FOLLOWUP ONLY - NOT HUMAN PRODUCTION AUTHORIZATION'});
    let calls=0;assert.equal((await api.executeApprovedUpgrade(approve(initial),{evaluate(){calls++;}})).code,'RESERVATION_EXISTS');
    const plan=await api.prepareReconciledDeploymentApproval();assert.notEqual(plan.descriptorSha256,parent);assert.equal(plan.descriptor.reconciliation.parentDescriptorSha256,parent);
    await assert.rejects(api.executeApprovedUpgrade(undefined,{evaluate(){calls++;}}),{code:'UNISSUED_APPROVAL'});
    const approval=approve(plan),transportApi=await import(pathToFileURL(join(root,'scripts/desktop-quiescent-install.mjs')).href),transport=transportApi.createIsolatedDesktopInstallTransport();
    const evaluate=async(expression,options)=>{calls++;const link=JSON.parse(await fs.readFile(join(ledger,parent+'.remediation.claim.json'),'utf8'));assert.equal(link.childDescriptorSha256,plan.descriptorSha256);assert.equal(link.parentDescriptorSha256,parent);return transport.evaluate(expression,options);};
    const results=await Promise.all(Array.from({length:6},()=>api.executeApprovedUpgrade(approval,{evaluate,timeoutMs:20000})));
    assert.equal(calls,1);assert.equal(results.filter(r=>r.acquired).length,1);const result=results.find(r=>r.acquired);assert.equal(result.state,'submitted');assert.equal(result.managerReceipt.application,'restart-required');assert.equal(result.managerReceipt.packageResult.exitCode,0);await transport.close();
    const rebuilt=await api.prepareReconciledDeploymentApproval();assert.equal(rebuilt.descriptorSha256,plan.descriptorSha256);assert.equal((await api.executeApprovedUpgrade(approve(rebuilt),{evaluate})).code,'PARENT_SUCCESSOR_EXISTS');
    const reopen='(async()=>{const a=await import('+JSON.stringify(apiUrl)+');const p=await a.prepareReconciledDeploymentApproval();const t=a.approveDeployment(p,{approved:true,kind:"synthetic-test",action:"upgrade",descriptorSha256:p.descriptorSha256,expiresAt:p.expiresAt,statement:"SYNTHETIC REOPEN ONLY"});let calls=0;const r=await a.executeApprovedUpgrade(t,{evaluate(){calls++;}});console.log(JSON.stringify({code:r.code,calls}));})().catch(()=>process.exitCode=1)';
    const child=spawnSync(process.execPath,['-e',reopen],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(child.status,0,child.stderr||child.stdout);assert.deepEqual(JSON.parse(child.stdout),{code:'PARENT_SUCCESSOR_EXISTS',calls:0});
    for(const[k,h]of Object.entries(parentRecordHashes))assert.equal(sha(await fs.readFile(join(ledger,parent+'.'+k+'.json'))),h);
    assert.equal((await fs.readdir(ledger)).filter(n=>n.endsWith('.remediation.claim.json')).length,1);
    const req=createRequire(join(profile,'package.json')),bundle=req.resolve('@kont/desktop-bundle/package.json'),plugin=createRequire(bundle).resolve('@kont/dsh-plugin/package.json');
    const candidate=join(root,'evidence/local/20261024-desktop-package/candidate'),manifest=JSON.parse(await fs.readFile(join(candidate,'manifest.json'),'utf8'));
    for(const file of manifest.files){const prefix=file.path.startsWith('packages/desktop-bundle/')?'packages/desktop-bundle/':'packages/dsh-plugin/';assert.deepEqual(await fs.readFile(join(prefix.includes('desktop-bundle')?dirname(bundle):dirname(plugin),file.path.slice(prefix.length))),await fs.readFile(join(candidate,file.path)));}
    const after=JSON.parse(await fs.readFile(join(profile,'package.json'),'utf8'));for(const[name,spec]of Object.entries(dependencies))assert.equal(after.dependencies[name],spec);assert.deepEqual(after.dsh.profile.bundles.filter(n=>n!=='@kont/desktop-bundle'),selection);
    assert.equal(req('@local/keep-file'),'SYNTHETIC_KEEP_file');assert.equal(req('@local/keep-link'),'SYNTHETIC_KEEP_link');assert.equal(yaml.parse(await fs.readFile(join(profile,'node_modules/.modules.yaml'),'utf8')).storeDir,storeBefore);
    console.log(JSON.stringify({syntheticAuthority:true,mock018:true,mockReconciledEvidence:true,officialManager:true,officialOfflinePnpm:true,installCalls:calls,filesMatched:manifest.files.length,parentRecordsPreserved:3,uniqueParentChildLink:true,rebuildAndProcessReopenRejected:true,initialReplayRejected:true,existingStoreAndNonKnotDependenciesPreserved:true,application:result.managerReceipt.application,productionProfileTouched:false,humanGrantIssued:false,modelCalls:0}));
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `;
  const result = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['-e', worker],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 40000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.installCalls, 1); assert.equal(receipt.filesMatched, 25); assert.equal(receipt.parentRecordsPreserved, 3);
  if (process.env.KONT_RECONCILED_TEST_RECEIPT) await writeFile(process.env.KONT_RECONCILED_TEST_RECEIPT, JSON.stringify(receipt, null, 2));
});
