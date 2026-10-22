const { createElement: h, useState, useEffect, useSyncExternalStore } = require('react');
exports.inject = ['slots', 'layout'];
exports.apply = function apply(ctx) {
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
    const onLeave = event => { if (drafts.size) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', onLeave);
    return () => { style.remove(); window.removeEventListener('beforeunload', onLeave); };
  });
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'kont' }, Workstation));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'kont', order: 10, label: 'KONT 工作现场' }, Icon));
};
