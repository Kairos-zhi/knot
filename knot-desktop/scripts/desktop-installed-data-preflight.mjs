import { readFile, writeFile, lstat, realpath, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { verifyDesktopCandidate } from './prepare-desktop-candidate.mjs';
import { verifyDesktopRecovery } from './prepare-desktop-recovery.mjs';

export const INSTALLED_DATA_FILE = 'D:/DSH-Desktop/kont-data/worksites.json';
const root = fileURLToPath(new URL('../', import.meta.url));
const upgradeRoot = resolve(root, 'evidence/local/20261024-desktop-package/candidate');
const recoveryRoot = resolve(root, 'evidence/local/20261024-desktop-recovery/candidate');
const upgradePin = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
const recoveryPin = '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const equal = (a, b) => sha(canonical(a)) === sha(canonical(b));
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
const fail = code => { const error = new Error(`Desktop data preflight refused (${code})`); error.code = code; throw error; };
const requireTrue = (value, code) => { if (!value) fail(code); };

async function readInstalledBytes() {
  const path = resolve(INSTALLED_DATA_FILE), stat = await lstat(path);
  requireTrue(stat.isFile() && !stat.isSymbolicLink() && same(path, await realpath(path)), 'SOURCE_REDIRECTED');
  requireTrue(stat.size > 0 && stat.size <= 8 * 1024 * 1024, 'SOURCE_SIZE');
  try { await lstat(`${path}.lock`); fail('SOURCE_BUSY'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = await readFile(path), again = await readFile(path);
  const after = await lstat(path);
  requireTrue(bytes.equals(again) && after.size === stat.size && after.mtimeMs === stat.mtimeMs, 'SOURCE_CHANGED');
  requireTrue(same(path, await realpath(path)), 'SOURCE_REDIRECTED');
  return bytes;
}

/** Fixed source only. No general file reader, original store initialization,
 * credentials, Session access or write capability is exposed. */
export async function recheckInstalledDesktopData(expectedSha256) {
  requireTrue(/^[a-f0-9]{64}$/.test(expectedSha256 ?? ''), 'EXPECTED_DIGEST_REQUIRED');
  try {
    const bytes = await readInstalledBytes();
    requireTrue(sha(bytes) === expectedSha256, 'SOURCE_CHANGED');
    return { sourceSha256: expectedSha256, productionFileUnchanged: true };
  } catch (error) { if (error.message?.startsWith('Desktop data preflight refused (')) throw error; fail('SOURCE_UNAVAILABLE'); }
}

/** Caller-provided bytes, not a data path. Actual mutations occur exclusively
 * on a newly owned private copy; failed assertions disclose no state values. */
export async function probeDesktopSnapshotCompatibility(inputBytes) {
  requireTrue(Buffer.isBuffer(inputBytes) && inputBytes.length > 0 && inputBytes.length <= 8 * 1024 * 1024, 'SOURCE_SIZE');
  inputBytes = Buffer.from(inputBytes);
  let original;
  try { original = JSON.parse(inputBytes); } catch { fail('INVALID_JSON'); }
  requireTrue(original && typeof original === 'object' && !Array.isArray(original)
    && original.schemaVersion === 4 && Array.isArray(original.assets), 'CURRENT_SCHEMA_REQUIRED');
  requireTrue(Object.keys(original).every(key => ['schemaVersion', 'revision', 'seq', 'assets', 'edges', 'workspace', 'titles', 'runs'].includes(key)), 'UNKNOWN_TOP_LEVEL_FIELDS');
  await verifyDesktopCandidate(upgradeRoot, upgradePin);
  await verifyDesktopRecovery(recoveryRoot, recoveryPin);
  const load = path => import(pathToFileURL(resolve(path, 'packages/dsh-plugin/src/store.mjs')).href);
  const [{ KontStore: UpgradeStore }, { KontStore: RecoveryStore }] = await Promise.all([load(upgradeRoot), load(recoveryRoot)]);
  const dir = await mkdtemp('D:/Temp/kont-installed-data-copy-'), file = join(dir, 'copy.json'), owned = new Set();
  const temporaryStores = [UpgradeStore, RecoveryStore, UpgradeStore];
  try {
    await writeFile(file, inputBytes, { flag: 'wx', mode: 0o600 });
    let expected = original;
    for (let index = 0; index < temporaryStores.length; index++) {
      const store = await new temporaryStores[index](file).init(); owned.add(store);
      requireTrue(equal(store.read(), expected), 'LOSSY_READ');
      const before = await readFile(file);
      if (index < 2) {
        const site = expected.workspace?.worksites?.[0];
        requireTrue(site && typeof site.id === 'string', 'WORKSITE_REQUIRED');
        const draft = `Private compatibility probe ${randomUUID()}`;
        const result = await store.command({ type: 'worksite.update', worksiteId: site.id, draft });
        requireTrue(result.ok === true, 'COPY_MUTATION_REJECTED');
        const after = store.read(), normalized = structuredClone(after);
        normalized.revision = expected.revision; normalized.seq = expected.seq;
        normalized.workspace.worksites[0].draft = site.draft;
        requireTrue(equal(normalized, expected), 'LOSSY_MUTATION');
        requireTrue(!before.equals(await readFile(file)), 'COPY_WRITE_NOT_EXERCISED');
        expected = after;
      } else requireTrue(equal(JSON.parse(before), expected), 'LOSSY_REOPEN');
      await store.close(); owned.delete(store);
    }
    return { sourceSha256: sha(inputBytes), schemaVersion: 4, assetCount: original.assets.length,
      runCount: Array.isArray(original.runs) ? original.runs.length : 0,
      validatedOnPrivateTemporaryCopy: true, readAndWriteRoundTripPreserved: true,
      upgradeManifestSha256: upgradePin, recoveryManifestSha256: recoveryPin,
      productionDeploymentAccepted: false, modelCalls: 0 };
  } catch (error) {
    if (error.message?.startsWith('Desktop data preflight refused (')) throw error;
    fail('COMPATIBILITY_CHECK_FAILED');
  } finally {
    // A close failure preserves the owned copy for diagnosis rather than
    // deleting a potentially active store. Never targets production data.
    for (const store of owned) await store.close();
    const target = resolve(dir);
    requireTrue(dirname(target) === resolve('D:/Temp') && target.split(/[\\/]/).at(-1).startsWith('kont-installed-data-copy-'), 'CLEANUP_PATH');
    await rm(target, { recursive: true, force: true });
  }
}

export async function probeInstalledDesktopData() {
  try {
    const bytes = await readInstalledBytes();
    const summary = await probeDesktopSnapshotCompatibility(bytes);
    await recheckInstalledDesktopData(summary.sourceSha256);
    return { ...summary, productionFileUnchanged: true };
  } catch (error) { if (error.message?.startsWith('Desktop data preflight refused (')) throw error; fail('SOURCE_UNAVAILABLE'); }
}

if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  try { console.log(JSON.stringify(await probeInstalledDesktopData(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ allowed: false, code: error.code })); process.exitCode = 1; }
}
