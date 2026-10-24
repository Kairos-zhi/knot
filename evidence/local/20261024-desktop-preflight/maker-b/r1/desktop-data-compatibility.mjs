import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyDesktopCandidate } from './prepare-desktop-candidate.mjs';
import { verifyDesktopRollback } from './prepare-desktop-rollback.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const newDigest = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
const oldDigest = 'd5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336';
const defaults = { newRoot: 'evidence/local/20261024-desktop-package/candidate',
  oldRoot: 'evidence/local/20261024-desktop-rollback/candidate' };

/** Pure decision over synthetic probe evidence. It never grants production
 * downgrade/upgrade permission, even when the narrow legacy roundtrip passes. */
export function desktopDataCompatibilityPreflight(report) {
  const phases = ['prepared', 'reserved', 'submitted', 'uncertain', 'completed'];
  if (report?.kind !== 'kont-synthetic-data-compatibility/v1'
    || !Array.isArray(report.experiments) || report.experiments.length !== phases.length
    || phases.some(phase => report.experiments.filter(item => item?.phase === phase).length !== 1)
    || report.experiments.some(item => ['beforeRunCount', 'oldMemoryRunCount', 'afterOldWriteRunCount']
      .some(key => !Number.isSafeInteger(item[key]) || item[key] < 0)))
    return { allowed: false, code: 'COMPATIBILITY_PROBE_REQUIRED', productionDataVerified: false };
  const losses = report.experiments.filter(item => item.oldMemoryRunCount !== item.beforeRunCount
    || item.afterOldWriteRunCount !== item.beforeRunCount);
  return { allowed: false, code: losses.length ? 'UNSAFE_DOWNGRADE_RUN_JOURNAL_LOSS' : 'PRODUCTION_DATA_NOT_VERIFIED',
    downgradeSafeForSyntheticRuns: losses.length === 0,
    unsafePhases: losses.map(item => item.phase),
    syntheticLegacyAssetRoundTrip: report.legacyRoundTrip?.assetsPreserved === true,
    productionDataVerified: false };
}

function syntheticEvidence(run, prompt) {
  const entries = [['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
    ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: prompt }] }],
    ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant',
      source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: 'Synthetic output only' }] } }],
    ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }]];
  return { sessionId: run.plannedSessionId, kind: 'synthetic-test',
    events: entries.map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) };
}
const snapshotFacts = state => ({ runCount: state.runs?.length ?? 0,
  runStates: (state.runs ?? []).map(run => ({ status: run.status,
    dispatchState: run.dispatchClaim?.state ?? null, hasReceipt: run.receipt !== null })),
  runsHash: hash(JSON.stringify(state.runs ?? [])), assetsHash: hash(JSON.stringify(state.assets)),
  generated: state.assets.flatMap(asset => (asset.blocks ?? []).filter(block => block.source === 'generated')
    .map(block => ({ assetId: asset.id, blockId: block.id, content: block.content, provenance: block.provenance }))) });

/** Imports only the two reviewed code artifacts. Every state file is created
 * beneath a newly owned D:/Temp directory; no production data path parameter. */
export async function probeDesktopDataCompatibility({ newRoot = defaults.newRoot, oldRoot = defaults.oldRoot,
  expectedNewManifestSha256 = newDigest, expectedOldManifestSha256 = oldDigest } = {}) {
  await verifyDesktopCandidate(newRoot, expectedNewManifestSha256);
  await verifyDesktopRollback(oldRoot, expectedOldManifestSha256);
  const load = (root, file) => import(pathToFileURL(resolve(root, 'packages/dsh-plugin/src', file)).href);
  const [{ KontStore: NewStore }, { KontStore: OldStore }, { runPromptText }] = await Promise.all([
    load(newRoot, 'store.mjs'), load(oldRoot, 'store.mjs'), load(newRoot, 'run.mjs')]);
  const dir = await mkdtemp('D:/Temp/kont-data-compatibility-');
  const owned = new Set();
  async function open(Store, file) { const store = await new Store(file).init(); owned.add(store); return store; }
  async function close(store) { await store.close(); owned.delete(store); }
  async function command(store, value) { const result = await store.command(value); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
  async function seed(store) {
    await command(store, { type: 'knot.create', id: 'public-source', data: { title: 'Synthetic source', summary: 'Public synthetic material' } });
    await command(store, { type: 'knot.create', id: 'target', data: { title: 'Synthetic target', summary: 'Synthetic initial target',
      blocks: [{ id: 'b1', source: 'manual', timestamp: '2026-10-24T00:00:00Z', provenance: ['public-source'], content: 'Synthetic initial target' }] } });
    await command(store, { type: 'worksite.update', worksiteId: 'legacy', draft: 'Synthetic draft only' });
    await command(store, { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'public-source', mode: 'connect' });
  }
  try {
    const experiments = [];
    for (const phase of ['prepared', 'reserved', 'submitted', 'uncertain', 'completed']) {
      const file = join(dir, `${phase}.json`);
      let store = await open(NewStore, file); await seed(store);
      const prepared = await command(store, { type: 'run.prepare', worksiteId: 'legacy', targetId: 'target',
        requestId: `synthetic-${phase}-request`, sessionId: `synthetic-${phase}-session` });
      if (phase !== 'prepared') {
        const reservation = await store.claimRunDispatch(prepared.runId, { provider: 'synthetic', model: 'never-called',
          maxTokens: 64, requestSha256: 'a'.repeat(64) });
        if (phase !== 'reserved') await store.settleRunDispatch(prepared.runId, reservation.run.dispatchClaim.claimId,
          phase === 'uncertain' ? 'uncertain' : 'submitted');
      }
      if (phase === 'completed') await store.returnRun(prepared.runId, syntheticEvidence(prepared, runPromptText(prepared.input)), 'runtime:synthetic');
      const before = snapshotFacts(store.read()); await close(store);
      const beforeBytes = await readFile(file), beforeHash = hash(beforeBytes);
      store = await open(OldStore, file);
      const oldMemory = snapshotFacts(store.read());
      await close(store);
      const afterReadOnlyHash = hash(await readFile(file));
      assert.equal(afterReadOnlyHash, beforeHash, 'Read-only old open must not silently rewrite disk');
      store = await open(OldStore, file);
      await command(store, { type: 'worksite.update', worksiteId: 'legacy', draft: 'Synthetic old-version edit' });
      await close(store);
      const afterOldWriteHash = hash(await readFile(file));
      store = await open(NewStore, file); const reopened = snapshotFacts(store.read()); await close(store);
      experiments.push({ phase, schemaVersion: 4, beforeHash, afterReadOnlyHash, afterOldWriteHash,
        beforeRunCount: before.runCount, oldMemoryRunCount: oldMemory.runCount,
        beforeRunStates: before.runStates,
        afterOldWriteRunCount: reopened.runCount, beforeRunsHash: before.runsHash,
        afterOldWriteRunsHash: reopened.runsHash, assetsPreserved: before.assetsHash === reopened.assetsHash,
        generatedBefore: before.generated, generatedAfter: reopened.generated,
        generatedAndProvenancePreserved: JSON.stringify(before.generated) === JSON.stringify(reopened.generated) });
    }
    // Separately exercise genuinely old-shaped data with no Run journal at all.
    const file = join(dir, 'legacy-no-runs.json');
    let store = await open(OldStore, file); await seed(store);
    const baseline = snapshotFacts(store.read()); await close(store);
    const oldBeforeBytes = await readFile(file), oldBeforeHash = hash(oldBeforeBytes);
    store = await open(NewStore, file);
    const newRead = snapshotFacts(store.read()); await close(store);
    const afterNewReadHash = hash(await readFile(file));
    assert.equal(afterNewReadHash, oldBeforeHash);
    store = await open(NewStore, file);
    await command(store, { type: 'worksite.update', worksiteId: 'legacy', draft: 'Synthetic new-version edit' }); await close(store);
    const afterNewWriteHash = hash(await readFile(file));
    store = await open(OldStore, file);
    await command(store, { type: 'worksite.update', worksiteId: 'legacy', draft: 'Synthetic legacy-version edit' }); await close(store);
    const afterOldWriteHash = hash(await readFile(file));
    store = await open(NewStore, file); const final = snapshotFacts(store.read()); await close(store);
    const legacyRoundTrip = { oldBeforeHash, afterNewReadHash, afterNewWriteHash, afterOldWriteHash,
      initialHadRunJournal: Object.hasOwn(JSON.parse(oldBeforeBytes), 'runs'),
      newMemoryRunCount: newRead.runCount, finalRunCount: final.runCount,
      assetsPreserved: baseline.assetsHash === final.assetsHash, provenancePreserved: baseline.assetsHash === final.assetsHash };
    const report = { kind: 'kont-synthetic-data-compatibility/v1', codeArtifacts: {
      newManifestSha256: expectedNewManifestSha256, oldManifestSha256: expectedOldManifestSha256 },
      dataSource: 'new-isolated-synthetic-stores-only', productionDataVerified: false,
      modelCalls: 0, experiments, legacyRoundTrip };
    return { ...report, preflight: desktopDataCompatibilityPreflight(report) };
  } finally {
    // A failure to close an owned store blocks cleanup rather than hiding a lock.
    for (const store of owned) await store.close();
    const target = resolve(dir);
    assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-data-compatibility-'));
    await rm(target, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await probeDesktopDataCompatibility(), null, 2));
}
