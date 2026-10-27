import { readFile, writeFile, mkdir, mkdtemp, rm, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const oldRoot = resolve(root, 'evidence/local/20261024-desktop-recovery/candidate');
const oldPin = '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d';
const currentPins = Object.freeze({
  'src/store.mjs': '229cba4121f7eff22f7e3f677950e44b5919e1f85e4473d16fbcd520ee24d1ff',
  'src/kernel.mjs': 'a69609f1c01c369c15dd606b3eb7d23fe0b61aa64aa453b7ff1fdc03c2368a13',
  'src/run.mjs': 'd325209833742ef0f12f4a848219fcc935fd334fe13c8b76429b11de2a86c36b',
  'src/worksite-preview.mjs': '8074f18a8fe81e7a8f61127a8f52f60988c0bf83b159e932323771b7f25f652c',
  'lib/snapshot.js': '7eec9b84f108e0412e95d82c1cf57b4ee6d8a2da4b28320a75292469bf1bea94',
  'lib/workspace-state.js': 'e52cf42cfcd4a6b2366d734074c31a05f11ff106073ff8ea0e9da415e0c304a4',
  'lib/knot-model.js': 'cc941f6a79c0f06379679faaed3fb4ad3823e0e52dc8e4fc35228e379c3bf8e9',
});
const oldFiles = Object.keys(currentPins).filter(path => path !== 'src/worksite-preview.mjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
async function regular(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || !same(path, await realpath(path))) fail('READER_REDIRECTED');
  const bytes = await readFile(path);
  if (!same(path, await realpath(path))) fail('READER_REDIRECTED');
  return bytes;
}
async function capture() {
  const toolPath = fileURLToPath(import.meta.url), workerPath = fileURLToPath(new URL('store-reader-pairing-worker.mjs', import.meta.url));
  const tool = await regular(toolPath), worker = await regular(workerPath), inputs = [{ path: toolPath, bytes: tool }, { path: workerPath, bytes: worker }];
  const readers = [];
  for (const id of ['current-store-043', 'recovery-017']) {
    let pins = currentPins, manifestSha256 = null;
    if (id === 'recovery-017') {
      const path = resolve(oldRoot, 'manifest.json'), bytes = await regular(path);
      if (sha(bytes) !== oldPin) fail('READER_MANIFEST_MISMATCH');
      const manifest = JSON.parse(bytes); inputs.push({ path, bytes }); manifestSha256 = oldPin;
      pins = Object.fromEntries(oldFiles.map(name => {
        const entries = manifest.files.filter(entry => entry.path === `packages/dsh-plugin/${name}`);
        if (entries.length !== 1 || !/^[a-f0-9]{64}$/.test(entries[0].sha256)) fail('READER_MANIFEST_MISMATCH');
        return [name, entries[0].sha256];
      }));
    }
    const files = [];
    for (const [name, pin] of Object.entries(pins)) {
      const path = resolve(id === 'current-store-043' ? resolve(root, 'packages/dsh-plugin') : resolve(oldRoot, 'packages/dsh-plugin'), name);
      const bytes = await regular(path);
      if (sha(bytes) !== pin) fail('READER_BYTES_MISMATCH');
      files.push({ name, bytes, sha256: pin }); inputs.push({ path, bytes });
    }
    const fileHashes = files.map(({ name, sha256 }) => ({ name, sha256 })).sort((a, b) => a.name.localeCompare(b.name));
    readers.push({ id, files, identity: { closureSha256: sha(canonical(fileHashes)), files: fileHashes, manifestSha256 } });
  }
  return { worker, readers, inputs, execution: { scriptSha256: sha(tool), workerSha256: sha(worker) } };
}
async function unchanged(inputs) {
  for (const { path, bytes } of inputs) if (!(await regular(path)).equals(bytes)) fail('READER_SOURCE_CHANGED');
}
const codes = new Set(['NOT_RUN', 'PRESERVED', 'LOSSY_READ', 'LOSSY_EXPORT', 'READER_REJECTED']);
const workerFailures = new Set(['READER_LOAD_FAILED', 'READER_INIT_FAILED', 'READER_EXECUTION_FAILED', 'WORKER_EXECUTION_FAILED', 'CLOSE_FAILED']);
function execute(directory) {
  return new Promise(resolveResult => {
    const result = { readCode: 'NOT_RUN', exportCode: 'NOT_RUN', failures: [] };
    let complete = false, timedOut = false;
    const child = fork(join(directory, 'worker.mjs'), [], { cwd: directory, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 5000);
    child.on('message', message => {
      if (!['observed', 'complete'].includes(message?.kind) || !codes.has(message.readCode) || !codes.has(message.exportCode)
        || !Array.isArray(message.failures) || message.failures.some(code => !workerFailures.has(code))) return;
      result.readCode = message.readCode; result.exportCode = message.exportCode;
      result.failures = [...new Set([...result.failures, ...message.failures])];
      if (message.kind === 'complete') complete = true;
    });
    child.on('error', () => { result.failures.push('WORKER_START_FAILED'); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) result.failures.push('TIMEOUT');
      else if (code !== 0 || !complete) result.failures.push('WORKER_EXIT_FAILED');
      resolveResult(result);
    });
    try { child.send({ kind: 'inspect' }, error => { if (error) result.failures.push('WORKER_START_FAILED'); }); }
    catch { result.failures.push('WORKER_START_FAILED'); }
  });
}
async function inspect(reader, bytes, worker) {
  const result = { readerId: reader.id, ...reader.identity, readCode: 'NOT_RUN', exportCode: 'NOT_RUN', failures: [] };
  let directory, safeToDelete = true;
  try {
    directory = await mkdtemp(join(tmpdir(), 'kont-store-reader-043-'));
    for (const { name, bytes } of reader.files) {
      const path = join(directory, 'reader', name); await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx' });
    }
    await writeFile(join(directory, 'reader/package.json'), '{"type":"module"}', { flag: 'wx' });
    await writeFile(join(directory, 'worker.mjs'), worker, { flag: 'wx' });
    // Full v1 explicitly excludes revision/seq: write the original bytes.
    await writeFile(join(directory, 'state.json'), bytes, { flag: 'wx' });
    Object.assign(result, await execute(directory));
    safeToDelete = !result.failures.some(code => ['CLOSE_FAILED', 'READER_INIT_FAILED'].includes(code));
    if (!(await readFile(join(directory, 'state.json'))).equals(bytes)) result.failures.push('DATA_BYTES_CHANGED');
  } catch { result.failures.push('TEMPORARY_EXECUTION_FAILED'); }
  finally {
    if (directory && safeToDelete) {
      try {
        const target = resolve(directory), parent = resolve(tmpdir());
        if (dirname(target) !== parent || !relative(parent, target).startsWith('kont-store-reader-043-')) fail('CLEANUP_PATH');
        await rm(target, { recursive: true, force: true });
      } catch { result.failures.push('CLEANUP_FAILED'); }
    } else if (directory) result.failures.push('CLEANUP_WITHHELD');
  }
  return result;
}

/** Offline fixed reader pair only. Input bytes confer no deployment permission. */
export async function probeStoreReaderPairing(inputBytes) {
  const report = { pairCompatible: false, readExportOnly: true, productionDeploymentAccepted: false, readers: [], failures: [] };
  if (arguments.length !== 1 || !Buffer.isBuffer(inputBytes) || !inputBytes.length || inputBytes.length > 8 * 1024 * 1024) {
    report.failures.push('INVALID_ARGUMENTS'); return report;
  }
  const bytes = Buffer.from(inputBytes); report.sourceSha256 = sha(bytes);
  let input;
  try { input = JSON.parse(bytes); } catch { report.failures.push('INVALID_FULL_SNAPSHOT'); return report; }
  if (input?.format !== 'kont-store-snapshot/v1') { report.failures.push('INVALID_FULL_SNAPSHOT'); return report; }
  let captured;
  try { report.execution = { scriptSha256: sha(await regular(fileURLToPath(import.meta.url))), workerSha256: sha(await regular(fileURLToPath(new URL('store-reader-pairing-worker.mjs', import.meta.url)))) }; }
  catch { report.failures.push('EXECUTION_CAPTURE_FAILED'); return report; }
  try { captured = await capture(); report.execution = captured.execution; }
  catch (error) { report.failures.push(['READER_REDIRECTED', 'READER_MANIFEST_MISMATCH', 'READER_BYTES_MISMATCH'].includes(error.code) ? error.code : 'READER_CAPTURE_FAILED'); return report; }
  try {
    await unchanged(captured.inputs);
    const current = await inspect(captured.readers[0], bytes, captured.worker); report.readers.push(current);
    if (current.failures.length) report.failures.push('CURRENT_READER_FAILED');
    else if (current.readCode === 'READER_REJECTED') report.failures.push('INVALID_FULL_SNAPSHOT');
    else if (current.readCode !== 'PRESERVED' || current.exportCode !== 'PRESERVED') report.failures.push('CURRENT_READER_LOSSY');
    else report.readers.push(await inspect(captured.readers[1], bytes, captured.worker));
    await unchanged(captured.inputs);
    report.pairCompatible = report.failures.length === 0 && report.readers.length === 2 && report.readers.every(reader =>
      !reader.failures.length && reader.readCode === 'PRESERVED' && reader.exportCode === 'PRESERVED');
  } catch { report.failures.push('READER_SOURCE_CHANGED'); }
  return report;
}
