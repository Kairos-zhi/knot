import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

// Isolated module copies with explicitly SYNTHETIC 016/data-helper seams.
// Never write/read production data, profile, or historical frozen artifacts.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kont-paired-preflight-'));
  t.after(async () => { const target = resolve(root); assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('kont-paired-preflight-')); await rm(target, { recursive: true, force: true }); });
  await mkdir(join(root, 'scripts'));
  for (const name of ['desktop-recovery-preflight.mjs', 'prepare-desktop-recovery.mjs', 'prepare-desktop-candidate.mjs', 'prepare-desktop-rollback.mjs', 'desktop-host-client.mjs'])
    await copyFile(`scripts/${name}`, join(root, 'scripts', name));
  for (const unit of ['desktop-package', 'desktop-rollback', 'desktop-recovery']) {
    const part = `evidence/local/20261024-${unit}/candidate`;
    await cp(part, join(root, part), { recursive: true });
  }
  await writeFile(join(root, 'source.marker'), 'SYNTHETIC_SOURCE_UNCHANGED');
  await writeFile(join(root, 'data.fixture'), 'SYNTHETIC_DATA_UNCHANGED');
  await writeFile(join(root, 'scripts/desktop-deployment-plan.mjs'), `
    import{readFile}from'node:fs/promises';import{resolve}from'node:path';import{fileURLToPath}from'node:url';
    import{managerExpression,INSTALL_SPEC}from'./desktop-host-client.mjs';
    const root=fileURLToPath(new URL('../',import.meta.url)), issued=new WeakSet();
    async function fence(){if(await readFile(resolve(root,'source.marker'),'utf8')!=='SYNTHETIC_SOURCE_UNCHANGED'){const e=new Error('Synthetic source changed');e.code='SOURCE_CHANGED';throw e;}}
    export async function prepareDesktopDeploymentPlan(){await fence();const p=Object.freeze({expiresAt:Date.now()+600000,upgrade:Object.freeze({spec:'file:'+resolve(root,'evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle').replaceAll('\\\\','/'),manifestSha256:'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8'})});issued.add(p);return p;}
    export function createReviewedDesktopManager(evaluate,{plan}){if(!issued.has(plan))throw Error('Synthetic unissued inherited plan');return{async inspectUpgrade(){await fence();const expr=managerExpression('pluginManager/inspect',{spec:INSTALL_SPEC}).replace(JSON.stringify(INSTALL_SPEC),JSON.stringify(plan.upgrade.spec));return evaluate(expr);}};}
  `);
  await writeFile(join(root, 'scripts/desktop-installed-data-preflight.mjs'), `
    import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
    const data=new URL('../data.fixture',import.meta.url);const sha=b=>createHash('sha256').update(b).digest('hex');
    export async function probeInstalledDesktopData(){return{sourceSha256:sha(await readFile(data)),schemaVersion:4,assetCount:1,runCount:1,validatedOnPrivateTemporaryCopy:true,readAndWriteRoundTripPreserved:true,productionFileUnchanged:true,productionDeploymentAccepted:false,privateFixture:'SYNTHETIC_PRIVATE_NOT_EXPOSED'};}
    export async function recheckInstalledDesktopData(expected){if(sha(await readFile(data))!==expected){const e=new Error('Synthetic data changed');e.code='SOURCE_CHANGED';throw e;}return{productionFileUnchanged:true};}
  `);
  const api = await import(pathToFileURL(join(root, 'scripts/desktop-recovery-preflight.mjs')).href);
  return { root, api };
}

test('paired plan consumes internal probe, retains blocked readiness, and sends exact upgrade/recovery/list RPC only', async t => {
  const { root, api } = await fixture(t), plan = await api.prepareDesktopRecoveryPreflight();
  assert.equal(plan.deploymentReady, false); assert.equal(plan.data.productionDeploymentAccepted, false);
  assert.equal(plan.recovery.manifestSha256, api.REVIEWED_RECOVERY_SHA256);
  assert.equal(Object.isFrozen(plan.data), true); assert.equal(JSON.stringify(plan).includes('SYNTHETIC_PRIVATE_NOT_EXPOSED'), false);
  const requests = [];
  const manager = api.createRecoveryPreflightManager(expression => vm.runInNewContext(expression, {
    location: { protocol: 'dsh-app:', hostname: 'app' }, fetch: async (url, options) => {
      const request = JSON.parse(options.body); requests.push(request);
      assert.equal(url, `/api/${request.method}`); assert.equal(options.credentials, 'same-origin');
      return { ok: true, json: async () => ({ type: 'server-response', rpcId: request.rpcId,
        result: { ok: true, value: request.method === 'pluginManager/inspect' ? { status: 'accepted' } : [] } }) };
    },
  }), { plan });
  assert.deepEqual(await manager.inspectUpgrade(), { status: 'accepted' });
  assert.deepEqual(await manager.inspectRecovery(), { status: 'accepted' });
  assert.equal(requests[0].payload.args.spec, plan.upgrade.spec);
  assert.equal(requests[1].payload.args.spec, `file:${join(root, 'evidence/local/20261024-desktop-recovery/candidate/packages/desktop-bundle').replaceAll('\\', '/')}`);
  await manager.listBundles(); await manager.listPlugins();
  assert.deepEqual(requests.map(r => r.method), ['pluginManager/inspect', 'pluginManager/inspect', 'pluginManager/listBundles', 'pluginManager/listPlugins']);
  const before = requests.length;
  await assert.rejects(manager.installBundle('upgrade'), { code: 'INSTALL_OPT_IN_REQUIRED' });
  await assert.rejects(manager.installBundle('upgrade', { allowInstall: true }), { code: 'DEPLOYMENT_AUTHORIZATION_REQUIRED' });
  await assert.rejects(manager.installBundle('recovery', { allowInstall: true }), { code: 'DEPLOYMENT_AUTHORIZATION_REQUIRED' });
  assert.equal(requests.length, before);
});

test('paired plans reject caller reports/spec/phase/pin, clones, forgeries and expiry before evaluation', async t => {
  const { api } = await fixture(t), plan = await api.prepareDesktopRecoveryPreflight(); let calls = 0;
  for (const option of ['datareport', 'phase', 'pin', 'spec'])
    await assert.rejects(api.prepareDesktopRecoveryPreflight({ [option]: 'caller-value' }), { code: 'UNKNOWN_OPTIONS' });
  for (const forged of [{}, structuredClone(plan), { ...plan, deploymentReady: true }])
    assert.throws(() => api.createRecoveryPreflightManager(() => { calls++; }, { plan: forged }), { code: 'UNISSUED_PLAN' });
  const manager = api.createRecoveryPreflightManager(() => { calls++; }, { plan });
  await assert.rejects(manager.installBundle('recovery', { allowInstall: true, dataCompatible: true }), { code: 'UNKNOWN_OPTIONS' });
  t.mock.method(Date, 'now', () => plan.expiresAt + 1);
  await assert.rejects(manager.inspectUpgrade(), { code: 'EXPIRED_PLAN' });
  await assert.rejects(manager.inspectRecovery(), { code: 'EXPIRED_PLAN' });
  await assert.rejects(manager.installBundle('upgrade', { allowInstall: true }), { code: 'EXPIRED_PLAN' });
  assert.equal(calls, 0);
});

test('each paired inspect fences data/source drift and complete recovery inventory before evaluation', async t => {
  const { root, api } = await fixture(t), plan = await api.prepareDesktopRecoveryPreflight(); let calls = 0;
  const manager = api.createRecoveryPreflightManager(() => { calls++; }, { plan });
  await writeFile(join(root, 'data.fixture'), 'SYNTHETIC_CHANGED');
  await assert.rejects(manager.inspectUpgrade(), { code: 'SOURCE_CHANGED' });
  await assert.rejects(manager.inspectRecovery(), { code: 'SOURCE_CHANGED' });
  await writeFile(join(root, 'data.fixture'), 'SYNTHETIC_DATA_UNCHANGED');
  await writeFile(join(root, 'source.marker'), 'SYNTHETIC_CHANGED');
  await assert.rejects(manager.inspectRecovery(), { code: 'SOURCE_CHANGED' });
  await writeFile(join(root, 'source.marker'), 'SYNTHETIC_SOURCE_UNCHANGED');
  const extra = join(root, 'evidence/local/20261024-desktop-recovery/candidate/extra.json'); await writeFile(extra, '{}');
  await assert.rejects(manager.inspectUpgrade(), /extra file/);
  assert.equal(calls, 0);
});
