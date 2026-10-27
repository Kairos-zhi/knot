import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('browser bundle joins native DSH slots and disposes its stylesheet', async () => {
  const bundle = await readFile(new URL('../packages/dsh-plugin/lib/client.js', import.meta.url), 'utf8');
  let definition;
  const effects = [], registrations = [];
  const style = { remove() { this.removed = true; } };
  const window = { __ModuleLoader__: { load(value) { definition = value; } }, addEventListener() {}, removeEventListener() {} };
  runInNewContext(bundle, { window, document: { createElement: () => style, head: { appendChild() {} } } });
  assert.equal(definition.id, '@kont/dsh-plugin');
  const exported = definition.factory(name => { assert.equal(name, 'react'); return {}; });
  exported.apply({ effect: fn => effects.push(fn()), slots: { inject: (_name, fn) => fn(), register: (spec, component) => { registrations.push({ spec, component }); return () => {}; } } });
  assert.equal(registrations.find(row => row.spec.name === 'main').spec.key, 'kont');
  assert.equal(registrations.find(row => row.spec.name === 'sidebar.panellist').spec.label, 'KONT 工作现场');
  effects.forEach(dispose => dispose()); assert.equal(style.removed, true);
});
