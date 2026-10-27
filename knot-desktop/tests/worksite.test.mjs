import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-test-'));
  const file = join(dir, 'worksites.json');
  const store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const act = commands => store.mutate({ revision: store.read().revision, commands });
  return { store, file, act };
}

test('selected materials, exclusion, draft and presentation survive restart; sites stay isolated', async t => {
  const { store, file, act } = await fixture(t);
  await act([{ type: 'asset.add', title: '来源 A', content: '原始内容' }]);
  const assetId = store.read().assets[0].id;
  await act([
    { type: 'worksite.supply', worksiteId: 'legacy', assetId, mode: 'connect' },
    { type: 'worksite.update', worksiteId: 'legacy', draft: '沿着这个问题继续' },
    { type: 'presentation.open', id: 'first-view', worksiteId: 'legacy', kind: 'card' },
    { type: 'scene.create', title: '第二现场' },
  ]);
  const second = store.read().workspace.activeWorksiteId;
  assert.notEqual(second, 'legacy');
  assert.deepEqual(store.preview(second).materials, []);
  assert.equal(store.preview(second).draft, '');
  assert.equal(store.preview('legacy').materials.length, 1);
  await act([{ type: 'worksite.supply', worksiteId: 'legacy', assetId, mode: 'exclude' }]);
  await act([{ type: 'worksite.supply', worksiteId: 'legacy', assetId, mode: 'suggest' }]);
  assert.deepEqual(store.preview('legacy').materials, []);
  assert.equal(store.read().assets.length, 1, 'excluding a source preserves its original');
  const before = store.read();
  await store.close();
  const reopened = await new KontStore(file).init();
  try { assert.deepEqual(reopened.read(), before); }
  finally { await reopened.close(); }
});

test('concurrent windows reject stale writes and do not lose a saved draft', async t => {
  const { store } = await fixture(t);
  const results = await Promise.allSettled([
    store.mutate({ revision: 0, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: 'first' }] }),
    store.mutate({ revision: 0, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: 'second' }] }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].reason.code, 'STALE_REVISION');
  assert.equal(store.preview('legacy').draft, 'first');
  assert.equal(store.read().revision, 1);
});

test('failed batch rolls back all changes and disk; returned objects cannot mutate the store', async t => {
  const { store, file, act } = await fixture(t);
  await act([{ type: 'worksite.update', worksiteId: 'legacy', draft: 'saved' }]);
  const disk = await readFile(file, 'utf8');
  await assert.rejects(act([
    { type: 'asset.add', title: 'must not remain', content: 'not committed' },
    { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'missing', mode: 'connect' },
  ]), { code: 'MISSING_ASSET' });
  assert.equal(await readFile(file, 'utf8'), disk);
  assert.equal(store.read().assets.length, 0);
  const copy = store.read(); copy.workspace.worksites[0].draft = 'mutated';
  assert.equal(store.preview('legacy').draft, 'saved');
});

test('corrupt snapshots fail closed and are never replaced with empty data', async t => {
  const { store, file } = await fixture(t);
  await store.close();
  const corrupt = '{"schema":1,"revision":0,"assets":[],"titles":{}}';
  await writeFile(file, corrupt);
  await assert.rejects(new KontStore(file).init(), { code: 'INVALID_STORE' });
  assert.equal(await readFile(file, 'utf8'), corrupt);
});

test('one live writer owns storage and oversized drafts are rejected', async t => {
  const { store, file, act } = await fixture(t);
  await assert.rejects(new KontStore(file).init(), { code: 'STORE_LOCKED' });
  await assert.rejects(act([{ type: 'worksite.update', worksiteId: 'legacy', draft: 'x'.repeat(50001) }]), { code: 'INVALID_INPUT' });
  assert.equal(store.read().revision, 0);
});
