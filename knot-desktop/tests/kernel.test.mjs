import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-kernel-'));
  const file = join(dir, 'state.json');
  const store = await new KontStore(file).init();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  return { store, file, dir };
}
const manual = content => ({ id: 'b1', source: 'manual', timestamp: '2026-10-21T00:00:00Z', provenance: [], content });
const asset = (id, blocks) => ({ id, title: id, summary: blocks[0].content, src: 'local:test', chain_id: '', blocks });

test('headless old commands create/connect/append/disconnect and preserve real schema-4 state after restart', async t => {
  const { store, file } = await fixture(t);
  const observed = []; store.subscribe(event => observed.push(event));
  assert.deepEqual(await store.command({ type: 'knot.create', id: 'A', data: asset('A', [manual('original')]) }, 'agent:one'), { ok: true, value: 'A' });
  assert.equal((await store.command({ type: 'knot.create', id: 'B', data: asset('B', [manual('second')]), position: { x: 44, y: 55 } })).ok, true);
  assert.equal((await store.command({ type: 'rope.connect', fromId: 'A', toId: 'B', fixed: true })).ok, true);
  const generated = { id: 'b2', source: 'generated', timestamp: '2026-10-21T01:00:00Z', provenance: ['B'], content: 'appended from B', metadata: { version: 2 } };
  assert.equal((await store.command({ type: 'knot.update', id: 'A', patch: { blocks: [manual('original'), generated] } })).ok, true);
  const withEdge = store.snapshot();
  assert.equal(withEdge.schemaVersion, 4);
  assert.equal(withEdge.edges[0].data.fixed, true);
  assert.deepEqual(withEdge.assets[0].blocks[1], generated);
  assert.deepEqual(withEdge.assets[1].position, { x: 44, y: 55 });
  assert.equal((await store.command({ type: 'rope.disconnect', fromId: 'A', toId: 'B' })).ok, true);
  assert.equal(store.snapshot().edges.length, 0);
  assert.deepEqual(observed.map(event => event.type), ['knot.created', 'knot.created', 'rope.connected', 'knot.updated', 'rope.disconnected']);
  assert.deepEqual(observed.map(event => event.seq), [1, 2, 3, 4, 5]);
  const saved = store.read();
  await store.close();
  const reopened = await new KontStore(file).init();
  try { assert.deepEqual(reopened.read(), saved); assert.equal(reopened.eventsSince(0).reset, true); assert.equal(reopened.eventsSince(5).reset, false); }
  finally { await reopened.close(); }
});

test('legacy snapshot normalization keeps IDs, edge extension data, blocks and source; invalid restore preserves bytes', async t => {
  const { store, file } = await fixture(t);
  const snapshot = { schemaVersion: 3, assets: [asset('A', [manual('one')]), asset('B', [manual('two')])], edges: [{ sourceNodeID: 'A', targetNodeID: 'B', sourcePortID: 'out', targetPortID: 'in', data: { fixed: true, role: 'reference', other: { value: 1 } } }] };
  await store.restoreSnapshot(snapshot);
  assert.deepEqual(store.snapshot().assets, snapshot.assets);
  assert.deepEqual(store.snapshot().edges, snapshot.edges);
  assert.equal(store.snapshot().workspace.activeWorksiteId, 'legacy');
  const before = await readFile(file, 'utf8');
  await assert.rejects(store.restoreSnapshot({ ...snapshot, schemaVersion: 99 }));
  await assert.rejects(store.restoreSnapshot({ ...snapshot, edges: [{ sourceNodeID: 'A', targetNodeID: 'missing' }] }));
  assert.equal(await readFile(file, 'utf8'), before);
});

test('old UI-only schema migrates into canonical snapshot without data loss or eager disk rewriting', async t => {
  const { store, file } = await fixture(t);
  const initial = store.read(); await store.close();
  const old = { schema: 1, revision: 7, workspace: initial.workspace, assets: [{ id: 'old', title: 'old', summary: 'text', blocks: [manual('text')] }], titles: { legacy: 'old scene' } };
  const bytes = JSON.stringify(old); await writeFile(file, bytes);
  const migrated = await new KontStore(file).init();
  try {
    assert.equal(migrated.read().schemaVersion, 4); assert.equal(migrated.read().seq, 7);
    assert.equal(migrated.read().assets[0].src, ''); assert.equal(migrated.read().titles.legacy, 'old scene');
    assert.equal(await readFile(file, 'utf8'), bytes);
    assert.equal((await migrated.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'after migration' })).ok, true);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).schemaVersion, 4);
  } finally { await migrated.close(); }
});

test('unimplemented commands and invalid blocks cannot become fake success; source is fixed by caller context', async t => {
  const { store, file } = await fixture(t);
  await store.command({ type: 'knot.create', id: 'A', data: asset('A', [manual('original')]), source: 'forged' }, 'agent:configured');
  const before = await readFile(file, 'utf8');
  for (const type of ['generate.grow', 'tool.set', 'chain.thread', 'knot.delete', 'invented.command']) {
    assert.equal((await store.command({ type })).error.code, 'UNSUPPORTED_COMMAND');
  }
  assert.equal((await store.command({ type: 'knot.update', id: 'A', patch: { blocks: [manual('a'), manual('duplicate')] } })).ok, false);
  assert.equal((await store.command({ type: 'knot.update', id: 'A', patch: { id: 'changed' } })).ok, false);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.equal(store.eventsSince(0).events[0].source, 'agent:configured');
});

test('queued arguments and returned events are detached; failed batch emits nothing', async t => {
  const { store, file } = await fixture(t);
  const request = { revision: 0, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: 'captured' }] };
  const promise = store.mutate(request); request.commands[0].draft = 'changed after call'; await promise;
  assert.equal(store.preview('legacy').draft, 'captured');
  const before = await readFile(file, 'utf8');
  store.subscribe(() => { throw new Error('observer failed'); });
  await assert.rejects(store.mutate({ revision: 1, commands: [{ type: 'knot.create', id: 'new' }, { type: 'rope.connect', fromId: 'missing', toId: 'new' }] }));
  assert.equal(await readFile(file, 'utf8'), before); assert.equal(store.read().seq, 1);
  assert.equal((await store.command({ type: 'knot.create', id: 'A' })).ok, true);
  const replay = store.eventsSince(0); replay.events[0].source = 'mutated';
  assert.equal(store.eventsSince(0).events[0].source, 'human');
});

test('bounded event buffer reports snapshot reset and failed IO emits no event', async t => {
  const { store, file, dir } = await fixture(t);
  await mkdir(file);
  assert.equal((await store.command({ type: 'knot.create', id: 'A' })).ok, false);
  assert.equal(store.read().seq, 0); assert.deepEqual(store.eventsSince(0).events, []);
  assert.deepEqual((await readdir(dir)).filter(file => file.endsWith('.tmp')), []);
  await rm(file, { recursive: true });
  for (let i = 0; i < 205; i++) await store.mutate({ revision: i, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: `${i}` }] });
  assert.equal(store.eventsSince(0).reset, true); assert.equal(store.eventsSince(5).reset, false);
  assert.equal(store.eventsSince(5).events.length, 200);
});
