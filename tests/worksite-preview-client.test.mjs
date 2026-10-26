import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkstationClient, deferred, response, settle } from './helpers/workstation-client-fixture.mjs';

const firstId = '现场 / %2F 中文';
function workspace() {
  return { revision: 1, seq: 4, titles: { [firstId]: 'First site', two: 'Second site' }, assets: [],
    workspace: { activeWorksiteId: firstId,
      worksites: [{ id: firstId, draft: 'saved', checkedIds: [], excludedIds: [] }, { id: 'two', draft: 'second', checkedIds: [], excludedIds: [] }],
      presentations: [{ id: 'view', worksiteId: firstId, kind: 'window', closed: false }] } };
}
function preview(data, extra = {}) {
  const id = data.workspace.activeWorksiteId;
  return { ok: true, seq: data.seq, preview: { worksiteId: id,
    draft: data.workspace.worksites.find(site => site.id === id).draft,
    materials: [{ id: 'server', title: 'Server-only supply', summary: 'authoritative body', blocks: [] }] }, ...extra };
}
const isPreview = request => request.path.endsWith('/preview');
const visiblePreview = client => client.node(node => node.props['aria-label'] === '本轮供给预览');
const draftField = client => client.node(node => node.props['aria-label'] === '现场草稿');
const refresh = client => client.button('刷新').props.onClick();
const reveal = client => client.button('查看本轮供给').props.onClick();

test('built factory reads encoded same-origin preview once and renders server supply without a local fallback', async t => {
  const data = workspace();
  const client = await createWorkstationClient(data, request => isPreview(request) ? response(preview(data)) : undefined);
  t.after(client.unmount);
  await reveal(client);
  assert.match(JSON.stringify(visiblePreview(client)), /authoritative body/);
  const requests = client.requests.filter(isPreview);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, `/kont/worksites/${encodeURIComponent(firstId)}/preview`);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(new URL(requests[0].url).origin, 'http://127.0.0.1:9000');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test('dirty draft is saved before GET; save failure issues no GET and keeps unsaved text', async t => {
  for (const fail of [false, true]) {
    const data = workspace(), save = deferred();
    const client = await createWorkstationClient(data, request => {
      if (request.options.method === 'POST') return save.promise;
      if (isPreview(request)) return response(preview(data));
    });
    t.after(client.unmount);
    draftField(client).props.onChange({ target: { value: 'edited' } });
    const loading = reveal(client);
    assert.equal(client.requests.filter(isPreview).length, 0);
    const post = client.requests.find(request => request.options.method === 'POST');
    assert.equal(JSON.parse(post.options.body).commands[0].draft, 'edited');
    if (fail) save.reject(new Error('synthetic save failed'));
    else { data.seq++; data.revision++; data.workspace.worksites[0].draft = 'edited'; save.resolve(response(structuredClone(data))); }
    await loading;
    assert.equal(client.requests.filter(isPreview).length, fail ? 0 : 1);
    assert.equal(draftField(client).props.value, 'edited');
    assert.equal(Boolean(visiblePreview(client)), !fail);
  }
});

test('newer draft during save survives saved response and prevents the following GET', async t => {
  const data = workspace(), save = deferred();
  const client = await createWorkstationClient(data, request => request.options.method === 'POST' ? save.promise : undefined);
  t.after(client.unmount);
  draftField(client).props.onChange({ target: { value: 'saving draft' } });
  const field = draftField(client), loading = reveal(client);
  field.props.onChange({ target: { value: 'newer draft' } });
  data.seq++; data.workspace.worksites[0].draft = 'saving draft'; save.resolve(response(structuredClone(data)));
  await loading;
  assert.equal(client.requests.filter(isPreview).length, 0);
  assert.equal(draftField(client).props.value, 'newer draft');
});

test('component unmount or a changed active site in the save response prevents the first preview GET', async t => {
  for (const operation of ['component-unmount', 'site-changed']) {
    const data = workspace(), save = deferred();
    const client = await createWorkstationClient(data, request => request.options.method === 'POST' ? save.promise : undefined);
    t.after(client.unmount);
    draftField(client).props.onChange({ target: { value: 'saving draft' } });
    const loading = reveal(client);
    if (operation === 'component-unmount') client.unmountComponent();
    else data.workspace.activeWorksiteId = 'two';
    data.seq++; data.workspace.worksites[0].draft = 'saving draft';
    save.resolve(response(structuredClone(data))); await loading;
    assert.equal(client.requests.filter(isPreview).length, 0, operation);
    assert.equal(visiblePreview(client), null, operation);
  }
});

test('latest request wins even when aborted transport resolves out of order, and waiting hides prior content', async t => {
  const data = workspace(), pending = [];
  const client = await createWorkstationClient(data, request => {
    if (isPreview(request)) { const gate = deferred(); pending.push({ gate, request }); return gate.promise; }
  });
  t.after(client.unmount);
  const first = reveal(client); pending[0].gate.resolve(response(preview(data))); await first;
  assert.ok(visiblePreview(client));
  const second = reveal(client);
  assert.equal(visiblePreview(client), null);
  assert.match(JSON.stringify(client.render()), /正在读取本轮供给/);
  const third = reveal(client);
  assert.equal(pending[1].request.options.signal.aborted, true);
  pending[2].gate.resolve(response(preview(data))); await third;
  pending[1].gate.resolve(response(preview(data, { preview: { worksiteId: firstId, draft: 'saved', materials: [{ id: 'late', title: 'LATE', summary: 'LATE', blocks: [] }] } }))); await second;
  assert.match(JSON.stringify(visiblePreview(client)), /authoritative body/);
  assert.doesNotMatch(JSON.stringify(client.render()), /LATE/);
});

test('seq drift, wrong identity, malformed JSON and backend errors show fixed readable errors with no local supply', async t => {
  const data = workspace();
  for (const value of [preview(data, { seq: 3 }), preview(data, { seq: 5 }),
    preview(data, { preview: { worksiteId: 'two', draft: 'second', materials: [] } }),
    { ok: false, message: 'PRIVATE_BACKEND_DETAIL' }, { ok: true, seq: 4, preview: {} }, null]) {
    const client = await createWorkstationClient(data, request => isPreview(request) ? response(value) : undefined);
    t.after(client.unmount);
    await reveal(client);
    assert.equal(visiblePreview(client), null);
    const tree = JSON.stringify(client.render());
    assert.match(tree, /现场已变化，请刷新后再查看供给|暂时无法查看供给，请刷新后重试/);
    assert.doesNotMatch(tree, /PRIVATE_BACKEND_DETAIL|authoritative body/);
    assert.equal(client.requests.filter(isPreview).length, 1);
  }
});

test('active network and JSON failures show only fixed preview text and never retry', async t => {
  for (const failure of ['network', 'json']) {
    const data = workspace();
    const client = await createWorkstationClient(data, request => {
      if (!isPreview(request)) return;
      if (failure === 'network') throw new Error('PRIVATE_TRANSPORT_DETAIL');
      return { ok: false, json: async () => { throw new Error('PRIVATE_JSON_DETAIL'); } };
    });
    t.after(client.unmount);
    await reveal(client);
    assert.equal(visiblePreview(client), null);
    assert.match(JSON.stringify(client.render()), /暂时无法查看供给，请刷新后重试/);
    assert.doesNotMatch(JSON.stringify(client.render()), /PRIVATE_/);
    assert.equal(client.requests.filter(isPreview).length, 1);
  }
});

test('refresh, draft edit, site switch, presentation changes and unmount abort and reject late responses', async t => {
  for (const operation of ['refresh', 'draft', 'switch', 'card', 'icon', 'component-unmount', 'unmount']) {
    const data = workspace(), pending = deferred();
    const client = await createWorkstationClient(data, request => {
      if (isPreview(request)) return pending.promise;
      if (request.options.method === 'POST') {
        const command = JSON.parse(request.options.body).commands.at(-1);
        if (command.type === 'worksite.activate') data.workspace.activeWorksiteId = command.worksiteId;
        if (command.type === 'presentation.update') data.workspace.presentations[0].kind = command.kind;
        data.seq++; return response(structuredClone(data));
      }
    });
    if (operation !== 'unmount') t.after(client.unmount);
    const oldResult = preview(data), loading = reveal(client);
    if (operation === 'refresh') await refresh(client);
    if (operation === 'draft') draftField(client).props.onChange({ target: { value: 'new local draft' } });
    if (operation === 'switch') await client.button('Second site').props.onClick();
    if (operation === 'card') await client.button('卡片').props.onClick();
    if (operation === 'icon') await client.button('图标').props.onClick();
    if (operation === 'unmount') client.unmount();
    if (operation === 'component-unmount') client.unmountComponent();
    assert.equal(client.requests.find(isPreview).options.signal.aborted, true, operation);
    pending.resolve(response(oldResult)); await loading;
    assert.equal(visiblePreview(client), null, operation);
    assert.doesNotMatch(JSON.stringify(client.render()), /authoritative body/, operation);
  }
});

test('late JSON and rejected aborted requests cannot restore content or errors after component unmount', async t => {
  for (const failure of [false, true]) {
    const data = workspace(), gate = deferred();
    const client = await createWorkstationClient(data, request => {
      if (isPreview(request)) return { ok: true, json: () => gate.promise };
    });
    t.after(client.unmount);
    const loading = reveal(client); await settle();
    client.unmountComponent();
    if (failure) gate.reject(new Error('PRIVATE_LATE_ERROR'));
    else gate.resolve(preview(data));
    await loading;
    assert.equal(visiblePreview(client), null);
    assert.doesNotMatch(JSON.stringify(client.render()), /PRIVATE_LATE_ERROR|authoritative body|暂时无法查看供给/);
  }
});

test('failed refresh clears old preview and prevents new requests until workspace recovers', async t => {
  const data = workspace(); let failWorkspace = false;
  const client = await createWorkstationClient(data, request => {
    if (isPreview(request)) return response(preview(data));
    if (request.path === '/kont/api/workspace' && failWorkspace) throw new Error('synthetic workspace failure');
  });
  t.after(client.unmount);
  await reveal(client); assert.ok(visiblePreview(client));
  failWorkspace = true; await refresh(client);
  assert.equal(visiblePreview(client), null);
  const count = client.requests.filter(isPreview).length;
  await reveal(client); assert.equal(client.requests.filter(isPreview).length, count);
  failWorkspace = false; await refresh(client); await settle(); await reveal(client);
  assert.ok(visiblePreview(client));
});
