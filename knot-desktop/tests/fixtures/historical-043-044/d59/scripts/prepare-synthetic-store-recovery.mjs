import { readFile, writeFile, mkdir, mkdtemp, rm, lstat, realpath, readdir } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const oldRoot = resolve(root, 'evidence/local/20261024-desktop-recovery/candidate');
const oldPin = '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d';
const pins = Object.freeze({
  'src/index.mjs': '2478eff9523bee134f87eab0c101fd7629a5892342f1ab575b9fd5f61e32154b',
  'src/store.mjs': '229cba4121f7eff22f7e3f677950e44b5919e1f85e4473d16fbcd520ee24d1ff',
  'src/kernel.mjs': 'a69609f1c01c369c15dd606b3eb7d23fe0b61aa64aa453b7ff1fdc03c2368a13',
  'src/run.mjs': 'd325209833742ef0f12f4a848219fcc935fd334fe13c8b76429b11de2a86c36b',
  'src/worksite-preview.mjs': '8074f18a8fe81e7a8f61127a8f52f60988c0bf83b159e932323771b7f25f652c',
  'src/run-observer-binding.mjs': '05666211a3cae846146e86b5547b98773cb6001286a6fa338adcfe81d828eb9b',
  'src/read-audit-config.mjs': 'a2bf191fd67172b0ced563451741e19773c6ba64f57ad88149381bc9fc830447',
  'src/dsh-run-read.mjs': 'f0b538ed713b11d16e31b4e32f163a04d08ed1398b0e1c0d85da0a594ac81923',
  'src/run-query.mjs': '8abc195d88c20578b8ddc4f4327a64803c27f7223c80c533bf6aa6d59494347e',
  'lib/snapshot.js': '7eec9b84f108e0412e95d82c1cf57b4ee6d8a2da4b28320a75292469bf1bea94',
  'lib/workspace-state.js': 'e52cf42cfcd4a6b2366d734074c31a05f11ff106073ff8ea0e9da415e0c304a4',
  'lib/knot-model.js': 'cc941f6a79c0f06379679faaed3fb4ad3823e0e52dc8e4fc35228e379c3bf8e9',
  'package.json': 'a4332bf747d1da3b6bc4969044e7afda8bc1e20b3442fa489396aca347ea67fb',
});
const dataFiles = ['src/store.mjs', 'src/kernel.mjs', 'src/run.mjs', 'src/worksite-preview.mjs', 'lib/snapshot.js', 'lib/workspace-state.js', 'lib/knot-model.js'];
const carrierFiles = ['packages/desktop-bundle/package.json', 'packages/desktop-bundle/cordis.patch.yml', 'packages/dsh-plugin/package.json',
  'packages/dsh-plugin/src/index.mjs', 'packages/dsh-plugin/src/client.cjs', 'packages/dsh-plugin/src/style.css', 'packages/dsh-plugin/lib/client.js'];
const issued = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const refuse = code => { const error = new Error(code); error.code = code; throw error; };
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || !same(path, await realpath(path))) refuse('SOURCE_REDIRECTED');
  const bytes = await readFile(path);
  if (!same(path, await realpath(path))) refuse('SOURCE_REDIRECTED');
  return bytes;
}
async function inventory(directory, path = directory) {
  const found = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const item = join(path, entry.name);
    if (entry.isSymbolicLink() || !same(item, await realpath(item))) refuse('ARTIFACT_REDIRECTED');
    if (entry.isDirectory()) found.push(...await inventory(directory, item));
    else if (entry.isFile()) found.push(relative(directory, item).replaceAll('\\', '/'));
    else refuse('ARTIFACT_NOT_REGULAR');
  }
  return found.sort();
}
async function removeOwned(directory) {
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !relative(resolve(tmpdir()), target).startsWith('kont-synthetic-recovery-044-')
    || !same(target, await realpath(target))) refuse('CLEANUP_PATH');
  await rm(target, { recursive: true, force: true });
}

/** New temporary synthetic combination; never an installable root candidate. */
export async function prepareSyntheticStoreRecovery() {
  if (arguments.length) refuse('UNKNOWN_OPTIONS');
  const sources = [], files = [];
  const manifestPath = resolve(oldRoot, 'manifest.json'), manifestBytes = await regular(manifestPath);
  if (sha(manifestBytes) !== oldPin) refuse('OLD_MANIFEST_MISMATCH');
  sources.push({ path: manifestPath, bytes: manifestBytes });
  const old = JSON.parse(manifestBytes);
  for (const [name, pin] of Object.entries(pins)) {
    const sourcePath = `packages/dsh-plugin/${name}`, path = resolve(root, sourcePath), bytes = await regular(path);
    if (sha(bytes) !== pin) refuse('CURRENT_SOURCE_MISMATCH');
    sources.push({ path, bytes });
    files.push({ path: `a/${sourcePath}`, source: 'current-live', sourcePath, bytes, sha256: pin });
    if (dataFiles.includes(name)) files.push({ path: `b/${sourcePath}`, source: 'current-data', sourcePath, bytes, sha256: pin });
  }
  for (const sourcePath of carrierFiles) {
    const entries = old.files.filter(entry => entry.path === sourcePath);
    if (entries.length !== 1) refuse('OLD_MANIFEST_MISMATCH');
    const path = resolve(oldRoot, sourcePath), bytes = await regular(path);
    if (sha(bytes) !== entries[0].sha256 || bytes.length !== entries[0].bytes) refuse('OLD_SOURCE_MISMATCH');
    sources.push({ path, bytes });
    files.push({ path: `b/${sourcePath}`, source: 'reviewed-017-carrier', sourcePath, bytes, sha256: entries[0].sha256 });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { format: 'kont-synthetic-store-recovery/v1', identity: 'derived-current-store-on-reviewed-recovery-carrier',
    productionCandidate: false, oldCarrierManifestSha256: oldPin, aFiles: 13, bFiles: 14,
    files: files.map(({ bytes, ...file }) => ({ ...file, bytes: bytes.length })) };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  let directory;
  try {
    directory = await mkdtemp(join(tmpdir(), 'kont-synthetic-recovery-044-'));
    for (const file of files) {
      const path = resolve(directory, file.path); await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.bytes, { flag: 'wx' });
    }
    await writeFile(join(directory, 'manifest.json'), bytes, { flag: 'wx' });
    const artifact = Object.freeze({ directory, manifestSha256: sha(bytes), format: manifest.format, aFiles: 13, bFiles: 14 });
    issued.set(artifact, { sources, manifest, bytes });
    await verifySyntheticStoreRecovery(artifact);
    return artifact;
  } catch (error) {
    if (directory) { try { await removeOwned(directory); } catch { error.cleanupFailed = true; } }
    throw error;
  }
}

export async function verifySyntheticStoreRecovery(artifact) {
  const state = issued.get(artifact); if (!state) refuse('UNISSUED_ARTIFACT');
  if (!same(artifact.directory, await realpath(artifact.directory))) refuse('ARTIFACT_REDIRECTED');
  for (const source of state.sources) if (!(await regular(source.path)).equals(source.bytes)) refuse('SOURCE_CHANGED');
  if (!(await regular(join(artifact.directory, 'manifest.json'))).equals(state.bytes)) refuse('ARTIFACT_MANIFEST_CHANGED');
  const expected = ['manifest.json', ...state.manifest.files.map(file => file.path)].sort();
  if (JSON.stringify(await inventory(artifact.directory)) !== JSON.stringify(expected)) refuse('ARTIFACT_INVENTORY_CHANGED');
  for (const file of state.manifest.files) {
    const bytes = await regular(resolve(artifact.directory, file.path));
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) refuse('ARTIFACT_BYTES_CHANGED');
  }
  return structuredClone(state.manifest);
}

export async function disposeSyntheticStoreRecovery(artifact) {
  if (!issued.has(artifact)) refuse('UNISSUED_ARTIFACT');
  await removeOwned(artifact.directory); issued.delete(artifact);
}
