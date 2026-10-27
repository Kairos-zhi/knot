import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { prepareDesktopDeploymentPlan, createReviewedDesktopManager } from './desktop-deployment-plan.mjs';
import { verifyDesktopRecovery } from './prepare-desktop-recovery.mjs';
import { probeInstalledDesktopData, recheckInstalledDesktopData } from './desktop-installed-data-preflight.mjs';
import { managerExpression, safeManagerResult } from './desktop-host-client.mjs';

export const REVIEWED_RECOVERY_SHA256 = '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d';
const recoveryRoot = fileURLToPath(new URL('../evidence/local/20261024-desktop-recovery/candidate', import.meta.url));
const plans = new WeakMap();
const refuse = code => { const error = new Error(`Desktop paired preflight refused (${code})`); error.code = code; throw error; };
const freeze = value => { if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; };
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
function options(value, keys) { if (!plain(value) || Reflect.ownKeys(value).some(key => !keys.includes(key))) refuse('UNKNOWN_OPTIONS'); }
function issued(plan) {
  const state = plans.get(plan);
  if (!state) refuse('UNISSUED_PLAN');
  if (Date.now() >= plan.expiresAt) refuse('EXPIRED_PLAN');
  return state;
}
async function recoveryFence() { await verifyDesktopRecovery(recoveryRoot, REVIEWED_RECOVERY_SHA256); }
function dataProjection(report) {
  if (!report || !/^[a-f0-9]{64}$/.test(report.sourceSha256 ?? '') || report.schemaVersion !== 4
    || !Number.isSafeInteger(report.assetCount) || report.assetCount < 0 || !Number.isSafeInteger(report.runCount) || report.runCount < 0
    || report.validatedOnPrivateTemporaryCopy !== true || report.readAndWriteRoundTripPreserved !== true
    || report.productionFileUnchanged !== true || report.productionDeploymentAccepted !== false) refuse('DATA_COPY_PROBE_NOT_CONFIRMED');
  return { sourceSha256: report.sourceSha256, schemaVersion: report.schemaVersion, assetCount: report.assetCount, runCount: report.runCount,
    validatedOnPrivateTemporaryCopy: true, readAndWriteRoundTripPreserved: true,
    productionFileUnchanged: true, productionDeploymentAccepted: false };
}

/** Fixed pairing only: no supplied report, phase, artifact path, spec or pin.
 * A private-copy compatibility probe is evidence, never deployment consent. */
export async function prepareDesktopRecoveryPreflight(config = {}) {
  options(config, []);
  const inherited = await prepareDesktopDeploymentPlan();
  await recoveryFence();
  const data = dataProjection(await probeInstalledDesktopData());
  await recheckInstalledDesktopData(data.sourceSha256);
  if (Date.now() >= inherited.expiresAt) refuse('EXPIRED_PLAN');
  const plan = freeze({ kind: 'kont-paired-recovery-preflight/v1', id: randomUUID(), phase: 'pre-upgrade',
    expiresAt: inherited.expiresAt, upgrade: inherited.upgrade,
    recovery: { spec: `file:${resolve(recoveryRoot, 'packages/desktop-bundle').replaceAll('\\', '/')}`, manifestSha256: REVIEWED_RECOVERY_SHA256 },
    data, deploymentReady: false, blockers: ['ACTUAL_DEPLOYMENT_AUTHORIZATION_REQUIRED', 'PRIVATE_COPY_PROBE_IS_NOT_PRODUCTION_ACCEPTANCE'] });
  plans.set(plan, { inherited, sourceSha256: data.sourceSha256 }); return plan;
}

export function createRecoveryPreflightManager(evaluate, config = {}) {
  options(config, ['plan']); const { plan } = config; issued(plan);
  if (typeof evaluate !== 'function') refuse('INVALID_EVALUATOR');
  const invoke = async (target, performRpc = true) => {
    const state = issued(plan);
    let value;
    // Reuse 016's private original-source/profile/selection fence unchanged.
    // Its inspect bridge is local: only the final reviewed expression below is
    // handed to the caller's evaluator, once, after all three fences succeed.
    const inherited = createReviewedDesktopManager(async template => {
      await recoveryFence(); await recheckInstalledDesktopData(state.sourceSha256); issued(plan);
      if (!performRpc) return { status: 'accepted' };
      const method = target === 'bundles' ? 'pluginManager/listBundles' : target === 'plugins' ? 'pluginManager/listPlugins' : 'pluginManager/inspect';
      let expression = method === 'pluginManager/inspect' ? template : managerExpression(method);
      if (target === 'recovery') {
        const old = JSON.stringify(plan.upgrade.spec);
        if (expression.split(old).length !== 2) refuse('RPC_TEMPLATE_DRIFT');
        expression = expression.replace(old, JSON.stringify(plan.recovery.spec));
      }
      issued(plan); value = safeManagerResult(method, await evaluate(expression));
      return { status: 'accepted' };
    }, { plan: state.inherited });
    await inherited.inspectUpgrade(); return value;
  };
  return Object.freeze({ plan,
    inspectUpgrade: () => invoke('upgrade'), inspectRecovery: () => invoke('recovery'),
    listBundles: () => invoke('bundles'), listPlugins: () => invoke('plugins'),
    async installBundle(target, config = {}) {
      issued(plan); options(config, ['allowInstall']);
      if (!['upgrade', 'recovery'].includes(target)) refuse('UNKNOWN_OPTIONS');
      await invoke(target, false);
      if (config.allowInstall !== true) refuse('INSTALL_OPT_IN_REQUIRED');
      refuse('DEPLOYMENT_AUTHORIZATION_REQUIRED');
    },
  });
}
