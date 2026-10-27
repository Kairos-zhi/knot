window.__ModuleLoader__.load({id:"@kont/dsh-plugin",factory:(require)=>{const exports={};const CSS=".kont-root{height:100%;overflow:auto;background:#f7f6f2;color:#242a27;font:14px/1.6 system-ui,\"Microsoft YaHei\",sans-serif;color-scheme:light}.kont-root *{box-sizing:border-box}.kont-root button,.kont-root input,.kont-root textarea{font:inherit}.kont-root button{border:1px solid #d7dcd4;border-radius:9px;background:#fff;color:#304c3d;padding:7px 13px;cursor:pointer}.kont-root button:hover{background:#eef2eb}.kont-root button:disabled{opacity:.5;cursor:default}.kont-root button:focus-visible,.kont-root input:focus-visible,.kont-root textarea:focus-visible{outline:2px solid #47735c;outline-offset:3px}.kont-root button[aria-pressed=true]{background:#e7eee3;border-color:#7c987e}.kont-root input:not([type=checkbox]),.kont-root textarea{border:1px solid #d7dcd4;border-radius:9px;background:#fff;padding:10px 12px;color:#242a27;width:100%}.kont-root textarea{resize:vertical;min-height:140px}.kont-root h1,.kont-root h2,.kont-root h3,.kont-root p{margin:0}.kont-root h1{font-size:26px;letter-spacing:-.5px;line-height:1.3}.kont-root h2{font-size:15px;margin-bottom:12px}.kont-header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:22px 30px;border-bottom:1px solid #e2e3da}.kont-wordmark{font-size:19px;letter-spacing:3px;font-weight:750}.kont-subtitle{margin-left:20px;color:#768174;font-size:12px}.kont-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.kont-save{font-size:12px;color:#768174;margin-right:8px}.kont-body{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:calc(100% - 85px)}.kont-scenes{padding:28px 18px;border-right:1px solid #e2e3da}.kont-muted{font-size:12px;color:#768174;margin-bottom:18px!important}.kont-scene{display:block;width:100%;text-align:left;margin:8px 0;overflow-wrap:anywhere}.kont-scenes form{display:grid;gap:8px;margin-top:28px}.kont-site{padding:32px;min-width:0}.kont-site-title{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:34px}.kont-eyebrow{font-size:11px;letter-spacing:2px;color:#768174;margin-bottom:7px!important}.kont-columns{display:grid;grid-template-columns:minmax(230px,.9fr) minmax(260px,1.1fr);gap:32px}.kont-material{display:flex;gap:12px;background:#fff;border:1px solid #e1e4dc;border-radius:12px;padding:16px;margin-bottom:10px;cursor:pointer;min-width:0}.kont-material input{accent-color:#47735c;flex-shrink:0;align-self:flex-start;margin-top:5px}.kont-material span{min-width:0}.kont-material strong{font-weight:600;overflow-wrap:anywhere}.kont-material p{color:#768174;font-size:12px;white-space:pre-wrap;max-height:110px;overflow:auto;margin-top:7px;overflow-wrap:anywhere}.kont-add{margin-top:20px}.kont-add summary{cursor:pointer;color:#47735c}.kont-add form{display:grid;gap:10px;margin-top:12px}.kont-compose>textarea{min-height:230px;margin-bottom:14px}.kont-empty{padding:30px 20px;border:1px dashed #ccd4c7;border-radius:12px;color:#768174}.kont-runtime-note{font-size:12px;color:#768174;margin-top:20px!important}.kont-preview{border-top:1px solid #dde2d6;padding-top:18px;margin-top:28px}.kont-preview p{white-space:pre-wrap;overflow-wrap:anywhere}.kont-preview article{margin-top:18px;background:#edf1e7;padding:14px;border-radius:9px}.kont-compact{max-width:360px;border:1px solid #d7dcd4;border-radius:18px;padding:28px;background:#fff}.kont-compact p{margin-bottom:20px}.kont-icon{max-width:250px}.kont-icon h2{font-size:32px}.kont-error{background:#fff0e8;color:#934321;padding:12px 30px;overflow-wrap:anywhere}.kont-loading{padding:40px}.kont-loading p{margin:20px 0}@media(max-width:1000px){.kont-body{grid-template-columns:180px minmax(0,1fr)}.kont-site{padding:24px}.kont-columns{grid-template-columns:1fr;gap:26px}.kont-subtitle{display:none}}@media(max-width:620px){.kont-body{display:block}.kont-scenes{border-right:0;border-bottom:1px solid #e2e3da;padding:16px}.kont-scenes form{margin-top:12px}.kont-header{padding:16px;align-items:flex-start}.kont-site{padding:20px 16px}.kont-site-title{align-items:flex-start;flex-direction:column}.kont-save{width:100%}}\n.kont-library{list-style:none;padding:0;margin:16px 0}.kont-library-entry{padding:12px 0;border-bottom:1px solid #e2e3da;min-width:0}.kont-library-entry .kont-scene{margin:0 0 8px}.kont-library-meta{font-size:12px;color:#768174;overflow-wrap:anywhere;margin-bottom:8px!important}.kont-library-entry>button:last-child{font-size:12px}.kont-library-entry:focus-within{outline:2px solid #ff9500;outline-offset:4px;border-radius:6px}\n\n.kont-hud{min-width:0}.kont-hud-target{font-weight:600;overflow-wrap:anywhere;margin-bottom:8px!important}.kont-hud-meta{font-size:12px;color:#768174;overflow-wrap:anywhere;margin-bottom:8px!important}.kont-hud-supply{margin:12px 0 16px}.kont-hud-supply summary{cursor:pointer}.kont-hud-supply ul{padding-left:20px;overflow-wrap:anywhere}.kont-hud-supply p{margin-top:8px}.kont-columns>.kont-compact{align-self:start;width:100%}\n\n.kont-work-island{padding:18px 30px;border-bottom:1px solid #e2e3da}.kont-work-island>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.kont-work-island h2{margin-bottom:0}.kont-island-list{list-style:none;padding:0;margin:12px 0 0;display:flex;flex-wrap:wrap;gap:12px}.kont-island-list li{border:1px solid #d7dcd4;border-radius:12px;padding:12px;min-width:180px;max-width:100%;overflow-wrap:anywhere}.kont-island-list p{font-size:12px;margin:8px 0}.kont-island-list button{font-size:12px}@media(max-width:620px){.kont-work-island{padding:16px}}\n\n.kont-folder-group{margin-top:20px}.kont-folder-group>h3{font-size:13px;overflow-wrap:anywhere}.kont-folder-tools{margin-top:10px}.kont-folder-tools>summary{font-size:12px;cursor:pointer;color:#768174}.kont-folder-tools form{margin-top:10px}.kont-folder-tools select{width:100%;max-width:100%;margin-top:8px;padding:8px;border:1px solid #d7dcd4;border-radius:8px;background:#fff;color:inherit}.kont-folder-tools select:focus-visible{outline:2px solid #ff9500;outline-offset:3px}\n\n.kont-run-panel{margin-top:28px;padding-top:18px;border-top:1px solid #dde2d6;min-width:0}.kont-run-panel-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.kont-run-panel-header h2{margin-bottom:0}.kont-run-list{list-style:none;margin:0;padding:0}.kont-run-item{margin-top:10px;padding:12px 16px;border:1px solid #e1e4dc;border-radius:12px;background:#fff}.kont-run-item summary{cursor:pointer;overflow-wrap:anywhere}.kont-run-title{font-weight:600}.kont-run-phase{margin-left:12px;color:#768174;font-size:12px}.kont-run-item p{margin-top:8px;overflow-wrap:anywhere}.kont-run-next{color:#768174;font-size:12px}.kont-run-item button{margin-top:12px}.kont-run-item summary:focus-visible{outline:2px solid #47735c;outline-offset:3px}@media(max-width:620px){.kont-run-panel-header{align-items:flex-start;flex-wrap:wrap}}\n";
const hostRequire=require; const localCache=Object.create(null); const localModules={
"@kont/run-status-view":(require,exports)=>{const keys = ['runId', 'requestId', 'sessionId', 'targetId', 'worksiteId', 'phase', 'hasOutput', 'blockId'];
const copy = Object.freeze({
  prepared: Object.freeze({ label: '待运行', detail: '本轮材料与目标已准备，尚未提交运行。',
    nextStep: '核对本轮材料与目标，等待获准运行。' }),
  submitted: Object.freeze({ label: '已提交', detail: '请求已提交，尚未证实正在运行或已完成。',
    nextStep: '等待结果核对，请勿重复提交。' }),
  uncertain: Object.freeze({ label: '待核对', detail: '本次提交的结果尚不确定，不能据此认定失败或成功。',
    nextStep: '核对原提交的结果；请勿重新发送。' }),
  completed: Object.freeze({ label: '已完成', detail: '本次运行已完成，已记录产物位置。',
    nextStep: '按记录定位产物；若已移除，保留完成记录。' }),
});

/** Presentation only: consumes the shared projectRun DTO, owns no Run state,
 * execution capability, title lookup, timers, model choice or cost estimate.
 * References are navigation data, never user-visible identifier labels. */
function createRunStatusView(projected) {
  const reject = () => { throw new TypeError('INVALID_RUN_STATUS_PROJECTION'); };
  if (projected === null || typeof projected !== 'object'
    || Object.getPrototypeOf(projected) !== Object.prototype
    || Object.getOwnPropertySymbols(projected).length) reject();
  const descriptors = Object.getOwnPropertyDescriptors(projected);
  if (Object.keys(descriptors).length !== keys.length || keys.some(key =>
    !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))) reject();
  for (const key of ['runId', 'requestId', 'sessionId', 'targetId', 'worksiteId'])
    if (typeof projected[key] !== 'string' || !projected[key].trim()) reject();
  if (!Object.hasOwn(copy, projected.phase) || typeof projected.hasOutput !== 'boolean') reject();
  const completed = projected.phase === 'completed';
  if (completed !== projected.hasOutput || (completed
    ? typeof projected.blockId !== 'string' || !projected.blockId.trim()
    : projected.blockId !== null)) reject();
  return Object.freeze({ phase: projected.phase, ...copy[projected.phase],
    targetReference: Object.freeze({ worksiteId: projected.worksiteId, assetId: projected.targetId }),
    outputReference: completed ? Object.freeze({ worksiteId: projected.worksiteId,
      assetId: projected.targetId, blockId: projected.blockId }) : null });
}

exports.createRunStatusView=createRunStatusView;},
"@kont/run-status-panel":(require,exports)=>{const { createElement: h } = require('react');
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
},
"@kont/run-status-source":(require,exports)=>{const { createRunStatusView } = require('@kont/run-status-view');

/** One renderer owner for the public read-only query DTO. No phase inference,
 * model actions, workspace mutations, timers or per-presentation stores. */
exports.createRunStatusSource = function createRunStatusSource({ fetch, baseURI }) {
  let closed = false, generation = 0, pending, floor = 0;
  let snapshot = Object.freeze({ worksiteId: null, seq: null, runs: Object.freeze([]), loading: false, error: '' });
  const listeners = new Set();
  const emit = patch => {
    if (closed) return;
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  };
  const refresh = async (worksiteId = snapshot.worksiteId, minimumSeq = floor) => {
    if (closed || !worksiteId) return;
    floor = Math.max(floor, minimumSeq);
    const own = ++generation;
    pending?.abort(); pending = new AbortController();
    const signal = pending.signal;
    emit({ worksiteId, runs: Object.freeze([]), loading: true, error: '' });
    try {
      const response = await fetch(new URL('kont/runs', baseURI), { method: 'GET', credentials: 'same-origin', signal });
      if (!response.ok) throw new Error('RUN_QUERY_FAILED');
      const body = await response.json();
      if (closed || own !== generation || signal.aborted) return;
      if (body?.ok !== true || !Number.isSafeInteger(body.seq) || body.seq < floor
        || !Array.isArray(body.runs) || body.runs.length > 200) throw new Error('RUN_QUERY_INVALID');
      const runs = body.runs.map(run => { createRunStatusView(run); return Object.freeze({ ...run }); });
      floor = body.seq;
      emit({ worksiteId, seq: body.seq, runs: Object.freeze(runs), loading: false, error: '' });
    } catch {
      if (!closed && own === generation && !signal.aborted)
        emit({ worksiteId, runs: Object.freeze([]), loading: false, error: '暂时无法读取运行状态，请刷新重试。' });
    }
  };
  return Object.freeze({
    read: () => snapshot,
    subscribe(listener) { if (closed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    invalidate(worksiteId = snapshot.worksiteId, error = '') {
      if (closed) return;
      ++generation; pending?.abort();
      emit({ worksiteId, runs: Object.freeze([]), loading: !error, error });
    },
    setWorksite(worksiteId, minimumSeq = 0) {
      if (closed) return;
      if (!worksiteId) { ++generation; pending?.abort(); emit({ worksiteId: null, seq: null, runs: Object.freeze([]), loading: false, error: '' }); return; }
      if (snapshot.worksiteId !== worksiteId || minimumSeq > floor || snapshot.seq === null && !snapshot.loading)
        return refresh(worksiteId, minimumSeq);
    },
    refresh,
    dispose() { if (closed) return; closed = true; ++generation; pending?.abort(); listeners.clear(); },
  });
};

/** Re-resolve history against the current kernel snapshot, without mutation. */
exports.resolveRunOutput = function resolveRunOutput(data, reference) {
  if (!data || !reference || data.workspace?.activeWorksiteId !== reference.worksiteId
    || !data.workspace.worksites.some(site => site.id === reference.worksiteId)) return null;
  const asset = data.assets.find(item => item.id === reference.assetId);
  const block = asset?.blocks?.find(item => item.id === reference.blockId);
  return block ? { title: asset.title, content: block.content } : null;
};
}};
require=name=>{if(!Object.hasOwn(localModules,name))return hostRequire(name);if(!Object.hasOwn(localCache,name)){const value={};localCache[name]=value;localModules[name](require,value);}return localCache[name];};
const { createElement: h, useState, useEffect, useSyncExternalStore } = require('react');
const { RunStatusPanel, areRunAssetsComparable } = require('@kont/run-status-panel');
const { createRunStatusSource, resolveRunOutput } = require('@kont/run-status-source');
const { createRunStatusView } = require('@kont/run-status-view');

/** Read-only DTO presentation. Loading and request lifetime belong to the
 * workstation provider; historical provenance never expands supplied material. */
function SupplyPreviewPanel({ worksiteId, preview, loading = false, error = '' } = {}) {
  if (loading) return h('p', { role: 'status' }, '正在读取本轮供给…');
  if (error) return h('p', { role: 'alert' }, '暂时无法查看供给，请刷新后重试。');
  if (!preview || typeof worksiteId !== 'string' || !worksiteId || preview.worksiteId !== worksiteId) return null;

  // Protect text rendering only; supply permissions and schema validation stay
  // in the shared service. Unreadable blocks must not look like empty content.
  const materials = preview.materials;
  const readable = typeof preview.draft === 'string' && Array.isArray(materials)
    && materials.every(material => material && typeof material.id === 'string'
      && typeof material.title === 'string' && typeof material.summary === 'string'
      && Array.isArray(material.blocks) && material.blocks.every(block => block
        && typeof block.content === 'string' && ['manual', 'generated'].includes(block.source)
        && Array.isArray(block.provenance) && block.provenance.every(id => typeof id === 'string')));
  if (!readable) return h('p', { role: 'alert' }, '供给内容暂时无法读取，请刷新后重试。');

  return h('section', { className: 'kont-preview', 'aria-label': '本轮供给预览' },
    h('h3', null, '本轮供给'),
    h('p', null, preview.draft || '尚未填写问题'),
    h('p', null, `${materials.length} 份材料`),
    ...materials.map(material => h('article', { key: material.id },
      h('strong', null, material.title), h('p', null, material.summary),
      h('details', null, h('summary', null, '查看原文与来源'),
        h('p', null, '来源记录仅供追溯，不扩展本轮供给。'),
        material.blocks.length === 0 && h('p', null, '暂无可展示的原文块。'),
        ...material.blocks.map((block, index) => h('div', { key: index },
          h('p', null, `${block.source === 'manual' ? '人工' : '生成'} · 历史来源记录 ${block.provenance.length} 条`),
          h('p', null, block.content)))))),
    materials.length === 0 && h('p', null, '本轮未选材料'));
}
exports.SupplyPreviewPanel = SupplyPreviewPanel;

// One input surface in a stable tree position for window/card/icon. Editable
// text and request lifetime stay in the existing worksite provider.
function WorksiteHud({ site, title, selected, draft, busy, error, dirty, preview, previewLoading, previewError, onDraft, onSave, onPreview }) {
  const agentLabel = site.agentId === null ? '尚未选择 Agent'
    : typeof site.agentId === 'string' && site.agentId.trim() ? `已选 Agent 标识：${site.agentId}` : 'Agent 选择待核对';
  return h('section', { key: 'worksite-hud', className: 'kont-compose kont-hud', 'aria-label': '现场输入 HUD', 'data-worksite-id': site.id },
    h('h2', null, '沿着什么继续'),
    h('p', { className: 'kont-hud-target' }, `目标现场：${title}`),
    h('p', { className: 'kont-hud-meta', role: 'status' }, busy || error ? '已保存快照 · 现场待核对' : '已核对的保存现场'),
    h('p', { className: 'kont-hud-meta' }, agentLabel),
    h('details', { className: 'kont-hud-supply' }, h('summary', null, `本轮已选 ${selected.length} 份材料`),
      selected.length ? h('ul', null, ...selected.map(asset => h('li', { key: asset.id }, asset.title))) : h('p', null, '本轮未选材料')),
    h('textarea', { 'aria-label': '现场草稿', placeholder: '写下这次想推进的问题…', value: draft, maxLength: 50000, disabled: busy, onChange: onDraft }),
    h('div', { className: 'kont-actions' },
      h('button', { type: 'button', disabled: busy || Boolean(error) || !dirty, onClick: onSave }, busy ? '保存中…' : '保存草稿'),
      h('button', { type: 'button', disabled: busy || Boolean(error), onClick: onPreview }, '查看本轮供给')),
    h('p', { className: 'kont-runtime-note' }, '现场准备就绪后，再交给 Agent。真实运行入口正在接入。'),
    h(SupplyPreviewPanel, { worksiteId: site.id, preview, loading: previewLoading, error: previewError }));
}

// A read-only overview of the existing single Run source. Labels remain owned
// by createRunStatusView; grouping does not infer execution or ownership.
function WorkIsland({ workspace, titles, seq, runState, busy, error, onReturn, onRefresh }) {
  const section = content => h('section', { className: 'kont-work-island', 'aria-label': '工作岛运行概览' },
    h('header', null, h('h2', null, '工作岛'), h('button', { type: 'button', disabled: busy || runState.loading, onClick: onRefresh }, '刷新工作岛')),
    h('p', { className: 'kont-hud-meta' }, '当前核对快照 · 运行仍归原现场'), content);
  if (busy || error || runState.loading || runState.error || runState.worksiteId !== workspace.activeWorksiteId
    || !Number.isSafeInteger(runState.seq) || runState.seq < seq) {
    return section(h('p', { role: error || runState.error ? 'alert' : 'status' }, '运行概览待核对，请刷新现场。'));
  }
  const groups = new Map();
  try {
    for (const run of runState.runs) {
      const view = createRunStatusView(run);
      const owner = workspace.worksites.find(site => site.id === run.worksiteId);
      const key = owner?.id ?? null;
      if (!groups.has(key)) groups.set(key, { owner, labels: new Map(), count: 0 });
      const group = groups.get(key);
      group.count++;
      group.labels.set(view.label, (group.labels.get(view.label) ?? 0) + 1);
    }
  } catch {
    return section(h('p', { role: 'alert' }, '运行概览待核对，请刷新现场。'));
  }
  if (!groups.size) return section(h('p', { role: 'status' }, '暂无运行记录。'));
  return section(h('ul', { className: 'kont-island-list' }, ...[...groups].map(([id, group]) =>
    h('li', { key: id === null ? 'unknown-owner' : `site:${id}` },
      h('strong', null, group.owner ? titles[id] : '运行归属待核对'),
      h('p', null, `${group.count} 条记录 · ${[...group.labels].map(([label, count]) => `${label} ${count}`).join(' · ')}`),
      h('button', { type: 'button', disabled: !group.owner, 'aria-label': group.owner ? `从工作岛回到现场：${titles[id]}` : '运行归属待核对，无法返回现场',
        onClick: () => { if (group.owner) return onReturn(id); } }, '回到现场')))));
}

// Navigation reuses the current source's completed tuple and the current core
// resolver. The low-level resolver is not an authority for cross-epoch joins.
function resolveComparableRunOutput(data, runState, reference) {
  if (!data || !reference || runState.loading || runState.error
    || runState.worksiteId !== data.workspace.activeWorksiteId
    || !areRunAssetsComparable(data.seq, runState.seq)) return null;
  const recorded = runState.runs.some(run => {
    const output = createRunStatusView(run).outputReference;
    return output && output.worksiteId === reference.worksiteId
      && output.assetId === reference.assetId && output.blockId === reference.blockId;
  });
  return recorded ? resolveRunOutput(data, reference) : null;
}

function workspaceFailureMessage(writing, status, code) {
  if (status === 401 || status === 403) {
    return '现场连接已失效，请从本次启动入口重新连接后再核对。';
  }
  if (status === 409 && code === 'STALE_REVISION') {
    return '现场已被其他窗口更新，请先刷新核对；本页草稿仍保留。';
  }
  return writing
    ? '保存结果待核对，请先刷新现场；本页草稿仍保留，请勿重复提交。'
    : '暂时无法读取现场，请刷新重试；本页草稿仍保留。';
}

/** A rendering boundary, not the store schema. Keep accepted JSON untouched:
 * journal, edges, layout and block provenance remain owned by the service. */
function acceptWorkspaceResponse(data, previous = null) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const identity = value => typeof value === 'string' && value.trim().length > 0;
  const stringIds = value => Array.isArray(value) && value.every(identity) && new Set(value).size === value.length;
  if (!record(data) || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !Number.isSafeInteger(data.seq) || data.seq < 0 || !record(data.titles)
    || !Array.isArray(data.assets) || !record(data.workspace)) return null;
  if (previous && (data.revision < previous.revision || data.seq < previous.seq)) return null;

  const workspace = data.workspace;
  if (!identity(workspace.activeWorksiteId) || !Array.isArray(workspace.worksites)
    || !Array.isArray(workspace.presentations)) return null;
  const siteIds = new Set();
  for (const site of workspace.worksites) {
    if (!record(site) || !identity(site.id) || siteIds.has(site.id) || typeof site.draft !== 'string'
      || !stringIds(site.checkedIds) || !stringIds(site.excludedIds) || typeof data.titles[site.id] !== 'string') return null;
    siteIds.add(site.id);
  }
  if (!siteIds.has(workspace.activeWorksiteId)) return null;
  if (!Object.hasOwn(data, 'organization')) {
    if (previous && Object.hasOwn(previous, 'organization')) return null;
  } else {
    const organization = data.organization;
    if (!record(organization) || organization.version !== 1 || !Array.isArray(organization.folders)
      || organization.folders.length > 200) return null;
    const folderIds = new Set(), filed = new Set();
    for (const folder of organization.folders) {
      if (!record(folder) || !identity(folder.id) || folder.id.length > 200 || folderIds.has(folder.id)
        || typeof folder.title !== 'string' || !folder.title.trim() || folder.title.length > 200
        || !stringIds(folder.worksiteIds) || folder.worksiteIds.length > 200) return null;
      folderIds.add(folder.id);
      for (const worksiteId of folder.worksiteIds) {
        if (!siteIds.has(worksiteId) || filed.has(worksiteId)) return null;
        filed.add(worksiteId);
      }
    }
    if (filed.size > 200) return null;
  }

  const assetIds = new Set();
  for (const asset of data.assets) {
    if (!record(asset) || !identity(asset.id) || assetIds.has(asset.id)
      || typeof asset.title !== 'string' || typeof asset.summary !== 'string') return null;
    assetIds.add(asset.id);
    if (asset.blocks === undefined) continue;
    if (!Array.isArray(asset.blocks)) return null;
    const blockIds = new Set();
    for (const block of asset.blocks) {
      if (!record(block) || !identity(block.id) || blockIds.has(block.id) || typeof block.content !== 'string') return null;
      blockIds.add(block.id);
    }
  }
  const presentationIds = new Set();
  for (const view of workspace.presentations) {
    if (!record(view) || !identity(view.id) || presentationIds.has(view.id) || !identity(view.worksiteId)
      || !['window', 'card', 'icon'].includes(view.kind) || typeof view.closed !== 'boolean') return null;
    presentationIds.add(view.id);
  }
  return data;
}
exports.acceptWorkspaceResponse = acceptWorkspaceResponse;

// Workspace order is authoritative. Reuse the first live presentation, then
// the first closed one; a library entry never owns another copy of a worksite.
function findWorksitePresentation(workspace, worksiteId) {
  return workspace.presentations.find(view => view.worksiteId === worksiteId && !view.closed)
    ?? workspace.presentations.find(view => view.worksiteId === worksiteId);
}
function worksitePresentationCommand(workspace, worksiteId, kind) {
  const view = findWorksitePresentation(workspace, worksiteId);
  if (view) return { type: 'presentation.update', presentationId: view.id, kind, closed: false };
  const base = `view:${worksiteId}`;
  let id = base, suffix = 1;
  const used = new Set(workspace.presentations.map(item => item.id));
  while (used.has(id)) id = `${base}:${suffix++}`;
  return { type: 'presentation.open', id, worksiteId, kind };
}
function worksiteRevealCommands(workspace, worksiteId) {
  return [{ type: 'worksite.activate', worksiteId }, worksitePresentationCommand(workspace, worksiteId, 'window')];
}

function nextFolderId(organization) {
  const used = new Set(organization.folders.map(folder => folder.id));
  let number = 1;
  while (used.has(`folder:${number}`)) number++;
  return `folder:${number}`;
}
function WorksiteLibrary({ workspace, organization, renderEntry, folderTitles, newFolderTitle, busy, error, onNewTitle, onCreate, onRenameTitle, onRename }) {
  const available = Boolean(organization), disabled = busy || Boolean(error) || !available;
  const filed = new Set(organization?.folders.flatMap(folder => folder.worksiteIds) ?? []);
  const groups = available ? [
    ...organization.folders.map(folder => ({ key: `folder:${folder.id}`, title: folder.title, folder,
      sites: folder.worksiteIds.map(id => workspace.worksites.find(site => site.id === id)) })),
    { key: 'unfiled', title: '未归组', sites: workspace.worksites.filter(site => !filed.has(site.id)) },
  ] : [{ key: 'legacy', title: '全部现场', sites: workspace.worksites }];
  return h('div', { 'aria-label': '现场资源库' },
    !available && h('p', { role: 'status', className: 'kont-library-meta' }, '文件夹组织暂不可用'),
    h('details', { className: 'kont-folder-tools' }, h('summary', null, '整理文件夹'),
      h('form', { onSubmit: onCreate },
        h('input', { 'aria-label': '新文件夹名称', value: newFolderTitle, maxLength: 200, disabled,
          onChange: event => onNewTitle(event.target.value) }),
        h('button', { type: 'submit', disabled: disabled || !newFolderTitle.trim() || organization.folders.length >= 200 }, '新建文件夹'))),
    ...groups.map(group => h('section', { key: group.key, className: 'kont-folder-group', 'data-folder-id': group.folder?.id ?? null },
      h('h3', null, group.title),
      group.folder && h('details', { className: 'kont-folder-tools' }, h('summary', null, '修改文件夹名称'),
        h('form', { onSubmit: event => onRename(event, group.folder) },
          h('input', { 'aria-label': `文件夹新名称：${group.folder.title}`, 'data-folder-id': group.folder.id, value: folderTitles.get(group.folder.id) ?? group.folder.title,
            maxLength: 200, disabled, onChange: event => onRenameTitle(group.folder.id, event.target.value) }),
          h('button', { type: 'submit', disabled: disabled || !(folderTitles.get(group.folder.id) ?? group.folder.title).trim()
            || (folderTitles.get(group.folder.id) ?? group.folder.title).trim() === group.folder.title,
            'aria-label': `保存文件夹名称：${group.folder.title}`, 'data-folder-id': group.folder.id }, '保存名称'))),
      h('ul', { className: 'kont-library' }, ...group.sites.map(renderEntry)),
      group.sites.length === 0 && h('p', { className: 'kont-library-meta' }, '暂无现场'))));
}
exports.inject = ['slots', 'layout'];
exports.apply = function apply(ctx) {
  // Runtime inventory only: no product data or identity enters this receipt.
  const receiptKey = Symbol.for('kont.renderer.receipt.v1');
  const receipt = { module: '@kont/dsh-plugin', version: '0.1.0', active: true, mainRegistered: false, sidebarRegistered: false };
  const readReceipt = () => Object.freeze({ ...receipt });
  const deactivateReceipt = () => {
    receipt.active = false; receipt.mainRegistered = false; receipt.sidebarRegistered = false;
    if (Object.getOwnPropertyDescriptor(window, receiptKey)?.get === readReceipt) delete window[receiptKey];
  };
  ctx.effect(() => {
    Object.defineProperty(window, receiptKey, { configurable: true, enumerable: false, get: readReceipt });
    return deactivateReceipt;
  });
  const registerWithReceipt = (field, spec, component) => {
    if (!receipt.active) return () => {};
    let dispose;
    try { dispose = ctx.slots.register(spec, component); }
    catch (error) { deactivateReceipt(); throw error; }
    receipt[field] = true;
    return () => { receipt[field] = false; dispose(); };
  };
  try {
  let snapshot = { data: null, error: '', busy: false, preview: null, previewLoading: false, previewError: '' };
  let closed = false;
  let previewGeneration = 0;
  let previewController;
  let workspaceMounted = false;
  let workspaceEvents;
  let workspaceEventsGeneration = 0;
  const runSource = createRunStatusSource({ fetch: (...args) => fetch(...args), baseURI: document.baseURI });
  const listeners = new Set();
  const drafts = new Map();
  const emit = patch => { if (!closed) { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); } };
  const source = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, read: () => snapshot };
  function invalidatePreview() {
    previewGeneration++;
    previewController?.abort();
    previewController = undefined;
    emit({ preview: null, previewLoading: false, previewError: '' });
  }
  function stopWorkspaceEvents() {
    workspaceEventsGeneration++;
    workspaceEvents?.close();
    workspaceEvents = undefined;
  }
  function requireWorkspaceRefresh(message) {
    stopWorkspaceEvents();
    invalidatePreview();
    runSource.invalidate(snapshot.data?.workspace.activeWorksiteId ?? null, '请刷新核对现场。');
    emit({ error: snapshot.error || message });
  }
  function startWorkspaceEvents() {
    stopWorkspaceEvents();
    if (closed || !workspaceMounted || snapshot.busy || snapshot.error || !snapshot.data) return;
    const generation = workspaceEventsGeneration;
    try {
      if (typeof EventSource !== 'function') throw new Error('Workspace events unavailable');
      const url = new URL('kont/events', document.baseURI);
      // Requests close the old observer first. Replaying from the newly
      // accepted seq covers that gap without guessing which events are ours.
      url.searchParams.set('since', String(snapshot.data.seq));
      const stream = new EventSource(url.href, { withCredentials: true });
      workspaceEvents = stream;
      const isCurrent = () => !closed && workspaceMounted && generation === workspaceEventsGeneration && workspaceEvents === stream;
      const failed = () => {
        if (isCurrent()) requireWorkspaceRefresh('现场变化监听中断，请刷新核对；本页草稿仍保留。');
      };
      const notified = (event, reset) => {
        if (!isCurrent()) return;
        try {
          const notification = JSON.parse(event.data);
          if (!Number.isSafeInteger(notification?.seq) || notification.seq < 0
            || reset && notification.snapshotRequired !== true
            || !reset && event.lastEventId && event.lastEventId !== String(notification.seq)) {
            failed();
            return;
          }
          if (reset || notification.seq > snapshot.data.seq) {
            requireWorkspaceRefresh('现场有新变化，请刷新核对；本页草稿仍保留。');
          }
        } catch { failed(); }
      };
      stream.onmessage = event => notified(event, false);
      stream.addEventListener('reset', event => notified(event, true));
      stream.onerror = failed;
    } catch {
      if (!closed && workspaceMounted && generation === workspaceEventsGeneration) {
        requireWorkspaceRefresh('现场变化监听中断，请刷新核对；本页草稿仍保留。');
      }
    }
  }
  ctx.effect(() => () => {
    stopWorkspaceEvents();
    invalidatePreview();
    closed = true;
    runSource.dispose();
    listeners.clear();
    drafts.clear();
  });
  const api = async (body) => {
    const writing = body !== undefined;
    const previous = snapshot.data;
    let response;
    try {
      response = await fetch(new URL('kont/api/workspace', document.baseURI), writing ? {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin',
      } : { credentials: 'same-origin' });
    } catch {
      throw new Error(workspaceFailureMessage(writing));
    }
    if (!response.ok) {
      let code;
      // Only the fixed conflict code is needed. Other error bodies may contain
      // private diagnostics and are neither read nor shown by the workstation.
      if (response.status === 409) {
        try { code = (await response.json())?.code; } catch {}
      }
      const failure = new Error(workspaceFailureMessage(writing, response.status, code));
      failure.status = response.status;
      failure.code = code;
      throw failure;
    }
    try {
      const data = await response.json();
      if (!acceptWorkspaceResponse(data, previous)) throw new Error('Unreadable workspace response');
      return data;
    } catch {
      throw new Error(workspaceFailureMessage(writing));
    }
  };
  const refresh = async () => {
    if (snapshot.busy) return;
    stopWorkspaceEvents();
    invalidatePreview();
    runSource.invalidate(snapshot.data?.workspace.activeWorksiteId ?? null);
    emit({ busy: true, error: '' });
    try {
      const data = await api(); emit({ data });
      if (!closed) runSource.refresh(data.workspace.activeWorksiteId, data.seq);
    } catch (error) {
      emit({ error: workspaceFailureMessage(false, error.status, error.code) });
      runSource.invalidate(snapshot.data?.workspace.activeWorksiteId ?? null, '暂时无法更新现场，请刷新重试。');
    }
    finally { emit({ busy: false }); startWorkspaceEvents(); }
  };
  const mutate = async commands => {
    if (snapshot.busy || snapshot.error || !snapshot.data) return false;
    stopWorkspaceEvents();
    invalidatePreview();
    emit({ busy: true, error: '' });
    const dirty = [...drafts].filter(([id, draft]) => snapshot.data.workspace.worksites.some(site => site.id === id && site.draft !== draft));
    try {
      const draftCommands = dirty.map(([worksiteId, draft]) => ({ type: 'worksite.update', worksiteId, draft }));
      const sentCommands = [...draftCommands, ...commands];
      const data = await api({ revision: snapshot.data.revision, commands: sentCommands });
      // Confirm all submitted drafts before clearing any local text or exposing
      // the response as current. This is not a receipt for unrelated commands.
      for (const command of sentCommands) {
        if (['folder.create', 'folder.rename', 'folder.assign'].includes(command.type)) {
          if (!data.organization) throw new Error('Folder acknowledgement missing');
          if (command.type === 'folder.assign') {
            const owner = data.organization.folders.find(folder => folder.worksiteIds.includes(command.worksiteId));
            if (!data.workspace.worksites.some(site => site.id === command.worksiteId)
              || (owner?.id ?? null) !== command.folderId) throw new Error('Folder assignment acknowledgement missing');
          } else {
            const folder = data.organization.folders.find(folder => folder.id === (command.type === 'folder.create' ? command.id : command.folderId));
            if (!folder || folder.title !== command.title.trim()
              || command.type === 'folder.create' && folder.worksiteIds.length !== 0) throw new Error('Folder title acknowledgement missing');
          }
        }
        if (command.type !== 'worksite.update' || !Object.hasOwn(command, 'draft')) continue;
        const savedSite = data.workspace.worksites.find(site => site.id === command.worksiteId);
        if (!savedSite || savedSite.draft !== command.draft) throw new Error('Draft acknowledgement missing');
      }
      // A save acknowledges only its captured text, never an edit made later.
      dirty.forEach(([id, savedDraft]) => {
        if (drafts.get(id) === savedDraft) drafts.delete(id);
      });
      emit({ data }); return true;
    } catch (error) { emit({ error: workspaceFailureMessage(true, error.status, error.code) }); return false; }
    finally { emit({ busy: false }); startWorkspaceEvents(); }
  };
  async function loadWorksitePreview() {
    if (closed || snapshot.busy || snapshot.error || !snapshot.data) return;
    invalidatePreview();
    const worksiteId = snapshot.data.workspace.activeWorksiteId;
    const site = snapshot.data.workspace.worksites.find(item => item.id === worksiteId);
    const draft = drafts.get(worksiteId) ?? site.draft;
    if (draft !== site.draft) {
      const saving = mutate([]);
      // mutate invalidates synchronously. Any later invalidation cancels the
      // pending reveal as well, even before its GET has started.
      const saveGeneration = previewGeneration;
      if (!await saving || closed || saveGeneration !== previewGeneration) return;
    }
    if (snapshot.busy || snapshot.error || snapshot.data.workspace.activeWorksiteId !== worksiteId) return;
    const seq = snapshot.data.seq;
    const generation = previewGeneration;
    const controller = new AbortController();
    previewController = controller;
    emit({ previewLoading: true });
    const isCurrentPreviewRequest = () => !closed && generation === previewGeneration
      && !snapshot.busy && !snapshot.error && snapshot.data?.seq === seq
      && snapshot.data.workspace.activeWorksiteId === worksiteId
      && (drafts.get(worksiteId) ?? snapshot.data.workspace.worksites.find(item => item.id === worksiteId)?.draft) === draft;
    try {
      const response = await fetch(new URL(`kont/worksites/${encodeURIComponent(worksiteId)}/preview`, document.baseURI), {
        method: 'GET', credentials: 'same-origin', signal: controller.signal,
      });
      const result = await response.json();
      if (!isCurrentPreviewRequest()) return;
      if (!response.ok || result?.ok !== true || result.preview?.worksiteId !== worksiteId
        || result.preview.draft !== draft || !Array.isArray(result.preview.materials)
        || !result.preview.materials.every(material => typeof material.id === 'string'
          && typeof material.title === 'string' && typeof material.summary === 'string' && Array.isArray(material.blocks))) {
        throw new Error('Invalid preview response');
      }
      if (result.seq !== seq) {
        emit({ previewLoading: false, previewError: '现场已变化，请刷新后再查看供给。' });
        return;
      }
      emit({ preview: result.preview, previewLoading: false });
    } catch {
      if (isCurrentPreviewRequest()) {
        emit({ previewLoading: false, previewError: '暂时无法查看供给，请刷新后重试。' });
      }
    } finally {
      if (generation === previewGeneration) previewController = undefined;
    }
  }
  function Workstation() {
    const state = useSyncExternalStore(source.subscribe, source.read);
    const runState = useSyncExternalStore(runSource.subscribe, runSource.read);
    const [newScene, setNewScene] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [locateReference, setLocateReference] = useState(null);
    const [newFolderTitle, setNewFolderTitle] = useState('');
    const [folderTitles, setFolderTitles] = useState(new Map());
    const [, redraw] = useState(0);
    useEffect(() => {
      workspaceMounted = true;
      if (!snapshot.data) refresh();
      else startWorkspaceEvents();
      return () => {
        workspaceMounted = false;
        stopWorkspaceEvents();
        invalidatePreview();
      };
    }, []);
    const activeSite = state.data?.workspace.activeWorksiteId;
    useEffect(() => { setLocateReference(null); runSource.setWorksite(activeSite, state.data?.seq ?? 0); }, [activeSite, state.data?.seq]);
    useEffect(() => { if (state.busy || state.error) setLocateReference(null); }, [state.busy, state.error]);
    useEffect(() => {
      setLocateReference(current => current && current.runSnapshot === runState && current.assetSnapshot === state.data
        && !state.busy && !state.error ? current : null);
    }, [runState, state.data, state.busy, state.error]);
    if (!state.data) return h('section', { className: 'kont-root kont-loading' }, h('h1', null, 'KONT'), h('p', { role: state.error ? 'alert' : 'status' }, state.error || '正在打开工作现场…'), h('button', { onClick: refresh, disabled: state.busy }, '重新连接'), h('button', { onClick: () => ctx.layout.selectPanel(null), disabled: state.busy }, '返回对话'));
    const { workspace, assets, titles, revision, organization } = state.data;
    const site = workspace.worksites.find(item => item.id === workspace.activeWorksiteId);
    const draft = drafts.get(site.id) ?? site.draft;
    const dirty = draft !== site.draft;
    const view = workspace.presentations.find(item => item.worksiteId === site.id && !item.closed);
    const mode = view?.kind ?? null;
    const presentationLabel = view ? { window: '窗口', card: '卡片', icon: '图标' }[mode]
      : findWorksitePresentation(workspace, site.id) ? '呈现已关闭' : '尚未唤出';
    const selected = assets.filter(asset => site.checkedIds.includes(asset.id) && !site.excludedIds.includes(asset.id));
    const located = !state.busy && !state.error && locateReference?.runSnapshot === runState && locateReference?.assetSnapshot === state.data
      ? resolveComparableRunOutput(state.data, runState, locateReference.reference) : null;
    const onLocate = reference => {
      // Source object identity fences even a same-seq refresh which went
      // through loading between renders; old callbacks cannot revive it.
      if (closed || snapshot.busy || snapshot.error || runSource.read() !== runState || snapshot.data !== state.data) return;
      if (resolveComparableRunOutput(snapshot.data, runSource.read(), reference))
        setLocateReference({ reference: { ...reference }, runSnapshot: runState, assetSnapshot: state.data });
    };
    const btn = (label, onClick, props = {}) => h('button', { type: 'button', disabled: state.busy || Boolean(state.error), onClick, ...props }, label);
    const changeMode = kind => mutate([worksitePresentationCommand(workspace, site.id, kind)]);
    const preview = !state.busy && !state.error && state.preview?.worksiteId === site.id ? state.preview : null;
    const createFolder = async event => {
      event.preventDefault();
      if (!organization || state.busy || state.error || !newFolderTitle.trim()) return;
      const captured = newFolderTitle;
      if (await mutate([{ type: 'folder.create', id: nextFolderId(organization), title: captured }]))
        setNewFolderTitle(current => current === captured ? '' : current);
    };
    const renameFolder = async (event, folder) => {
      event.preventDefault();
      if (!organization || state.busy || state.error) return;
      const captured = folderTitles.get(folder.id) ?? folder.title;
      if (!captured.trim() || captured.trim() === folder.title) return;
      if (await mutate([{ type: 'folder.rename', folderId: folder.id, title: captured }]))
        setFolderTitles(current => {
          if ((current.get(folder.id) ?? folder.title) !== captured) return current;
          const next = new Map(current); next.delete(folder.id); return next;
        });
    };
    const renderLibraryEntry = item => {
      const presentation = findWorksitePresentation(workspace, item.id);
      const presentationLabel = !presentation ? '尚未唤出' : presentation.closed ? '呈现已关闭' : { window: '窗口', card: '卡片', icon: '图标' }[presentation.kind];
      const supplyCount = assets.filter(asset => item.checkedIds.includes(asset.id) && !item.excludedIds.includes(asset.id)).length;
      const localDraft = drafts.get(item.id) ?? item.draft;
      const draftLabel = localDraft !== item.draft ? '本页草稿未保存' : item.draft ? '已有保存草稿' : '尚无草稿';
      const owner = organization?.folders.find(folder => folder.worksiteIds.includes(item.id));
      return h('li', { className: 'kont-library-entry', key: `site:${item.id}`, 'data-worksite-id': item.id },
        btn(titles[item.id], () => mutate([{ type: 'worksite.activate', worksiteId: item.id }]), { className: `kont-scene ${item.id === site.id ? 'is-active' : ''}`, 'aria-pressed': item.id === site.id }),
        h('p', { className: 'kont-library-meta' }, `${presentationLabel} · ${supplyCount} 份供给`),
        h('p', { className: 'kont-library-meta' }, draftLabel),
        btn('唤出', () => mutate(worksiteRevealCommands(workspace, item.id)), { 'aria-label': `唤出现场：${titles[item.id]}` }),
        h('details', { className: 'kont-folder-tools' }, h('summary', null, '整理现场'),
          h('select', { 'aria-label': `现场文件夹：${titles[item.id]}`, 'data-worksite-id': item.id, value: owner?.id ?? '', disabled: state.busy || Boolean(state.error) || !organization,
            onChange: event => {
              const folderId = event.target.value || null;
              if (organization && folderId !== (owner?.id ?? null)) return mutate([{ type: 'folder.assign', worksiteId: item.id, folderId }]);
            } },
            h('option', { value: '' }, '未归组'),
            ...(organization?.folders ?? []).map(folder => h('option', { key: `folder:${folder.id}`, value: folder.id }, folder.title)))));
    };
    return h('section', { className: 'kont-root', 'aria-label': 'KONT 工作站' },
      h('header', { className: 'kont-header' }, h('div', null, h('span', { className: 'kont-wordmark' }, 'KONT'), h('span', { className: 'kont-subtitle' }, '让思考留下来')), h('div', { className: 'kont-actions' }, h('span', { className: 'kont-save', role: 'status' }, state.busy ? '正在核对现场…' : state.error ? '现场待核对' : dirty ? '草稿未保存' : `已保存 · ${revision}`), btn('刷新', refresh, { disabled: state.busy }), btn('返回对话', () => ctx.layout.selectPanel(null), { disabled: state.busy }))),
      state.error && h('div', { className: 'kont-error', role: 'alert' }, state.error, '。刷新会保留本页未保存的草稿。'),
      h(WorkIsland, { workspace, titles, seq: state.data.seq, runState, busy: state.busy, error: state.error,
        onReturn: worksiteId => mutate(worksiteRevealCommands(workspace, worksiteId)), onRefresh: refresh }),
      h('div', { className: 'kont-body' },
        h('aside', { className: 'kont-scenes' }, h('h2', null, '工作现场'), h('p', { className: 'kont-muted' }, '切换现场，材料选择各自保留。'),
          h('p', { className: 'kont-library-meta', role: 'status' }, state.busy || state.error ? '已保存快照 · 现场待核对' : '已保存现场 · 唤出会展开原现场'),
          h(WorksiteLibrary, { workspace, organization, renderEntry: renderLibraryEntry, folderTitles, newFolderTitle, busy: state.busy, error: state.error,
            onNewTitle: setNewFolderTitle, onCreate: createFolder,
            onRenameTitle: (id, value) => setFolderTitles(current => new Map(current).set(id, value)), onRename: renameFolder }),
          h('form', { onSubmit: async event => { event.preventDefault(); if (await mutate([{ type: 'scene.create', title: newScene }])) setNewScene(''); } }, h('input', { 'aria-label': '新现场名称', placeholder: '给新现场起个名字', value: newScene, maxLength: 200, disabled: state.busy, onChange: event => setNewScene(event.target.value) }), h('button', { disabled: state.busy || Boolean(state.error) || !newScene.trim(), type: 'submit' }, '＋ 新建现场'))),
        h('main', { className: 'kont-site' }, h('div', { className: 'kont-site-title' }, h('div', null, h('p', { className: 'kont-eyebrow' }, '当前工作'), h('h1', null, titles[site.id])), h('div', { className: 'kont-actions', 'aria-label': '现场呈现' }, ...[['window', '展开', '窗口'], ['card', '卡片', '卡片'], ['icon', '图标', '图标']].map(([kind, label, name]) => btn(label, () => changeMode(kind), { key: kind, 'aria-pressed': mode === kind, 'aria-label': `唤出为${name}：${titles[site.id]}` })),
          h('p', { className: 'kont-library-meta', role: 'status' }, state.busy || state.error ? '已保存快照 · 现场待核对' : `${presentationLabel} · 按钮显式唤出或切换登记实例`))),
          h(RunStatusPanel, { runs: !state.busy && !state.error && runState.worksiteId === site.id ? runState.runs : [], worksiteId: site.id, assets,
            assetSeq: state.data.seq, runSeq: runState.seq,
            loading: state.busy || runState.worksiteId !== site.id || runState.loading,
            error: state.error ? '暂时无法更新现场，请刷新重试。' : runState.worksiteId === site.id ? runState.error : '',
            onRefresh: refresh, onLocate }),
          located && h('section', { className: 'kont-preview', 'aria-label': '运行产物' }, h('h2', null, located.title),
            h('p', null, located.content), h('button', { type: 'button', onClick: () => setLocateReference(null) }, '关闭产物预览')),
          h('div', { className: 'kont-columns' },
            !view ? h('div', { className: 'kont-empty', 'aria-label': '现场呈现状态' }, h('p', null, presentationLabel), h('p', null, '可用上方按钮显式唤出；HUD 仍指向同一现场。'))
            : mode !== 'window' ? h('div', { className: `kont-compact kont-${mode}`, 'aria-label': '登记现场呈现', 'data-presentation-id': view.id }, h('h2', null, mode === 'icon' ? '◉' : titles[site.id]), h('p', null, `${selected.length} 份供给 · 草稿与材料已保留`), btn('回到现场', () => changeMode('window'))) : h('section', { className: 'kont-materials', 'aria-label': '登记现场呈现', 'data-presentation-id': view.id }, h('h2', null, '这次用哪些材料'), h('p', { className: 'kont-muted' }, `已选 ${selected.length} 份 · 只供给当前现场`),
              assets.length === 0 && h('div', { className: 'kont-empty' }, '先放入一份参考、讨论或想法。'),
              ...assets.map(asset => h('label', { className: 'kont-material', key: asset.id }, h('input', { type: 'checkbox', checked: selected.some(item => item.id === asset.id), disabled: state.busy || Boolean(state.error), onChange: event => mutate([{ type: 'worksite.supply', worksiteId: site.id, assetId: asset.id, mode: event.target.checked ? 'connect' : 'exclude' }]) }), h('span', null, h('strong', null, asset.title), h('p', null, asset.summary)))),
              h('details', { className: 'kont-add' }, h('summary', null, '＋ 添加材料'), h('form', { onSubmit: async event => { event.preventDefault(); if (await mutate([{ type: 'asset.add', title, content }])) { setTitle(''); setContent(''); } } }, h('input', { 'aria-label': '材料标题', placeholder: '材料标题', maxLength: 200, value: title, disabled: state.busy, onChange: event => setTitle(event.target.value) }), h('textarea', { 'aria-label': '材料正文', placeholder: '粘贴正文或记录一个想法', maxLength: 50000, value: content, disabled: state.busy, onChange: event => setContent(event.target.value) }), h('button', { type: 'submit', disabled: state.busy || Boolean(state.error) || !title.trim() || !content.trim() }, '存为材料')))),
            h(WorksiteHud, { key: 'worksite-hud', site, title: titles[site.id], selected, draft, busy: state.busy, error: state.error, dirty,
              preview, previewLoading: state.previewLoading, previewError: state.previewError,
              onDraft: event => { drafts.set(site.id, event.target.value); invalidatePreview(); redraw(value => value + 1); },
              onSave: () => mutate([]), onPreview: loadWorksitePreview })))));
  }
  function Icon() { return h('span', { style: { fontSize: 18, fontWeight: 700 }, 'aria-hidden': true }, '结'); }
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const onLeave = event => {
      const dirty = [...drafts].some(([id, draft]) => {
        const site = snapshot.data?.workspace.worksites.find(item => item.id === id);
        return !site || site.draft !== draft;
      });
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => { style.remove(); window.removeEventListener('beforeunload', onLeave); };
  });
  ctx.slots.inject('main', () => registerWithReceipt('mainRegistered', { name: 'main', key: 'kont' }, Workstation));
  ctx.slots.inject('sidebar.panellist', () => registerWithReceipt('sidebarRegistered', { name: 'sidebar.panellist', id: 'kont', order: 10, label: 'KONT 工作现场' }, Icon));
  } catch (error) { deactivateReceipt(); throw error; }
};

return exports;}});
