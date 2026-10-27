import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const settle = () => new Promise(resolve => setImmediate(resolve));
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of tree.children ?? []) { const match = find(child, predicate); if (match) return match; }
  return null;
}
test('built client embeds local panel/view/source, shares all presentations, and locates without a write request', async () => {
  const bundle = await readFile(new URL('../packages/dsh-plugin/lib/client.js', import.meta.url), 'utf8');
  let definition, component, cursor = 0, data = { revision: 1, seq: 4, titles: { one: 'Scene one' },
    workspace: { activeWorksiteId: 'one', worksites: [{ id: 'one', draft: '', checkedIds: [], excludedIds: [] }],
      presentations: [{ id: 'view-one', worksiteId: 'one', kind: 'window', closed: false }] },
    assets: [{ id: 'target', title: 'Synthetic target', summary: '', blocks: [{ id: 'b1', content: 'Synthetic output' }] }] };
  const hooks = [], effectQueue = [], disposers = [], requests = [];
  let workspaceGate;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) { const index = cursor++; if (!hooks[index]) hooks[index] = { value: initial }; return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; },
    useEffect(callback, dependencies) {
      const index = cursor++, prior = hooks[index];
      if (!prior || dependencies.some((d, n) => d !== prior.dependencies[n])) { hooks[index] = { dependencies }; effectQueue.push(callback); }
    },
    useSyncExternalStore: (_subscribe, read) => read(),
  };
  const window = { __ModuleLoader__: { load(value) { definition = value; } }, addEventListener() {}, removeEventListener() {} };
  const document = { baseURI: 'http://127.0.0.1:9000/', createElement: () => ({ remove() {} }), head: { appendChild() {} } };
  const fetch = async (url, options = {}) => {
    requests.push({ path: new URL(url).pathname, options });
    if (new URL(url).pathname === '/kont/api/workspace') return workspaceGate ?? { ok: true, json: async () => structuredClone(data) };
    assert.equal(new URL(url).pathname, '/kont/runs'); assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    // Parse inside the renderer realm, matching actual response.json().
    return { ok: true, json: async () => vm.runInContext('JSON.parse(payload)', context) };
  };
  const context = vm.createContext({ window, document, URL, AbortController, fetch,
    EventSource: class { addEventListener() {} close() {} },
    payload: JSON.stringify({ ok: true, seq: 4, runs: [{ runId: 'r1', requestId: 'q1', sessionId: 's1', targetId: 'target', worksiteId: 'one', phase: 'completed', hasOutput: true, blockId: 'b1' }] }) });
  vm.runInContext(bundle, context);
  const exported = definition.factory(name => { assert.equal(name, 'react', 'local aliases must not escape to host require'); return react; });
  exported.apply({ effect: fn => disposers.push(fn()), layout: { selectPanel() {} }, slots: {
    inject: (_name, fn) => fn(), register: (spec, value) => { if (spec.name === 'main') component = value; return () => {}; },
  } });
  const render = () => { cursor = 0; const tree = component(); for (const effect of effectQueue.splice(0)) effect(); return tree; };
  render(); await settle(); await settle();
  for (const mode of ['window', 'card', 'icon']) {
    data.workspace.presentations[0].kind = mode;
    if (mode !== 'window') { const panel = find(render(), n => n.type?.name === 'RunStatusPanel'); await panel.props.onRefresh(); await settle(); }
    const panel = find(render(), n => n.type?.name === 'RunStatusPanel');
    assert.ok(panel, `${mode} has one shared status panel`); assert.equal(panel.props.runs[0].runId, 'r1');
  }
  const panel = find(render(), n => n.type?.name === 'RunStatusPanel'), before = requests.length;
  panel.props.onLocate({ worksiteId: 'one', assetId: 'target', blockId: 'b1' });
  assert.equal(find(render(), n => n.props['aria-label'] === '运行产物').children[1].children[0], 'Synthetic output');
  assert.equal(requests.length, before, 'location is local and read-only');
  let rejectWorkspace;
  workspaceGate = new Promise((_, reject) => { rejectWorkspace = reject; });
  const refreshing = panel.props.onRefresh();
  const waiting = render();
  assert.equal(find(waiting, n => n.type?.name === 'RunStatusPanel').props.loading, true);
  assert.equal(find(waiting, n => n.props['aria-label'] === '运行产物'), null);
  rejectWorkspace(new Error('SYNTHETIC_WORKSPACE_FAILURE')); await refreshing;
  const failed = render(), failedPanel = find(failed, n => n.type?.name === 'RunStatusPanel');
  assert.equal(failedPanel.props.runs.length, 0); assert.ok(failedPanel.props.error);
  assert.equal(find(failed, n => n.props['aria-label'] === '运行产物'), null);
  assert.ok(requests.every(r => !r.options.method || r.options.method === 'GET'));
  for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose();
});
