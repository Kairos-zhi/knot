import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { managerExpression, INSTALL_SPEC } from '../scripts/desktop-host-client.mjs';
import { validateDesktopInstallExpression } from '../scripts/desktop-install-transport-policy.mjs';
const candidate = resolve('evidence/local/20261024-desktop-package/candidate');
function expression(method, args) {
  return managerExpression(method, { ...args, spec: INSTALL_SPEC }, { allowInstall: true })
    .replace(JSON.stringify(INSTALL_SPEC), JSON.stringify(`file:${join(candidate, 'packages/desktop-bundle').replaceAll('\\', '/')}`));
}
test('transport accepts only exact official JSON envelope and rejects arbitrary JS or unreviewed install options', () => {
  const value = expression('pluginManager/installBundle', { options: { enabled: true, saveExact: true, requestId: 'synthetic-request' } });
  assert.equal(validateDesktopInstallExpression(value).method, 'pluginManager/installBundle');
  for (const changed of [value + ';process.exit()', value.replace("credentials:'same-origin'", "credentials:'omit'"),
    value.replace('"enabled":true', '"enabled":false'), value.replace('"saveExact":true', '"saveExact":false'),
    value.replace('desktop-package/candidate', 'desktop-recovery/candidate'), 'globalThis.fetch("https://elsewhere.invalid")'])
    assert.throws(() => validateDesktopInstallExpression(changed), { code: 'UNREVIEWED_EXPRESSION' });
});
for (const existing of [false, true]) test(`synthetic approval executes one real official offline install (${existing ? 'existing file/link dependencies and recorded store' : 'empty profile'}) and cannot enter production transport`, async t => {
  const root = await mkdtemp('D:/Temp/kont-official-install-test-');
  t.after(async () => { const target = resolve(root); assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-official-install-test-')); await rm(target, { recursive: true, force: true }); });
  await mkdir(join(root, 'scripts'));
  for (const name of ['desktop-install-execution.mjs', 'desktop-quiescent-install.mjs', 'desktop-pnpm-store.mjs', 'desktop-install-transport-policy.mjs', 'desktop-host-client.mjs', 'prepare-desktop-candidate.mjs'])
    await copyFile(`scripts/${name}`, join(root, 'scripts', name));
  const copiedCandidate = join(root, 'evidence/local/20261024-desktop-package/candidate');
  await cp(candidate, copiedCandidate, { recursive: true });
  await mkdir(join(root, 'profile'));
  await writeFile(join(root, 'profile/package.json'), JSON.stringify({ name: 'isolated-official-upgrade', private: true, dsh: { profile: { bundles: [] } } }));
  await writeFile(join(root, 'profile/cordis.patch.yml'), '[]\n');
  await writeFile(join(root, 'scripts/desktop-recovery-preflight.mjs'), `
    import{fileURLToPath}from'node:url';import{resolve}from'node:path';
    const root=fileURLToPath(new URL('../',import.meta.url));const plans=new WeakSet();
    export async function prepareDesktopRecoveryPreflight(){const p={expiresAt:Date.now()+300000,upgrade:{spec:'file:'+resolve(root,'evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle').replaceAll('\\\\','/'),manifestSha256:'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8'},recovery:{manifestSha256:'774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d'},data:{sourceSha256:'a'.repeat(64),productionDeploymentAccepted:false},deploymentReady:false};plans.add(p);return p;}
    export function createRecoveryPreflightManager(evaluate,{plan}){if(!plans.has(plan))throw Error('SYNTHETIC_UNISSUED_PLAN');return{inspectUpgrade:async()=>evaluate('synthetic-readonly-preflight')};}
  `);
  const worker = `
    const assert=require('node:assert/strict'),{readFile}=require('node:fs/promises'),{createRequire}=require('node:module'),{dirname,join}=require('node:path'),{pathToFileURL}=require('node:url');
    (async()=>{const root=${JSON.stringify(root)};
    const existing=${existing};
    let recordedStore, originalSelection, originalDependencies;
    if(existing){
      const fs=require('node:fs/promises'),{spawnSync}=require('node:child_process');
      for(const type of ['file','link']){const dir=join(root,'keep-'+type);await fs.mkdir(dir);await fs.writeFile(join(dir,'package.json'),JSON.stringify({name:'@local/keep-'+type,version:'1.0.0',main:'index.cjs'}));await fs.writeFile(join(dir,'index.cjs'),'module.exports="SYNTHETIC_KEEP_'+type+'";');}
      const profilePath=join(root,'profile/package.json');const p=JSON.parse(await readFile(profilePath,'utf8'));
      p.dependencies={'@local/keep-file':'file:../keep-file','@local/keep-link':'link:../keep-link'};
      p.dsh.profile.bundles=['@local/keep-file'];await fs.writeFile(profilePath,JSON.stringify(p));
      originalSelection=[...p.dsh.profile.bundles];originalDependencies={...p.dependencies};
      const runtime='D:/DSH-Desktop/app/resources/runtime/primary-runtime/dependencies';
      const seed=spawnSync(join(runtime,'node/bin/node.exe'),[join(runtime,'pnpm/bin/pnpm.cjs'),'install','--offline','--ignore-scripts','--config.auto-install-peers=false','--store-dir',join(root,'existing-store')],{cwd:join(root,'profile'),env:{...process.env,HOME:root,USERPROFILE:root},encoding:'utf8',windowsHide:true,timeout:20000});
      assert.equal(seed.status,0,seed.stderr||seed.stdout);
      const official=require('node:module').createRequire('D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
      recordedStore=official('yaml').parse(await readFile(join(root,'profile/node_modules/.modules.yaml'),'utf8')).storeDir;
      assert.ok(recordedStore.replaceAll('\\\\','/').endsWith('/existing-store/v11'));
    }
    const api=await import(pathToFileURL(join(root,'scripts/desktop-install-execution.mjs')).href);
    const{managerExpression,INSTALL_SPEC}=await import(pathToFileURL(join(root,'scripts/desktop-host-client.mjs')).href);
    const transportApi=await import(pathToFileURL(join(root,'scripts/desktop-quiescent-install.mjs')).href);
    const plan=await api.prepareDeploymentApproval();const approval=api.approveDeployment(plan,{approved:true,kind:'synthetic-test',action:'upgrade',descriptorSha256:plan.descriptorSha256,expiresAt:plan.expiresAt,statement:'SYNTHETIC TEST ONLY - NO HUMAN DEPLOYMENT GRANT'});
    const transport=transportApi.createIsolatedDesktopInstallTransport();let calls=0,captured;
    const args={spec:plan.descriptor.upgradeSpec,options:plan.descriptor.options};
    const direct=managerExpression('pluginManager/installBundle',{spec:INSTALL_SPEC,options:args.options},{allowInstall:true}).replace(JSON.stringify(INSTALL_SPEC),JSON.stringify(args.spec));
    await assert.rejects(transport.evaluate(direct,{approval}),error=>/PERMIT/.test(error.code));
    await assert.rejects(transport.evaluate(direct,{approval,dispatchPermit:{}}),error=>/PERMIT/.test(error.code));
    const mislabeled=api.approveDeployment(plan,{approved:true,kind:'explicit-user-approval',action:'upgrade',descriptorSha256:plan.descriptorSha256,expiresAt:plan.expiresAt,statement:'SYNTHETIC NEGATIVE TEST - deliberately mislabeled kind, no human grant'});
    const copiedProd=transportApi.createQuiescentDesktopInstallTransport();await assert.rejects(copiedProd.evaluate(direct,{approval:mislabeled}),{code:'PRODUCTION_MODULE_ROOT_REQUIRED'});await copiedProd.close();
    const result=await api.executeApprovedUpgrade(approval,{evaluate:async(expression,options)=>{calls++;captured={expression,options};const prod=transportApi.createQuiescentDesktopInstallTransport();await assert.rejects(prod.evaluate(expression,options),{code:'EXPLICIT_INSTALL_APPROVAL_REQUIRED'});await prod.close();return transport.evaluate(expression,options);},timeoutMs:20000});
    assert.equal(result.state,'submitted');assert.equal(result.managerReceipt.packageResult.exitCode,0);assert.equal(result.managerReceipt.application,'restart-required');
    const repeated=await api.executeApprovedUpgrade(approval,{evaluate:()=>{calls++;throw Error('REPLAY');}});assert.equal(repeated.acquired,false);assert.equal(calls,1);
    const second=transportApi.createIsolatedDesktopInstallTransport();await assert.rejects(second.evaluate(captured.expression,captured.options),error=>/PERMIT/.test(error.code));await second.close();
    await transport.close();
    const req=createRequire(join(root,'profile/package.json'));const bundle=req.resolve('@kont/desktop-bundle/package.json');const plugin=createRequire(bundle).resolve('@kont/dsh-plugin/package.json');
    const manifest=JSON.parse(await readFile(join(root,'evidence/local/20261024-desktop-package/candidate/manifest.json'),'utf8'));for(const file of manifest.files){const prefix=file.path.startsWith('packages/desktop-bundle/')?'packages/desktop-bundle/':'packages/dsh-plugin/';const dir=prefix.includes('desktop-bundle')?dirname(bundle):dirname(plugin);assert.deepEqual(await readFile(join(dir,file.path.slice(prefix.length))),await readFile(join(root,'evidence/local/20261024-desktop-package/candidate',file.path)));}
    const profile=JSON.parse(await readFile(join(root,'profile/package.json'),'utf8'));assert.ok(profile.dsh.profile.bundles.includes('@kont/desktop-bundle'));
    if(existing){
      const official=require('node:module').createRequire('D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
      assert.equal(official('yaml').parse(await readFile(join(root,'profile/node_modules/.modules.yaml'),'utf8')).storeDir,recordedStore);
      for(const [name,spec]of Object.entries(originalDependencies))assert.equal(profile.dependencies[name],spec);
      assert.deepEqual(profile.dsh.profile.bundles.filter(n=>n!=='@kont/desktop-bundle'),originalSelection);
      assert.equal(req('@local/keep-file'),'SYNTHETIC_KEEP_file');assert.equal(req('@local/keep-link'),'SYNTHETIC_KEEP_link');
    }
    console.log(JSON.stringify({syntheticAuthorization:true,officialManagerInstall:true,enabled:true,application:result.managerReceipt.application,calls,filesMatched:manifest.files.length,existingDependencies:existing,recordedStorePreserved:existing,nonKnotDependenciesAndSelectionPreserved:existing,productionTransportRejectedSynthetic:true,directWithoutPermitRejected:true,reusedPermitRejected:true,productionProfileTouched:false,modelCalls:0}));
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  const result = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['-e', worker],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 35000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.filesMatched, 25); assert.equal(receipt.calls, 1);
  assert.equal(receipt.officialManagerInstall, true); assert.equal(receipt.productionProfileTouched, false);
  if (process.env.KONT_INSTALL_TEST_RECEIPT) await writeFile(process.env.KONT_INSTALL_TEST_RECEIPT + (existing ? '.existing.json' : '.empty.json'), JSON.stringify(receipt, null, 2));
});
