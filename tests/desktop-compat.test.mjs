import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

test('official Desktop 0.2.1 runtime serves the unchanged KONT kernel and awaits cleanup', () => {
 const executable=process.env.KONT_DESKTOP_EXECUTABLE || 'D:/DSH-Desktop/app/DeepSeek Harness.exe';
 const run=spawnSync(executable,['tests/desktop-compat-worker.cjs'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(run.status,0,run.stderr || run.stdout || String(run.error));
 assert.equal(JSON.parse(run.stdout.trim()).version,'0.2.1-rc.2');
});

test('official pnpm file bundle includes generated modules and resolves the sibling plugin', async () => {
 const dir=await mkdtemp('D:/Temp/kont-desktop-package-');
 try {
  await writeFile(join(dir,'package.json'),JSON.stringify({name:'kont-package-isolation',private:true}));
  const runtime='D:/DSH-Desktop/app/resources/runtime/primary-runtime/dependencies';
  const install=spawnSync(join(runtime,'node/bin/node.exe'),[join(runtime,'pnpm/bin/pnpm.cjs'),'--dir',dir,'add',`file:${resolve('packages/desktop-bundle')}`,'--offline','--config.auto-install-peers=false','--store-dir',join(dir,'store')],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(install.status,0,install.stderr+install.stdout);
  const profileRequire=createRequire(join(dir,'package.json'));
  const bundle=profileRequire.resolve('@kont/desktop-bundle/package.json');
  const pluginRequire=createRequire(bundle);
  const plugin=pluginRequire.resolve('@kont/dsh-plugin/package.json');
  assert.ok(!plugin.startsWith(resolve('packages')), 'file install must resolve copied package');
  for (const file of ['lib/client.js','lib/snapshot.js','lib/knot-model.js','lib/workspace-state.js','src/index.mjs','src/store.mjs','src/kernel.mjs']) {
   assert.deepEqual(await readFile(join(dirname(plugin),file)), await readFile(resolve('packages/dsh-plugin',file)),file);
  }
  assert.match(await readFile(plugin,'utf8'),/0\.1\.7-rc\.2 \|\| 0\.2\.1-rc\.2/);
  const actual=spawnSync(process.env.KONT_DESKTOP_EXECUTABLE || 'D:/DSH-Desktop/app/DeepSeek Harness.exe',['tests/desktop-compat-worker.cjs'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',KONT_PLUGIN_ENTRY:join(dirname(plugin),'src/index.mjs')},encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(actual.status,0,actual.stderr || actual.stdout);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
