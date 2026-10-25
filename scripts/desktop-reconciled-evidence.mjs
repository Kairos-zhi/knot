import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveDesktopProfileStore } from './desktop-pnpm-store.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { const error = new Error(`Reconciled attempt refused (${code})`); error.code = code; throw error; };
export const RECONCILED_PARENT = '928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9';
const records = Object.freeze({ claim: '668ce4577ebe2d9d3b49b9600cfe7a6d4c5fcf3aa7316dc46a6d43d7e7cf9484',
  transport: '6cc9edf7fcc2ab8d8a4921c618c61b70224c6c5b381a5aa8d80bd4fde3a28dfd',
  result: '44e4c9dc9fdb602771e43c8023be36fbcbb4874374419dcaaea383ae6c20520e' });
const pins = Object.freeze({ failureReview: '82c7c458590efad0f27694c9a6b18709ef636f03b2a52f5cc2cad336bc443370',
  failureLog: '64f8d2029b0b4162eabb8d1d20a8ddf3dca5d60c0075d194d1d48a14132b28fb',
  repairManifest: '967b4e1c26aa58041cb1d97d11c6dd4e3aef83ce89ae68c1c1f118e9e71f6cc2',
  repairReview: '130643e02a3af504bfef821ae55a76c258d01d7609263f099d02965a67870db5',
  profile: '074125faf53fc9832aa075e35617adfa773806a6321dc0267b9e969d0e9d5283',
  data: 'e0359bb66a44a41c082ab12c845cbea6a70435e5c9d6f7bc641277a16c3c79ac',
  modules: '457cd50b0e00695c2137b62e0a5759aaafc01d85fbf62d96afc245b8b863c82b',
  store: '4f5d2f5e3c40d03e142e971a7446e2a8dd5de180bd5b7bda1c220d0869dc9881' });
async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024
    || resolve(path).toLowerCase() !== (await realpath(path)).toLowerCase()) fail('EVIDENCE_REDIRECTED');
  return readFile(path);
}
async function pinned(path, expected) {
  const bytes = await regular(path); if (sha(bytes) !== expected) fail('FIXED_EVIDENCE_CHANGED'); return bytes;
}
async function noRecordedPackageOperation() {
  for (const path of ['D:/DSH-Desktop/home/profiles/desktop/package.json.lock',
    'D:/DSH-Desktop/home/profiles/desktop/.plugin-manager/run.json']) {
    try { await lstat(path); fail('PROFILE_PACKAGE_OPERATION_PENDING'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await assertNoOfficialPackageWriter();
}
/** Read-only bounded process inventory. No command lines leave this helper. */
export async function assertNoOfficialPackageWriter() {
  const command = "$ErrorActionPreference='Stop'; $items=@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.ExecutablePath -ieq 'D:\\DSH-Desktop\\app\\resources\\runtime\\primary-runtime\\dependencies\\node\\bin\\node.exe' -and ($_.CommandLine -match 'primary-runtime[\\\\/]dependencies[\\\\/]pnpm[\\\\/](bin[\\\\/]pnpm\\.cjs|dist[\\\\/]pnpm\\.mjs)') }); [Console]::Write($items.Count)";
  let stdout;
  try { ({ stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 10000, maxBuffer: 1024, windowsHide: true })); }
  catch { fail('PACKAGE_WRITER_CHECK_UNAVAILABLE'); }
  if (typeof stdout !== 'string' || !/^[0-9]+$/.test(stdout.trim())) fail('PACKAGE_WRITER_CHECK_UNAVAILABLE');
  if (Number(stdout.trim()) !== 0) fail('OFFICIAL_PACKAGE_WRITER_PRESENT');
  return Object.freeze({ officialPackageWriterCount: 0, readOnly: true });
}
/** Fixed 020 -> one reviewed repair only; no caller parent/path/spec/pin knobs.
 * Fresh018 must precede this function. It reads code/metadata, never asset text. */
export async function prepareFixedReconciledEvidence() {
  try {
    // Conservative read-only guard: even a stale/unknown official operation
    // marker refuses eligibility. Never reap a lock, record or process here.
    await noRecordedPackageOperation();
    for (const [kind, digest] of Object.entries(records)) {
      const value = JSON.parse(await pinned(resolve(root, '.runtime/desktop-install/explicit-user-approval', `${RECONCILED_PARENT}.${kind}.json`), digest));
      if (value.approvalHash !== RECONCILED_PARENT) fail('PARENT_BINDING');
      if (kind === 'claim' && value.state !== 'reserved' || kind === 'result' && (value.state !== 'uncertain'
        || value.managerReceipt?.application !== 'failed' || value.managerReceipt?.changed !== false
        || value.managerReceipt?.packageResult?.exitCode !== 1)) fail('PARENT_NOT_CONFIRMED_FAILURE');
    }
    const review = JSON.parse(await pinned(resolve(root, 'evidence/local/20261024-desktop-installed/checker/final-review.json'), pins.failureReview));
    if (review.verdict !== 'CLOSED_FAILED_INSTALL_PRESERVED' || review.execution?.descriptorSha256 !== RECONCILED_PARENT) fail('FAILURE_REVIEW_REQUIRED');
    const log = await pinned('D:/DSH-Desktop/home/profiles/desktop/.plugin-manager/logs/operation-odXRTB/pnpm.log', pins.failureLog);
    if (!log.includes(Buffer.from('ERR_PNPM_UNEXPECTED_STORE'))) fail('FAILURE_LOG_REQUIRED');
    const manifest = JSON.parse(await pinned(resolve(root, 'evidence/local/20261025-desktop-store-fix/maker/manifest.json'), pins.repairManifest));
    const fixed = ['scripts/desktop-pnpm-store.mjs', 'scripts/desktop-quiescent-install.mjs'];
    for (const path of fixed) {
      const file = manifest.files?.find(item => item.path === path);
      if (!file || (await pinned(resolve(root, path), file.sha256)).length !== file.bytes) fail('REPAIR_IMPLEMENTATION_CHANGED');
    }
    const repair = JSON.parse(await pinned(resolve(root, 'evidence/local/20261025-desktop-store-fix/checker/final-review.json'), pins.repairReview));
    if (repair.verdict !== 'ACCEPT_RECORDED_PNPM_STORE_FIX_LIMITED') fail('REPAIR_REVIEW_REQUIRED');
    await pinned('D:/DSH-Desktop/home/profiles/desktop/package.json', pins.profile);
    const store = await resolveDesktopProfileStore('D:/DSH-Desktop/home/profiles/desktop',
      resolve(root, '.runtime/desktop-install/explicit-user-approval/pnpm-store'));
    if (store.source !== 'recorded-profile' || store.manifestSha256 !== pins.modules
      || sha(store.storeDir.toLowerCase()) !== pins.store) fail('STORE_MAPPING_CHANGED');
    const implementation = {};
    for (const name of ['desktop-install-execution.mjs', 'desktop-reconciled-evidence.mjs', 'desktop-install-transport-policy.mjs'])
      implementation[name] = sha(await regular(resolve(root, 'scripts', name)));
    const binding = { parentDescriptorSha256: RECONCILED_PARENT, parentRecordHashes: records,
      failureReviewSha256: pins.failureReview, failureLogSha256: pins.failureLog,
      repairManifestSha256: pins.repairManifest, repairReviewSha256: pins.repairReview,
      originalProfileSha256: pins.profile, originalDataSha256: pins.data,
      modulesManifestSha256: pins.modules, storeDirSha256: pins.store, implementation };
    return Object.freeze({ ...binding, evidenceSha256: sha(JSON.stringify(binding)) });
  } catch (error) { if (error.message?.startsWith('Reconciled attempt refused (')) throw error; fail('FIXED_EVIDENCE_UNAVAILABLE'); }
}
export async function recheckFixedReconciledEvidence(expected) {
  const current = await prepareFixedReconciledEvidence();
  if (JSON.stringify(current) !== JSON.stringify(expected)) fail('RECONCILIATION_CHANGED');
}
