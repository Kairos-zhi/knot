window.__ModuleLoader__.load({id:"@kont/dsh-plugin",factory:(require)=>{const exports={};const CSS=".kont-root{height:100%;overflow:auto;background:#f7f6f2;color:#242a27;font:14px/1.6 system-ui,\"Microsoft YaHei\",sans-serif;color-scheme:light}.kont-root *{box-sizing:border-box}.kont-root button,.kont-root input,.kont-root textarea{font:inherit}.kont-root button{border:1px solid #d7dcd4;border-radius:9px;background:#fff;color:#304c3d;padding:7px 13px;cursor:pointer}.kont-root button:hover{background:#eef2eb}.kont-root button:disabled{opacity:.5;cursor:default}.kont-root button:focus-visible,.kont-root input:focus-visible,.kont-root textarea:focus-visible{outline:2px solid #47735c;outline-offset:3px}.kont-root button[aria-pressed=true]{background:#e7eee3;border-color:#7c987e}.kont-root input:not([type=checkbox]),.kont-root textarea{border:1px solid #d7dcd4;border-radius:9px;background:#fff;padding:10px 12px;color:#242a27;width:100%}.kont-root textarea{resize:vertical;min-height:140px}.kont-root h1,.kont-root h2,.kont-root h3,.kont-root p{margin:0}.kont-root h1{font-size:26px;letter-spacing:-.5px;line-height:1.3}.kont-root h2{font-size:15px;margin-bottom:12px}.kont-header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:22px 30px;border-bottom:1px solid #e2e3da}.kont-wordmark{font-size:19px;letter-spacing:3px;font-weight:750}.kont-subtitle{margin-left:20px;color:#768174;font-size:12px}.kont-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.kont-save{font-size:12px;color:#768174;margin-right:8px}.kont-body{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:calc(100% - 85px)}.kont-scenes{padding:28px 18px;border-right:1px solid #e2e3da}.kont-muted{font-size:12px;color:#768174;margin-bottom:18px!important}.kont-scene{display:block;width:100%;text-align:left;margin:8px 0;overflow-wrap:anywhere}.kont-scenes form{display:grid;gap:8px;margin-top:28px}.kont-site{padding:32px;min-width:0}.kont-site-title{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:34px}.kont-eyebrow{font-size:11px;letter-spacing:2px;color:#768174;margin-bottom:7px!important}.kont-columns{display:grid;grid-template-columns:minmax(230px,.9fr) minmax(260px,1.1fr);gap:32px}.kont-material{display:flex;gap:12px;background:#fff;border:1px solid #e1e4dc;border-radius:12px;padding:16px;margin-bottom:10px;cursor:pointer;min-width:0}.kont-material input{accent-color:#47735c;flex-shrink:0;align-self:flex-start;margin-top:5px}.kont-material span{min-width:0}.kont-material strong{font-weight:600;overflow-wrap:anywhere}.kont-material p{color:#768174;font-size:12px;white-space:pre-wrap;max-height:110px;overflow:auto;margin-top:7px;overflow-wrap:anywhere}.kont-add{margin-top:20px}.kont-add summary{cursor:pointer;color:#47735c}.kont-add form{display:grid;gap:10px;margin-top:12px}.kont-compose>textarea{min-height:230px;margin-bottom:14px}.kont-empty{padding:30px 20px;border:1px dashed #ccd4c7;border-radius:12px;color:#768174}.kont-runtime-note{font-size:12px;color:#768174;margin-top:20px!important}.kont-preview{border-top:1px solid #dde2d6;padding-top:18px;margin-top:28px}.kont-preview p{white-space:pre-wrap;overflow-wrap:anywhere}.kont-preview article{margin-top:18px;background:#edf1e7;padding:14px;border-radius:9px}.kont-compact{max-width:360px;border:1px solid #d7dcd4;border-radius:18px;padding:28px;background:#fff}.kont-compact p{margin-bottom:20px}.kont-icon{max-width:250px}.kont-icon h2{font-size:32px}.kont-error{background:#fff0e8;color:#934321;padding:12px 30px;overflow-wrap:anywhere}.kont-loading{padding:40px}.kont-loading p{margin:20px 0}@media(max-width:1000px){.kont-body{grid-template-columns:180px minmax(0,1fr)}.kont-site{padding:24px}.kont-columns{grid-template-columns:1fr;gap:26px}.kont-subtitle{display:none}}@media(max-width:620px){.kont-body{display:block}.kont-scenes{border-right:0;border-bottom:1px solid #e2e3da;padding:16px}.kont-scenes form{margin-top:12px}.kont-header{padding:16px;align-items:flex-start}.kont-site{padding:20px 16px}.kont-site-title{align-items:flex-start;flex-direction:column}.kont-save{width:100%}}\n";
const { createElement: h, useState, useEffect, useSyncExternalStore } = require('react');
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
  let snapshot = { data: null, error: '', busy: false };
  const listeners = new Set();
  const drafts = new Map();
  const emit = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
  const source = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, read: () => snapshot };
  const api = async (body) => {
    const response = await fetch(new URL('kont/api/workspace', document.baseURI), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' } : { credentials: 'same-origin' });
    let data;
    try { data = await response.json(); } catch { throw new Error('连接失效，请从 DSH 的本次启动链接重新进入'); }
    if (!response.ok) throw new Error(data.message || `请求失败 (${response.status})`);
    return data;
  };
  const refresh = async () => {
    if (snapshot.busy) return;
    emit({ busy: true, error: '' });
    try { emit({ data: await api() }); } catch (error) { emit({ error: error.message }); }
    finally { emit({ busy: false }); }
  };
  const mutate = async commands => {
    if (snapshot.busy || !snapshot.data) return false;
    emit({ busy: true, error: '' });
    const dirty = [...drafts].filter(([id, draft]) => snapshot.data.workspace.worksites.some(site => site.id === id && site.draft !== draft));
    try {
      const draftCommands = dirty.map(([worksiteId, draft]) => ({ type: 'worksite.update', worksiteId, draft }));
      const data = await api({ revision: snapshot.data.revision, commands: [...draftCommands, ...commands] });
      dirty.forEach(([id]) => drafts.delete(id));
      emit({ data }); return true;
    } catch (error) { emit({ error: error.message }); return false; }
    finally { emit({ busy: false }); }
  };
  function Workstation() {
    const state = useSyncExternalStore(source.subscribe, source.read);
    const [newScene, setNewScene] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [preview, setPreview] = useState(null);
    const [, redraw] = useState(0);
    useEffect(() => { if (!snapshot.data) refresh(); }, []);
    if (!state.data) return h('section', { className: 'kont-root kont-loading' }, h('h1', null, 'KONT'), h('p', { role: state.error ? 'alert' : 'status' }, state.error || '正在打开工作现场…'), h('button', { onClick: refresh, disabled: state.busy }, '重新连接'));
    const { workspace, assets, titles, revision } = state.data;
    const site = workspace.worksites.find(item => item.id === workspace.activeWorksiteId);
    const draft = drafts.get(site.id) ?? site.draft;
    const dirty = draft !== site.draft;
    const view = workspace.presentations.find(item => item.worksiteId === site.id && !item.closed);
    const mode = view?.kind ?? 'window';
    const selected = assets.filter(asset => site.checkedIds.includes(asset.id) && !site.excludedIds.includes(asset.id));
    const btn = (label, onClick, props = {}) => h('button', { type: 'button', disabled: state.busy, onClick, ...props }, label);
    const changeMode = kind => mutate([view ? { type: 'presentation.update', presentationId: view.id, kind } : { type: 'presentation.open', id: `view:${site.id}`, worksiteId: site.id, kind }]);
    const reveal = async () => {
      if (dirty && !await mutate([])) return;
      const latest = snapshot.data;
      const current = latest.workspace.worksites.find(item => item.id === site.id);
      setPreview({ worksiteId: current.id, draft: current.draft, materials: latest.assets.filter(asset => current.checkedIds.includes(asset.id) && !current.excludedIds.includes(asset.id)) });
    };
    return h('section', { className: 'kont-root', 'aria-label': 'KONT 工作站' },
      h('header', { className: 'kont-header' }, h('div', null, h('span', { className: 'kont-wordmark' }, 'KONT'), h('span', { className: 'kont-subtitle' }, '让思考留下来')), h('div', { className: 'kont-actions' }, h('span', { className: 'kont-save', role: 'status' }, dirty ? '草稿未保存' : `已保存 · ${revision}`), btn('刷新', refresh), btn('返回对话', () => ctx.layout.selectPanel(null)))),
      state.error && h('div', { className: 'kont-error', role: 'alert' }, state.error, '。刷新会保留本页未保存的草稿。'),
      h('div', { className: 'kont-body' },
        h('aside', { className: 'kont-scenes' }, h('h2', null, '工作现场'), h('p', { className: 'kont-muted' }, '切换现场，材料选择各自保留。'),
          ...workspace.worksites.map(item => btn(titles[item.id], () => { setPreview(null); mutate([{ type: 'worksite.activate', worksiteId: item.id }]); }, { key: item.id, className: `kont-scene ${item.id === site.id ? 'is-active' : ''}`, 'aria-pressed': item.id === site.id })),
          h('form', { onSubmit: async event => { event.preventDefault(); if (await mutate([{ type: 'scene.create', title: newScene }])) { setNewScene(''); setPreview(null); } } }, h('input', { 'aria-label': '新现场名称', placeholder: '给新现场起个名字', value: newScene, maxLength: 200, disabled: state.busy, onChange: event => setNewScene(event.target.value) }), h('button', { disabled: state.busy || !newScene.trim(), type: 'submit' }, '＋ 新建现场'))),
        h('main', { className: 'kont-site' }, h('div', { className: 'kont-site-title' }, h('div', null, h('p', { className: 'kont-eyebrow' }, '当前工作'), h('h1', null, titles[site.id])), h('div', { className: 'kont-actions', 'aria-label': '现场呈现' }, ...[['window', '展开'], ['card', '卡片'], ['icon', '图标']].map(([kind, label]) => btn(label, () => changeMode(kind), { key: kind, 'aria-pressed': mode === kind })))),
          mode !== 'window' ? h('div', { className: `kont-compact kont-${mode}` }, h('h2', null, mode === 'icon' ? '◉' : titles[site.id]), h('p', null, `${selected.length} 份供给 · 草稿与材料已保留`), btn('回到现场', () => changeMode('window'))) : h('div', { className: 'kont-columns' },
            h('section', { className: 'kont-materials' }, h('h2', null, '这次用哪些材料'), h('p', { className: 'kont-muted' }, `已选 ${selected.length} 份 · 只供给当前现场`),
              assets.length === 0 && h('div', { className: 'kont-empty' }, '先放入一份参考、讨论或想法。'),
              ...assets.map(asset => h('label', { className: 'kont-material', key: asset.id }, h('input', { type: 'checkbox', checked: selected.some(item => item.id === asset.id), disabled: state.busy, onChange: event => { setPreview(null); mutate([{ type: 'worksite.supply', worksiteId: site.id, assetId: asset.id, mode: event.target.checked ? 'connect' : 'exclude' }]); } }), h('span', null, h('strong', null, asset.title), h('p', null, asset.summary)))),
              h('details', { className: 'kont-add' }, h('summary', null, '＋ 添加材料'), h('form', { onSubmit: async event => { event.preventDefault(); if (await mutate([{ type: 'asset.add', title, content }])) { setTitle(''); setContent(''); } } }, h('input', { 'aria-label': '材料标题', placeholder: '材料标题', maxLength: 200, value: title, disabled: state.busy, onChange: event => setTitle(event.target.value) }), h('textarea', { 'aria-label': '材料正文', placeholder: '粘贴正文或记录一个想法', maxLength: 50000, value: content, disabled: state.busy, onChange: event => setContent(event.target.value) }), h('button', { type: 'submit', disabled: state.busy || !title.trim() || !content.trim() }, '存为材料')))),
            h('section', { className: 'kont-compose' }, h('h2', null, '沿着什么继续'), h('textarea', { 'aria-label': '现场草稿', placeholder: '写下这次想推进的问题…', value: draft, maxLength: 50000, disabled: state.busy, onChange: event => { drafts.set(site.id, event.target.value); setPreview(null); redraw(value => value + 1); } }), h('div', { className: 'kont-actions' }, btn(state.busy ? '保存中…' : '保存草稿', () => mutate([]), { disabled: state.busy || !dirty }), btn('查看本轮供给', reveal)), h('p', { className: 'kont-runtime-note' }, '现场准备就绪后，再交给 Agent。真实运行入口正在接入。'),
              preview && h('section', { className: 'kont-preview', 'aria-label': '本轮供给预览' }, h('h3', null, '本轮供给'), h('p', null, preview.draft || '尚未填写问题'), ...preview.materials.map(asset => h('article', { key: asset.id }, h('strong', null, asset.title), h('p', null, asset.summary))), preview.materials.length === 0 && h('p', null, '本轮未选材料')))))));
  }
  function Icon() { return h('span', { style: { fontSize: 18, fontWeight: 700 }, 'aria-hidden': true }, '结'); }
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const onLeave = event => {
      const dirty = [...drafts].some(([id, draft]) => snapshot.data?.workspace.worksites.some(site => site.id === id && site.draft !== draft));
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
