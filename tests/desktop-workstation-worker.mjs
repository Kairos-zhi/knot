import assert from 'node:assert/strict';
import { readFile, realpath, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createWorkstationClient, findNode } from './helpers/workstation-client-fixture.mjs';
import { createHttpEventSource } from './helpers/http-event-source.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function waitFor(check, label) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Integration wait expired: ${label}`);
    await new Promise(done => setTimeout(done, 10));
  }
}
function isInside(root, path) {
  const part = relative(root, path);
  return part && !part.startsWith('..') && !isAbsolute(part);
}
async function run() {
  assert.ok(process.env.KONT_INSTALLED_PLUGIN_ROOT && process.env.KONT_ISOLATED_PROFILE_ROOT, 'Explicit installation roots required');
  const profileRoot = await realpath(resolve(process.env.KONT_ISOLATED_PROFILE_ROOT));
  assert.equal(dirname(profileRoot).toLowerCase(), resolve('D:/Temp').toLowerCase());
  assert.ok(profileRoot.split(/[\\/]/).at(-1).startsWith('kont-candidate-manager-'));
  const pluginRoot = await realpath(resolve(process.env.KONT_INSTALLED_PLUGIN_ROOT));
  assert.ok(isInside(profileRoot, pluginRoot), 'Only the copied plugin inside this temporary profile may load');
  const loaded = [];
  for (const name of ['src/index.mjs', 'src/store.mjs', 'lib/client.js']) {
    const path = resolve(pluginRoot, name), actual = await realpath(path);
    assert.ok(isInside(pluginRoot, actual));
    assert.equal(actual.toLowerCase(), path.toLowerCase(), 'Installed entry cannot redirect outside its package');
    loaded.push({ path: actual, sha256: hash(await readFile(actual)) });
  }
  const { KontStore } = await import(pathToFileURL(join(pluginRoot, 'src/store.mjs')));
  const { createProtocolHandler, name: pluginName } = await import(pathToFileURL(join(pluginRoot, 'src/index.mjs')));
  assert.equal(pluginName, 'kont-worksite');
  const dataRoot = await mkdtemp(join(profileRoot, 'workstation-data-'));
  const stateFile = join(dataRoot, 'state.json');
  let store, server, handler, client, bridge;
  let subscriptions = 0;
  const checks = [];
  try {
    store = await new KontStore(stateFile).init();
    const block = { id: 'synthetic-block', content: 'synthetic complete original 中文', source: 'generated',
      timestamp: '2026-10-25T00:00:00Z', provenance: ['synthetic-history'] };
    assert.equal((await store.command({ type: 'knot.create', id: 'synthetic-material', data: {
      title: 'Synthetic material', summary: 'Synthetic summary', blocks: [block] } })).ok, true);
    assert.equal((await store.command({ type: 'worksite.supply', worksiteId: 'legacy', assetId: 'synthetic-material', mode: 'connect' })).ok, true);
    const subscribe = store.subscribe.bind(store);
    store.subscribe = listener => { subscriptions++; const dispose = subscribe(listener); return () => { subscriptions--; dispose(); }; };
    handler = createProtocolHandler(store, { requestRejection: req => req.headers['x-integration-client'] === 'synthetic' ? undefined : 401 });
    const workspaceHandler = (await import(pathToFileURL(join(pluginRoot, 'src/index.mjs')))).createHandler(store,
      { requestRejection: req => req.headers['x-integration-client'] === 'synthetic' ? undefined : 401 });
    server = createServer((req, res) => req.url.startsWith('/kont/api/workspace') ? workspaceHandler(req, res) : handler(req, res));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const baseURI = `http://127.0.0.1:${server.address().port}/`;
    const transport = (url, options = {}) => {
      assert.equal(new URL(url).origin, new URL(baseURI).origin, 'Only isolated loopback transport is permitted');
      return fetch(url, { ...options, headers: { ...options.headers, 'x-integration-client': 'synthetic' } });
    };
    bridge = createHttpEventSource(transport);
    client = await createWorkstationClient(null, () => undefined, {
      bundlePath: join(pluginRoot, 'lib/client.js'), baseURI, fetch: transport, EventSource: bridge.EventSource,
    });
    const field = () => client.node(node => node.props['aria-label'] === '现场草稿');
    const status = () => client.node(node => node.props.className === 'kont-save');
    await waitFor(() => Boolean(field()) && subscriptions === 1, 'initial copied client and subscription');
    checks.push('copied-service-and-renderer', 'actual-loopback-workspace-and-sse');
    field().props.onChange({ target: { value: 'synthetic saved draft' } });
    await client.button('保存草稿').props.onClick();
    await waitFor(() => subscriptions === 1, 'subscription after own write');
    assert.equal(store.read().workspace.worksites[0].draft, 'synthetic saved draft');
    assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).workspace.worksites[0].draft, 'synthetic saved draft');
    assert.match(String(status().children[0]), /已保存/);
    checks.push('draft-echo-and-durable-file', 'own-post-not-a-remote-change');
    await client.button('查看本轮供给').props.onClick();
    const panel = client.node(node => node.props['aria-label'] === '本轮供给预览');
    assert.ok(panel);
    assert.ok(findNode(panel, node => node.children.includes(block.content)));
    assert.ok(findNode(panel, node => node.children.some(value => typeof value === 'string' && value.includes('历史来源记录 1 条'))));
    const previewRequest = client.requests.find(request => request.path.endsWith('/preview'));
    assert.equal(previewRequest.options.method, 'GET');
    checks.push('shared-preview-complete-block-and-history');
    field().props.onChange({ target: { value: 'synthetic local dirty' } });
    const beforeEvent = client.requests.length;
    assert.equal((await store.command({ type: 'knot.update', id: 'synthetic-material', patch: { title: 'Synthetic externally changed' } })).ok, true);
    await waitFor(() => String(status().children[0]) === '现场待核对', 'external real SSE');
    assert.equal(field().props.value, 'synthetic local dirty');
    assert.equal(client.node(node => node.props['aria-label'] === '本轮供给预览'), null);
    await client.button('保存草稿').props.onClick();
    assert.equal(client.requests.length, beforeEvent, 'external notification never refreshes or writes');
    await waitFor(() => subscriptions === 0, 'closed remote-change stream');
    checks.push('external-byte-stream-invalidates-and-blocks', 'dirty-retained-no-auto-request');
    const beforeRefresh = client.requests.length;
    await client.button('刷新').props.onClick();
    await waitFor(() => subscriptions === 1, 'manual refresh subscription');
    assert.equal(field().props.value, 'synthetic local dirty');
    assert.ok(client.requests.slice(beforeRefresh).every(request => request.options.method !== 'POST'));
    assert.equal(client.button('保存草稿').props.disabled, false);
    await client.button('保存草稿').props.onClick();
    assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).workspace.worksites[0].draft, 'synthetic local dirty');
    checks.push('manual-refresh-only-get', 'explicit-save-after-reconciliation');
    client.unmount(); client = undefined;
    await bridge.dispose();
    await waitFor(() => subscriptions === 0, 'unmounted subscriptions released');
    checks.push('component-plugin-and-stream-disposal');
  } finally {
    client?.unmount();
    await bridge?.dispose();
    handler?.dispose();
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    await store?.close();
    await assert.rejects(access(`${stateFile}.lock`), { code: 'ENOENT' });
    const target = resolve(dataRoot);
    assert.equal(dirname(target), profileRoot); assert.ok(target.split(/[\\/]/).at(-1).startsWith('workstation-data-'));
    await rm(target, { recursive: true, force: true });
  }
  return { pluginRoot, profileRoot, loaded, checks, subscriptionsAfterCleanup: subscriptions,
    nativeEventSource: false, reactDOM: false, actualDshAppTransport: false,
    syntheticDataOnly: true, actualDesktopDeployment: false, modelCalls: 0 };
}
run().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
