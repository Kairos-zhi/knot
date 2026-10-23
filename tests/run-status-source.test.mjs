import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRunStatusView } from '../packages/dsh-plugin/src/run-status-view.mjs';

const source = await readFile(new URL('../packages/dsh-plugin/src/run-status-source.cjs', import.meta.url), 'utf8');
function load() {
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => { assert.equal(name, '@kont/run-status-view'); return { createRunStatusView }; }, URL, AbortController });
  return exports;
}
const run = (worksiteId, runId = 'synthetic-run') => ({ runId, requestId: 'synthetic-request', sessionId: 'synthetic-session',
  targetId: 'target', worksiteId, phase: 'prepared', hasOutput: false, blockId: null });
const body = (seq, runs) => ({ ok: true, seq, runs });
const response = value => ({ ok: true, json: async () => value });
const plain = value => JSON.parse(JSON.stringify(value));

test('Run source uses only same-origin GET; switching cancels and fences late old-scene responses', async () => {
  const { createRunStatusSource } = load(), requests = [];
  const controller = createRunStatusSource({ baseURI: 'http://127.0.0.1:9000/', fetch: (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:9000/kont/runs');
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'same-origin');
    return new Promise(resolve => requests.push({ options, resolve }));
  } });
  const first = controller.setWorksite('one', 4);
  const second = controller.setWorksite('two', 5);
  assert.equal(requests[0].options.signal.aborted, true);
  assert.deepEqual(plain(controller.read().runs), []);
  requests[1].resolve(response(body(6, [run('two')]))); await second;
  requests[0].resolve(response(body(4, [run('one')]))); await first;
  assert.equal(controller.read().worksiteId, 'two'); assert.equal(controller.read().seq, 6);
  assert.equal(controller.read().runs[0].worksiteId, 'two');
  controller.dispose();
});

test('Run source rejects sequence regression/private fields/errors and lets manual refresh recover', async () => {
  const { createRunStatusSource } = load(); let value = body(6, [run('one')]);
  const controller = createRunStatusSource({ baseURI: 'http://127.0.0.1/', fetch: async () => response(value) });
  await controller.setWorksite('one', 5); assert.equal(controller.read().runs.length, 1);
  value = body(4, [run('one')]); await controller.refresh();
  assert.equal(controller.read().runs.length, 0); assert.ok(controller.read().error);
  value = body(7, [{ ...run('one'), prompt: 'PRIVATE_SENTINEL' }]); await controller.refresh();
  assert.equal(controller.read().runs.length, 0); assert.equal(JSON.stringify(controller.read()).includes('PRIVATE_SENTINEL'), false);
  value = body(8, [run('one')]); await controller.refresh();
  assert.equal(controller.read().seq, 8); assert.equal(controller.read().error, '');
  controller.dispose();
});

test('Run source drops same-scene out-of-order responses and clears subscribers/cancels on disposal', async () => {
  const { createRunStatusSource } = load(), requests = []; let notices = 0;
  const controller = createRunStatusSource({ baseURI: 'http://127.0.0.1/', fetch: (_url, options) => new Promise(resolve => requests.push({ options, resolve })) });
  const unsubscribe = controller.subscribe(() => notices++);
  const first = controller.setWorksite('one', 1), second = controller.refresh('one', 1);
  requests[1].resolve(response(body(3, [run('one', 'new')]))); await second;
  requests[0].resolve(response(body(2, [run('one', 'old')]))); await first;
  assert.equal(controller.read().runs[0].runId, 'new');
  const pending = controller.refresh(); const before = notices;
  controller.dispose(); unsubscribe();
  assert.equal(requests[2].options.signal.aborted, true);
  requests[2].resolve(response(body(4, [run('one', 'late')]))); await pending;
  assert.equal(notices, before);
  await controller.refresh(); assert.equal(requests.length, 3);
});

test('output location resolves only a current-site block and observes deletion without recreating it', () => {
  const { resolveRunOutput } = load();
  const data = { workspace: { activeWorksiteId: 'one', worksites: [{ id: 'one' }, { id: 'two' }] },
    assets: [{ id: 'target', title: 'Current target', blocks: [{ id: 'b1', content: 'Current output' }] }] };
  const reference = { worksiteId: 'one', assetId: 'target', blockId: 'b1' };
  assert.deepEqual(plain(resolveRunOutput(data, reference)), { title: 'Current target', content: 'Current output' });
  data.workspace.activeWorksiteId = 'two'; assert.equal(resolveRunOutput(data, reference), null);
  data.workspace.activeWorksiteId = 'one'; data.assets[0].blocks = [];
  assert.equal(resolveRunOutput(data, reference), null); assert.equal(data.assets[0].blocks.length, 0);
});
