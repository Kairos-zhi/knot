import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

export const settle = () => new Promise(done => setImmediate(done));
export function findNode(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of tree.children ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
export const response = value => ({ ok: true, json: async () => value });

export function createEventSourceFixture() {
  const streams = [];
  class EventSource {
    constructor(url, options) {
      this.url = url; this.options = options; this.closed = false;
      this.listeners = new Map(); streams.push(this);
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    close() { this.closed = true; }
    notify(type, data, lastEventId = '') {
      const event = { data: typeof data === 'string' ? data : JSON.stringify(data), lastEventId };
      if (type === 'message') this.onmessage?.(event);
      else if (type === 'error') this.onerror?.(event);
      else this.listeners.get(type)?.(event);
    }
  }
  return { EventSource, streams };
}

// Expand downstream pure function components without naming individual panels.
// This is semantic composition, not ReactDOM or a general hook renderer.
export function expandPureComponents(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expandPureComponents(tree.type(tree.props));
  return { ...tree, children: (tree.children ?? []).map(expandPureComponents) };
}

/** Component and callback semantics only. No DOM, screenshot or simulated click.
 * Execute the real built module factory; the only host dependency is React. */
export async function createWorkstationClient(data, onRequest = () => undefined, options = {}) {
  const bundle = await readFile(options.bundlePath ?? new URL('../../packages/dsh-plugin/lib/client.js', import.meta.url), 'utf8');
  let definition, component, cursor = 0;
  const hooks = [], pendingEffects = [], disposers = [], requests = [], events = new Map();
  const eventSourceFixture = createEventSourceFixture();
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: initial };
      return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }];
    },
    useEffect(callback, dependencies) {
      const index = cursor++, prior = hooks[index];
      if (!prior || dependencies.some((item, n) => item !== prior.dependencies[n])) {
        hooks[index] = { dependencies, cleanup: prior?.cleanup };
        pendingEffects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
    useSyncExternalStore: (_subscribe, read) => read(),
  };
  const context = vm.createContext({ URL, AbortController,
    EventSource: Object.hasOwn(options, 'EventSource') ? options.EventSource : eventSourceFixture.EventSource,
    window: { __ModuleLoader__: { load(value) { definition = value; } },
      addEventListener(name, callback) { events.set(name, callback); }, removeEventListener(name) { events.delete(name); } },
    document: { baseURI: options.baseURI ?? 'http://127.0.0.1:9000/', createElement: () => ({ remove() {} }), head: { appendChild() {} } },
    fetch: async (url, requestOptions = {}) => {
      const request = { url: String(url), path: new URL(url).pathname, options: requestOptions };
      requests.push(request);
      const custom = onRequest(request);
      if (custom !== undefined) return custom;
      if (options.fetch) return options.fetch(url, requestOptions);
      const body = request.path === '/kont/api/workspace' ? structuredClone(data)
        : request.path === '/kont/runs' && options.runResponse ? await options.runResponse(request)
          : { ok: true, seq: data.seq, runs: [] };
      // response.json belongs to the renderer realm in production.
      context.payload = JSON.stringify(body);
      return response(vm.runInContext('JSON.parse(payload)', context));
    },
  });
  vm.runInContext(bundle, context);
  assert.equal(definition.id, '@kont/dsh-plugin');
  const exported = definition.factory(name => { assert.equal(name, 'react'); return react; });
  exported.apply({ effect: fn => disposers.push(fn()), layout: { selectPanel() {} }, slots: {
    inject: (_name, fn) => fn(), register: (spec, value) => { if (spec.name === 'main') component = value; return () => {}; },
  } });
  function render() {
    cursor = 0;
    const tree = component();
    for (const effect of pendingEffects.splice(0)) effect();
    return expandPureComponents(tree);
  }
  const node = predicate => findNode(render(), predicate);
  const button = label => node(item => item.type === 'button' && item.children.includes(label));
  function unmountComponent() {
    for (const hook of hooks) hook?.cleanup?.();
  }
  function unmount() {
    unmountComponent();
    for (const dispose of disposers.reverse()) dispose?.();
  }
  async function remountComponent() {
    unmountComponent();
    hooks.length = 0;
    pendingEffects.length = 0;
    render(); await settle(); await settle();
  }
  render(); await settle(); await settle();
  return { render, node, button, requests, events, unmount, unmountComponent, remountComponent,
    eventStreams: eventSourceFixture.streams };
}
