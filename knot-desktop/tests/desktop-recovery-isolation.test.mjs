import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { verifyRecoveryData } from '../scripts/desktop-recovery-data.mjs';
const root = 'evidence/local/20261024-desktop-recovery/candidate';
const digest = '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d';
const report = await verifyRecoveryData(root, digest);
test('derived recovery preserves exact journals and generated provenance through ordinary mutation, absent-runs restore and 014 reopen', () => {
  assert.equal(report.identity, 'derived-recovery-not-original-installed-rollback');
  assert.deepEqual(report.phases.map(item => item.phase), ['prepared', 'reserved', 'submitted', 'uncertain', 'completed']);
  for (const phase of report.phases) {
    assert.equal(phase.beforeHash, phase.readHash);
    assert.notEqual(phase.beforeHash, phase.afterMutationHash);
    assert.equal(phase.beforeJournalHash, phase.reopenedJournalHash);
    assert.equal(phase.afterRestoreHash, phase.reopenedHash);
    assert.equal(phase.assetsAndProvenancePreserved, true);
    assert.equal(phase.eraseRestoreRefused, true);
    assert.equal(phase.foreignJournalRestoreRefused, true);
    assert.equal(phase.absentJournalRestorePreserved, true);
  }
  const completed = report.phases.find(item => item.phase === 'completed');
  assert.equal(completed.runState.hasReceipt, true);
  assert.equal(completed.generated.length, 1);
  assert.deepEqual(completed.generated[0].provenance, ['public-source']);
});
test('existing durable claims cannot reacquire or change constraints, prepared permits its legitimate first claim', () => {
  for (const phase of report.phases.filter(item => item.phase !== 'prepared')) {
    assert.equal(phase.duplicateClaimRefused, true);
    assert.equal(phase.changedConstraintsRefused, true);
  }
  assert.equal(report.phases[0].duplicateClaimRefused, null);
  assert.equal(report.phases[0].preparedFirstClaimAcquired, true);
  assert.equal(report.modelCalls, 0);
  assert.equal(report.productionDataVerified, false);
  assert.equal(report.deploymentAuthorized, false);
});
test('official offline manager installs all 13 derived bytes and old renderer/runtime apply in isolation', () => {
  const result = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['scripts/verify-desktop-recovery.cjs', root, digest],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.installedFilesMatched, 13);
  assert.equal(receipt.recoveryIdentity, 'derived-recovery-not-original-installed-rollback');
  assert.equal(receipt.application, 'restart-required'); assert.equal(receipt.enabled, false);
  assert.equal(receipt.versionExemptions, false);
  assert.equal(receipt.rendererModuleAndSlots, true);
  assert.ok(receipt.runtimeApply.includes('durable-readback'));
  assert.equal(receipt.actualDesktopDeployment, false);
});
test('recovery data probe refuses a substituted code pin before package reads or synthetic store creation', async () => {
  await assert.rejects(verifyRecoveryData('Z:/absent-artifact', '0'.repeat(64)), /UNREVIEWED_RECOVERY_DIGEST/);
});
