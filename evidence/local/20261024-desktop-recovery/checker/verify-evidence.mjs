import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { verifyDesktopRecovery } from '../../../../scripts/prepare-desktop-recovery.mjs';
import { claimRunDispatch } from '../../20261024-desktop-package/candidate/packages/dsh-plugin/src/run.mjs';
const root = 'evidence/local/20261024-desktop-recovery';
const pin = '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const { manifest } = await verifyDesktopRecovery(`${root}/candidate`, pin);
const entries = [];
for (const line of ['maker-a', 'maker-b']) {
  const frozen = JSON.parse(await readFile(`${root}/${line}/manifest.json`, 'utf8'));
  for (const item of frozen.files) {
    const bytes = await readFile(item.path);
    assert.equal(bytes.length, item.bytes, item.path); assert.equal(hash(bytes), item.sha256, item.path);
    entries.push({ line, path: item.path, sha256: hash(bytes), match: true });
  }
}
const files = [];
for (const item of manifest.files) {
  const modern = /\/src\/(?:store|run)\.mjs$/.test(item.path);
  const sourceRoot = modern ? 'evidence/local/20261024-desktop-package/candidate' : 'evidence/local/20261024-desktop-rollback/candidate';
  assert.equal(item.sourceArtifact, modern ? 'upgrade' : 'rollback');
  const bytes = await readFile(`${root}/candidate/${item.path}`);
  assert.deepEqual(bytes, await readFile(`${sourceRoot}/${item.path}`), item.path);
  files.push({ path: item.path, sourceArtifact: item.sourceArtifact, sha256: hash(bytes), match: true });
}
assert.equal(files.filter(item => item.sourceArtifact === 'upgrade').length, 2);
assert.equal(files.filter(item => item.sourceArtifact === 'rollback').length, 11);
const planFreeze = JSON.parse(await readFile('evidence/local/20261024-desktop-preflight/maker-a/manifest.json', 'utf8'));
const planSource = planFreeze.files.find(item => item.path === 'scripts/desktop-deployment-plan.mjs');
assert.equal(hash(await readFile(planSource.path)), planSource.sha256);
// Additional narrow legacy-completed case: even without a prior claim, modern
// data semantics forbid allocating new dispatch to a terminal record.
const terminal = { runs: [{ runId: 'synthetic-completed-without-claim', status: 'completed' }] };
const before = JSON.stringify(terminal);
assert.throws(() => claimRunDispatch(terminal, terminal.runs[0].runId,
  { provider: 'synthetic', model: 'never-called', maxTokens: 64, requestSha256: 'a'.repeat(64) }), { code: 'RUN_DISPATCH_CONFLICT' });
assert.equal(JSON.stringify(terminal), before);
await writeFile(`${root}/checker/hash-check.json`, JSON.stringify({ task: 'KONT-DESKTOP-017',
  candidateManifestSha256: pin, frozenEntriesMatched: entries.length, mismatch: 0,
  candidateFilesMatched: files.length, from014: 2, from015: 11,
  management016ScriptUnchanged: true, completedWithoutClaimRefusedWithoutMutation: true,
  entries, files }, null, 2) + '\n');
console.log(JSON.stringify({ frozenEntries: entries.length, candidateFilesMatched: files.length, from014: 2, from015: 11, completedWithoutClaimRefused: true }));
