import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

test('official YAML recorded-store parser rejects incompatible/missing metadata and redirected local paths', async t => {
  const root = await mkdtemp('D:/Temp/kont-store-parser-');
  t.after(async () => { const target = resolve(root); assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(basename(target).startsWith('kont-store-parser-')); await rm(target, { recursive: true, force: true }); });
  const worker = `
    const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{join}=require('node:path'),{pathToFileURL}=require('node:url');
    (async()=>{const root=${JSON.stringify(root)};
    const {resolveDesktopProfileStore:read}=await import(${JSON.stringify(new URL('../scripts/desktop-pnpm-store.mjs', import.meta.url).href)});
    const yaml=require('node:module').createRequire('D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json')('yaml');
    const profile=join(root,'profile'),store=join(root,'store/v11'),privateStore=join(root,'private-store');
    await fs.mkdir(profile);await fs.mkdir(store,{recursive:true});
    assert.equal((await read(profile,privateStore)).source,'empty-profile');
    const redirect=join(root,'private-redirect');await fs.mkdir(redirect);await fs.symlink(redirect,privateStore,'junction');
    await assert.rejects(read(profile,privateStore),{code:'STORE_REDIRECTED'});await fs.unlink(privateStore);
    const modules=join(profile,'node_modules'),manifest=join(modules,'.modules.yaml');await fs.mkdir(modules);
    await assert.rejects(read(profile,privateStore),{code:'MODULES_MANIFEST_REQUIRED'});
    const valid={packageManager:'pnpm@11.28.5',storeDir:store,layoutVersion:5};
    const write=async value=>fs.writeFile(manifest,yaml.stringify(value));
    await write(valid);const result=await read(profile,privateStore);assert.equal(result.source,'recorded-profile');assert.equal(result.storeDir,store);assert.equal(result.manifestSha256.length,64);assert.ok(Object.isFrozen(result));
    let rejected=0;
    for(const storeDir of ['../store/v11','https://elsewhere/v11','\\\\\\\\host\\\\store\\\\v11','\\\\\\\\?\\\\D:\\\\store\\\\v11','D:relative/v11',join(root,'store/v10'),join(root,'missing/v11'),store+'/../v11',store+' ']){
      await write({...valid,storeDir});await assert.rejects(read(profile,privateStore));rejected++;
    }
    for(const packageManager of ['pnpm@10.0.0','npm@11.28.5',null]){await write({...valid,packageManager});await assert.rejects(read(profile,privateStore),{code:'INCOMPATIBLE_RECORDED_STORE'});rejected++;}
    for(const raw of ['storeDir: x\\nstoreDir: y\\n','[unclosed','a: &a [1]\\nb: *a\\n','x'.repeat(1024*1024+1)]){await fs.writeFile(manifest,raw);await assert.rejects(read(profile,privateStore),{code:'INVALID_MODULES_MANIFEST'});rejected++;}
    const redirected=join(root,'redirect/v11');await fs.mkdir(redirected,{recursive:true});const link=join(root,'link');await fs.symlink(join(root,'redirect'),link,'junction');
    await write({...valid,storeDir:join(link,'v11')});await assert.rejects(read(profile,privateStore),{code:'STORE_REDIRECTED'});rejected++;
    console.log(JSON.stringify({officialYaml:true,negativeCases:rejected,productionProfileTouched:false}));
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `;
  const result = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['-e', worker],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout.trim()).negativeCases, 17);
});
