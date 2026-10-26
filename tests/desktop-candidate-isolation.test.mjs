import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareDesktopCandidate } from '../scripts/prepare-desktop-candidate.mjs';
import { createCandidateFixture } from './helpers/desktop-candidate-fixture.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const executable = 'D:/DSH-Desktop/app/DeepSeek Harness.exe';
const invoke = (root, digest) => spawnSync(executable, ['scripts/verify-desktop-candidate.cjs', root, digest], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 45000 });

async function fixture(t) {
  const dir = await mkdtemp('D:/Temp/kont-candidate-artifact-test-');
  t.after(async () => {
    const target = resolve(dir);
    assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-candidate-artifact-test-'));
    await rm(target, { recursive: true, force: true });
  });
  // Final self-check sets KONT_DESKTOP_CANDIDATE to Maker A's frozen output.
  // Ordinary suite runs use the same on-disk package shape, explicitly not a
  // claim about a release artifact or the running Desktop installation.
  const selected = process.env.KONT_DESKTOP_CANDIDATE, candidate = join(dir, 'candidate');
  if (selected) await cp(resolve(selected), candidate, { recursive: true });
  else {
    const source = await createCandidateFixture(t, 'D:/Temp');
    await prepareDesktopCandidate({ sourceRoot: source.sourceRoot, outputDir: candidate,
      expectedBaseCommit: source.expectedBaseCommit });
  }
  return candidate;
}
test('official manager offline installs candidate and copied runtime/renderer apply in isolation', async t => {
  const dir = await fixture(t);
  const result = invoke(dir, hash(await readFile(join(dir, 'manifest.json'))));
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.officialManagerInspect, 'accepted');
  assert.equal(receipt.officialManagerInstall, 'completed-in-isolated-profile');
  assert.equal(receipt.application, 'restart-required');
  assert.equal(receipt.enabled, false);
  assert.equal(receipt.packageCopied, true);
  assert.equal(receipt.rendererModuleAndSlots, true);
  assert.ok(receipt.runtimeApply.includes('durable-readback'));
  assert.equal(receipt.versionExemptions, false);
  assert.equal(receipt.actualDesktopDeployment, false);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(receipt.installedFilesMatched, manifest.files.length);
  if (manifest.format === 'kont-desktop-directory-candidate/v2') {
    assert.equal(receipt.installedFilesMatched, 26);
    assert.ok(manifest.files.some(file => file.path.endsWith('/src/worksite-preview.mjs')));
  }
});
test('official manager refuses incompatible candidate without a version exemption', async t => {
  const dir = await fixture(t), file = join(dir, 'packages/desktop-bundle/package.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.peerDependencies['@deepseek-ai/dsh'] = '9.9.9';
  await writeFile(file, JSON.stringify(manifest));
  const inventoryFile = join(dir, 'manifest.json');
  const inventory = JSON.parse(await readFile(inventoryFile, 'utf8'));
  const item = inventory.files.find(item => item.path === 'packages/desktop-bundle/package.json');
  const modified = await readFile(file); item.bytes = modified.length; item.sha256 = hash(modified);
  await writeFile(inventoryFile, JSON.stringify(inventory));
  const digest = hash(await readFile(inventoryFile));
  await writeFile(join(dir, 'manifest.sha256'), `${digest}  manifest.json\n`);
  const result = invoke(dir, digest);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /incompatible-version/);
});
