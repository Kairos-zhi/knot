import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('actual bundle factory composes real panel/view/source and stale location callbacks cannot reveal another site', async () => {
  const bundle = await readFile('packages/dsh-plugin/lib/client.js', 'utf8');
  const data = { revision: 1, seq: 5, titles: { one: '现场一', two: '现场二' },
    workspace: { activeWorksiteId: 'one', worksites: ['one', 'two'].map(id => ({ id, draft: '', checkedIds: [], excludedIds: [] })),
      presentations: [] }, assets: [{ id: 'target', title: '<script>opaque title</script>', summary: '', blocks: [{ id: 'b', content: '<img>PUBLIC OUTPUT' }] }] };
  let definition, component, cursor = 0;
  const hooks = [], effects = [], disposers = [], requests = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) { const id = cursor++; hooks[id] ??= { value: initial }; return [hooks[id].value, next => { hooks[id].value = typeof next === 'function' ? next(hooks[id].value) : next; }]; },
    useEffect(fn, dependencies) { const id = cursor++, prior = hooks[id]; if (!prior || dependencies.some((value, i) => value !== prior.dependencies[i])) { hooks[id] = { dependencies }; effects.push(fn); } },
    useSyncExternalStore: (_subscribe, read) => read(),
  };
  const context = vm.createContext({ URL, AbortController,
    window: { __ModuleLoader__: { load(value) { definition = value; } }, addEventListener() {}, removeEventListener() {} },
    document: { baseURI: 'http://127.0.0.1:9000/', createElement: () => ({ remove() {} }), head: { appendChild() {} } },
    fetch: async (url, options = {}) => {
      requests.push({ path: new URL(url).pathname, method: options.method ?? 'GET' });
      context.payload = JSON.stringify(new URL(url).pathname === '/kont/runs'
        ? { ok: true, seq: 5, runs: [{ runId: 'r', requestId: 'q', sessionId: 's', worksiteId: 'one', targetId: 'target', phase: 'completed', hasOutput: true, blockId: 'b' }] } : data);
      return { ok: true, json: async () => vm.runInContext('JSON.parse(payload)', context) };
    },
  });
  vm.runInContext(bundle, context);
  const exported = definition.factory(name => { assert.equal(name, 'react'); return react; });
  exported.apply({ effect: fn => disposers.push(fn()), layout: {}, slots: { inject: (_slot, fn) => fn(), register: (spec, value) => { if (spec.name === 'main') component = value; return () => {}; } } });
  const render = () => { cursor = 0; const tree = component(); for (const fn of effects.splice(0)) fn(); return tree; };
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes)];
  const find = (tree, predicate) => nodes(tree).find(predicate);
  const text = tree => !tree || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : tree.children.map(text).join(' ');
  const panel = tree => find(tree, node => node.type?.name === 'RunStatusPanel');
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    render(); await settle(); await settle(); render(); await settle();
    let tree = render(), entry = panel(tree);
    // Invoke the actual locally bundled CJS component, which invokes its actual
    // locally bundled ESM viewmodel. No alias is satisfied by the host.
    const semantic = entry.type(entry.props);
    assert.match(text(semantic), /已完成/);
    assert.ok(find(semantic, node => node.type === 'span' && node.children.includes(data.assets[0].title)));
    assert.equal(nodes(semantic).some(node => node.type === 'script' || node.props.dangerouslySetInnerHTML), false);
    const locate = find(semantic, node => node.type === 'button' && node.children.includes('查看产物'));
    locate.props.onClick(); tree = render();
    assert.match(text(find(tree, node => node.props['aria-label'] === '运行产物')), /PUBLIC OUTPUT/);
    data.workspace.activeWorksiteId = 'two';
    await entry.props.onRefresh(); tree = render(); await settle(); tree = render();
    assert.equal(find(tree, node => node.props['aria-label'] === '运行产物'), undefined);
    locate.props.onClick(); tree = render(); // retained old callback is rechecked against current snapshot
    assert.equal(find(tree, node => node.props['aria-label'] === '运行产物'), undefined);
    entry = panel(tree);
    assert.doesNotMatch(text(entry.type(entry.props)), /opaque title|PUBLIC OUTPUT|已完成/);
    assert.ok(requests.every(request => request.method === 'GET'));
  } finally { for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose(); }
});
