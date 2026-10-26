import { readFile, writeFile, mkdir, lstat, realpath, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const TARGET_HOST_VERSION = '0.2.1-rc.2';
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const legacyProductFiles = [
  'packages/desktop-bundle/package.json', 'packages/desktop-bundle/cordis.patch.yml',
  'packages/dsh-plugin/package.json',
  ...['client.cjs', 'dsh-run-read.mjs', 'index.mjs', 'kernel.mjs', 'read-audit-config.mjs',
    'run-dispatch.mjs', 'run-execution-guard.mjs', 'run-executor.mjs', 'run-observer-binding.mjs',
    'run-query.mjs', 'run-request-gate.mjs', 'run-status-panel.cjs', 'run-status-panel.css',
    'run-status-source.cjs', 'run-status-view.mjs', 'run.mjs', 'store.mjs', 'style.css']
    .map(name => `packages/dsh-plugin/src/${name}`),
  ...['client.js', 'knot-model.js', 'snapshot.js', 'workspace-state.js'].map(name => `packages/dsh-plugin/lib/${name}`),
].sort();
export const LEGACY_DESKTOP_CANDIDATE_FILES = Object.freeze(legacyProductFiles);
// The public current inventory is used by preparation; v1 remains read-only.
export const DESKTOP_CANDIDATE_FILES = Object.freeze([
  ...legacyProductFiles, 'packages/dsh-plugin/src/worksite-preview.mjs',
].sort());
const productFiles = DESKTOP_CANDIDATE_FILES;
const hash = value => createHash('sha256').update(value).digest('hex');
const samePath = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
const inside = (path, root) => { const part = relative(root, path); return !part || !part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part); };
const reject = message => { throw new Error(`Desktop candidate refused: ${message}`); };
async function regular(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || !samePath(file, await realpath(file))) reject('non-regular or redirected source');
  return readFile(file);
}
function sourcePackages(bundleBytes, pluginBytes) {
  const bundle = JSON.parse(bundleBytes), plugin = JSON.parse(pluginBytes);
  if (bundle.name !== '@kont/desktop-bundle' || plugin.name !== '@kont/dsh-plugin'
    || bundle.version !== '0.1.0' || plugin.version !== '0.1.0'
    || JSON.stringify(bundle.dependencies) !== JSON.stringify({ '@kont/dsh-plugin': 'file:../dsh-plugin' })
    || Object.keys(plugin.dependencies ?? {}).length
    || bundle.dsh?.bundle?.patch !== './cordis.patch.yml' || plugin.main !== './src/index.mjs') reject('package layout/dependencies drifted');
  for (const pkg of [bundle, plugin]) {
    if (Object.keys(pkg.peerDependencies ?? {}).length !== 1
      || pkg.peerDependencies['@deepseek-ai/dsh'] !== '0.1.7-rc.2 || 0.2.1-rc.2') reject('source host declaration drifted');
  }
  return [bundle, plugin];
}

/** Pure local directory preparation, no npm/pnpm, installation, network or
 * profile access. The sibling file: dependency stays a directory dependency;
 * portability and manager compatibility require separate isolated verification. */
export async function prepareDesktopCandidate({ sourceRoot = defaultRoot, outputDir,
  expectedBaseCommit } = {}) {
  const root = await realpath(resolve(sourceRoot));
  const gitRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true }).trim();
  if (!samePath(gitRoot, root)) reject('source must be the repository root');
  const sourceBaseCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  if (!/^[a-f0-9]{40}$/.test(expectedBaseCommit ?? '') || sourceBaseCommit !== expectedBaseCommit) reject('source base commit mismatch');
  try {
    execFileSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', ...productFiles], { stdio: 'pipe', windowsHide: true });
    execFileSync('git', ['-C', root, 'diff', '--quiet', 'HEAD', '--', ...productFiles], { stdio: 'pipe', windowsHide: true });
  } catch { reject('product inputs must match the recorded base commit'); }
  const output = resolve(outputDir ?? resolve(root, 'evidence/local/20261024-desktop-package/candidate'));
  // Output may be a fresh isolated temp tree or local evidence, never an input
  // tree, its ancestor, a profile, or a symlink/junction-redirected destination.
  if (inside(root, output) || inside(output, root) && !inside(output, resolve(root, 'evidence/local'))
    || /(?:^|[\\/])(?:profiles?|node_modules|\.git)(?:[\\/]|$)/i.test(output)) reject('unsafe output overlap/location');
  const parent = dirname(output);
  if (!samePath(parent, await realpath(parent))) reject('redirected output parent');
  try { await lstat(output); reject('output already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const inputs = new Map();
  for (const path of productFiles) inputs.set(path, await regular(resolve(root, path)));
  const packages = sourcePackages(inputs.get('packages/desktop-bundle/package.json'), inputs.get('packages/dsh-plugin/package.json'));
  const records = packages.map(pkg => ({ name: pkg.name, version: pkg.version,
    path: pkg.name === '@kont/desktop-bundle' ? 'packages/desktop-bundle' : 'packages/dsh-plugin',
    dependencies: pkg.dependencies ?? {}, sourcePeerDependencies: pkg.peerDependencies,
    peerDependencies: { '@deepseek-ai/dsh': TARGET_HOST_VERSION } }));
  const files = [], artifacts = new Map();
  for (const [path, original] of inputs) {
    let bytes = original, transformation = 'none';
    if (path.endsWith('/package.json')) {
      const pkg = JSON.parse(original); pkg.peerDependencies = { '@deepseek-ai/dsh': TARGET_HOST_VERSION };
      bytes = Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`); transformation = 'candidate-only-exact-host-peer';
    }
    artifacts.set(path, bytes);
    files.push({ path, bytes: bytes.length, sha256: hash(bytes), sourceSha256: hash(original), transformation });
  }
  const manifest = { format: 'kont-desktop-directory-candidate/v2', sourceBaseCommit, sourceState: 'tracked-product-files-match-base',
    targetHostVersion: TARGET_HOST_VERSION, layout: 'sibling-local-directories',
    portability: 'unverified-directory-candidate-not-a-standalone-tarball',
    compatibility: 'declared-target-only-not-a-test-result', packages: records,
    dependencyResolution: [{ from: 'packages/desktop-bundle', name: '@kont/dsh-plugin',
      spec: 'file:../dsh-plugin', resolvedPath: 'packages/dsh-plugin' }], files };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`, manifestSha256 = hash(serialized);
  await mkdir(output); // exclusive, never overwrite an existing candidate
  await writeFile(resolve(output, '.incomplete'), 'Not ready: preparation has not completed.\n', { flag: 'wx' });
  for (const [path, bytes] of artifacts) {
    const target = resolve(output, path); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(resolve(output, 'manifest.json'), serialized, { flag: 'wx' });
  await writeFile(resolve(output, 'manifest.sha256'), `${manifestSha256}  manifest.json\n`, { flag: 'wx' });
  // A successful candidate retains no incomplete marker; failures intentionally
  // preserve the partial tree for review and cannot be retried over the same path.
  const { unlink } = await import('node:fs/promises'); await unlink(resolve(output, '.incomplete'));
  return { outputDir: output, manifestSha256, manifest };
}

export async function verifyDesktopCandidate(outputDir, expectedManifestSha256) {
  const output = await realpath(resolve(outputDir));
  const manifestBytes = await regular(resolve(output, 'manifest.json'));
  const digest = hash(manifestBytes);
  if (expectedManifestSha256 && digest !== expectedManifestSha256) reject('manifest digest mismatch');
  if ((await regular(resolve(output, 'manifest.sha256'))).toString('utf8') !== `${digest}  manifest.json\n`) reject('manifest checksum mismatch');
  const manifest = JSON.parse(manifestBytes);
  let expectedFiles;
  if (manifest.format === 'kont-desktop-directory-candidate/v1') {
    expectedFiles = LEGACY_DESKTOP_CANDIDATE_FILES;
  } else if (manifest.format === 'kont-desktop-directory-candidate/v2') {
    expectedFiles = DESKTOP_CANDIDATE_FILES;
  } else {
    reject('unknown manifest format');
  }
  if (JSON.stringify(manifest.files?.map(f => f.path)) !== JSON.stringify(expectedFiles)) {
    reject('manifest inventory mismatch');
  }
  const expected = new Set(['manifest.json', 'manifest.sha256', ...expectedFiles]);
  const directories = new Set(expectedFiles.flatMap(path => path.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'))));
  async function walk(path, prefix = '') {
    for (const name of await readdir(path)) {
      const relativePath = prefix + name, full = resolve(path, name), info = await lstat(full);
      if (info.isSymbolicLink() || !samePath(full, await realpath(full))) reject('redirected artifact');
      if (info.isDirectory()) {
        if (!directories.has(relativePath)) reject('unlisted artifact directory');
        await walk(full, `${relativePath}/`);
      }
      else if (!info.isFile() || !expected.delete(relativePath)) reject('unlisted artifact');
    }
  }
  await walk(output);
  if (expected.size) reject('missing artifact');
  for (const item of manifest.files) {
    const bytes = await regular(resolve(output, item.path));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) reject('artifact digest mismatch');
  }
  return { manifestSha256: digest, manifest };
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: node scripts/prepare-desktop-candidate.mjs <new-output-dir> <expected-base-commit>');
  const result = await prepareDesktopCandidate({ outputDir: args[0], expectedBaseCommit: args[1] });
  console.log(JSON.stringify({ outputDir: result.outputDir, manifestSha256: result.manifestSha256,
    files: result.manifest.files.length, targetHostVersion: TARGET_HOST_VERSION, layout: result.manifest.layout }));
}
