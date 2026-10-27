import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DESKTOP_CANDIDATE_FILES } from '../../scripts/prepare-desktop-candidate.mjs';

export async function createCandidateFixture(t, parent = tmpdir()) {
  const root = await mkdtemp(join(parent, 'kont-desktop-candidate-fixture-'));
  function assertFixtureRoot() {
    const target = resolve(root);
    assert.equal(dirname(target), resolve(parent));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-desktop-candidate-fixture-'));
    return target;
  }
  t.after(async () => {
    await rm(assertFixtureRoot(), { recursive: true, force: true });
  });
  const sourceRoot = join(root, 'source');
  await mkdir(sourceRoot);
  for (const path of DESKTOP_CANDIDATE_FILES) {
    const target = resolve(sourceRoot, path);
    const withinSource = relative(sourceRoot, target);
    assert.ok(withinSource && !withinSource.startsWith('..') && !isAbsolute(withinSource));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(fileURLToPath(new URL('../../' + path, import.meta.url)), target);
  }
  // No real checkout commit or identity configuration. All commands stay in
  // this newly created fixture, containing only explicit public product inputs.
  function git(...args) {
    assertFixtureRoot();
    return execFileSync('git', ['-C', sourceRoot, '-c', 'core.autocrlf=false', '-c', `core.hooksPath=${join(root, 'no-hooks')}`, ...args], {
      encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-25T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-25T00:00:00Z' },
    });
  }
  git('init', '--quiet');
  git('add', '--force', '--', ...DESKTOP_CANDIDATE_FILES);
  git('-c', 'user.name=KONT Synthetic Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '--no-gpg-sign', '-m', 'Synthetic product-input fixture');
  return { root, sourceRoot, expectedBaseCommit: git('rev-parse', 'HEAD').trim(), git };
}
