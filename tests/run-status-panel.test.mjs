import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createRunStatusView } from '../packages/dsh-plugin/src/run-status-view.mjs';
const source = await readFile(new URL('../packages/dsh-plugin/src/run-status-panel.cjs', import.meta.url), 'utf8');
const exported = {};
// Semantic createElement seam only, no browser or simulated clicks. Real
// viewmodel validates host-realm DTOs; no mocked Run status derivation.
runInNewContext(source, { exports: exported, require: name => {
  if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  assert.equal(name, '@kont/run-status-view'); return { createRunStatusView };
} });
const render = exported.RunStatusPanel;
const dto = (phase, worksiteId = 'site:current') => ({ runId: `run:secret:${phase}`, requestId: 'request:secret',
  sessionId: 'session:secret', targetId: 'target:1', worksiteId, phase,
  hasOutput: phase === 'completed', blockId: phase === 'completed' ? 'output:1' : null });
const asset = { id: 'target:1', title: '公开材料目标', blocks: [{ id: 'output:1', content: 'public' }] };
const base = { worksiteId: 'site:current', assets: [asset], runs: [dto('completed')] };
function all(node) { return !node || typeof node !== 'object' ? [] : [node, ...node.children.flat(Infinity).flatMap(all)]; }
function text(node) { return !node || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : node.children.flat(Infinity).map(text).join(' '); }
const buttons = node => all(node).filter(item => item.type === 'button');

test('panel shows only current worksite and readable semantic names without raw runtime IDs', () => {
  const tree = render({ ...base, runs: [dto('submitted'), dto('completed', 'site:other')] });
  assert.equal(tree.props['aria-label'], '本轮运行状态');
  assert.match(text(tree), /公开材料目标.*已提交/);
  assert.match(text(tree), /尚未证实正在运行或已完成/);
  assert.doesNotMatch(text(tree), /secret|已完成，|查看产物/);
  assert.equal(all(tree).filter(item => item.type === 'details').length, 1);
  assert.equal(buttons(tree)[0].props['aria-label'], '刷新本轮运行状态');
});
test('loading, failed query, empty current site and invalid DTO never show stale records or paid retry controls', () => {
  for (const props of [{ loading: true }, { error: 'private backend error' }, { runs: [dto('completed', 'site:other')] },
    { runs: [{ ...dto('completed'), phase: 'running' }] }, { runs: null }]) {
    const tree = render({ ...base, ...props });
    assert.doesNotMatch(text(tree), /公开材料目标|private backend|secret|查看产物|重新发送|运行一次/);
    assert.equal(buttons(tree).length, 1);
  }
  assert.equal(all(render({ ...base, error: 'failed' })).some(item => item.props.role === 'alert'), true);
  assert.equal(all(render({ ...base, loading: true })).some(item => item.props.role === 'status'), true);
});
test('completed output navigation requires current target and block and preserves missing history', () => {
  let located;
  const valid = render({ ...base, onLocate: reference => located = reference });
  const locate = buttons(valid).find(item => item.children.includes('查看产物'));
  assert.equal(locate.props.disabled, false);
  assert.equal(locate.props['aria-label'], '查看产物：公开材料目标');
  // Directly invoke the supplied navigation callback, not UI click simulation.
  locate.props.onClick();
  assert.deepEqual(located, { worksiteId: 'site:current', assetId: 'target:1', blockId: 'output:1' });
  for (const assets of [[], [{ ...asset, blocks: [] }]]) {
    located = null;
    const tree = render({ ...base, assets, onLocate: reference => located = reference });
    assert.match(text(tree), /已完成.*产物位置已失效，完成记录仍保留/);
    const button = buttons(tree).find(item => item.children.includes('查看产物'));
    assert.equal(button.props.disabled, true); button.props.onClick(); assert.equal(located, null);
  }
});
test('untrusted target titles remain text nodes and uncertainty never offers a generation action', () => {
  const title = '<img src=x onerror=steal()> & unsafe';
  const tree = render({ ...base, assets: [{ ...asset, title }], runs: [dto('uncertain')] });
  assert.ok(all(tree).some(node => node.type === 'span' && node.children.includes(title)));
  assert.equal(all(tree).some(node => node.type === 'img' || Object.hasOwn(node.props, 'dangerouslySetInnerHTML')), false);
  assert.match(text(tree), /请勿重新发送/);
  assert.equal(buttons(tree).length, 1);
});
