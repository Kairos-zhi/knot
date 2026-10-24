import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { prepareDeploymentApproval } from '../../../../scripts/desktop-install-execution.mjs';
const root = 'evidence/local/20261024-desktop-install-gate';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = [];
for (const line of ['maker-a', 'maker-b']) {
  const manifest = JSON.parse(await readFile(`${root}/${line}/manifest.json`, 'utf8'));
  for (const item of manifest.files) {
    const bytes = await readFile(item.path);
    assert.equal(bytes.length, item.bytes, item.path); assert.equal(hash(bytes), item.sha256, item.path);
    entries.push({ line, path: item.path, bytes: bytes.length, sha256: hash(bytes), match: true });
  }
}
assert.equal(execFileSync('git', ['diff', '9bb7fea', '--', 'scripts/desktop-host-client.mjs', 'scripts/desktop-host-debug.mjs'], { encoding: 'utf8', windowsHide: true }), '');
const rootReview = JSON.parse(await readFile(`${root}/controller/prepared-install-review.json`, 'utf8'));
assert.equal(hash(JSON.stringify(rootReview.preparedPlan.descriptor)), rootReview.preparedPlan.descriptorSha256);
assert.equal(rootReview.humanApprovalIssued, false);
assert.equal(rootReview.productionInstallAttempted, false);
// Only preparation: reviewed 018 performs fixed-source reads/private-copy
// compatibility checks. Never approve, execute, connect or construct transport.
const plan = await prepareDeploymentApproval();
assert.equal(plan.descriptorSha256, '928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9');
assert.deepEqual(plan.descriptor, rootReview.preparedPlan.descriptor);
assert.equal(plan.deploymentReady, false);
assert.equal(plan.callerDeclarationIsIdentityProof, false);
await assert.rejects(access(`.runtime/desktop-install/explicit-user-approval/${plan.descriptorSha256}.claim.json`), { code: 'ENOENT' });
await writeFile(`${root}/checker/hash-check.json`, JSON.stringify({ task: 'KONT-DESKTOP-019',
  manifestEntriesMatched: entries.length, mismatch: 0, legacyClientAndDebugUnchanged: true,
  descriptorSha256: plan.descriptorSha256, actualReadonlyPrepareMatched: true,
  productionApprovalClaimAbsent: true, humanGrantIssuedByChecker: false,
  executionOrTransportConstructedByChecker: false, entries }, null, 2) + '\n');
console.log(JSON.stringify({ frozenEntries: entries.length, descriptorSha256: plan.descriptorSha256, readonlyPrepare: true, humanGrantIssued: false }));
