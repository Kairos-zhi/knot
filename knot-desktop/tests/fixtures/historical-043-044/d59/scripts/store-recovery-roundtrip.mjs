import { mkdtemp, mkdir, readFile, writeFile, rm, lstat, realpath } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import assert from 'node:assert/strict';
import { prepareSyntheticStoreRecovery, verifySyntheticStoreRecovery, disposeSyntheticStoreRecovery } from './prepare-synthetic-store-recovery.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const token = 'synthetic-044-agent-token-never-a-real-credential';
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
function execute(directory, artifact, phase, env) {
  return new Promise(resolveResult => {
    const failures = []; let payload, timedOut = false;
    const child = fork(join(directory, 'worker.mjs'), [], { cwd: directory, env, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 10000);
    child.on('message', message => { if (message?.kind === 'complete' && message.phase === phase) payload = message; });
    child.on('error', () => failures.push('WORKER_START_FAILED'));
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) failures.push('TIMEOUT');
      else if (code !== 0 || !payload) failures.push('WORKER_EXIT_FAILED');
      resolveResult({ payload, failures });
    });
    try { child.send({ phase, artifactDirectory: artifact.directory }, error => { if (error) failures.push('WORKER_START_FAILED'); }); }
    catch { failures.push('WORKER_START_FAILED'); }
  });
}
function expectedDelta(before, phase) {
  const value = structuredClone(before);
  if (phase === 'b') {
    value.workspace.worksites.find(site => site.id === 'primary').draft = 'Synthetic B';
    value.organization.folders.find(folder => folder.id === 'folder').title = 'Synthetic B folder';
    value.workspace.presentations.find(view => view.id === 'presentation').kind = 'icon';
    value.assets.find(asset => asset.id === 'target').summary = 'Synthetic B target';
    value.revision += 2; value.seq += 4;
  } else if (phase === 'a2') {
    value.workspace.worksites.find(site => site.id === 'primary').draft = 'Synthetic A2';
    value.revision++; value.seq++;
  }
  return value;
}

/** Fixed synthetic A -> new derived B -> A writer handoff. No source path,
 * supplied state, reader, environment or deployment authority is accepted. */
export async function probeStoreRecoveryRoundTrip() {
  const report = { compatible: false, syntheticOnly: true, productionCandidateAccepted: false,
    desktopExperienceAccepted: false, stages: [], failures: [] };
  if (arguments.length) { report.failures.push('UNKNOWN_OPTIONS'); return report; }
  let artifact, directory, retain = false;
  try {
    artifact = await prepareSyntheticStoreRecovery();
    const manifest = await verifySyntheticStoreRecovery(artifact);
    const workerPath = fileURLToPath(new URL('store-recovery-roundtrip-worker.mjs', import.meta.url));
    const toolPath = fileURLToPath(import.meta.url), preparePath = fileURLToPath(new URL('prepare-synthetic-store-recovery.mjs', import.meta.url));
    const captured = await Promise.all([toolPath, preparePath, workerPath].map(async path => {
      const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || !same(path, await realpath(path))) throw Error('redirected');
      return { path, bytes: await readFile(path) };
    }));
    report.execution = { scriptSha256: sha(captured[0].bytes), prepareSha256: sha(captured[1].bytes), workerSha256: sha(captured[2].bytes) };
    report.combination = { manifestSha256: artifact.manifestSha256, manifest };
    directory = await mkdtemp(join(tmpdir(), 'kont-recovery-run-044-'));
    await mkdir(join(directory, 'data')); await mkdir(join(directory, 'tmp'));
    await writeFile(join(directory, 'worker.mjs'), captured[2].bytes, { flag: 'wx' });
    const env = {};
    for (const name of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[name]) env[name] = process.env[name];
    Object.assign(env, { TEMP: join(directory, 'tmp'), TMP: join(directory, 'tmp'), KONT_SYNTHETIC_044: 'yes', KONT_DATA_DIR: join(directory, 'data'), KONT_AGENT_TOKEN: token, KONT_AGENT_SOURCE: 'agent:synthetic-044' });
    let previous, diskSha256;
    for (const phase of ['a1', 'b', 'a2', 'a3']) {
      await verifySyntheticStoreRecovery(artifact);
      for (const source of captured) assert.deepEqual(await readFile(source.path), source.bytes);
      const file = join(directory, 'data/worksites.json');
      if (diskSha256) {
        assert.ok(same(file, await realpath(file)));
        assert.equal(sha(await readFile(file)), diskSha256);
      }
      try { await lstat(`${file}.lock`); report.failures.push('LOCK_BEFORE_HANDOFF'); retain = true; break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const { payload, failures } = await execute(directory, artifact, phase, env);
      report.failures.push(...failures);
      if (!payload || !Array.isArray(payload.failures)) { report.failures.push('STAGE_REPORT_MISSING'); retain = true; break; }
      if ((payload.fileSha256 !== undefined && !/^[a-f0-9]{64}$/.test(payload.fileSha256))
        || (payload.after !== undefined && (!Number.isSafeInteger(payload.after.revision) || !Number.isSafeInteger(payload.after.seq)))) {
        report.failures.push('INVALID_STAGE_REPORT'); retain = true; break;
      }
      // Fixed worker failures only: never forward arbitrary IPC error strings.
      const stageFailures = payload.failures.filter(code => ['STAGE_EXECUTION_FAILED', 'STAGE_DISPOSE_FAILED', 'LOCK_RETAINED', 'LOCK_CHECK_FAILED'].includes(code));
      if (stageFailures.length !== payload.failures.length) stageFailures.push('INVALID_STAGE_REPORT');
      report.failures.push(...stageFailures);
      report.stages.push({ phase, revision: payload.after?.revision ?? null, seq: payload.after?.seq ?? null,
        fileSha256: payload.fileSha256 ?? null, closed: payload.closed === true, lockReleased: payload.lockReleased === true,
        staleAtomic: payload.staleAtomic === true, publicRunImportRejected: payload.publicRunImportRejected === true,
        targetCasAtomic: payload.targetCasAtomic === true, environmentIsolated: payload.environmentIsolated === true,
        routeCount: Array.isArray(payload.routes) ? payload.routes.length : 0 });
      if (!payload.closed || !payload.lockReleased) { report.failures.push('HANDOFF_NOT_CLOSED'); retain = true; }
      try { await lstat(`${file}.lock`); report.failures.push('LOCK_AFTER_HANDOFF'); retain = true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (report.failures.length) break;
      const stat = await lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink() && same(file, await realpath(file)));
      if (previous) {
        assert.deepEqual(payload.before, previous);
        assert.equal(payload.beforeDiskSha256, diskSha256);
        assert.deepEqual(payload.after, expectedDelta(previous, phase));
        assert.equal(payload.staleAtomic, true); assert.equal(payload.publicRunImportRejected, true);
      } else {
        assert.equal(payload.after.workspace.worksites.find(site => site.id === 'primary').agentId, 'a'.repeat(214));
        assert.equal(payload.after.runs.length, 2);
        assert.equal(payload.after.runs[0].status, 'completed'); assert.ok(payload.after.runs[0].dispatchClaim);
      }
      const { revision, seq, ...business } = payload.after;
      assert.deepEqual(payload.snapshot, { format: 'kont-store-snapshot/v1', ...business });
      if (phase === 'a2') assert.equal(payload.targetCasAtomic, true);
      assert.equal(payload.environmentIsolated, true);
      assert.equal(sha(await readFile(file)), payload.fileSha256);
      previous = payload.after; diskSha256 = payload.fileSha256;
    }
    await verifySyntheticStoreRecovery(artifact);
    for (const source of captured) assert.deepEqual(await readFile(source.path), source.bytes);
    report.compatible = report.stages.length === 4 && !report.failures.length;
  } catch (error) {
    report.failures.push(['OLD_MANIFEST_MISMATCH', 'OLD_SOURCE_MISMATCH', 'CURRENT_SOURCE_MISMATCH', 'ARTIFACT_BYTES_CHANGED', 'ARTIFACT_MANIFEST_CHANGED', 'ARTIFACT_INVENTORY_CHANGED', 'SOURCE_CHANGED'].includes(error.code) ? error.code : 'ROUNDTRIP_CHECK_FAILED');
    if (error.cleanupFailed) report.failures.push('PREPARATION_CLEANUP_FAILED');
  } finally {
    if (directory && !retain) {
      try {
        const target = resolve(directory), parent = resolve(tmpdir());
        if (dirname(target) !== parent || !relative(parent, target).startsWith('kont-recovery-run-044-') || !same(target, await realpath(target))) throw Error('cleanup path');
        await rm(target, { recursive: true, force: true });
      } catch { report.failures.push('CLEANUP_FAILED'); }
    } else if (directory) report.failures.push('CLEANUP_WITHHELD');
    if (artifact && !retain) { try { await disposeSyntheticStoreRecovery(artifact); } catch { report.failures.push('ARTIFACT_CLEANUP_FAILED'); } }
    else if (artifact) report.failures.push('ARTIFACT_CLEANUP_WITHHELD');
    if (report.failures.length) report.compatible = false;
  }
  return report;
}
