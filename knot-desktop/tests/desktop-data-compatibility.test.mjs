import test from 'node:test';
import assert from 'node:assert/strict';
import { probeDesktopDataCompatibility, desktopDataCompatibilityPreflight } from '../scripts/desktop-data-compatibility.mjs';
const report = await probeDesktopDataCompatibility();
test('only fixed reviewed code pins are accepted before package reads or store creation', async () => {
  await assert.rejects(probeDesktopDataCompatibility({ newRoot: 'Z:/absent-artifact',
    expectedNewManifestSha256: '0'.repeat(64) }), /UNREVIEWED_NEW_CODE_DIGEST/);
  await assert.rejects(probeDesktopDataCompatibility({ oldRoot: 'Z:/absent-artifact',
    expectedOldManifestSha256: '0'.repeat(64) }), /UNREVIEWED_OLD_CODE_DIGEST/);
});
test('old no-journal data can traverse both frozen versions without changing assets/provenance', () => {
  assert.equal(report.dataSource, 'new-isolated-synthetic-stores-only');
  assert.equal(report.legacyRoundTrip.initialHadRunJournal, false);
  assert.equal(report.legacyRoundTrip.assetsPreserved, true);
  assert.equal(report.legacyRoundTrip.provenancePreserved, true);
  assert.equal(report.legacyRoundTrip.oldBeforeHash, report.legacyRoundTrip.afterNewReadHash);
  assert.equal(report.legacyRoundTrip.finalRunCount, 0);
});
test('all durable Run phases lose journal in old memory and after any old mutation despite schema 4', () => {
  assert.deepEqual(report.experiments.map(item => item.phase), ['prepared', 'reserved', 'submitted', 'uncertain', 'completed']);
  for (const experiment of report.experiments) {
    assert.equal(experiment.beforeRunCount, 1);
    assert.deepEqual(experiment.beforeRunStates, [{ status: experiment.phase === 'completed' ? 'completed' : 'prepared',
      dispatchState: experiment.phase === 'prepared' ? null : experiment.phase === 'completed' ? 'submitted' : experiment.phase,
      hasReceipt: experiment.phase === 'completed' }]);
    assert.equal(experiment.oldMemoryRunCount, 0);
    assert.equal(experiment.afterOldWriteRunCount, 0);
    assert.equal(experiment.beforeHash, experiment.afterReadOnlyHash);
    assert.notEqual(experiment.beforeHash, experiment.afterOldWriteHash);
    assert.notEqual(experiment.beforeRunsHash, experiment.afterOldWriteRunsHash);
    assert.equal(experiment.assetsPreserved, true);
  }
  const completed = report.experiments.find(item => item.phase === 'completed');
  assert.equal(completed.generatedBefore.length, 1);
  assert.deepEqual(completed.generatedAfter[0].provenance, ['public-source']);
  assert.equal(completed.generatedAndProvenancePreserved, true);
});
test('pure preflight refuses unsafe downgrade and never promotes synthetic checks into production permission', () => {
  assert.equal(report.preflight.allowed, false);
  assert.equal(report.preflight.code, 'UNSAFE_DOWNGRADE_RUN_JOURNAL_LOSS');
  assert.equal(report.preflight.unsafePhases.length, 5);
  assert.equal(report.preflight.productionDataVerified, false);
  assert.equal(desktopDataCompatibilityPreflight(null).code, 'COMPATIBILITY_PROBE_REQUIRED');
  const syntheticNoLoss = structuredClone(report);
  for (const item of syntheticNoLoss.experiments) item.oldMemoryRunCount = item.afterOldWriteRunCount = item.beforeRunCount;
  assert.equal(desktopDataCompatibilityPreflight(syntheticNoLoss).allowed, false);
  assert.equal(desktopDataCompatibilityPreflight(syntheticNoLoss).code, 'PRODUCTION_DATA_NOT_VERIFIED');
});
