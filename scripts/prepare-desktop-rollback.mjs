import { readFile, writeFile, mkdir, lstat, realpath, readdir, unlink } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep, basename } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const INSTALLED_DESKTOP_PROFILE_PACKAGE = 'D:/DSH-Desktop/home/profiles/desktop/package.json';
const repository = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
const inside = (path, root) => { const part = relative(root, path); return !part || part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); };
const fail = reason => { throw new Error(`Desktop rollback refused: ${reason}`); };
const bundleFiles = ['cordis.patch.yml', 'package.json'];
const pluginFiles = ['package.json', ...['client.cjs', 'index.mjs', 'kernel.mjs', 'store.mjs', 'style.css'].map(p => `src/${p}`),
  ...['client.js', 'knot-model.js', 'snapshot.js', 'workspace-state.js'].map(p => `lib/${p}`)].sort();
const productPaths = [...bundleFiles.map(p => `packages/desktop-bundle/${p}`), ...pluginFiles.map(p => `packages/dsh-plugin/${p}`)].sort();
const originals = ['original-packages/desktop-bundle.package.json', 'original-packages/dsh-plugin.package.json'];
async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || !same(path, await realpath(path))) fail('non-regular or redirected file');
  return readFile(path);
}
async function inventory(root, expected) {
  const remaining = new Set(expected), dirs = new Set(expected.flatMap(p => p.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
  async function walk(path, prefix = '') {
    for (const name of await readdir(path)) {
      const full = resolve(path, name), part = prefix + name, stat = await lstat(full);
      if (stat.isSymbolicLink() || !same(full, await realpath(full))) fail('redirected inventory');
      if (stat.isDirectory()) { if (!dirs.has(part)) fail('extra inventory directory'); await walk(full, `${part}/`); }
      else if (!stat.isFile() || !remaining.delete(part)) fail('extra inventory file');
    }
  }
  await walk(root); if (remaining.size) fail('missing inventory file');
}
function metadata(bundle, plugin, bundleRoot, pluginRoot) {
  if (bundle.name !== '@kont/desktop-bundle' || plugin.name !== '@kont/dsh-plugin'
    || bundle.version !== '0.1.0' || plugin.version !== '0.1.0'
    || bundle.dsh?.bundle?.patch !== './cordis.patch.yml' || plugin.main !== './src/index.mjs') fail('unexpected installed package identity');
  for (const pkg of [bundle, plugin]) {
    for (const field of ['scripts', 'optionalDependencies', 'devDependencies', 'bundledDependencies', 'bundleDependencies', 'peerDependenciesMeta', 'overrides', 'resolutions', 'pnpm'])
      if (pkg[field] !== undefined && Object.keys(pkg[field]).length) fail('extra dependency or lifecycle metadata');
    if (Object.keys(pkg.peerDependencies ?? {}).length !== 1
      || pkg.peerDependencies['@deepseek-ai/dsh'] !== '0.1.7-rc.2 || 0.2.1-rc.2') fail('installed host peer drift');
  }
  if (Object.keys(plugin.dependencies ?? {}).length || Object.keys(bundle.dependencies ?? {}).length !== 1
    || typeof bundle.dependencies?.['@kont/dsh-plugin'] !== 'string') fail('extra dependency');
  const spec = bundle.dependencies['@kont/dsh-plugin'];
  if (!spec.startsWith('file:') || !spec.slice(5)) fail('unsupported dependency spec');
  const local = spec.slice(5);
  // Absolute legacy specs are metadata only, never a source of rollback bytes.
  // A relative dependency must already identify the resolver-proven sibling.
  if (!isAbsolute(local) && !same(resolve(bundleRoot, local), pluginRoot)) fail('relative dependency escape');
}

/** Capture only installed package code selected by Node/Electron's resolver.
 * No repository product reads, profile writes, package manager or model calls. */
export async function prepareDesktopRollback({ outputDir, profilePackage = INSTALLED_DESKTOP_PROFILE_PACKAGE } = {}) {
  const profileFile = resolve(profilePackage), profileRoot = dirname(profileFile);
  if (basename(profileFile) !== 'package.json' || !same(profileRoot, await realpath(profileRoot))) fail('invalid profile package anchor');
  const profileBytes = await regular(profileFile), profile = JSON.parse(profileBytes);
  const profileRequire = createRequire(profileFile);
  const bundleFile = profileRequire.resolve('@kont/desktop-bundle/package.json');
  const pluginFile = createRequire(bundleFile).resolve('@kont/dsh-plugin/package.json');
  const bundleRoot = dirname(bundleFile), pluginRoot = dirname(pluginFile), modules = resolve(profileRoot, 'node_modules');
  if (!inside(bundleRoot, modules) || !inside(pluginRoot, modules) || same(bundleRoot, pluginRoot)
    || !same(bundleRoot, await realpath(bundleRoot)) || !same(pluginRoot, await realpath(pluginRoot))) fail('installed dependency escaped profile');
  await inventory(bundleRoot, bundleFiles); await inventory(pluginRoot, pluginFiles);
  const bundleBytes = await regular(bundleFile), pluginBytes = await regular(pluginFile);
  const bundle = JSON.parse(bundleBytes), plugin = JSON.parse(pluginBytes);
  metadata(bundle, plugin, bundleRoot, pluginRoot);
  const source = new Map();
  for (const part of bundleFiles) source.set(`packages/desktop-bundle/${part}`, await regular(resolve(bundleRoot, part)));
  for (const part of pluginFiles) source.set(`packages/dsh-plugin/${part}`, await regular(resolve(pluginRoot, part)));
  if (!source.get('packages/desktop-bundle/package.json').equals(bundleBytes)
    || !source.get('packages/dsh-plugin/package.json').equals(pluginBytes)
    || !(await regular(profileFile)).equals(profileBytes)) fail('source changed while capturing');

  const output = resolve(outputDir ?? resolve(repository, 'evidence/local/20261024-desktop-rollback/candidate'));
  if (inside(output, profileRoot) || inside(profileRoot, output) || inside(repository, output)
    || inside(output, repository) && !inside(output, resolve(repository, 'evidence/local'))
    || /(?:^|[\\/])(?:profiles?|node_modules|\.git)(?:[\\/]|$)/i.test(output)) fail('unsafe output location');
  if (!same(dirname(output), await realpath(dirname(output)))) fail('redirected output parent');
  try { await lstat(output); fail('output already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const artifacts = new Map(source), files = [];
  if (bundle.dependencies['@kont/dsh-plugin'] !== 'file:../dsh-plugin') {
    const relocated = structuredClone(bundle); relocated.dependencies['@kont/dsh-plugin'] = 'file:../dsh-plugin';
    artifacts.set('packages/desktop-bundle/package.json', Buffer.from(`${JSON.stringify(relocated, null, 2)}\n`));
  }
  for (const path of productPaths) {
    const bytes = artifacts.get(path), original = source.get(path);
    files.push({ path, bytes: bytes.length, sha256: hash(bytes), sourceSha256: hash(original),
      transformation: bytes.equals(original) ? 'none' : 'bundle-plugin-dependency-relocation-only' });
  }
  const originalPackages = originals.map((path, i) => {
    const bytes = i === 0 ? bundleBytes : pluginBytes; artifacts.set(path, bytes);
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
  const manifest = { format: 'kont-desktop-directory-rollback/v1', sourceKind: 'installed-bytes-not-repository',
    layout: 'sibling-local-directories', portability: 'requires-isolated-official-manager-verification',
    source: { profilePackage: profileFile, profilePackageSha256: hash(profileBytes),
      legacyBundleSpec: profile.dependencies?.['@kont/desktop-bundle'] ?? null,
      selectedInProfile: profile.dsh?.profile?.bundles?.includes('@kont/desktop-bundle') === true,
      bundleRoot, pluginRoot },
    packages: [bundle, plugin].map((p, i) => ({ name: p.name, version: p.version,
      path: i === 0 ? 'packages/desktop-bundle' : 'packages/dsh-plugin', peerDependencies: p.peerDependencies })),
    dependencyResolution: { originalSpec: bundle.dependencies['@kont/dsh-plugin'], relocatedSpec: 'file:../dsh-plugin',
      source: 'installed-resolver-not-legacy-spec', resolvedPath: 'packages/dsh-plugin' }, files, originalPackages };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`, manifestSha256 = hash(serialized);
  // Recheck the complete old code inventory and every captured byte before any
  // output write. This detects drift during capture without locking the profile.
  await inventory(bundleRoot, bundleFiles); await inventory(pluginRoot, pluginFiles);
  for (const [path, bytes] of source) {
    const isBundle = path.startsWith('packages/desktop-bundle/');
    const part = path.replace(/^packages\/(desktop-bundle|dsh-plugin)\//, '');
    if (!(await regular(resolve(isBundle ? bundleRoot : pluginRoot, part))).equals(bytes)) fail('source changed while capturing');
  }
  if (!(await regular(profileFile)).equals(profileBytes)) fail('profile metadata changed while capturing');
  await mkdir(output); await writeFile(resolve(output, '.incomplete'), 'Rollback capture incomplete.\n', { flag: 'wx' });
  for (const [path, bytes] of artifacts) {
    const full = resolve(output, path); await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(resolve(output, 'manifest.json'), serialized, { flag: 'wx' });
  await writeFile(resolve(output, 'manifest.sha256'), `${manifestSha256}  manifest.json\n`, { flag: 'wx' });
  await unlink(resolve(output, '.incomplete'));
  return { outputDir: output, manifestSha256, manifest };
}

export async function verifyDesktopRollback(outputDir, expectedManifestSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256 ?? '')) fail('reviewed manifest digest required');
  const output = resolve(outputDir);
  if (!same(output, await realpath(output))) fail('redirected output root');
  const bytes = await regular(resolve(output, 'manifest.json'));
  if (hash(bytes) !== expectedManifestSha256) fail('manifest digest mismatch');
  if ((await regular(resolve(output, 'manifest.sha256'))).toString() !== `${expectedManifestSha256}  manifest.json\n`) fail('checksum mismatch');
  const manifest = JSON.parse(bytes);
  if (manifest.format !== 'kont-desktop-directory-rollback/v1'
    || JSON.stringify(manifest.files?.map(f => f.path)) !== JSON.stringify(productPaths)
    || JSON.stringify(manifest.originalPackages?.map(f => f.path)) !== JSON.stringify(originals)) fail('manifest inventory drift');
  await inventory(output, [...productPaths, ...originals, 'manifest.json', 'manifest.sha256']);
  for (const file of [...manifest.files, ...manifest.originalPackages]) {
    const data = await regular(resolve(output, file.path));
    if (data.length !== file.bytes || hash(data) !== file.sha256) fail('artifact digest mismatch');
  }
  const oldBundle = JSON.parse(await regular(resolve(output, originals[0]))), oldPlugin = JSON.parse(await regular(resolve(output, originals[1])));
  const relocated = JSON.parse(await regular(resolve(output, 'packages/desktop-bundle/package.json')));
  const expected = structuredClone(oldBundle); expected.dependencies['@kont/dsh-plugin'] = 'file:../dsh-plugin';
  if (JSON.stringify(expected) !== JSON.stringify(relocated)
    || !((await regular(resolve(output, originals[1]))).equals(await regular(resolve(output, 'packages/dsh-plugin/package.json'))))) fail('unauthorized package transformation');
  metadata(relocated, oldPlugin, resolve(output, 'packages/desktop-bundle'), resolve(output, 'packages/dsh-plugin'));
  return { manifestSha256: expectedManifestSha256, manifest };
}

if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-desktop-rollback.mjs <new-output-dir>');
  const result = await prepareDesktopRollback({ outputDir: process.argv[2] });
  console.log(JSON.stringify({ outputDir: result.outputDir, manifestSha256: result.manifestSha256,
    files: result.manifest.files.length, originalPackages: result.manifest.originalPackages.length, source: result.manifest.source }));
}
