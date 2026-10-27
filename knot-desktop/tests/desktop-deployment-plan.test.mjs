import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kont-deployment-plan-'));
  t.after(async () => { const target = resolve(root); assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('kont-deployment-plan-')); await rm(target, { recursive: true, force: true }); });
  await mkdir(join(root, 'scripts'));
  for (const name of ['desktop-deployment-plan.mjs', 'prepare-desktop-candidate.mjs', 'prepare-desktop-rollback.mjs', 'desktop-host-client.mjs'])
    await copyFile(`scripts/${name}`, join(root, 'scripts', name));
  for (const unit of ['desktop-package', 'desktop-rollback']) {
    const path = `evidence/local/20261024-${unit}/candidate`;
    await cp(path, join(root, path), { recursive: true });
  }
  const selection = 'evidence/local/20261024-desktop-rollback/controller/installed-selection.json';
  await mkdir(dirname(join(root, selection)), { recursive: true }); await copyFile(selection, join(root, selection));
  const api = await import(pathToFileURL(join(root, 'scripts/desktop-deployment-plan.mjs')).href);
  return { root, api };
}

test('reviewed plan pins both artifacts, exact inspect RPC, original source fence, and remains blocked; no live connection', async t => {
  const { root, api } = await fixture(t), plan = await api.prepareDesktopDeploymentPlan();
  assert.equal(plan.deploymentReady, false); assert.equal(plan.phase, 'pre-upgrade');
  assert.equal(plan.upgrade.manifestSha256, api.REVIEWED_UPGRADE_SHA256);
  assert.equal(plan.rollback.manifestSha256, api.REVIEWED_ROLLBACK_SHA256);
  assert.equal(Object.isFrozen(plan.upgrade), true);
  const requests = [];
  const manager = api.createReviewedDesktopManager(expression => vm.runInNewContext(expression, {
    location: { protocol: 'dsh-app:', hostname: 'app' }, fetch: async (url, options) => {
      const request = JSON.parse(options.body); requests.push(request);
      assert.equal(url, `/api/${request.method}`); assert.equal(options.credentials, 'same-origin');
      assert.equal(options.redirect, 'error');
      const value = request.method === 'pluginManager/inspect' ? { status: 'accepted', diagnostic: 'PRIVATE_SENTINEL' } : [];
      return { ok: true, json: async () => ({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value } }) };
    },
  }), { plan });
  assert.deepEqual(await manager.inspectUpgrade(), { status: 'accepted' });
  assert.equal(requests[0].payload.args.spec, `file:${join(root, 'evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle').replaceAll('\\', '/')}`);
  await manager.inspectRollback(); assert.equal(requests[1].payload.args.spec, plan.rollback.spec);
  await manager.listBundles(); await manager.listPlugins();
  assert.deepEqual(requests.map(r => r.method), ['pluginManager/inspect', 'pluginManager/inspect', 'pluginManager/listBundles', 'pluginManager/listPlugins']);
  const before = requests.length;
  await assert.rejects(manager.installBundle('upgrade'), { code: 'INSTALL_OPT_IN_REQUIRED' });
  await assert.rejects(manager.installBundle('upgrade', { allowInstall: true }), { code: 'DATA_COMPATIBILITY_BLOCKED' });
  await assert.rejects(manager.installBundle('rollback', { allowInstall: true, dataCompatible: true }), { code: 'UNKNOWN_OPTIONS' });
  await assert.rejects(manager.installBundle('file:evil', { allowInstall: true }), { code: 'UNKNOWN_OPTIONS' });
  assert.equal(requests.length, before, 'blocked install never evaluates an expression');
});

test('forged/cloned/expired plans and arbitrary pins/options make zero evaluate calls', async t => {
  const { api } = await fixture(t), plan = await api.prepareDesktopDeploymentPlan(); let calls = 0;
  for (const forged of [{}, structuredClone(plan), { ...plan, deploymentReady: true }])
    assert.throws(() => api.createReviewedDesktopManager(() => { calls++; }, { plan: forged }), { code: 'UNISSUED_PLAN' });
  assert.throws(() => api.createReviewedDesktopManager(() => { calls++; }, { plan, spec: 'file:arbitrary' }), { code: 'UNKNOWN_OPTIONS' });
  await assert.rejects(api.prepareDesktopDeploymentPlan({ upgradeSha256: '0'.repeat(64) }), { code: 'UNKNOWN_OPTIONS' });
  const manager = api.createReviewedDesktopManager(() => { calls++; }, { plan });
  t.mock.method(Date, 'now', () => plan.expiresAt + 1);
  await assert.rejects(manager.inspectUpgrade(), { code: 'EXPIRED_PLAN' });
  await assert.rejects(manager.listBundles(), { code: 'EXPIRED_PLAN' });
  await assert.rejects(manager.installBundle('upgrade', { allowInstall: true }), { code: 'EXPIRED_PLAN' });
  assert.equal(calls, 0);
});

test('each inspect rechecks artifact bytes/inventory and pinned selection before any evaluate', async t => {
  const { root, api } = await fixture(t), plan = await api.prepareDesktopDeploymentPlan(); let calls = 0;
  const manager = api.createReviewedDesktopManager(() => { calls++; }, { plan });
  const client = join(root, 'evidence/local/20261024-desktop-package/candidate/packages/dsh-plugin/lib/client.js'), bytes = await readFile(client);
  await writeFile(client, 'tampered');
  await assert.rejects(manager.inspectUpgrade(), { code: 'REVIEWED_ARTIFACT_OR_SOURCE_INVALID' });
  await writeFile(client, bytes);
  const extra = join(root, 'evidence/local/20261024-desktop-rollback/candidate/extra.json'); await writeFile(extra, '{}');
  await assert.rejects(manager.inspectRollback(), { code: 'REVIEWED_ARTIFACT_OR_SOURCE_INVALID' }); await rm(extra);
  const selection = join(root, 'evidence/local/20261024-desktop-rollback/controller/installed-selection.json'); await writeFile(selection, '{}');
  await assert.rejects(manager.inspectUpgrade(), { code: 'SELECTION_RECEIPT_CHANGED' });
  assert.equal(calls, 0);
});
