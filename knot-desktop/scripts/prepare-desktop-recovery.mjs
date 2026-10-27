import { readFile, writeFile, mkdir, lstat, realpath, readdir, unlink } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyDesktopCandidate } from './prepare-desktop-candidate.mjs';
import { verifyDesktopRollback } from './prepare-desktop-rollback.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const upgradeRoot = resolve(root, 'evidence/local/20261024-desktop-package/candidate');
const rollbackRoot = resolve(root, 'evidence/local/20261024-desktop-rollback/candidate');
export const RECOVERY_SOURCE_PINS = Object.freeze({
  upgrade: 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8',
  rollback: 'd5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336',
});
const shared = ['src/kernel.mjs', 'lib/knot-model.js', 'lib/snapshot.js', 'lib/workspace-state.js'];
const paths = ['packages/desktop-bundle/cordis.patch.yml', 'packages/desktop-bundle/package.json',
  'packages/dsh-plugin/package.json', ...['client.cjs', 'index.mjs', 'kernel.mjs', 'run.mjs', 'store.mjs', 'style.css'].map(p => `packages/dsh-plugin/src/${p}`),
  ...['client.js', 'knot-model.js', 'snapshot.js', 'workspace-state.js'].map(p => `packages/dsh-plugin/lib/${p}`)].sort();
const from = path => /\/src\/(store|run)\.mjs$/.test(path) ? 'upgrade' : 'rollback';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
const inside = (path, parent) => { const p = relative(parent, path); return !p || p !== '..' && !p.startsWith(`..${sep}`) && !isAbsolute(p); };
const refuse = reason => { throw new Error(`Desktop recovery refused: ${reason}`); };
async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || !same(path, await realpath(path))) refuse('redirected or non-regular file');
  return readFile(path);
}
async function sources() {
  if (!same(upgradeRoot, await realpath(upgradeRoot)) || !same(rollbackRoot, await realpath(rollbackRoot))) refuse('source root redirected');
  const upgrade = await verifyDesktopCandidate(upgradeRoot, RECOVERY_SOURCE_PINS.upgrade);
  const rollback = await verifyDesktopRollback(rollbackRoot, RECOVERY_SOURCE_PINS.rollback);
  for (const path of shared) {
    const name = `packages/dsh-plugin/${path}`;
    if (!(await regular(resolve(upgradeRoot, name))).equals(await regular(resolve(rollbackRoot, name)))) refuse('shared kernel/lib mismatch');
  }
  const files = [], artifacts = new Map();
  for (const path of paths) {
    const sourceArtifact = from(path), sourceRoot = sourceArtifact === 'upgrade' ? upgradeRoot : rollbackRoot;
    const sourceManifest = sourceArtifact === 'upgrade' ? upgrade.manifest : rollback.manifest;
    const bytes = await regular(resolve(sourceRoot, path)), expected = sourceManifest.files.find(file => file.path === path);
    if (!expected || bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) refuse('source changed during assembly');
    artifacts.set(path, bytes);
    files.push({ path, bytes: bytes.length, sha256: hash(bytes), sourceArtifact, sourcePath: path,
      sourceManifestSha256: RECOVERY_SOURCE_PINS[sourceArtifact] });
  }
  return { files, artifacts };
}
async function inventory(output) {
  const allowed = new Set([...paths, 'manifest.json', 'manifest.sha256']);
  const dirs = new Set(paths.flatMap(p => p.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))));
  async function walk(path, prefix = '') {
    for (const name of await readdir(path)) {
      const full = resolve(path, name), part = prefix + name, stat = await lstat(full);
      if (stat.isSymbolicLink() || !same(full, await realpath(full))) refuse('redirected inventory');
      if (stat.isDirectory()) { if (!dirs.has(part)) refuse('extra directory'); await walk(full, `${part}/`); }
      else if (!stat.isFile() || !allowed.delete(part)) refuse('extra file');
    }
  }
  await walk(output); if (allowed.size) refuse('missing file');
}

/** Derive only this reviewed 13-file combination; no new store implementation,
 * build, package installation, profile or repository product reads/writes. */
export async function prepareDesktopRecovery({ outputDir } = {}) {
  const { files, artifacts } = await sources();
  const output = resolve(outputDir ?? resolve(root, 'evidence/local/20261024-desktop-recovery/candidate'));
  if (inside(root, output) || inside(output, root) && !inside(output, resolve(root, 'evidence/local'))
    || [upgradeRoot, rollbackRoot].some(source => inside(output, source) || inside(source, output))
    || /(?:^|[\\/])(?:profiles?|node_modules|\.git)(?:[\\/]|$)/i.test(output)) refuse('unsafe output location');
  if (!same(dirname(output), await realpath(dirname(output)))) refuse('redirected output parent');
  try { await lstat(output); refuse('output already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = { format: 'kont-desktop-directory-recovery/v1',
    identity: 'derived-recovery-not-original-installed-rollback', layout: 'sibling-local-directories',
    sourcePins: RECOVERY_SOURCE_PINS, sharedKernelAndLib: shared, codeOrPeerTransformed: false,
    derivation: '015 old UI/index/package bytes; 014 run-aware store bytes and run.mjs',
    compatibility: 'requires-independent-data-and-official-manager-verification', files };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`, manifestSha256 = hash(serialized);
  await mkdir(output); await writeFile(resolve(output, '.incomplete'), 'Derived recovery incomplete.\n', { flag: 'wx' });
  for (const [path, bytes] of artifacts) {
    const target = resolve(output, path); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(resolve(output, 'manifest.json'), serialized, { flag: 'wx' });
  await writeFile(resolve(output, 'manifest.sha256'), `${manifestSha256}  manifest.json\n`, { flag: 'wx' });
  await unlink(resolve(output, '.incomplete'));
  return { outputDir: output, manifestSha256, manifest };
}

export async function verifyDesktopRecovery(outputDir, expectedManifestSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256 ?? '')) refuse('reviewed digest required');
  const output = resolve(outputDir);
  if (!same(output, await realpath(output))) refuse('redirected output root');
  const bytes = await regular(resolve(output, 'manifest.json'));
  if (hash(bytes) !== expectedManifestSha256) refuse('manifest digest mismatch');
  if ((await regular(resolve(output, 'manifest.sha256'))).toString() !== `${expectedManifestSha256}  manifest.json\n`) refuse('checksum mismatch');
  const manifest = JSON.parse(bytes), original = await sources();
  if (manifest.format !== 'kont-desktop-directory-recovery/v1' || manifest.identity !== 'derived-recovery-not-original-installed-rollback'
    || JSON.stringify(manifest.sourcePins) !== JSON.stringify(RECOVERY_SOURCE_PINS)
    || JSON.stringify(manifest.files) !== JSON.stringify(original.files)) refuse('source mapping drift');
  await inventory(output);
  for (const [path, expected] of original.artifacts)
    if (!(await regular(resolve(output, path))).equals(expected)) refuse('artifact byte mismatch');
  return { manifestSha256: expectedManifestSha256, manifest };
}

if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-desktop-recovery.mjs <new-output-dir>');
  const result = await prepareDesktopRecovery({ outputDir: process.argv[2] });
  console.log(JSON.stringify({ outputDir: result.outputDir, manifestSha256: result.manifestSha256,
    files: result.manifest.files.length, identity: result.manifest.identity }));
}
