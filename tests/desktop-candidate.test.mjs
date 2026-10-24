import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareDesktopCandidate, verifyDesktopCandidate, DESKTOP_CANDIDATE_FILES, TARGET_HOST_VERSION } from '../scripts/prepare-desktop-candidate.mjs';

const expectedBaseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kont-desktop-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('directory candidate is reproducible, hash verified, exact-host declared and preserves sibling dependency without a portable tarball claim', async t => {
  const root = await fixture(t);
  const original = await readFile('packages/dsh-plugin/package.json');
  const first = await prepareDesktopCandidate({ outputDir: join(root, 'first'), expectedBaseCommit });
  const second = await prepareDesktopCandidate({ outputDir: join(root, 'second'), expectedBaseCommit });
  assert.equal(first.manifestSha256, second.manifestSha256);
  assert.equal((await verifyDesktopCandidate(first.outputDir, first.manifestSha256)).manifestSha256, first.manifestSha256);
  assert.deepEqual(first.manifest.files.map(file => file.path), DESKTOP_CANDIDATE_FILES);
  assert.equal(first.manifest.sourceBaseCommit, expectedBaseCommit);
  assert.equal(first.manifest.targetHostVersion, TARGET_HOST_VERSION);
  assert.equal(first.manifest.compatibility, 'declared-target-only-not-a-test-result');
  assert.match(first.manifest.portability, /unverified-directory.*not-a-standalone-tarball/);
  const bundle = JSON.parse(await readFile(join(first.outputDir, 'packages/desktop-bundle/package.json')));
  const plugin = JSON.parse(await readFile(join(first.outputDir, 'packages/dsh-plugin/package.json')));
  assert.equal(bundle.version, '0.1.0'); assert.equal(plugin.version, '0.1.0');
  assert.equal(bundle.dependencies['@kont/dsh-plugin'], 'file:../dsh-plugin');
  assert.equal(resolve(first.outputDir, 'packages/desktop-bundle', '../dsh-plugin'), resolve(first.outputDir, 'packages/dsh-plugin'));
  assert.equal(bundle.peerDependencies['@deepseek-ai/dsh'], '0.2.1-rc.2');
  assert.equal(plugin.peerDependencies['@deepseek-ai/dsh'], '0.2.1-rc.2');
  assert.deepEqual(await readFile('packages/dsh-plugin/package.json'), original);
  for (const file of first.manifest.files) assert.doesNotMatch(file.path, /(?:^|\/)(?:credentials?|private|evidence|tests?|node_modules|profiles?)(?:\/|$)/i);
  assert.ok(first.manifest.files.some(file => file.path.endsWith('/src/run-query.mjs')));
  assert.ok(first.manifest.files.some(file => file.path.endsWith('/src/run-status-panel.cjs')));
  assert.ok(first.manifest.files.some(file => file.path.endsWith('/lib/client.js')));
});

test('candidate refuses existing outputs, source/path overlaps, redirected parents and wrong base without replacing bytes', async t => {
  const root = await fixture(t), outputDir = join(root, 'candidate');
  const candidate = await prepareDesktopCandidate({ outputDir, expectedBaseCommit });
  const before = await readFile(join(outputDir, 'manifest.json'));
  await assert.rejects(prepareDesktopCandidate({ outputDir, expectedBaseCommit }), /output already exists/);
  assert.deepEqual(await readFile(join(outputDir, 'manifest.json')), before);
  await assert.rejects(prepareDesktopCandidate({ outputDir: process.cwd(), expectedBaseCommit }), /unsafe output/);
  await assert.rejects(prepareDesktopCandidate({ outputDir: resolve('packages/desktop-bundle/new'), expectedBaseCommit }), /unsafe output/);
  await assert.rejects(prepareDesktopCandidate({ outputDir: join(root, 'wrong-base'), expectedBaseCommit: '0'.repeat(40) }), /base commit mismatch/);
  const target = join(root, 'target'), redirected = join(root, 'redirected');
  await mkdir(target); await symlink(target, redirected, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareDesktopCandidate({ outputDir: join(redirected, 'candidate'), expectedBaseCommit }), /redirected output parent/);
  await assert.rejects(verifyDesktopCandidate(outputDir, '0'.repeat(64)), /manifest digest mismatch/);
  assert.equal((await verifyDesktopCandidate(outputDir, candidate.manifestSha256)).manifestSha256, candidate.manifestSha256);
});

test('candidate verification rejects changed bytes, extra private files and unlisted directories', async t => {
  const root = await fixture(t), outputDir = join(root, 'candidate');
  const candidate = await prepareDesktopCandidate({ outputDir, expectedBaseCommit });
  const client = join(outputDir, 'packages/dsh-plugin/lib/client.js'), bytes = await readFile(client);
  await writeFile(client, 'changed');
  await assert.rejects(verifyDesktopCandidate(outputDir, candidate.manifestSha256), /artifact digest mismatch/);
  await writeFile(client, bytes);
  const extra = join(outputDir, 'private.json'); await writeFile(extra, 'SYNTHETIC_PRIVATE_SENTINEL');
  await assert.rejects(verifyDesktopCandidate(outputDir, candidate.manifestSha256), /unlisted artifact/); await rm(extra);
  await mkdir(join(outputDir, 'node_modules'));
  await assert.rejects(verifyDesktopCandidate(outputDir, candidate.manifestSha256), /unlisted artifact directory/);
});
