import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { verifyDesktopRollback } from '../../../../scripts/prepare-desktop-rollback.mjs';
const root = 'evidence/local/20261024-desktop-rollback';
const expected = 'd5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const { manifest } = await verifyDesktopRollback(`${root}/candidate`, expected);
const entries = [];
for (const line of ['maker-a', 'maker-b']) {
  const frozen = JSON.parse(await readFile(`${root}/${line}/manifest.json`, 'utf8'));
  for (const item of frozen.files) {
    const bytes = await readFile(item.path);
    assert.equal(bytes.length, item.bytes, item.path); assert.equal(hash(bytes), item.sha256, item.path);
    entries.push({ line, path: item.path, bytes: bytes.length, sha256: hash(bytes), match: true });
  }
}
const profileFile = manifest.source.profilePackage;
const profileBefore = await readFile(profileFile);
assert.equal(hash(profileBefore), manifest.source.profilePackageSha256);
const profileRequire = createRequire(profileFile);
const bundleRoot = dirname(profileRequire.resolve('@kont/desktop-bundle/package.json'));
const pluginRoot = dirname(createRequire(resolve(bundleRoot, 'package.json')).resolve('@kont/dsh-plugin/package.json'));
assert.equal((await realpath(bundleRoot)).toLowerCase(), resolve(manifest.source.bundleRoot).toLowerCase());
assert.equal((await realpath(pluginRoot)).toLowerCase(), resolve(manifest.source.pluginRoot).toLowerCase());
const files = [];
for (const item of manifest.files) {
  const suffix = item.path.replace(/^packages\/(desktop-bundle|dsh-plugin)\//, '');
  const sourcePath = resolve(item.path.startsWith('packages/desktop-bundle/') ? bundleRoot : pluginRoot, suffix);
  const source = await readFile(sourcePath), artifact = await readFile(`${root}/candidate/${item.path}`);
  assert.equal(hash(source), item.sourceSha256, item.path);
  assert.deepEqual(artifact, source, item.path); // actual candidate has no transformations
  assert.equal(item.transformation, 'none');
  files.push({ path: item.path, bytes: source.length, sha256: hash(source), sourceMatched: true });
}
for (const [name, sourceRoot] of [['desktop-bundle', bundleRoot], ['dsh-plugin', pluginRoot]])
  assert.deepEqual(await readFile(`${root}/candidate/original-packages/${name}.package.json`), await readFile(resolve(sourceRoot, 'package.json')));
assert.deepEqual(await readFile(profileFile), profileBefore);
const selection = JSON.parse(await readFile(`${root}/controller/installed-selection.json`, 'utf8'));
assert.equal(selection.profilePackageSha256, hash(profileBefore));
const profileMetadata = JSON.parse(profileBefore);
assert.equal(selection.source, profileMetadata.dependencies['@kont/desktop-bundle']);
assert.equal(selection.enabled, profileMetadata.dsh.profile.bundles.includes('@kont/desktop-bundle'));
assert.equal(selection.source, manifest.source.legacyBundleSpec);
assert.equal(selection.enabled, manifest.source.selectedInProfile);
assert.equal(selection.version, JSON.parse(await readFile(resolve(bundleRoot, 'package.json'))).version);
assert.equal(selection.liveManagerQueried, false); assert.equal(selection.runtimeActiveQueried, false);
await writeFile(`${root}/checker/hash-check.json`, JSON.stringify({ task: 'KONT-DESKTOP-015',
  candidateManifestSha256: expected, manifestEntriesMatched: entries.length, mismatch: 0,
  installedSourceFilesMatched: files.length, originalPackagesMatched: 2, transformations: 0,
  profilePackageStable: true, profilePackageSha256: hash(profileBefore),
  officialParserMetadataEvidenceConsistent: true, runtimeActiveOrLiveManagerClaim: false, entries, files }, null, 2) + '\n');
console.log(JSON.stringify({ frozenEntries: entries.length, installedSourceFilesMatched: files.length, originalPackagesMatched: 2, profilePackageStable: true }));
