import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('draft leave guard warns on actual edits and clears when text returns to the saved value', async () => {
  const body = await readFile(new URL('../packages/dsh-plugin/src/client.cjs', import.meta.url), 'utf8');
  const events = new Map(), components = new Map();
  let effectMounted = false;
  const saved = { revision: 1, assets: [], titles: { legacy: '现场' }, workspace: { activeWorksiteId: 'legacy', worksites: [{ id: 'legacy', draft: 'saved text', checkedIds: [], excludedIds: [] }], presentations: [] } };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: value => [value, () => {}],
    useSyncExternalStore: (_subscribe, read) => read(),
    useEffect: effect => { if (!effectMounted) { effectMounted = true; effect(); } },
  };
  const exported = {};
  runInNewContext(body, {
    exports: exported, require: name => { assert.equal(name, 'react'); return react; }, CSS: '', URL,
    fetch: async () => ({ ok: true, json: async () => structuredClone(saved) }),
    document: { baseURI: 'http://127.0.0.1/', createElement: () => ({ remove() {} }), head: { appendChild() {} } },
    window: { addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) },
  });
  exported.apply({
    effect: callback => callback(), layout: {},
    slots: { inject: (_name, callback) => callback(), register: (spec, component) => components.set(`${spec.name}:${spec.key || spec.id}`, component) },
  });
  const component = components.get('main:kont');
  component();
  await new Promise(resolve => setImmediate(resolve));
  const tree = component();
  const find = node => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'textarea' && node.props['aria-label'] === '现场草稿') return node;
    return node.children?.flat(Infinity).map(find).find(Boolean);
  };
  const textarea = find(tree);
  assert.ok(textarea, JSON.stringify(tree));
  const checkLeave = () => {
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; } };
    events.get('beforeunload')(event);
    return prevented;
  };
  assert.equal(checkLeave(), false);
  // Direct component-callback contract checks; no browser/DOM or simulated click.
  textarea.props.onChange({ target: { value: 'edited text' } });
  assert.equal(checkLeave(), true);
  textarea.props.onChange({ target: { value: 'saved text' } });
  assert.equal(checkLeave(), false);
});
