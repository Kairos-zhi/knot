import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyDesktopCandidate } from './prepare-desktop-candidate.mjs';
import { verifyDesktopRecovery } from './prepare-desktop-recovery.mjs';
const newDigest = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const constraints = Object.freeze({ provider: 'synthetic', model: 'never-called', maxTokens: 64, requestSha256: 'a'.repeat(64) });
function evidence(run, prompt) {
  const entries = [['turn/start', { turn: 1 }], ['step/start', { turn: 1, step: 1 }],
    ['user/message', { role: 'user', source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: prompt }] }],
    ['assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'never-called' }, content: [{ type: 'text', text: 'Synthetic output only' }] } }],
    ['step/end', { turn: 1, step: 1 }], ['turn/end', { turn: 1, reason: { kind: 'completed' } }]];
  return { sessionId: run.plannedSessionId, kind: 'synthetic-test', events: entries.map(([type, data], seq) => ({ type, data, seq, time: 1792627200000 + seq })) };
}
const facts = state => ({ journalHash: hash(JSON.stringify(state.runs)), assetsHash: hash(JSON.stringify(state.assets)),
  generated: state.assets.flatMap(asset => (asset.blocks ?? []).filter(block => block.source === 'generated')
    .map(block => ({ assetId: asset.id, id: block.id, content: block.content, provenance: block.provenance }))) });

/** Only package roots are inputs; every data file is a new synthetic file in
 * an owned D:/Temp directory. No production-data or model execution capability. */
export async function verifyRecoveryData(candidateRoot, expectedManifestSha256) {
  assert.equal(expectedManifestSha256, '774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d', 'UNREVIEWED_RECOVERY_DIGEST');
  const { manifest } = await verifyDesktopRecovery(candidateRoot, expectedManifestSha256);
  const newRoot = resolve('evidence/local/20261024-desktop-package/candidate');
  await verifyDesktopCandidate(newRoot, newDigest);
  const load = (root, file) => import(pathToFileURL(resolve(root, 'packages/dsh-plugin/src', file)).href);
  const [{ KontStore: NewStore }, { KontStore: RecoveryStore }, { runPromptText }] = await Promise.all([
    load(newRoot, 'store.mjs'), load(candidateRoot, 'store.mjs'), load(newRoot, 'run.mjs')]);
  const dir = await mkdtemp('D:/Temp/kont-recovery-data-'), owned = new Set();
  async function open(Store, file) { const store = await new Store(file).init(); owned.add(store); return store; }
  async function close(store) { await store.close(); owned.delete(store); }
  async function command(store, value) { const result = await store.command(value); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
  try {
    const phases = [];
    for (const phase of ['prepared', 'reserved', 'submitted', 'uncertain', 'completed']) {
      const file = join(dir, `${phase}.json`); let store = await open(NewStore, file);
      await command(store, { type: 'knot.create', id: 'public-source', data: { title: 'Synthetic source', summary: 'Public synthetic material' } });
      await command(store, { type: 'knot.create', id: 'target', data: { title: 'Synthetic target', summary: 'Initial synthetic target' } });
      await command(store, { type: 'worksite.update', worksiteId: 'legacy', draft: 'Synthetic only' });
      await command(store, { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'public-source', mode: 'connect' });
      const run = await command(store, { type: 'run.prepare', worksiteId: 'legacy', targetId: 'target', requestId: `synthetic-${phase}`, sessionId: `synthetic-session-${phase}` });
      if (phase !== 'prepared') {
        const reserved = await store.claimRunDispatch(run.runId, constraints);
        if (phase !== 'reserved') await store.settleRunDispatch(run.runId, reserved.run.dispatchClaim.claimId, phase === 'uncertain' ? 'uncertain' : 'submitted');
      }
      if (phase === 'completed') await store.returnRun(run.runId, evidence(run, runPromptText(run.input)), 'runtime:synthetic');
      const beforeState = store.read(), before = facts(beforeState); await close(store);
      const beforeHash = hash(await readFile(file));
      store = await open(RecoveryStore, file);
      assert.equal(facts(store.read()).journalHash, before.journalHash);
      const readHash = hash(await readFile(file)); assert.equal(readHash, beforeHash);
      await command(store, { type: 'worksite.update', worksiteId: 'legacy', draft: 'Synthetic recovery UI edit' });
      assert.equal(facts(store.read()).journalHash, before.journalHash);
      const afterMutationHash = hash(await readFile(file));
      const erased = store.snapshot(); erased.runs = [];
      await assert.rejects(store.restoreSnapshot(erased), { code: 'RUN_RESTORE_CONFLICT' });
      assert.equal(hash(await readFile(file)), afterMutationHash);
      const changed = store.snapshot(); changed.runs[0].createdAt = '2000-01-01T00:00:00Z';
      await assert.rejects(store.restoreSnapshot(changed), { code: 'RUN_RESTORE_CONFLICT' });
      assert.equal(hash(await readFile(file)), afterMutationHash);
      const ordinarySnapshot = store.snapshot(); delete ordinarySnapshot.runs;
      await store.restoreSnapshot(ordinarySnapshot);
      assert.equal(facts(store.read()).journalHash, before.journalHash);
      const afterRestoreHash = hash(await readFile(file));
      let duplicateClaimRefused = null;
      if (phase !== 'prepared') {
        const repeated = await store.claimRunDispatch(run.runId, constraints);
        assert.equal(repeated.acquired, false); duplicateClaimRefused = true;
        await assert.rejects(store.claimRunDispatch(run.runId, { ...constraints, requestSha256: 'b'.repeat(64) }), { code: 'RUN_DISPATCH_CONFLICT' });
        assert.equal(hash(await readFile(file)), afterRestoreHash);
      }
      await close(store);
      store = await open(NewStore, file); const after = facts(store.read());
      assert.equal(after.journalHash, before.journalHash);
      assert.equal(after.assetsHash, before.assetsHash);
      assert.deepEqual(after.generated, before.generated);
      assert.deepEqual(store.read().runs, beforeState.runs);
      if (phase !== 'prepared') assert.equal((await store.claimRunDispatch(run.runId, constraints)).acquired, false);
      await close(store);
      const reopenedHash = hash(await readFile(file)); assert.equal(reopenedHash, afterRestoreHash);
      let preparedFirstClaimAcquired = null;
      if (phase === 'prepared') {
        const trial = join(dir, 'prepared-first-claim-copy.json'); await copyFile(file, trial);
        const first = await open(RecoveryStore, trial);
        assert.equal((await first.claimRunDispatch(run.runId, constraints)).acquired, true);
        const claimedHash = hash(await readFile(trial));
        assert.equal((await first.claimRunDispatch(run.runId, constraints)).acquired, false);
        assert.equal(hash(await readFile(trial)), claimedHash);
        preparedFirstClaimAcquired = true; await close(first);
      }
      phases.push({ phase, beforeHash, readHash, afterMutationHash, afterRestoreHash, reopenedHash,
        beforeJournalHash: before.journalHash, reopenedJournalHash: after.journalHash,
        runState: { status: beforeState.runs[0].status, dispatch: beforeState.runs[0].dispatchClaim?.state ?? null,
          hasReceipt: beforeState.runs[0].receipt !== null },
        generated: after.generated, assetsAndProvenancePreserved: true, eraseRestoreRefused: true,
        foreignJournalRestoreRefused: true, absentJournalRestorePreserved: true, duplicateClaimRefused,
        preparedFirstClaimAcquired, changedConstraintsRefused: phase !== 'prepared' });
    }
    return { kind: 'kont-derived-recovery-data/v1', identity: manifest.identity,
      newManifestSha256: newDigest, recoveryManifestSha256: expectedManifestSha256,
      syntheticDataOnly: true, phases, modelCalls: 0, productionDataVerified: false, deploymentAuthorized: false };
  } finally {
    for (const store of owned) await store.close();
    const target = resolve(dir); assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-recovery-data-'));
    await rm(target, { recursive: true, force: true });
  }
}
