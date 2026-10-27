import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir, symlink, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepareDesktopCandidate, verifyDesktopCandidate, DESKTOP_CANDIDATE_FILES, LEGACY_DESKTOP_CANDIDATE_FILES, TARGET_HOST_VERSION } from '../scripts/prepare-desktop-candidate.mjs';
import { createCandidateFixture } from './helpers/desktop-candidate-fixture.mjs';

async function fixture(t) {
  const f = await createCandidateFixture(t);
  return { ...f, prepare: outputDir => prepareDesktopCandidate({ sourceRoot: f.sourceRoot, outputDir, expectedBaseCommit: f.expectedBaseCommit }) };
}
async function rewriteManifest(outputDir, change) {
  const file = join(outputDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  change(manifest);
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const digest = createHash('sha256').update(bytes).digest('hex');
  await writeFile(file, bytes);
  await writeFile(join(outputDir, 'manifest.sha256'), `${digest}  manifest.json\n`);
  return digest;
}

test('directory candidate is reproducible, hash verified, exact-host declared and preserves sibling dependency without a portable tarball claim', async t => {
  const { root, prepare, expectedBaseCommit } = await fixture(t);
  const original = await readFile(new URL('../packages/dsh-plugin/package.json', import.meta.url));
  const first = await prepare(join(root, 'first'));
  const second = await prepare(join(root, 'second'));
  assert.equal(first.manifestSha256, second.manifestSha256);
  assert.equal((await verifyDesktopCandidate(first.outputDir, first.manifestSha256)).manifestSha256, first.manifestSha256);
  assert.deepEqual(first.manifest.files.map(file => file.path), DESKTOP_CANDIDATE_FILES);
  assert.equal(first.manifest.format, 'kont-desktop-directory-candidate/v2');
  assert.equal(first.manifest.files.length, 26);
  assert.equal(LEGACY_DESKTOP_CANDIDATE_FILES.length, 25);
  assert.ok(first.manifest.files.some(file => file.path.endsWith('/src/worksite-preview.mjs')));
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
  assert.deepEqual(await readFile(new URL('../packages/dsh-plugin/package.json', import.meta.url)), original);
  for (const file of first.manifest.files) assert.doesNotMatch(file.path, /(?:^|\/)(?:credentials?|private|evidence|tests?|node_modules|profiles?)(?:\/|$)/i);
  assert.ok(first.manifest.files.some(file => file.path.endsWith('/src/run-query.mjs')));
  assert.ok(first.manifest.files.some(file => file.path.endsWith('/src/run-status-panel.cjs')));
  assert.ok(first.manifest.files.some(file => file.path.endsWith('/lib/client.js')));
});

test('candidate refuses existing outputs, source/path overlaps, redirected parents and wrong base without replacing bytes', async t => {
  const { root, prepare, sourceRoot, expectedBaseCommit } = await fixture(t), outputDir = join(root, 'candidate');
  const candidate = await prepare(outputDir);
  const before = await readFile(join(outputDir, 'manifest.json'));
  await assert.rejects(prepare(outputDir), /output already exists/);
  assert.deepEqual(await readFile(join(outputDir, 'manifest.json')), before);
  await assert.rejects(prepare(sourceRoot), /unsafe output/);
  await assert.rejects(prepare(join(sourceRoot, 'packages/desktop-bundle/new')), /unsafe output/);
  await assert.rejects(prepareDesktopCandidate({ sourceRoot, outputDir: join(root, 'wrong-base'), expectedBaseCommit: '0'.repeat(40) }), /base commit mismatch/);
  const target = join(root, 'target'), redirected = join(root, 'redirected');
  await mkdir(target); await symlink(target, redirected, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepare(join(redirected, 'candidate')), /redirected output parent/);
  await assert.rejects(verifyDesktopCandidate(outputDir, '0'.repeat(64)), /manifest digest mismatch/);
  assert.equal((await verifyDesktopCandidate(outputDir, candidate.manifestSha256)).manifestSha256, candidate.manifestSha256);
});

test('candidate verification rejects changed bytes, extra private files and unlisted directories', async t => {
  const { root, prepare } = await fixture(t), outputDir = join(root, 'candidate');
  const candidate = await prepare(outputDir);
  const client = join(outputDir, 'packages/dsh-plugin/lib/client.js'), bytes = await readFile(client);
  await writeFile(client, 'changed');
  await assert.rejects(verifyDesktopCandidate(outputDir, candidate.manifestSha256), /artifact digest mismatch/);
  await writeFile(client, bytes);
  const extra = join(outputDir, 'private.json'); await writeFile(extra, 'SYNTHETIC_PRIVATE_SENTINEL');
  await assert.rejects(verifyDesktopCandidate(outputDir, candidate.manifestSha256), /unlisted artifact/); await rm(extra);
  await mkdir(join(outputDir, 'node_modules'));
  await assert.rejects(verifyDesktopCandidate(outputDir, candidate.manifestSha256), /unlisted artifact directory/);
});

test('manifest versions require their exact frozen inventory even after an attacker recomputes checksums', async t => {
  const { root, prepare } = await fixture(t);
  for (const format of ['kont-desktop-directory-candidate/v1', 'kont-desktop-directory-candidate/v99']) {
    const candidate = await prepare(join(root, format.endsWith('v1') ? 'wrong-v1' : 'unknown'));
    const digest = await rewriteManifest(candidate.outputDir, manifest => { manifest.format = format; });
    await assert.rejects(verifyDesktopCandidate(candidate.outputDir, digest), /inventory mismatch|unknown manifest format/);
  }
  const candidate = await prepare(join(root, 'legacy-shape'));
  const addedPath = 'packages/dsh-plugin/src/worksite-preview.mjs';
  await rm(join(candidate.outputDir, addedPath));
  const v2With25 = await rewriteManifest(candidate.outputDir, manifest => { manifest.files = manifest.files.filter(file => file.path !== addedPath); });
  await assert.rejects(verifyDesktopCandidate(candidate.outputDir, v2With25), /inventory mismatch/);
  const legacyDigest = await rewriteManifest(candidate.outputDir, manifest => { manifest.format = 'kont-desktop-directory-candidate/v1'; });
  assert.equal((await verifyDesktopCandidate(candidate.outputDir, legacyDigest)).manifest.files.length, 25);
  const forged = await rewriteManifest(candidate.outputDir, manifest => { manifest.files[0].path = 'packages/dsh-plugin/src/arbitrary.mjs'; });
  await assert.rejects(verifyDesktopCandidate(candidate.outputDir, forged), /inventory mismatch/);
});

test('missing and redirected artifacts fail and dirty or untracked source inputs cannot prepare', async t => {
  const { root, prepare, sourceRoot, git } = await fixture(t);
  const candidate = await prepare(join(root, 'candidate'));
  const modulePath = 'packages/dsh-plugin/src/worksite-preview.mjs';
  const artifact = join(candidate.outputDir, modulePath), bytes = await readFile(artifact);
  await rm(artifact);
  await assert.rejects(verifyDesktopCandidate(candidate.outputDir, candidate.manifestSha256), /missing artifact/);
  await writeFile(artifact, bytes);
  const sourceDirectory = join(candidate.outputDir, 'packages/dsh-plugin/src');
  const redirected = join(root, 'source-copy');
  await rename(sourceDirectory, redirected);
  await symlink(redirected, sourceDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyDesktopCandidate(candidate.outputDir, candidate.manifestSha256), /redirected artifact/);
  await writeFile(join(sourceRoot, modulePath), 'dirty input');
  await assert.rejects(prepare(join(root, 'dirty')), /product inputs must match/);
  git('rm', '--cached', '--', modulePath);
  await assert.rejects(prepare(join(root, 'untracked')), /product inputs must match/);
});

test('historical 014 candidate still verifies at its original pin without changing bytes', async () => {
  const root = fileURLToPath(new URL('./fixtures/historical-043-044/014', import.meta.url));
  const pin = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
  const before = await readFile(join(root, 'manifest.json'));
  const result = await verifyDesktopCandidate(root, pin);
  assert.equal(result.manifest.format, 'kont-desktop-directory-candidate/v1');
  assert.deepEqual(result.manifest.files.map(file => file.path), LEGACY_DESKTOP_CANDIDATE_FILES);
  assert.deepEqual(await readFile(join(root, 'manifest.json')), before);
});
