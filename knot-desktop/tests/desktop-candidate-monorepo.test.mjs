import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCandidateFixture } from './helpers/desktop-candidate-fixture.mjs';
import { prepareDesktopCandidate, verifyDesktopCandidate } from '../scripts/prepare-desktop-candidate.mjs';

async function nested(t) {
  const f = await createCandidateFixture(t);
  await mkdir(join(f.sourceRoot, 'knot-desktop'));
  f.git('mv', '--', 'packages', 'knot-desktop/packages');
  f.git('-c', 'user.name=Knot Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'Synthetic monorepo layout');
  const head = f.git('rev-parse', 'HEAD').trim(), sourceRoot = join(f.sourceRoot, 'knot-desktop');
  return { ...f, moduleRoot: sourceRoot, head, prepare: outputDir => prepareDesktopCandidate({ sourceRoot, expectedBaseCommit: head, outputDir }) };
}
test('nested candidate binds the real repository HEAD and all 26 prefixed source blobs without changing artifact layout', async t => {
  const f = await nested(t), output = join(f.root, 'candidate');
  const candidate = await f.prepare(output), { manifest: m } = await verifyDesktopCandidate(output, candidate.manifestSha256);
  assert.equal(m.format, 'kont-desktop-directory-candidate/v3');
  assert.equal(m.sourceBaseCommit, f.head); assert.equal(m.sourceModulePath, 'knot-desktop');
  assert.equal(m.files.length, 26); assert.equal(m.sourceFiles.length, 26);
  for (const item of m.sourceFiles) {
    assert.equal(item.repoPath, 'knot-desktop/' + item.path);
    assert.equal(item.sha256, createHash('sha256').update(await readFile(join(f.sourceRoot, item.repoPath))).digest('hex'));
  }
  assert.equal((await f.prepare(join(f.root, 'second'))).manifestSha256, candidate.manifestSha256);
});
test('nested source refuses staged drift, missing tracked inputs, wrong HEAD and non-module nested roots', async t => {
  const f = await nested(t), file = 'knot-desktop/packages/dsh-plugin/src/worksite-preview.mjs';
  const bytes = await readFile(join(f.sourceRoot, file));
  await writeFile(join(f.sourceRoot, file), 'changed');
  f.git('add', '--', file);
  await assert.rejects(f.prepare(join(f.root, 'dirty')), /product inputs must match/);
  await writeFile(join(f.sourceRoot, file), bytes);
  // Working bytes equal HEAD but the index still differs: this also rejects.
  await assert.rejects(f.prepare(join(f.root, 'staged')), /product inputs must match/);
  f.git('add', '--', file);
  await assert.rejects(prepareDesktopCandidate({ sourceRoot: f.moduleRoot, expectedBaseCommit: '0'.repeat(40), outputDir: join(f.root, 'wrong') }), /base commit mismatch/);
  f.git('rm', '--cached', '--', file);
  await assert.rejects(f.prepare(join(f.root, 'missing')), /product inputs must match/);
  await mkdir(join(f.sourceRoot, 'other'));
  await assert.rejects(prepareDesktopCandidate({ sourceRoot: join(f.sourceRoot, 'other'), expectedBaseCommit: f.head, outputDir: join(f.root, 'other') }), /fixed knot-desktop module/);
});
test('nested output cannot write into another repository input or follow a module junction', async t => {
  const f = await nested(t);
  await assert.rejects(f.prepare(join(f.sourceRoot, 'new-product')), /unsafe output/);
  await assert.rejects(f.prepare(f.sourceRoot), /unsafe output/);
  const link = join(f.sourceRoot, 'alias');
  await symlink(f.moduleRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareDesktopCandidate({ sourceRoot: link, expectedBaseCommit: f.head, outputDir: join(f.root, 'redirected') }), /redirected source/);
});
test('v3 verifier rejects a recomputed manifest with altered module or source mapping', async t => {
  const f = await nested(t);
  for (const kind of ['module', 'mapping']) {
    const candidate = await f.prepare(join(f.root, kind));
    const m = JSON.parse(await readFile(join(candidate.outputDir, 'manifest.json')));
    if (kind === 'module') m.sourceModulePath = 'other'; else m.sourceFiles[0].repoPath = '../escape';
    const bytes = JSON.stringify(m, null, 2) + '\n', digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(candidate.outputDir, 'manifest.json'), bytes);
    await writeFile(join(candidate.outputDir, 'manifest.sha256'), `${digest}  manifest.json\n`);
    await assert.rejects(verifyDesktopCandidate(candidate.outputDir, digest), /source provenance mismatch/);
  }
});
test('a shadow Git repository inside the fixed module cannot bypass the outer HEAD provenance', async t => {
  const f = await nested(t);
  execFileSync('git', ['-C', f.moduleRoot, 'init', '--quiet'], { windowsHide: true });
  await assert.rejects(f.prepare(join(f.root, 'shadow')), /fixed module cannot be its own repository root/);
});
