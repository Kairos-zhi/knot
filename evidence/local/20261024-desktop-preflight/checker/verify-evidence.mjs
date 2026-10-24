import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDesktopCandidate } from '../../../../scripts/prepare-desktop-candidate.mjs';
import { verifyDesktopRollback } from '../../../../scripts/prepare-desktop-rollback.mjs';
import { prepareDesktopDeploymentPlan, createReviewedDesktopManager } from '../../../../scripts/desktop-deployment-plan.mjs';
const root = 'evidence/local/20261024-desktop-preflight';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = [];
for (const line of ['maker-a', 'maker-b']) {
  const manifest = JSON.parse(await readFile(`${root}/${line}/manifest.json`, 'utf8'));
  for (const item of manifest.files) {
    const bytes = await readFile(item.path);
    assert.equal(bytes.length, item.bytes, item.path); assert.equal(hash(bytes), item.sha256, item.path);
    entries.push({ line, path: item.path, sha256: hash(bytes), match: true });
  }
}
const newPin = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
const oldPin = 'd5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336';
await verifyDesktopCandidate('evidence/local/20261024-desktop-package/candidate', newPin);
const { manifest: old } = await verifyDesktopRollback('evidence/local/20261024-desktop-rollback/candidate', oldPin);
let sourceMatched = 0;
for (const item of old.files) {
  const suffix = item.path.replace(/^packages\/(desktop-bundle|dsh-plugin)\//, '');
  const bytes = await readFile(resolve(item.path.startsWith('packages/desktop-bundle/') ? old.source.bundleRoot : old.source.pluginRoot, suffix));
  assert.equal(hash(bytes), item.sourceSha256, item.path); sourceMatched++;
}
assert.equal(hash(await readFile(old.source.profilePackage)), old.source.profilePackageSha256);
const plan = await prepareDesktopDeploymentPlan();
assert.equal(plan.deploymentReady, false);
let evaluateCalls = 0;
const manager = createReviewedDesktopManager(() => { evaluateCalls++; throw Error('must never evaluate'); }, { plan });
for (const target of ['upgrade', 'rollback'])
  await assert.rejects(manager.installBundle(target, { allowInstall: true }), { code: 'DATA_COMPATIBILITY_BLOCKED' });
assert.equal(evaluateCalls, 0);
await writeFile(`${root}/checker/hash-check.json`, JSON.stringify({ task: 'KONT-DESKTOP-016',
  frozenManifestEntriesMatched: entries.length, mismatch: 0, upgradeManifestSha256: newPin,
  rollbackManifestSha256: oldPin, unchangedInstalledSourceFiles: sourceMatched,
  profilePackageStable: true, profilePackageSha256: old.source.profilePackageSha256, entries }, null, 2) + '\n');
await writeFile(`${root}/checker/readonly-prepare.json`, JSON.stringify({ task: 'KONT-DESKTOP-016',
  plan, bothExplicitInstallTargetsRefused: true, installCode: 'DATA_COMPATIBILITY_BLOCKED',
  evaluateCalls, actualLiveConnection: false }, null, 2) + '\n');
console.log(JSON.stringify({ frozenEntries: entries.length, installedSourceMatched: sourceMatched, bothInstallTargetsBlocked: true, evaluateCalls }));
