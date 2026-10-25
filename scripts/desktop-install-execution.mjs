import { mkdir, open, lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { prepareDesktopRecoveryPreflight, createRecoveryPreflightManager } from './desktop-recovery-preflight.mjs';
import { managerExpression, safeManagerResult, INSTALL_SPEC } from './desktop-host-client.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const ledger = resolve(root, '.runtime/desktop-install');
const upgradePin = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
const recoveryPin = '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d';
const upgradeSpec = `file:${resolve(root, 'evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle').replaceAll('\\', '/')}`;
const prepared = new WeakMap(), approvals = new WeakMap(), dispatchPermits = new WeakMap();
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
const freeze = value => { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; };
const fail = code => { const e = new Error(`Desktop install refused (${code})`); e.code = code; throw e; };
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(k => !keys.includes(k))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !d.enumerable || !Object.hasOwn(d, 'value'))) fail('UNKNOWN_OPTIONS');
}
function active(token) {
  const state = approvals.get(token);
  if (!state) fail('UNISSUED_APPROVAL');
  if (Date.now() >= token.expiresAt) fail('EXPIRED_APPROVAL');
  return state;
}
async function ledgerDirectory(kind) {
  if (!same(root, await realpath(root))) fail('LEDGER_REDIRECTED');
  const namespace = resolve(ledger, kind);
  for (const dir of [resolve(root, '.runtime'), ledger, namespace]) {
    try { await mkdir(dir); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !same(dir, await realpath(dir))) fail('LEDGER_REDIRECTED');
  }
  return namespace;
}
async function exclusiveJson(path, value) {
  const serialized = `${JSON.stringify(value)}\n`;
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(serialized); await handle.sync(); return sha(serialized); }
  finally { await handle.close(); }
}
function reservationFence(reservation) {
  if (!reservation) return;
  for (const [path, digest] of reservation.files) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || !same(path, realpathSync(path))
      || sha(readFileSync(path).toString()) !== digest) fail('TRANSPORT_RESERVATION_CHANGED');
  }
}

/** Preparation performs the real 018 private-copy preflight but cannot install.
 * The stable descriptor excludes random parent ids and all issuance/expiry times. */
export async function prepareDeploymentApproval(config = {}) {
  exact(config, []);
  const preflight = await prepareDesktopRecoveryPreflight();
  if (preflight.upgrade?.spec !== upgradeSpec || preflight.upgrade?.manifestSha256 !== upgradePin
    || preflight.recovery?.manifestSha256 !== recoveryPin || !/^[a-f0-9]{64}$/.test(preflight.data?.sourceSha256 ?? '')
    || preflight.deploymentReady !== false || preflight.data.productionDeploymentAccepted !== false) fail('PREFLIGHT_BINDING');
  const binding = { action: 'upgrade', upgradeSpec, upgradeManifestSha256: upgradePin,
    recoveryManifestSha256: recoveryPin, dataSha256: preflight.data.sourceSha256 };
  const requestId = `kont-upgrade-${sha(binding).slice(0, 40)}`;
  const descriptor = { format: 'kont-desktop-one-shot-upgrade/v1', ...binding,
    method: 'pluginManager/installBundle', options: { enabled: true, saveExact: true, requestId } };
  const descriptorSha256 = sha(descriptor), expiresAt = Math.min(preflight.expiresAt, Date.now() + 5 * 60 * 1000);
  if (!Number.isSafeInteger(expiresAt) || Date.now() >= expiresAt) fail('EXPIRED_PLAN');
  const result = freeze({ descriptor, descriptorSha256, expiresAt, deploymentReady: false,
    authorizationRequired: true, callerDeclarationIsIdentityProof: false });
  prepared.set(result, { preflight }); return result;
}

/** A single, evidence-linked successor to the fixed failed 020 attempt. The
 * initial API/descriptor remain unchanged and permanently deny their replay. */
export async function prepareReconciledDeploymentApproval(config = {}) {
  exact(config, []);
  const initial = await prepareDeploymentApproval();
  const state = prepared.get(initial);
  const { prepareFixedReconciledEvidence } = await import('./desktop-reconciled-evidence.mjs');
  const reconciliation = await prepareFixedReconciledEvidence();
  if (reconciliation.parentDescriptorSha256 !== '928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9'
    || initial.descriptor.dataSha256 !== reconciliation.originalDataSha256) fail('RECONCILED_PARENT_BINDING');
  const binding = { ...initial.descriptor, format: 'kont-desktop-reconciled-upgrade/v1',
    reconciliation, successor: 1 };
  delete binding.options;
  const options = { enabled: true, saveExact: true, requestId: `kont-reconciled-${sha(binding).slice(0, 40)}` };
  const descriptor = { ...binding, options }, descriptorSha256 = sha(descriptor);
  const result = freeze({ descriptor, descriptorSha256, expiresAt: initial.expiresAt,
    deploymentReady: false, authorizationRequired: true, callerDeclarationIsIdentityProof: false });
  prepared.set(result, { ...state, reconciliation }); return result;
}

async function executionFence(state) {
  await createRecoveryPreflightManager(async () => ({ status: 'accepted' }), { plan: state.preflight }).inspectUpgrade();
  if (state.reconciliation) {
    const { recheckFixedReconciledEvidence } = await import('./desktop-reconciled-evidence.mjs');
    await recheckFixedReconciledEvidence(state.reconciliation);
  }
}

/** Only a trusted caller can assert that explicit human permission was obtained.
 * This declaration is recorded, not independently authenticated as human identity. */
export function approveDeployment(plan, declaration) {
  const state = prepared.get(plan);
  if (!state) fail('UNISSUED_PLAN');
  if (Date.now() >= plan.expiresAt) fail('EXPIRED_PLAN');
  exact(declaration, ['approved', 'kind', 'action', 'descriptorSha256', 'expiresAt', 'statement']);
  if (declaration.approved !== true || !['synthetic-test', 'explicit-user-approval'].includes(declaration.kind)
    || declaration.action !== 'upgrade' || declaration.descriptorSha256 !== plan.descriptorSha256
    || !Number.isSafeInteger(declaration.expiresAt) || declaration.expiresAt <= Date.now() || declaration.expiresAt > plan.expiresAt
    || typeof declaration.statement !== 'string' || !declaration.statement.trim() || declaration.statement.length > 1000) fail('APPROVAL_BINDING');
  const statementSha256 = sha(declaration.statement);
  const token = freeze({ kind: declaration.kind, action: 'upgrade', descriptorSha256: plan.descriptorSha256,
    approvalHash: plan.descriptorSha256, requestId: plan.descriptor.options.requestId, expiresAt: declaration.expiresAt,
    trust: 'trusted-caller-declaration-not-human-identity-proof' });
  approvals.set(token, { ...state, plan, statementSha256 }); return token;
}

/** Validation only: cannot issue a grant, extend expiry or replace bound args. */
export function getInstallationTransportAuthorization(approval) {
  const state = active(approval);
  reservationFence(state.transportReservation);
  return freeze({ kind: approval.kind, method: 'pluginManager/installBundle',
    requestId: approval.requestId, approvalHash: approval.approvalHash,
    descriptorSha256: approval.descriptorSha256, expiresAt: approval.expiresAt,
    trust: approval.trust });
}

/** Only execute can issue this permit after its durable reservation. Consumption
 * is synchronous and precedes the transport's first management side effect. */
export function consumeInstallationTransportPermit(dispatchPermit, approval) {
  active(approval);
  const state = dispatchPermits.get(dispatchPermit);
  if (!state || state.approval !== approval) fail('UNISSUED_DISPATCH_PERMIT');
  if (state.consumed) fail('DISPATCH_PERMIT_CONSUMED');
  if (!state.open) fail('EXPIRED_DISPATCH_PERMIT');
  reservationFence(state.reservation);
  state.consumed = true;
  return state.payload;
}

/** One initial upgrade attempt only. No recovery, process restart or retry.
 * Timeout cannot cancel an already issued management RPC; retain uncertainty. */
export async function executeApprovedUpgrade(approval, config = {}) {
  const state = active(approval);
  exact(config, ['evaluate', 'timeoutMs']);
  const { evaluate, timeoutMs = 30000 } = config;
  if (typeof evaluate !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) fail('INVALID_TRANSPORT');
  // Local inspect bridge invokes all 018/016 artifact, data, source and selection
  // checks, without handing a read expression to the installation transport.
  await executionFence(state);
  active(approval);
  const namespace = await ledgerDirectory(approval.kind);
  const key = approval.approvalHash, claimFile = resolve(namespace, `${key}.claim.json`), resultFile = resolve(namespace, `${key}.result.json`);
  const metadata = { format: 'kont-desktop-install-ledger/v1', action: 'upgrade', approvalHash: key,
    descriptorSha256: key, kind: approval.kind, statementSha256: state.statementSha256,
    upgradeManifestSha256: upgradePin, recoveryManifestSha256: recoveryPin,
    dataSha256: state.plan.descriptor.dataSha256, requestId: approval.requestId, expiresAt: approval.expiresAt,
    ...(state.reconciliation ? { parentDescriptorSha256: state.reconciliation.parentDescriptorSha256,
      reconciliationSha256: state.reconciliation.evidenceSha256 } : {}) };
  let parentFile, parentDigest;
  if (state.reconciliation) {
    const parent = state.reconciliation.parentDescriptorSha256;
    parentFile = resolve(namespace, `${parent}.remediation.claim.json`);
    try {
      parentDigest = await exclusiveJson(parentFile, {
        format: 'kont-single-reconciled-child/v1', parentDescriptorSha256: parent,
        childDescriptorSha256: key, reconciliationSha256: state.reconciliation.evidenceSha256 });
    } catch (error) {
      if (error.code === 'EEXIST') return { acquired: false, state: 'uncertain', approvalHash: key,
        code: 'PARENT_SUCCESSOR_EXISTS', deploymentAccepted: false };
      fail('PARENT_SUCCESSOR_WRITE_FAILED');
    }
  }
  let claimDigest;
  try { claimDigest = await exclusiveJson(claimFile, { ...metadata, state: 'reserved', reservedAt: new Date().toISOString() }); }
  catch (error) {
    if (error.code === 'EEXIST') return { acquired: false, state: 'uncertain', approvalHash: key, code: 'RESERVATION_EXISTS', deploymentAccepted: false };
    fail('RESERVATION_WRITE_FAILED'); // partial reservation is never deleted
  }
  let timer, result, permitState, outcome = 'uncertain';
  try {
    // Reservation I/O is a gap in which the fixed source/data may have changed.
    // A refusal here keeps the reservation permanently, without dispatch.
    await executionFence(state);
    active(approval);
    if (state.reconciliation) state.transportReservation = { files: [[parentFile, parentDigest], [claimFile, claimDigest]] };
    const payload = freeze({ ...getInstallationTransportAuthorization(approval),
      args: { spec: state.plan.descriptor.upgradeSpec, options: { ...state.plan.descriptor.options } } });
    const args = payload.args;
    const template = managerExpression('pluginManager/installBundle', { spec: INSTALL_SPEC, options: args.options }, { allowInstall: true });
    const old = JSON.stringify(INSTALL_SPEC);
    if (template.split(old).length !== 2) fail('RPC_TEMPLATE_DRIFT');
    const expression = template.replace(old, JSON.stringify(args.spec));
    const dispatchPermit = Object.freeze({});
    permitState = { approval, payload, consumed: false, open: true, reservation: state.transportReservation };
    dispatchPermits.set(dispatchPermit, permitState);
    const raw = await Promise.race([
      Promise.resolve().then(() => { active(approval); return evaluate(expression, { approval, dispatchPermit }); }),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    result = raw === null ? null : safeManagerResult('pluginManager/installBundle', raw);
    if (permitState.consumed && result && !result.error && result.packageResult?.exitCode === 0 && ['applied', 'restart-required'].includes(result.application)) outcome = 'submitted';
  } catch { /* No raw transport exception or management diagnostic enters ledger. */ }
  finally { clearTimeout(timer); if (permitState) permitState.open = false; }
  try {
    await exclusiveJson(resultFile, { ...metadata, state: outcome, reportedAt: new Date().toISOString(),
      ...(result ? { managerReceipt: result } : {}), runtimeActiveProven: false, deploymentAccepted: false });
  } catch { return { acquired: true, state: 'uncertain', approvalHash: key, receiptSaved: false, deploymentAccepted: false }; }
  return { acquired: true, state: outcome, approvalHash: key, receiptSaved: true,
    ...(result ? { managerReceipt: result } : {}), runtimeActiveProven: false, deploymentAccepted: false };
}
