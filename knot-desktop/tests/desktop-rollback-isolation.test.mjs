import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invoke = (root, digest) => spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe',
  ['scripts/verify-desktop-rollback.cjs', root, digest], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8', windowsHide: true, timeout: 45000 });

async function fixture(t) {
  const dir = await mkdtemp('D:/Temp/kont-rollback-artifact-test-');
  t.after(async () => {
    const target = resolve(dir);
    assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-rollback-artifact-test-'));
    await rm(target, { recursive: true, force: true });
  });
  // This is an installed-old-code artifact test, never a latest-source fixture.
  const captured = process.env.KONT_DESKTOP_ROLLBACK ?? 'evidence/local/20261024-desktop-rollback/candidate';
  await cp(resolve(captured), join(dir, 'rollback'), { recursive: true });
  return join(dir, 'rollback');
}

test('old-layout rollback installs through official offline manager and actual copied runtime/renderer', async t => {
  const root = await fixture(t), manifestBytes = await readFile(join(root, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const result = invoke(root, hash(manifestBytes));
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.officialManagerInspect, 'accepted');
  assert.equal(receipt.officialManagerInstall, 'completed-in-isolated-profile');
  assert.equal(receipt.application, 'restart-required');
  assert.equal(receipt.enabled, false);
  assert.equal(receipt.installedFilesMatched, manifest.files.length);
  assert.equal(receipt.rollbackManifestSha256, hash(manifestBytes));
  assert.ok(receipt.runtimeApply.includes('durable-readback'));
  assert.equal(receipt.rendererModuleAndSlots, true);
  assert.equal(receipt.versionExemptions, false);
  assert.equal(receipt.actualDesktopDeployment, false);
});
test('rollback refuses unreviewed manifest before creating an installation profile', async t => {
  const root = await fixture(t);
  const result = invoke(root, '0'.repeat(64));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest digest mismatch/);
});
test('rollback refuses unlisted package configuration before invoking manager', async t => {
  const root = await fixture(t), manifest = await readFile(join(root, 'manifest.json'));
  await writeFile(join(root, 'packages/desktop-bundle/.npmrc'), 'registry=https://unapproved.invalid\n');
  const result = invoke(root, hash(manifest));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /extra inventory file/);
});
