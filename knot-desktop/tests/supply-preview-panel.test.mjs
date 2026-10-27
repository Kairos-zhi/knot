import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createWorkstationClient, findNode, response } from './helpers/workstation-client-fixture.mjs';

const element = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) });
async function panelFactory() {
  const bundle = await readFile(new URL('../packages/dsh-plugin/lib/client.js', import.meta.url), 'utf8');
  let definition;
  vm.runInNewContext(bundle, {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
    fetch() { throw new Error('Pure panel must never fetch'); },
  });
  const exports = definition.factory(name => { assert.equal(name, 'react'); return { createElement: element }; });
  assert.equal(typeof exports.SupplyPreviewPanel, 'function');
  return exports.SupplyPreviewPanel;
}
function fixture() {
  return { worksiteId: 'site', draft: '问题\n第二行', materials: [
    { id: 'material-hidden-a', title: 'Second chosen first', summary: 'Short summary', blocks: [
      { id: 'block-hidden-a', source: 'manual', content: '人工原文\n逐字保留', provenance: [] },
      { id: 'block-hidden-b', source: 'generated', content: 'Generated complete original', provenance: ['history-hidden-a', 'history-hidden-b'] },
    ] },
    { id: 'material-hidden-b', title: 'First chosen second', summary: '', blocks: [] },
  ] };
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  return (tree.children ?? []).map(text).join('\n');
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, predicate))];
}

test('pure panel preserves order, count, complete originals and source history without fetching or expanding supply', async () => {
  const Panel = await panelFactory(), preview = fixture(), before = structuredClone(preview);
  const tree = Panel({ worksiteId: 'site', preview });
  assert.equal(tree.props['aria-label'], '本轮供给预览');
  const articles = nodes(tree, node => node.type === 'article');
  assert.equal(articles.length, 2);
  assert.match(text(articles[0]), /Second chosen first/);
  assert.match(text(articles[1]), /First chosen second/);
  assert.match(text(tree), /2 份材料/);
  assert.match(text(tree), /人工原文\n逐字保留/);
  assert.match(text(tree), /Generated complete original/);
  assert.match(text(tree), /人工 · 历史来源记录 0 条/);
  assert.match(text(tree), /生成 · 历史来源记录 2 条/);
  assert.match(text(tree), /来源记录仅供追溯，不扩展本轮供给/);
  assert.match(text(tree), /暂无可展示的原文块/);
  assert.doesNotMatch(text(tree), /hidden|Session|Run|token|费用/);
  const details = nodes(tree, node => node.type === 'details');
  assert.equal(details.length, 2);
  assert.ok(details.every(node => !Object.hasOwn(node.props, 'open')));
  assert.ok(details.every(node => node.children[0].type === 'summary' && text(node.children[0]) === '查看原文与来源'));
  assert.equal(nodes(tree, node => typeof node.type === 'string' && ['button', 'input', 'a', 'form'].includes(node.type)).length, 0);
  assert.ok(nodes(tree, () => true).every(node => !Object.keys(node.props).some(key => key.startsWith('on'))));
  assert.deepEqual(preview, before);
});

test('empty draft and empty supply are explicit, and missing or mismatched identity reveals no content', async () => {
  const Panel = await panelFactory();
  const empty = Panel({ worksiteId: 'site', preview: { worksiteId: 'site', draft: '', materials: [] } });
  assert.match(text(empty), /尚未填写问题/);
  assert.match(text(empty), /0 份材料/);
  assert.match(text(empty), /本轮未选材料/);
  for (const props of [{}, { worksiteId: 'site' }, { worksiteId: 'other', preview: fixture() }, { preview: fixture() }]) {
    assert.equal(Panel(props), null);
  }
});

test('loading and fixed errors suppress previous text and invalid block DTOs fail visibly', async () => {
  const Panel = await panelFactory();
  const loading = Panel({ worksiteId: 'site', preview: fixture(), loading: true, error: 'PRIVATE' });
  assert.equal(loading.props.role, 'status'); assert.match(text(loading), /正在读取本轮供给/);
  const failed = Panel({ worksiteId: 'site', preview: fixture(), error: 'PRIVATE' });
  assert.equal(failed.props.role, 'alert'); assert.doesNotMatch(text(failed), /PRIVATE|原文|chosen/);
  for (const blocks of [null, {}, [null], [{ content: {} }], [{ content: 'body', source: 'unknown', provenance: [] }],
    [{ content: 'body', source: 'manual', provenance: null }], [{ content: 'body', source: 'generated', provenance: [{}] }]]) {
    const preview = fixture(); preview.materials[0].blocks = blocks;
    const result = Panel({ worksiteId: 'site', preview });
    assert.equal(result.props.role, 'alert');
    assert.equal(text(result), '供给内容暂时无法读取，请刷新后重试。');
    assert.doesNotMatch(text(result), /chosen|body/);
  }
});

test('hostile text stays in text children rather than HTML attributes or links', async () => {
  const Panel = await panelFactory(), preview = fixture();
  const hostile = '<img src=x onerror=alert(1)><script>private()</script>';
  preview.draft = hostile; preview.materials[0].title = hostile;
  preview.materials[0].summary = hostile; preview.materials[0].blocks[0].content = hostile;
  const tree = Panel({ worksiteId: 'site', preview });
  assert.equal(nodes(tree, () => true).filter(node => node.props.dangerouslySetInnerHTML || node.props.href || node.props.src).length, 0);
  assert.equal(nodes(tree, node => node.type === 'script' || node.type === 'img').length, 0);
  assert.equal(nodes(tree, () => true).flatMap(node => node.children).filter(child => child === hostile).length, 4);
});

test('actual built workstation composes the exported panel with server block data and no additional requests', async t => {
  const preview = fixture();
  const data = { revision: 1, seq: 4, assets: [], titles: { site: 'Site' }, workspace: {
    activeWorksiteId: 'site', worksites: [{ id: 'site', draft: preview.draft, checkedIds: [], excludedIds: [] }], presentations: [],
  } };
  const client = await createWorkstationClient(data, request => request.path.endsWith('/preview') ? response({ ok: true, seq: 4, preview }) : undefined);
  t.after(client.unmount);
  const before = client.requests.length;
  await client.button('查看本轮供给').props.onClick();
  const tree = client.render(), panel = findNode(tree, node => node.props['aria-label'] === '本轮供给预览');
  assert.ok(panel); assert.match(text(panel), /Generated complete original/);
  assert.equal(nodes(panel, node => node.type === 'details').length, 2);
  assert.equal(client.requests.length, before + 1);
  client.render(); client.render();
  assert.equal(client.requests.length, before + 1, 'pure reading cannot fetch linked histories or execute actions');
});
