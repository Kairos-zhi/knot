import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkstationClient, findNode, deferred, response } from './helpers/workstation-client-fixture.mjs';

function workspace() {
  return { revision: 1, seq: 4, titles: { one: 'First site', two: 'Second site' },
    assets: [{ id: 'material', title: 'Known material', summary: 'Known content', blocks: [] }],
    workspace: { activeWorksiteId: 'one', worksites: [
      { id: 'one', draft: 'saved', checkedIds: [], excludedIds: [] },
      { id: 'two', draft: 'second saved', checkedIds: [], excludedIds: [] },
    ], presentations: [{ id: 'view-one', worksiteId: 'one', kind: 'window', closed: false }] } };
}
const field = client => client.node(node => node.props['aria-label'] === '现场草稿');
const edit = (client, value) => field(client).props.onChange({ target: { value } });
const save = client => client.button('保存草稿').props.onClick();
const refresh = client => client.button('刷新').props.onClick();
const posts = client => client.requests.filter(request => request.options.method === 'POST');
const status = client => client.node(node => node.props.className === 'kont-save');
const text = client => JSON.stringify(client.render());
function failure(kind, readBody = () => {}) {
  if (kind === 'network') throw new Error('PRIVATE_NETWORK D:/private/runtime');
  if (kind === 'json') return { ok: true, json: async () => { throw new Error('PRIVATE_JSON'); } };
  const status = typeof kind === 'number' ? kind : 409;
  return { ok: false, status, json: async () => {
    readBody();
    return { code: kind === 'conflict' ? 'STALE_REVISION' : 'PRIVATE_CODE', message: 'PRIVATE_BACKEND D:/private/runtime' };
  } };
}
function formWithButton(client, label) {
  return client.node(node => node.type === 'form' && findNode(node, child => child.type === 'button' && child.children.includes(label)));
}

test('workspace write failures map to fixed messages, preserve draft/known scene and do not claim saved', async t => {
  for (const kind of ['conflict', 'other409', 401, 403, 500, 'network', 'json']) {
    const data = workspace(); let bodyReads = 0;
    const client = await createWorkstationClient(data, request => {
      if (request.options.method === 'POST') return failure(kind, () => bodyReads++);
    });
    t.after(client.unmount);
    edit(client, 'unsaved local text'); await save(client);
    const rendered = text(client);
    assert.doesNotMatch(rendered, /PRIVATE_|D:\/private/);
    assert.match(rendered, /First site|Known material/);
    assert.equal(field(client).props.value, 'unsaved local text');
    assert.equal(status(client).children[0], '现场待核对');
    if (kind === 'conflict') assert.match(rendered, /其他窗口更新，请先刷新核对/);
    else if (kind === 401 || kind === 403) assert.match(rendered, /连接已失效/);
    else assert.match(rendered, /保存结果待核对/);
    assert.equal(bodyReads, kind === 'conflict' || kind === 'other409' ? 1 : 0);
    assert.equal(posts(client).length, 1);
  }
});

test('recovery barrier blocks direct mutation callbacks and disables submissions while draft/refresh/return stay available', async t => {
  const data = workspace();
  const client = await createWorkstationClient(data, request => request.options.method === 'POST' ? failure(500) : undefined);
  t.after(client.unmount);
  edit(client, 'edited');
  const saveAction = client.button('保存草稿').props.onClick;
  await saveAction();
  assert.equal(client.button('保存草稿').props.disabled, true);
  assert.equal(client.button('Second site').props.disabled, true);
  assert.equal(client.button('卡片').props.disabled, true);
  assert.equal(client.button('刷新').props.disabled, false);
  assert.equal(client.button('返回对话').props.disabled, false);
  assert.equal(field(client).props.disabled, false);
  edit(client, 'newer draft while blocked');
  const checkbox = client.node(node => node.type === 'input' && node.props.type === 'checkbox');
  assert.equal(checkbox.props.disabled, true);
  client.node(node => node.props['aria-label'] === '新现场名称').props.onChange({ target: { value: 'new scene' } });
  client.node(node => node.props['aria-label'] === '材料标题').props.onChange({ target: { value: 'new title' } });
  client.node(node => node.props['aria-label'] === '材料正文').props.onChange({ target: { value: 'new content' } });
  assert.equal(client.button('＋ 新建现场').props.disabled, true);
  assert.equal(client.button('存为材料').props.disabled, true);
  await saveAction();
  await client.button('Second site').props.onClick();
  await checkbox.props.onChange({ target: { checked: true } });
  await formWithButton(client, '＋ 新建现场').props.onSubmit({ preventDefault() {} });
  await formWithButton(client, '存为材料').props.onSubmit({ preventDefault() {} });
  await client.button('查看本轮供给').props.onClick();
  assert.equal(posts(client).length, 1, 'even retained direct callbacks cannot bypass recovery');
  assert.equal(field(client).props.value, 'newer draft while blocked');
});

test('manual refresh failure retains barrier; successful GET preserves edits and only explicit save uses latest revision', async t => {
  const data = workspace(); let failRead = false, failWrite = true;
  const client = await createWorkstationClient(data, request => {
    if (request.options.method === 'POST') {
      if (failWrite) return failure('network');
      for (const command of JSON.parse(request.options.body).commands) {
        if (command.type === 'worksite.update') data.workspace.worksites.find(site => site.id === command.worksiteId).draft = command.draft;
      }
      data.revision++; data.seq++;
      return response(structuredClone(data));
    }
    if (request.path === '/kont/api/workspace' && failRead) return failure(500);
  });
  t.after(client.unmount);
  edit(client, 'first edit'); await save(client);
  edit(client, 'newest edit'); failRead = true; await refresh(client);
  assert.match(text(client), /暂时无法读取现场/);
  await save(client); assert.equal(posts(client).length, 1);
  failRead = false; data.revision = 9; data.seq = 12;
  const before = client.requests.length;
  await refresh(client);
  assert.equal(posts(client).length, 1, 'GET success does not replay a write');
  assert.ok(client.requests.slice(before).every(request => request.options.method !== 'POST'));
  assert.equal(field(client).props.value, 'newest edit');
  assert.equal(client.button('保存草稿').props.disabled, false);
  failWrite = false; await save(client);
  const submitted = JSON.parse(posts(client)[1].options.body);
  assert.equal(submitted.revision, 9);
  assert.equal(submitted.commands[0].draft, 'newest edit');
});

test('read failures never show backend text and initial reconnect remains available', async t => {
  for (const kind of [401, 403, 500, 'network', 'json']) {
    const data = workspace(); let failRead = true;
    const client = await createWorkstationClient(data, request => {
      if (request.path === '/kont/api/workspace' && failRead) return failure(kind);
    });
    t.after(client.unmount);
    assert.doesNotMatch(text(client), /PRIVATE_/);
    assert.match(text(client), kind === 401 || kind === 403 ? /连接已失效/ : /暂时无法读取现场/);
    assert.equal(client.button('重新连接').props.disabled, false);
    assert.equal(client.button('返回对话').props.disabled, false);
    assert.equal(posts(client).length, 0);
    failRead = false; await client.button('重新连接').props.onClick();
    assert.ok(field(client));
  }
});

test('refresh in flight shows neutral status and cannot temporarily bypass the recovery barrier', async t => {
  const data = workspace(), readGate = deferred(); let refreshing = false;
  const client = await createWorkstationClient(data, request => {
    if (request.options.method === 'POST') return failure('network');
    if (request.path === '/kont/api/workspace' && refreshing) return readGate.promise;
  });
  t.after(client.unmount);
  edit(client, 'unsaved'); await save(client);
  refreshing = true; const loading = refresh(client);
  assert.equal(status(client).children[0], '正在核对现场…');
  assert.equal(client.button('保存中…').props.disabled, true);
  await client.button('保存中…').props.onClick();
  assert.equal(posts(client).length, 1);
  readGate.resolve(response(structuredClone(data))); await loading;
  assert.equal(field(client).props.value, 'unsaved');
});

test('unknown scene/material creation results are never replayed by refresh', async t => {
  for (const label of ['＋ 新建现场', '存为材料']) {
    const data = workspace();
    const client = await createWorkstationClient(data, request => request.options.method === 'POST' ? failure('json') : undefined);
    t.after(client.unmount);
    client.node(node => node.props['aria-label'] === '新现场名称').props.onChange({ target: { value: 'New scene' } });
    client.node(node => node.props['aria-label'] === '材料标题').props.onChange({ target: { value: 'New material' } });
    client.node(node => node.props['aria-label'] === '材料正文').props.onChange({ target: { value: 'New body' } });
    await formWithButton(client, label).props.onSubmit({ preventDefault() {} });
    assert.match(text(client), /保存结果待核对/);
    assert.equal(client.node(node => node.props['aria-label'] === '新现场名称').props.value, 'New scene');
    assert.equal(client.node(node => node.props['aria-label'] === '材料标题').props.value, 'New material');
    const command = JSON.parse(posts(client)[0].options.body).commands.at(-1);
    assert.equal(command.type, label === '存为材料' ? 'asset.add' : 'scene.create');
    await refresh(client);
    assert.equal(posts(client).length, 1);
  }
});

test('failed save clears old preview and pending failure cannot erase newer edits', async t => {
  const data = workspace(), gate = deferred();
  const client = await createWorkstationClient(data, request => {
    if (request.options.method === 'POST') return gate.promise;
    if (request.path.endsWith('/preview')) return response({ ok: true, seq: 4, preview: { worksiteId: 'one', draft: 'saved', materials: [] } });
  });
  t.after(client.unmount);
  await client.button('查看本轮供给').props.onClick();
  assert.ok(client.node(node => node.props['aria-label'] === '本轮供给预览'));
  edit(client, 'first edit'); const loading = save(client);
  edit(client, 'newer while saving');
  gate.reject(new Error('PRIVATE_LATE_WRITE_ERROR')); await loading;
  assert.equal(client.node(node => node.props['aria-label'] === '本轮供给预览'), null);
  assert.equal(client.node(node => node.props['aria-label'] === '运行产物'), null);
  assert.equal(field(client).props.value, 'newer while saving');
  assert.equal(posts(client).length, 1);
});

test('refresh keeps drafts attached to original identities and warns on leaving if their site disappeared', async t => {
  const data = workspace();
  const client = await createWorkstationClient(data);
  t.after(client.unmount);
  edit(client, 'orphan draft');
  data.workspace.activeWorksiteId = 'two'; data.workspace.worksites = data.workspace.worksites.filter(site => site.id !== 'one');
  data.revision++; data.seq++;
  await refresh(client);
  assert.equal(field(client).props.value, 'second saved');
  let warned = false;
  client.events.get('beforeunload')({ preventDefault() { warned = true; } });
  assert.equal(warned, true);
  assert.equal(posts(client).length, 0);
});
