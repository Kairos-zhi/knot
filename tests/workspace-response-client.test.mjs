import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createWorkstationClient, response, deferred } from './helpers/workstation-client-fixture.mjs';

function workspace() {
  return { revision: 7, seq: 11, titles: { one: 'Known first', two: 'Known second' },
    assets: [{ id: 'asset', title: 'Known material', summary: 'Known summary', blocks: [{ id: 'block', content: 'Known body' }] }],
    workspace: { activeWorksiteId: 'one', worksites: [
      { id: 'one', draft: 'saved', checkedIds: [], excludedIds: [] },
      { id: 'two', draft: 'second saved', checkedIds: [], excludedIds: [] },
    ], presentations: [{ id: 'view', worksiteId: 'one', kind: 'window', closed: false }] } };
}
const field = client => client.node(node => node.props['aria-label'] === '现场草稿');
const edit = (client, value) => field(client).props.onChange({ target: { value } });
const save = client => client.button('保存草稿').props.onClick();
const refresh = client => client.button('刷新').props.onClick();
const posts = client => client.requests.filter(request => request.options.method === 'POST');
function leaveWarns(client) {
  let warned = false;
  client.events.get('beforeunload')({ preventDefault() { warned = true; } });
  return warned;
}
async function acceptFunction() {
  const bundle = await readFile(new URL('../packages/dsh-plugin/lib/client.js', import.meta.url), 'utf8');
  let definition;
  vm.runInNewContext(bundle, { window: { __ModuleLoader__: { load(value) { definition = value; } } } });
  return definition.factory(name => { assert.equal(name, 'react'); return {}; }).acceptWorkspaceResponse;
}
function malformedResponses() {
  const mutate = change => { const value = workspace(); change(value); return value; };
  return [
    ['null', null], ['array', []], ['empty', {}],
    ['missing-active', mutate(data => { data.workspace.activeWorksiteId = 'absent'; })],
    ['negative-seq', mutate(data => { data.seq = -1; })],
    ['fractional-revision', mutate(data => { data.revision = 1.5; })],
    ['unsafe-seq', mutate(data => { data.seq = Number.MAX_SAFE_INTEGER + 1; })],
    ['title-object', mutate(data => { data.titles.one = {}; })],
    ['missing-title', mutate(data => { delete data.titles.two; })],
    ['assets-object', mutate(data => { data.assets = {}; })],
    ['asset-summary-object', mutate(data => { data.assets[0].summary = {}; })],
    ['null-blocks', mutate(data => { data.assets[0].blocks = null; })],
    ['block-content-object', mutate(data => { data.assets[0].blocks[0].content = {}; })],
    ['block-id-missing', mutate(data => { delete data.assets[0].blocks[0].id; })],
    ['duplicate-block', mutate(data => { data.assets[0].blocks.push(structuredClone(data.assets[0].blocks[0])); })],
    ['duplicate-asset', mutate(data => { data.assets.push(structuredClone(data.assets[0])); })],
    ['duplicate-site', mutate(data => { data.workspace.worksites.push(structuredClone(data.workspace.worksites[0])); })],
    ['blank-site', mutate(data => { data.workspace.worksites[1].id = ' '; })],
    ['draft-object', mutate(data => { data.workspace.worksites[0].draft = {}; })],
    ['checked-not-array', mutate(data => { data.workspace.worksites[0].checkedIds = null; })],
    ['excluded-not-id', mutate(data => { data.workspace.worksites[0].excludedIds = [{}]; })],
    ['duplicate-checked', mutate(data => { data.workspace.worksites[0].checkedIds = ['asset', 'asset']; })],
    ['presentations-object', mutate(data => { data.workspace.presentations = {}; })],
    ['presentation-kind', mutate(data => { data.workspace.presentations[0].kind = 'unknown'; })],
    ['presentation-closed', mutate(data => { delete data.workspace.presentations[0].closed; })],
    ['duplicate-presentation', mutate(data => { data.workspace.presentations.push(structuredClone(data.workspace.presentations[0])); })],
  ];
}

test('pure acceptance returns the original DTO and extensions, accepts optional old blocks and equal versions without normalization', async () => {
  const accept = await acceptFunction(), data = workspace(), before = structuredClone(data);
  data.extension = { retain: ['extra'] }; data.assets[0].extension = { marker: true };
  data.schemaVersion = 'not-read-by-renderer'; data.edges = { unchecked: true }; data.runs = { unchecked: true };
  const extra = data.extension, assetExtra = data.assets[0].extension;
  assert.equal(accept(data, before), data);
  assert.equal(data.extension, extra); assert.equal(data.assets[0].extension, assetExtra);
  assert.equal(data.seq, 11); assert.equal(data.revision, 7);
  delete data.assets[0].blocks;
  assert.equal(accept(data), data, 'legacy asset without blocks remains readable');
  data.assets[0].blocks = [{ id: 'minimal', content: 'plain text' }];
  assert.equal(accept(data), data, 'source/timestamp/provenance are not workspace schema requirements');
  for (const [label, malformed] of malformedResponses()) assert.equal(accept(malformed), null, label);
  assert.equal(accept({ ...data, revision: 6 }, before), null);
  assert.equal(accept({ ...data, seq: 10 }, before), null);
});

test('initial malformed HTTP200 responses stay at reconnect instead of rendering bad data', async t => {
  for (const [label, malformed] of malformedResponses()) {
    const client = await createWorkstationClient(workspace(), request => request.path === '/kont/api/workspace' ? response(malformed) : undefined);
    t.after(client.unmount);
    assert.equal(client.button('重新连接').props.disabled, false, label);
    assert.equal(field(client), null, label);
    assert.match(JSON.stringify(client.render()), /暂时无法读取现场/, label);
    assert.equal(posts(client).length, 0);
  }
});

test('refresh rejects malformed or regressed responses before replacing known data and preserves the local draft barrier', async t => {
  const backwards = [{ ...workspace(), revision: 6 }, { ...workspace(), seq: 10 }];
  for (const [label, malformed] of [...malformedResponses(), ...backwards.map((value, n) => [`backwards-${n}`, value])]) {
    let invalid = false;
    const client = await createWorkstationClient(workspace(), request => invalid && request.path === '/kont/api/workspace' ? response(malformed) : undefined);
    t.after(client.unmount);
    edit(client, 'local draft'); invalid = true; await refresh(client);
    assert.equal(field(client).props.value, 'local draft', label);
    assert.match(JSON.stringify(client.render()), /Known material/);
    assert.match(JSON.stringify(client.render()), /暂时无法读取现场/);
    assert.equal(client.button('保存草稿').props.disabled, true);
    assert.equal(leaveWarns(client), true);
    await save(client); assert.equal(posts(client).length, 0);
  }
});

test('malformed write HTTP200 responses never clear draft or expose a false saved state and do not auto retry', async t => {
  const backwards = [{ ...workspace(), revision: 6 }, { ...workspace(), seq: 10 }];
  for (const [label, malformed] of [...malformedResponses(), ...backwards.map((value, n) => [`backwards-${n}`, value])]) {
    const client = await createWorkstationClient(workspace(), request => request.options.method === 'POST' ? response(malformed) : undefined);
    t.after(client.unmount);
    edit(client, 'local draft'); await save(client);
    assert.equal(field(client).props.value, 'local draft', label);
    assert.equal(leaveWarns(client), true);
    assert.match(JSON.stringify(client.render()), /保存结果待核对/);
    assert.match(JSON.stringify(client.render()), /Known material/);
    await save(client); assert.equal(posts(client).length, 1);
  }
});

test('a partially matching multi-site draft response clears none of the captured drafts', async t => {
  const data = workspace();
  const client = await createWorkstationClient(data, request => {
    if (request.options.method === 'POST') {
      const acknowledged = structuredClone(data); acknowledged.revision++; acknowledged.seq++;
      acknowledged.workspace.worksites[0].draft = 'first local';
      acknowledged.workspace.worksites[1].draft = 'not the submitted second draft';
      return response(acknowledged);
    }
  });
  t.after(client.unmount);
  edit(client, 'first local'); data.workspace.activeWorksiteId = 'two'; data.seq++;
  await refresh(client); edit(client, 'second local'); await save(client);
  assert.equal(JSON.parse(posts(client)[0].options.body).commands.length, 2);
  assert.equal(field(client).props.value, 'second local');
  assert.match(JSON.stringify(client.render()), /保存结果待核对/);
  data.workspace.activeWorksiteId = 'one'; await refresh(client);
  assert.equal(field(client).props.value, 'first local', 'the first matching draft was not cleared before checking the second');
  assert.equal(leaveWarns(client), true);
  assert.equal(posts(client).length, 1);
});

test('write draft acknowledgement must match original identity and text before any local draft or known data is cleared', async t => {
  for (const missing of [false, true]) {
    const acknowledged = workspace(); acknowledged.revision++; acknowledged.seq++;
    acknowledged.titles.two = 'Response should not become current';
    if (missing) {
      acknowledged.workspace.worksites = acknowledged.workspace.worksites.filter(site => site.id !== 'one');
      acknowledged.workspace.activeWorksiteId = 'two';
    } else acknowledged.workspace.worksites[0].draft = 'different from captured';
    const client = await createWorkstationClient(workspace(), request => request.options.method === 'POST' ? response(acknowledged) : undefined);
    t.after(client.unmount);
    edit(client, 'captured draft'); await save(client);
    assert.equal(field(client).props.value, 'captured draft');
    assert.equal(leaveWarns(client), true);
    assert.match(JSON.stringify(client.render()), /保存结果待核对/);
    assert.doesNotMatch(JSON.stringify(client.render()), /Response should not become current/);
    assert.equal(posts(client).length, 1);
  }
});

test('valid refresh may disagree with dirty local draft and explicit acknowledged save uses refreshed revision', async t => {
  const data = workspace(); let writing = false;
  const client = await createWorkstationClient(data, request => {
    if (request.options.method === 'POST') {
      writing = true;
      const command = JSON.parse(request.options.body).commands.find(command => command.type === 'worksite.update');
      data.workspace.worksites[0].draft = command.draft;
      data.revision++; data.seq++;
      return response(structuredClone(data));
    }
  });
  t.after(client.unmount);
  edit(client, 'local retained'); data.revision = 9; data.seq = 15; data.workspace.worksites[0].draft = 'remote update';
  await refresh(client);
  assert.equal(field(client).props.value, 'local retained'); assert.equal(writing, false);
  await save(client);
  assert.equal(JSON.parse(posts(client)[0].options.body).revision, 9);
  assert.equal(field(client).props.value, 'local retained');
  assert.equal(leaveWarns(client), false);
  assert.match(JSON.stringify(client.render()), /已保存 · 10/);
});

test('a complete captured echo cannot erase text edited later while the save response was pending', async t => {
  const data = workspace(), gate = deferred();
  const client = await createWorkstationClient(data, request => request.options.method === 'POST' ? gate.promise : undefined);
  t.after(client.unmount);
  edit(client, 'captured'); const pending = save(client);
  edit(client, 'newer local edit');
  const acknowledged = workspace(); acknowledged.revision++; acknowledged.seq++; acknowledged.workspace.worksites[0].draft = 'captured';
  gate.resolve(response(acknowledged)); await pending;
  assert.equal(field(client).props.value, 'newer local edit');
  assert.equal(leaveWarns(client), true);
  assert.match(JSON.stringify(client.render()), /草稿未保存/);
  assert.equal(posts(client).length, 1);
});
