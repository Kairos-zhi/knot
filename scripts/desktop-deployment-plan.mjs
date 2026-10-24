import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifyDesktopCandidate } from './prepare-desktop-candidate.mjs';
import { verifyDesktopRollback, INSTALLED_DESKTOP_PROFILE_PACKAGE } from './prepare-desktop-rollback.mjs';
import { managerExpression, safeManagerResult, INSTALL_SPEC } from './desktop-host-client.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const upgradeRoot = resolve(root, 'evidence/local/20261024-desktop-package/candidate');
const rollbackRoot = resolve(root, 'evidence/local/20261024-desktop-rollback/candidate');
const selectionFile = resolve(root, 'evidence/local/20261024-desktop-rollback/controller/installed-selection.json');
export const REVIEWED_UPGRADE_SHA256 = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
export const REVIEWED_ROLLBACK_SHA256 = 'd5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336';
const selectionSha256 = '4b58d8ceb1e75867b7e3f7adbd60fbc8795af850b8a0351cd9dbebeff82902bf';
const plans = new WeakMap();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
const refuse = code => { const error = new Error(`Desktop preflight refused (${code})`); error.code = code; throw error; };
const freeze = value => { if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; };
async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || !same(path, await realpath(path))) refuse('SOURCE_REDIRECTED');
  return readFile(path);
}
async function originalSourceFence(rollback) {
  const source = rollback.source;
  if (!same(source.profilePackage, INSTALLED_DESKTOP_PROFILE_PACKAGE)) refuse('PROFILE_ANCHOR');
  const selectionBytes = await regular(selectionFile);
  if (hash(selectionBytes) !== selectionSha256) refuse('SELECTION_RECEIPT_CHANGED');
  const selection = JSON.parse(selectionBytes);
  if (selection.name !== '@kont/desktop-bundle' || selection.version !== '0.1.0' || selection.installed !== true
    || selection.enabled !== true || selection.profilePackageSha256 !== source.profilePackageSha256
    || selection.source !== source.legacyBundleSpec) refuse('SELECTION_BINDING');
  if (hash(await regular(source.profilePackage)) !== source.profilePackageSha256) refuse('PROFILE_SELECTION_CHANGED');
  const req = createRequire(source.profilePackage), bundleFile = req.resolve('@kont/desktop-bundle/package.json');
  const pluginFile = createRequire(bundleFile).resolve('@kont/dsh-plugin/package.json');
  if (!same(dirname(bundleFile), source.bundleRoot) || !same(dirname(pluginFile), source.pluginRoot)) refuse('INSTALLED_SOURCE_MOVED');
  for (const [packageRoot, prefix] of [[source.bundleRoot, 'packages/desktop-bundle/'], [source.pluginRoot, 'packages/dsh-plugin/']]) {
    if (!same(packageRoot, await realpath(packageRoot))) refuse('SOURCE_REDIRECTED');
    const inventory = [];
    const expected = rollback.files.filter(file => file.path.startsWith(prefix));
    const directories = new Set(expected.flatMap(file => file.path.slice(prefix.length).split('/').slice(0, -1)
      .map((_, index, parts) => parts.slice(0, index + 1).join('/'))));
    async function walk(path) {
      for (const name of await readdir(path)) {
        const full = resolve(path, name), stat = await lstat(full);
        if (stat.isSymbolicLink() || !same(full, await realpath(full))) refuse('SOURCE_REDIRECTED');
        if (stat.isDirectory()) {
          if (!directories.has(relative(packageRoot, full).replaceAll('\\', '/'))) refuse('INSTALLED_INVENTORY_CHANGED');
          await walk(full);
        }
        else inventory.push(prefix + relative(packageRoot, full).replaceAll('\\', '/'));
      }
    }
    await walk(packageRoot);
    if (JSON.stringify(inventory.sort()) !== JSON.stringify(expected.map(file => file.path).sort())) refuse('INSTALLED_INVENTORY_CHANGED');
    for (const file of expected) if (hash(await regular(resolve(packageRoot, file.path.slice(prefix.length)))) !== file.sourceSha256) refuse('INSTALLED_BYTES_CHANGED');
  }
}
async function reviewedFence() {
  try {
    if (!same(upgradeRoot, await realpath(upgradeRoot)) || !same(rollbackRoot, await realpath(rollbackRoot))) refuse('ARTIFACT_REDIRECTED');
    await verifyDesktopCandidate(upgradeRoot, REVIEWED_UPGRADE_SHA256);
    const { manifest } = await verifyDesktopRollback(rollbackRoot, REVIEWED_ROLLBACK_SHA256);
    await originalSourceFence(manifest);
  } catch (error) { if (error.code?.startsWith?.('INSTALLED_') || error.code?.startsWith?.('PROFILE_') || error.code?.startsWith?.('SELECTION_')) throw error; refuse('REVIEWED_ARTIFACT_OR_SOURCE_INVALID'); }
}
function owned(plan) {
  const state = plans.get(plan);
  if (!state) refuse('UNISSUED_PLAN');
  if (Date.now() >= state.expiresAt) refuse('EXPIRED_PLAN');
  return state;
}
function noArguments(value) { if (value !== undefined && (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length)) refuse('UNKNOWN_OPTIONS'); }

/** This card issues only a pre-upgrade read-only capability. It cannot advance
 * to after-upgrade/after-rollback or bypass old-source checks by a caller phase.
 * Future install support needs a separately reviewed data/authorization gate. */
export async function prepareDesktopDeploymentPlan(options) {
  noArguments(options);
  await reviewedFence();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const plan = freeze({ kind: 'kont-reviewed-desktop-preflight/v1', id: randomUUID(), expiresAt,
    phase: 'pre-upgrade', upgrade: { spec: `file:${resolve(upgradeRoot, 'packages/desktop-bundle').replaceAll('\\', '/')}`, manifestSha256: REVIEWED_UPGRADE_SHA256 },
    rollback: { spec: `file:${resolve(rollbackRoot, 'packages/desktop-bundle').replaceAll('\\', '/')}`, manifestSha256: REVIEWED_ROLLBACK_SHA256 },
    sourceFence: { selectionReceiptSha256: selectionSha256, originalInstalledBytesRequired: true },
    deploymentReady: false, blockers: ['PRODUCTION_DATA_COMPATIBILITY_NOT_VERIFIED', 'ACTUAL_DEPLOYMENT_NOT_AUTHORIZED'] });
  plans.set(plan, { expiresAt }); return plan;
}

/** Uses the existing official RPC envelope/origin and sanitized result adapter.
 * No connection, installation or process lifecycle is initiated here. */
export function createReviewedDesktopManager(evaluate, options = {}) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Reflect.ownKeys(options).some(key => key !== 'plan')) refuse('UNKNOWN_OPTIONS');
  const { plan } = options;
  owned(plan);
  if (typeof evaluate !== 'function') refuse('INVALID_EVALUATOR');
  const inspect = async target => {
    owned(plan); await reviewedFence(); owned(plan);
    // Keep the existing protocol constructor and replace its sole fixed spec
    // literal with this freshly verified, privately issued artifact address.
    const template = managerExpression('pluginManager/inspect', { spec: INSTALL_SPEC });
    const old = JSON.stringify(INSTALL_SPEC);
    if (template.split(old).length !== 2) refuse('RPC_TEMPLATE_DRIFT');
    const expression = template.replace(old, JSON.stringify(plan[target].spec));
    owned(plan);
    return safeManagerResult('pluginManager/inspect', await evaluate(expression));
  };
  const list = async method => { owned(plan); return safeManagerResult(method, await evaluate(managerExpression(method))); };
  return Object.freeze({
    plan,
    inspectUpgrade: () => inspect('upgrade'), inspectRollback: () => inspect('rollback'),
    listBundles: () => list('pluginManager/listBundles'), listPlugins: () => list('pluginManager/listPlugins'),
    async installBundle(target, options = {}) {
      owned(plan);
      if (!['upgrade', 'rollback'].includes(target) || !options || typeof options !== 'object'
        || Object.keys(options).some(key => key !== 'allowInstall')) refuse('UNKNOWN_OPTIONS');
      await reviewedFence(); owned(plan);
      if (options.allowInstall !== true) refuse('INSTALL_OPT_IN_REQUIRED');
      // A boolean cannot stand in for data compatibility or deployment consent.
      refuse('DATA_COMPATIBILITY_BLOCKED');
    },
  });
}
