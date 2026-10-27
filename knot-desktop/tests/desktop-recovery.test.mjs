import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareDesktopRecovery, verifyDesktopRecovery, RECOVERY_SOURCE_PINS } from '../scripts/prepare-desktop-recovery.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const frozen = source => resolve(`evidence/local/20261024-${source === 'upgrade' ? 'desktop-package' : 'desktop-rollback'}/candidate`);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kont-recovery-fixture-'));
  t.after(async () => { const target = resolve(root); assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('kont-recovery-fixture-')); await rm(target, { recursive: true, force: true }); });
  return root;
}

test('derived recovery copies exactly 11 old files plus reviewed run-aware store/run bytes with unchanged old package and peer gates', async t => {
  const root = await fixture(t), result = await prepareDesktopRecovery({ outputDir: join(root, 'recovery') });
  assert.equal(result.manifest.format, 'kont-desktop-directory-recovery/v1');
  assert.equal(result.manifest.identity, 'derived-recovery-not-original-installed-rollback');
  assert.equal(result.manifest.files.length, 13);
  assert.equal(result.manifest.files.filter(f => f.sourceArtifact === 'upgrade').length, 2);
  assert.equal(result.manifest.files.filter(f => f.sourceArtifact === 'rollback').length, 11);
  for (const file of result.manifest.files) {
    const original = await readFile(join(frozen(file.sourceArtifact), file.sourcePath));
    assert.equal(file.sha256, hash(original)); assert.equal(file.sourceManifestSha256, RECOVERY_SOURCE_PINS[file.sourceArtifact]);
    assert.deepEqual(await readFile(join(result.outputDir, file.path)), original);
  }
  for (const path of ['src/kernel.mjs', 'lib/knot-model.js', 'lib/snapshot.js', 'lib/workspace-state.js'])
    assert.deepEqual(await readFile(join(frozen('upgrade'), 'packages/dsh-plugin', path)), await readFile(join(frozen('rollback'), 'packages/dsh-plugin', path)));
  const plugin = JSON.parse(await readFile(join(result.outputDir, 'packages/dsh-plugin/package.json')));
  assert.equal(plugin.peerDependencies['@deepseek-ai/dsh'], '0.1.7-rc.2 || 0.2.1-rc.2');
  await verifyDesktopRecovery(result.outputDir, result.manifestSha256);
  const second = await prepareDesktopRecovery({ outputDir: join(root, 'second') });
  assert.equal(second.manifestSha256, result.manifestSha256);
});

test('recovery output refuses overwrite/source overlap and verification rejects wrong pin, extra files and changed bytes', async t => {
  const root = await fixture(t), outputDir = join(root, 'recovery');
  const result = await prepareDesktopRecovery({ outputDir }), before = await readFile(join(outputDir, 'manifest.json'));
  await assert.rejects(prepareDesktopRecovery({ outputDir }), /output already exists/);
  assert.deepEqual(await readFile(join(outputDir, 'manifest.json')), before);
  await assert.rejects(prepareDesktopRecovery({ outputDir: join(frozen('rollback'), 'new') }), /unsafe output location/);
  await assert.rejects(verifyDesktopRecovery(outputDir, '0'.repeat(64)), /manifest digest mismatch/);
  const extra = join(outputDir, 'unlisted.json'); await writeFile(extra, '{}');
  await assert.rejects(verifyDesktopRecovery(outputDir, result.manifestSha256), /extra file/); await rm(extra);
  const store = join(outputDir, 'packages/dsh-plugin/src/store.mjs'); await writeFile(store, 'forked store');
  await assert.rejects(verifyDesktopRecovery(outputDir, result.manifestSha256), /artifact byte mismatch/);
});

test('even a recomputed manifest cannot relabel recovery as original rollback or change reviewed source pins/mappings', async t => {
  const root = await fixture(t);
  for (const mode of ['identity', 'pin', 'mapping']) {
    const outputDir = join(root, mode), result = await prepareDesktopRecovery({ outputDir });
    const changed = structuredClone(result.manifest);
    if (mode === 'identity') changed.identity = 'original-installed-rollback';
    if (mode === 'pin') changed.sourcePins.upgrade = '0'.repeat(64);
    if (mode === 'mapping') changed.files.find(f => f.path.endsWith('/store.mjs')).sourceArtifact = 'rollback';
    const bytes = `${JSON.stringify(changed, null, 2)}\n`, digest = hash(bytes);
    await writeFile(join(outputDir, 'manifest.json'), bytes); await writeFile(join(outputDir, 'manifest.sha256'), `${digest}  manifest.json\n`);
    await assert.rejects(verifyDesktopRecovery(outputDir, digest), /source mapping drift/);
  }
});
