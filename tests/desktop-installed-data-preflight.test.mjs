import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { KontStore } from '../evidence/local/20261024-desktop-package/candidate/packages/dsh-plugin/src/store.mjs';
import { probeDesktopSnapshotCompatibility } from '../scripts/desktop-installed-data-preflight.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const dir = await mkdtemp('D:/Temp/kont-installed-data-test-');
  const file = join(dir, 'synthetic.json');
  const store = await new KontStore(file).init();
  t.after(async () => {
    await store.close();
    const target = resolve(dir);
    assert.equal(dirname(target), resolve('D:/Temp'));
    assert.ok(target.split(/[\\/]/).at(-1).startsWith('kont-installed-data-test-'));
    await rm(target, { recursive: true, force: true });
  });
  assert.equal((await store.command({ type: 'knot.create', id: 'private-synthetic-target',
    data: { title: 'SYNTHETIC_PRIVATE_SENTINEL', summary: 'SYNTHETIC_PRIVATE_SENTINEL' } })).ok, true);
  assert.equal((await store.command({ type: 'run.prepare', worksiteId: 'legacy', targetId: 'private-synthetic-target',
    requestId: 'synthetic-request', sessionId: 'synthetic-session' })).ok, true);
  await store.close();
  return { file, bytes: await readFile(file) };
}
test('private-copy probe preserves all state except its deliberate draft/revision changes and discloses only summary', async t => {
  const { file, bytes } = await fixture(t), before = hash(bytes);
  const result = await probeDesktopSnapshotCompatibility(bytes);
  assert.equal(result.sourceSha256, before);
  assert.equal(result.assetCount, 1); assert.equal(result.runCount, 1);
  assert.equal(result.validatedOnPrivateTemporaryCopy, true);
  assert.equal(result.readAndWriteRoundTripPreserved, true);
  assert.equal(result.productionDeploymentAccepted, false);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_SENTINEL'), false);
  assert.equal(JSON.stringify(result).includes('private-synthetic-target'), false);
  assert.equal(hash(await readFile(file)), before);
});
test('unknown fields and malformed journals fail closed without leaking values or touching caller data', async t => {
  const { file, bytes } = await fixture(t), base = JSON.parse(bytes), before = hash(bytes);
  for (const changed of [{ ...base, futureField: 'SYNTHETIC_PRIVATE_SENTINEL' },
    { ...base, runs: [{ private: 'SYNTHETIC_PRIVATE_SENTINEL' }] }, { ...base, schemaVersion: 999 }]) {
    const input = Buffer.from(JSON.stringify(changed)), inputHash = hash(input);
    await assert.rejects(probeDesktopSnapshotCompatibility(input), error =>
      error.message.startsWith('Desktop data preflight refused (') && !error.message.includes('SYNTHETIC_PRIVATE_SENTINEL'));
    assert.equal(hash(input), inputHash);
  }
  assert.equal(hash(await readFile(file)), before);
});
test('probe requires bounded bytes and valid JSON before any store is created', async () => {
  for (const input of [null, Buffer.alloc(0), Buffer.from('{')])
    await assert.rejects(probeDesktopSnapshotCompatibility(input), error => ['SOURCE_SIZE', 'INVALID_JSON'].includes(error.code));
});
