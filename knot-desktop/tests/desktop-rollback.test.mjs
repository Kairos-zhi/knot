import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { prepareDesktopRollback, verifyDesktopRollback } from '../scripts/prepare-desktop-rollback.mjs';

// Explicit old-installed SYNTHETIC fixture, never current repository product
// code. Actual installed capture is a separate Maker evidence artifact.
async function fixture(t, relocate = false) {
  const root = await mkdtemp(join(tmpdir(), 'kont-rollback-fixture-'));
  t.after(async () => {
    const target = resolve(root);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('kont-rollback-fixture-'));
    await rm(target, { recursive: true, force: true });
  });
  const profileRoot = join(root, 'isolated-anchor'), profilePackage = join(profileRoot, 'package.json');
  const bundleRoot = join(profileRoot, 'node_modules/@kont/desktop-bundle'), pluginRoot = join(profileRoot, 'node_modules/@kont/dsh-plugin');
  await mkdir(bundleRoot, { recursive: true }); await mkdir(join(pluginRoot, 'src'), { recursive: true }); await mkdir(join(pluginRoot, 'lib'));
  const peerDependencies = { '@deepseek-ai/dsh': '0.1.7-rc.2 || 0.2.1-rc.2' };
  const bundle = { name: '@kont/desktop-bundle', version: '0.1.0', type: 'module', exports: { './package.json': './package.json' },
    dependencies: { '@kont/dsh-plugin': relocate ? `file:${join(root, 'stale-repository-code-do-not-read')}` : 'file:../dsh-plugin' },
    peerDependencies, dsh: { bundle: { patch: './cordis.patch.yml' } } };
  const plugin = { name: '@kont/dsh-plugin', version: '0.1.0', type: 'module', main: './src/index.mjs',
    exports: { './package.json': './package.json' }, peerDependencies };
  const bundleBytes = Buffer.from(JSON.stringify(bundle)), pluginBytes = Buffer.from(JSON.stringify(plugin));
  await writeFile(profilePackage, JSON.stringify({ dependencies: { '@kont/desktop-bundle': `file:${join(root, 'changed-repository-ignore')}` },
    dsh: { profile: { bundles: ['@kont/desktop-bundle'] } } }));
  await writeFile(join(bundleRoot, 'package.json'), bundleBytes); await writeFile(join(bundleRoot, 'cordis.patch.yml'), "- insert:\n    - id: kont-worksite\n      name: '@kont/dsh-plugin'\n");
  await writeFile(join(pluginRoot, 'package.json'), pluginBytes);
  for (const path of ['src/client.cjs', 'src/index.mjs', 'src/kernel.mjs', 'src/store.mjs', 'src/style.css',
    'lib/client.js', 'lib/knot-model.js', 'lib/snapshot.js', 'lib/workspace-state.js']) await writeFile(join(pluginRoot, path), `OLD_INSTALLED_SYNTHETIC_BYTES:${path}\n`);
  return { root, profilePackage, bundleRoot, pluginRoot, bundle, plugin, bundleBytes, pluginBytes,
    options: { profilePackage, outputDir: join(root, 'rollback') } };
}

test('rollback captures old installed bytes instead of legacy repository spec and preserves original package bytes and peer gates', async t => {
  const f = await fixture(t), result = await prepareDesktopRollback(f.options);
  assert.equal(result.manifest.files.length, 12); assert.equal(result.manifest.originalPackages.length, 2);
  assert.equal(result.manifest.sourceKind, 'installed-bytes-not-repository');
  assert.match(result.manifest.source.legacyBundleSpec, /changed-repository-ignore/);
  assert.equal(result.manifest.source.selectedInProfile, true);
  assert.ok(result.manifest.files.every(row => row.transformation === 'none' && row.sha256 === row.sourceSha256));
  assert.deepEqual(await readFile(join(result.outputDir, 'original-packages/desktop-bundle.package.json')), f.bundleBytes);
  assert.deepEqual(await readFile(join(result.outputDir, 'packages/desktop-bundle/package.json')), f.bundleBytes);
  assert.deepEqual(await readFile(join(result.outputDir, 'packages/dsh-plugin/package.json')), f.pluginBytes);
  assert.match(await readFile(join(result.outputDir, 'packages/dsh-plugin/src/index.mjs'), 'utf8'), /^OLD_INSTALLED_SYNTHETIC_BYTES/);
  assert.equal((await verifyDesktopRollback(result.outputDir, result.manifestSha256)).manifestSha256, result.manifestSha256);
  const before = await readFile(join(result.outputDir, 'manifest.json'));
  await assert.rejects(prepareDesktopRollback(f.options), /output already exists/);
  assert.deepEqual(await readFile(join(result.outputDir, 'manifest.json')), before);
});

test('rollback relocates only an absolute installed dependency label, retaining both original manifests and every code byte', async t => {
  const f = await fixture(t, true), result = await prepareDesktopRollback(f.options);
  const relocated = JSON.parse(await readFile(join(result.outputDir, 'packages/desktop-bundle/package.json')));
  const expected = structuredClone(f.bundle); expected.dependencies['@kont/dsh-plugin'] = 'file:../dsh-plugin';
  assert.deepEqual(relocated, expected);
  assert.deepEqual(await readFile(join(result.outputDir, 'original-packages/desktop-bundle.package.json')), f.bundleBytes);
  assert.equal(result.manifest.files.filter(row => row.transformation !== 'none').length, 1);
  assert.deepEqual(relocated.peerDependencies, f.bundle.peerDependencies);
  await verifyDesktopRollback(result.outputDir, result.manifestSha256);
});

test('rollback refuses extra inventory/dependencies, peer drift, relative escape and resolver escape without creating output', async t => {
  for (const mode of ['inventory', 'dependency', 'peer', 'relative', 'resolver']) {
    const f = await fixture(t);
    if (mode === 'inventory') await writeFile(join(f.pluginRoot, 'private.json'), 'SYNTHETIC_PRIVATE_NOT_READ');
    if (mode === 'dependency') { f.bundle.dependencies.unapproved = 'file:../other'; await writeFile(join(f.bundleRoot, 'package.json'), JSON.stringify(f.bundle)); }
    if (mode === 'peer') { f.bundle.peerDependencies['@deepseek-ai/dsh'] = '*'; await writeFile(join(f.bundleRoot, 'package.json'), JSON.stringify(f.bundle)); }
    if (mode === 'relative') { f.bundle.dependencies['@kont/dsh-plugin'] = 'file:../../outside'; await writeFile(join(f.bundleRoot, 'package.json'), JSON.stringify(f.bundle)); }
    if (mode === 'resolver') {
      const outside = join(f.root, 'outside-code'); await rename(f.pluginRoot, outside);
      await symlink(outside, f.pluginRoot, process.platform === 'win32' ? 'junction' : 'dir');
    }
    await assert.rejects(prepareDesktopRollback(f.options), /Desktop rollback refused/);
    await assert.rejects(access(f.options.outputDir), { code: 'ENOENT' });
  }
});

test('rollback hash verification refuses changed code and extra files; output cannot overlap installed code', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareDesktopRollback({ ...f.options, outputDir: join(f.pluginRoot, 'new') }), /unsafe output location/);
  const result = await prepareDesktopRollback(f.options), target = join(result.outputDir, 'packages/dsh-plugin/src/index.mjs');
  const original = await readFile(target); await writeFile(target, 'CURRENT_REPOSITORY_BYTES_ARE_NOT_OLD');
  await assert.rejects(verifyDesktopRollback(result.outputDir, result.manifestSha256), /artifact digest mismatch/);
  await writeFile(target, original); await writeFile(join(result.outputDir, 'unexpected.json'), '{}');
  await assert.rejects(verifyDesktopRollback(result.outputDir, result.manifestSha256), /extra inventory file/);
  await assert.rejects(verifyDesktopRollback(result.outputDir, '0'.repeat(64)), /manifest digest mismatch/);
});
