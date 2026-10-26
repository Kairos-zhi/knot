import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { prepareSyntheticStoreRecovery, verifySyntheticStoreRecovery, disposeSyntheticStoreRecovery } from '../scripts/prepare-synthetic-store-recovery.mjs';
import { probeStoreRecoveryRoundTrip } from '../scripts/store-recovery-roundtrip.mjs';

const current = ['package.json', 'src/index.mjs', 'src/store.mjs', 'src/kernel.mjs', 'src/run.mjs', 'src/worksite-preview.mjs', 'src/run-observer-binding.mjs', 'src/read-audit-config.mjs', 'src/dsh-run-read.mjs', 'src/run-query.mjs', 'lib/snapshot.js', 'lib/workspace-state.js', 'lib/knot-model.js'];
const old = 'evidence/local/20261024-desktop-recovery/candidate';
const carrier = ['packages/desktop-bundle/package.json', 'packages/desktop-bundle/cordis.patch.yml', 'packages/dsh-plugin/package.json', 'packages/dsh-plugin/src/index.mjs', 'packages/dsh-plugin/src/client.cjs', 'packages/dsh-plugin/src/style.css', 'packages/dsh-plugin/lib/client.js'];
const scripts = ['prepare-synthetic-store-recovery.mjs', 'store-recovery-roundtrip.mjs', 'store-recovery-roundtrip-worker.mjs'];
async function isolated(t, transforms = {}) {
  const root = await mkdtemp(join(tmpdir(), 'kont-recovery-source-test-'));
  const owned = join(root, 'owned-tmp'); await mkdir(owned);
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, bytes) => { const path = join(root, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); };
  for (const name of current) await put(`packages/dsh-plugin/${name}`, await readFile(`packages/dsh-plugin/${name}`));
  for (const name of ['manifest.json', ...carrier]) await put(`${old}/${name}`, await readFile(`${old}/${name}`));
  for (const name of scripts) {
    let source = await readFile(`scripts/${name}`, 'utf8');
    source = source.replace("import { tmpdir } from 'node:os';", `const tmpdir = () => ${JSON.stringify(owned)};`);
    if (transforms[name]) source = transforms[name](source);
    await put(`scripts/${name}`, source);
  }
  return { root, owned,
    prepare: await import(pathToFileURL(join(root, 'scripts/prepare-synthetic-store-recovery.mjs')).href),
    roundtrip: (await import(pathToFileURL(join(root, 'scripts/store-recovery-roundtrip.mjs')).href)).probeStoreRecoveryRoundTrip };
}

test('new derived artifact has exact current A13 / reviewed-carrier plus current-data B14 provenance and an independent pin', async () => {
  const artifact = await prepareSyntheticStoreRecovery();
  try {
    const manifest = await verifySyntheticStoreRecovery(artifact);
    assert.equal(manifest.format, 'kont-synthetic-store-recovery/v1'); assert.equal(manifest.productionCandidate, false);
    assert.equal(manifest.files.length, 27);
    assert.equal(manifest.files.filter(f => f.path.startsWith('a/')).length, 13);
    assert.equal(manifest.files.filter(f => f.source === 'current-data').length, 7);
    assert.equal(manifest.files.filter(f => f.source === 'reviewed-017-carrier').length, 7);
    assert.notEqual(artifact.manifestSha256, manifest.oldCarrierManifestSha256);
    const find = path => manifest.files.find(file => file.path === path);
    assert.equal(find('a/packages/dsh-plugin/src/store.mjs').sha256, find('b/packages/dsh-plugin/src/store.mjs').sha256);
    assert.notEqual(find('a/packages/dsh-plugin/src/index.mjs').sha256, find('b/packages/dsh-plugin/src/index.mjs').sha256);
    assert.ok(find('b/packages/dsh-plugin/src/worksite-preview.mjs'));
    await assert.rejects(verifySyntheticStoreRecovery({ ...artifact }), { code: 'UNISSUED_ARTIFACT' });
    manifest.files.length = 0; assert.equal((await verifySyntheticStoreRecovery(artifact)).files.length, 27);
  } finally { await disposeSyntheticStoreRecovery(artifact); }
});

test('source/pin drift, artifact byte/inventory/manifest drift and unissued descriptors reject', async t => {
  for (const kind of ['source', 'old-pin', 'bytes', 'extra', 'manifest']) {
    const f = await isolated(t);
    if (kind === 'source') {
      await writeFile(join(f.root, 'packages/dsh-plugin/src/store.mjs'), 'forged');
      await assert.rejects(f.prepare.prepareSyntheticStoreRecovery(), { code: 'CURRENT_SOURCE_MISMATCH' }); continue;
    }
    if (kind === 'old-pin') {
      await writeFile(join(f.root, old, 'manifest.json'), '{}');
      await assert.rejects(f.prepare.prepareSyntheticStoreRecovery(), { code: 'OLD_MANIFEST_MISMATCH' }); continue;
    }
    const artifact = await f.prepare.prepareSyntheticStoreRecovery();
    const path = kind === 'bytes' ? 'b/packages/dsh-plugin/src/store.mjs' : kind === 'extra' ? 'extra.txt' : 'manifest.json';
    await writeFile(join(artifact.directory, path), 'forged');
    await assert.rejects(f.prepare.verifySyntheticStoreRecovery(artifact), { code: kind === 'bytes' ? 'ARTIFACT_BYTES_CHANGED' : kind === 'extra' ? 'ARTIFACT_INVENTORY_CHANGED' : 'ARTIFACT_MANIFEST_CHANGED' });
    await f.prepare.disposeSyntheticStoreRecovery(artifact);
  }
});

test('actual A HTTP -> real derived B apply/HTTP -> A HTTP -> independent reopen preserves full business and journal', async () => {
  const environment = { ...process.env }, result = await probeStoreRecoveryRoundTrip();
  assert.equal(result.compatible, true, JSON.stringify(result.failures)); assert.deepEqual(result.failures, []);
  assert.deepEqual(result.stages.map(s => s.phase), ['a1', 'b', 'a2', 'a3']);
  assert.deepEqual(result.stages.map(s => s.revision), [8, 10, 11, 11]);
  assert.deepEqual(result.stages.map(s => s.seq), [14, 18, 19, 19]);
  assert.equal(result.stages[2].fileSha256, result.stages[3].fileSha256);
  assert.ok(result.stages.every(s => s.closed && s.lockReleased && s.environmentIsolated && s.routeCount === 4));
  assert.ok(result.stages[1].staleAtomic && result.stages[1].publicRunImportRejected && result.stages[2].targetCasAtomic);
  assert.equal(result.productionCandidateAccepted, false); assert.equal(result.desktopExperienceAccepted, false);
  for (const text of ['Synthetic A1', 'Synthetic B target', 'synthetic-044-agent-token', 'primary']) assert.equal(JSON.stringify(result).includes(text), false);
  assert.deepEqual({ ...process.env }, environment);
});

test('no caller path/state/environment/capability options and independent parallel probes cannot share a lease', async () => {
  for (const value of [null, {}, { path: 'production', state: {}, env: {}, allowed: true }]) assert.deepEqual((await probeStoreRecoveryRoundTrip(value)).failures, ['UNKNOWN_OPTIONS']);
  await assert.rejects(prepareSyntheticStoreRecovery({ allowed: true }), { code: 'UNKNOWN_OPTIONS' });
  const results = await Promise.all([probeStoreRecoveryRoundTrip(), probeStoreRecoveryRoundTrip()]);
  assert.ok(results.every(r => r.compatible));
  assert.notEqual(results[0].stages[0].fileSha256, results[1].stages[0].fileSha256);
});

test('B actual mutation failure or dispose failure blocks returning A, preserving fixed failure facts', async t => {
  for (const closeFailure of [false, true]) {
    const f = await isolated(t, { 'store-recovery-roundtrip-worker.mjs': source => closeFailure
      ? source.replace('await disposer();', 'await disposer(); if (side === "b") throw Error("PRIVATE_SYNTHETIC_SENTINEL");')
      : source.replace("if (phase === 'b') {", 'if (phase === "b") { throw Error("PRIVATE_SYNTHETIC_SENTINEL");') });
    const result = await f.roundtrip(); assert.equal(result.compatible, false);
    assert.deepEqual(result.stages.map(s => s.phase), ['a1', 'b']);
    assert.ok(result.failures.includes(closeFailure ? 'STAGE_DISPOSE_FAILED' : 'STAGE_EXECUTION_FAILED'));
    assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_SENTINEL'), false);
    if (closeFailure) { assert.ok(result.failures.includes('CLEANUP_WITHHELD')); assert.ok((await readdir(f.owned)).length >= 2); }
  }
});

test('owned subprocess timeout waits for exit and prevents subsequent stages; cleanup error cannot turn a result green', async t => {
  const timeout = await isolated(t, {
    'store-recovery-roundtrip.mjs': s => s.replace('}, 10000);', '}, 1500);'),
    'store-recovery-roundtrip-worker.mjs': s => s.replace("const phase = message.phase,", 'if (message.phase === "b") { setInterval(()=>{},1000); await new Promise(()=>{}); } const phase = message.phase,'),
  });
  const timed = await timeout.roundtrip(); assert.equal(timed.compatible, false);
  assert.ok(timed.failures.includes('TIMEOUT')); assert.ok(timed.failures.includes('CLEANUP_WITHHELD'));
  assert.deepEqual(timed.stages.map(s => s.phase), ['a1']);
  const cleanup = await isolated(t, { 'store-recovery-roundtrip.mjs': s => s.replace('await rm(target, { recursive: true, force: true });', 'throw Error("PRIVATE_SYNTHETIC_SENTINEL");') });
  const failed = await cleanup.roundtrip(); assert.equal(failed.compatible, false); assert.ok(failed.failures.includes('CLEANUP_FAILED'));
  assert.equal(failed.stages.length, 4); assert.equal(JSON.stringify(failed).includes('PRIVATE_SYNTHETIC_SENTINEL'), false);
});

test('preparation half-write failure uses the same owned cleanup fence and leaves no half artifact', async t => {
  const f = await isolated(t, { 'prepare-synthetic-store-recovery.mjs': s => s.replace("await writeFile(join(directory, 'manifest.json'), bytes, { flag: 'wx' });", 'throw Error("SYNTHETIC_HALF_WRITE");') });
  await assert.rejects(f.prepare.prepareSyntheticStoreRecovery(), /SYNTHETIC_HALF_WRITE/);
  assert.deepEqual(await readdir(f.owned), []);
});
