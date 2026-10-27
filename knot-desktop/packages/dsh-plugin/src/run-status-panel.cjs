const { createElement: h } = require('react');
const { createRunStatusView } = require('@kont/run-status-view');

// Historical phases may arrive separately. Current asset existence is a join
// only when both explicit snapshot epochs are valid and equal.
function areRunAssetsComparable(assetSeq, runSeq) {
  return Number.isSafeInteger(assetSeq) && assetSeq >= 0
    && Number.isSafeInteger(runSeq) && runSeq >= 0 && assetSeq === runSeq;
}
exports.areRunAssetsComparable = areRunAssetsComparable;

// Read-only rendering. References remain opaque and are re-resolved by the
// owning workstation before navigation; this component owns no runtime state.
exports.RunStatusPanel = function RunStatusPanel({ runs, worksiteId, assets, assetSeq, runSeq,
  loading = false, error = '', onRefresh, onLocate } = {}) {
  const refresh = h('button', { type: 'button', disabled: loading || typeof onRefresh !== 'function',
    onClick: onRefresh, 'aria-label': '刷新本轮运行状态' }, '刷新状态');
  const section = content => h('section', { className: 'kont-run-panel', 'aria-label': '本轮运行状态' },
    h('header', { className: 'kont-run-panel-header' }, h('h2', null, '本轮运行'), refresh), content);
  if (loading) return section(h('p', { role: 'status' }, '正在读取本轮运行状态…'));
  if (error) return section(h('p', { role: 'alert' }, '运行状态暂时无法读取，请刷新核对。'));
  if (typeof worksiteId !== 'string' || !worksiteId.trim() || !Array.isArray(runs) || !Array.isArray(assets))
    return section(h('p', { role: 'alert' }, '运行状态无法核对，请刷新。'));
  let current;
  try {
    current = runs.filter(run => {
      const descriptor = run && Object.getOwnPropertyDescriptor(run, 'worksiteId');
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('Invalid projection');
      return descriptor.value === worksiteId;
    }).map(run => ({ run, view: createRunStatusView(run) }));
  } catch {
    return section(h('p', { role: 'alert' }, '运行状态无法核对，请刷新。'));
  }
  if (!current.length) return section(h('p', { role: 'status' }, '当前现场尚无运行记录。'));
  const comparable = areRunAssetsComparable(assetSeq, runSeq);
  return section(h('ul', { className: 'kont-run-list' }, ...current.map(({ run, view }) => {
    const asset = assets.find(item => item?.id === view.targetReference.assetId);
    const title = typeof asset?.title === 'string' && asset.title.trim() ? asset.title
      : comparable ? '目标已移除或无法读取' : '运行目标待核对';
    const output = view.outputReference;
    const exists = Boolean(comparable && output && Array.isArray(asset?.blocks)
      && asset.blocks.some(block => block?.id === output.blockId));
    return h('li', { key: run.runId }, h('details', { className: 'kont-run-item' },
      h('summary', null, h('span', { className: 'kont-run-title' }, title),
        h('span', { className: 'kont-run-phase' }, view.label)),
      h('p', null, view.detail), h('p', { className: 'kont-run-next' }, view.nextStep),
      output && !comparable && h('p', null, '产物位置待核对，请刷新现场。'),
      output && comparable && !exists && h('p', null, '产物位置已失效，完成记录仍保留。'),
      output && h('button', { type: 'button', disabled: !exists || typeof onLocate !== 'function',
        'aria-label': `查看产物：${title}`, onClick: () => {
          if (exists && typeof onLocate === 'function') onLocate(output);
        } }, '查看产物')));
  })));
};
