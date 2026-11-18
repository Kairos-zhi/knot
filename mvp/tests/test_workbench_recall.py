"""RECALL-UX-004: retained originals, honest projections, and global navigation.

Synthetic manifests and the shared Node DOM model only; no browser interaction.
"""
from test_workbench_capture import observation, reply, run_capture
from test_workbench_projects import PAGE, Structure, run_projects
from test_workbench_work_review import run_review


def test_fourteen_plain_messages_are_readable_without_selection_or_material_disclosure():
    sources = [observation(f'完整人类记录 {i}：普通正文、提问？继续执行。\n第二行 <img src=x> 😀', i)
               for i in range(14)]
    run_capture(r'''
const scene=copy(sceneA);scene.decisions=null;scene.snapshots=[scene.snapshots[1]];
respond=()=>scene;await execute('openProject(sceneA.project_id)');
assert.equal(originalRows().length,14);
for(const source of scene.observations){
  const row=originalRows().find(row=>row.children.some(node=>node.tagName==='PRE'&&node.textContent===source.text));
  assert(row);assert(!row.hidden);assert(!row.children.some(node=>node.tagName==='DETAILS'));
}
assert.equal(els['project-observations-section'].hidden,false);
assert.equal(els['project-recap-section'].hidden,true);
assert.equal(els['project-detail-view'].hidden,true);
assert.equal(els['project-versions'].hidden,true);
assert.equal(els['project-timeline'].disabled,true);
assert.equal(els['project-materials-section'].open,false);
assert.equal(els['project-choice-sections'].className,'choice-sections single-section');
assert(flat(els['project-date-status']).includes('14 条原话'));
assert(!flat(els['project-observations']).includes('原因未知'));
assert.equal(calls.filter(call=>call.url.startsWith('/api/project?')).length,1);
assert.equal(calls.filter(call=>call.options.method==='POST').length,0);
''', observations=sources)


def test_structured_answers_are_complete_natural_text_and_exact_envelope_remains_in_source():
    import json
    items = [dict(questionItemId='id-a', question='为什么如此？', answer='  多行回答😀\n' + '长原话'*100),
             dict(questionItemId='id-b', question='确认决定吗？', answer='继续运行测试。')]
    raw = '<send_user_message_question_reply>\n' + json.dumps(items, ensure_ascii=False) + '\n</send_user_message_question_reply>'
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const source=sceneA.observations[0],answers=JSON.parse(source.text.split('\n')[1]);
const row=originalRows()[0];
assert.equal(row.children.find(node=>node.tagName==='PRE').textContent,answers.map(item=>item.answer).join('\n\n'));
assert(!flat(row).includes('为什么如此'));assert(!flat(row).includes('questionItemId'));
assert(!flat(row).includes('send_user_message_question_reply'));
execute('selectProjectObservation(projectCards.find(card=>card.observation).id)');
const details=els['project-detail-content'],record=details.children.find(node=>node.tagName==='DETAILS');
assert.equal(record.open,false);assert(record.children.some(node=>node.tagName==='PRE'&&node.textContent===source.text));
for(const answer of answers)assert(flat(record).includes(answer.question));
for(const key of ['asset_id','content_hash','thread_id','message_id'])assert(flat(record).includes(source[key]));
els['project-read-mode'].value='clues';els['project-read-mode'].events.change[0]();
assert.equal(originalRows().length,1); // long answer retained; command is no decision candidate
assert.equal(originalRows()[0].children.find(node=>node.tagName==='PRE').textContent,answers[0].answer);
assert(flat(els['project-observations']).includes('候选'));
assert(!flat(els['project-observations']).includes(answers[1].answer));
''', observations=[observation(raw)])


def test_clues_have_explicit_basis_no_cap_and_preserve_repeated_sources_and_all_restore():
    sources = [observation(reply('这是回答原文，不含固定偏好关键词。'), i) for i in range(5)]
    run_capture(r'''
respond=()=>({...sceneA,decisions:null});await execute('openProject(sceneA.project_id)');
const original=JSON.stringify(execute('projectScene')),before=calls.length;
els['project-read-mode'].value='clues';els['project-read-mode'].events.change[0]();
assert.equal(originalRows().length,5);
for(const card of execute('projectCards.filter(card=>card.observation)')){
  assert.equal(card.item,undefined);assert.equal(card.excerpt.quote,'这是回答原文，不含固定偏好关键词。');
  assert(card.observation.text.includes(card.excerpt.quote));
}
assert(flat(els['project-filter-status']).includes('不判定决定与因果'));
assert(flat(els['project-observations']).includes('线索依据：结构化回复的 answer'));
els['project-recall-query'].value='不存在的检索';els['project-recall-query'].events.input[0]();
assert.equal(originalRows().length,0);
assert(flat(els['project-filter-status']).includes('0 / 5'));
els['project-show-all'].events.click[0]();
assert.equal(els['project-read-mode'].value,'all');assert.equal(els['project-recall-query'].value,'');
assert.equal(originalRows().length,5);
assert.equal(JSON.stringify(execute('projectScene')),original);assert.equal(calls.length,before);
''', observations=sources)


def test_date_slider_uses_selected_manifest_message_days_and_clears_future_detail_without_fetch():
    run_capture(r'''
ctx.Date=class extends Date{static now(){return Date.parse('2026-11-18T08:00:00Z');}};
const source=sceneA.observations[0],scene=copy(sceneA);
const make=(index,stamp)=>({...source,asset_id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(index).padStart(12,'0'),message_id:'m'+index,text:'Original day '+index,message_time_ms:Date.parse(stamp)});
scene.saved_at=Date.parse('2026-12-20T00:00:00Z');
scene.observations=[make(3,'2026-11-18T01:00:00Z'),make(1,'2026-11-16T16:00:00Z'),make(0,'2026-11-16T15:59:59Z'),make(2,'2026-11-17T15:59:59Z')];
respond=()=>scene;await execute('openProject(sceneA.project_id)');
const original=execute('projectScene'),before=calls.length;
assert.equal(els['project-date-range'].max,'2');assert.equal(els['project-date-range'].disabled,false);
assert.equal(els['project-date-start'].textContent,'2026-11-16');assert.equal(els['project-date-end'].textContent,'2026-11-18');
execute('selectProjectObservation(projectCards.find(card=>card.observation?.text==="Original day 3").id)');
els['project-date-range'].value='1';els['project-date-range'].events.input[0]();
assert.equal(execute('projectCutoff'),'2026-11-17');
assert.equal(originalRows().length,4);
assert.equal(els['project-detail-view'].hidden,true);assert.equal(els['project-detail-content'].children.length,0);
assert(flat(els['project-observations']).includes('Original day 3'));
assert(flat(els['project-observations']).includes('Original day 2'));
assert(flat(els['project-date-status']).includes('当前留存 4 条原话'));
assert(els['project-date-range'].attrs['aria-valuetext'].includes('2026-11-17'));
assert.equal(els['project-recap-section'].hidden,false);assert.equal(els['project-background'].hidden,false);
assert.equal(els['project-materials-section'].hidden,false);assert.equal(els['work-review'].hidden,false);
assert.equal(execute('projectScene'),original);assert.equal(calls.length,before);
els['project-date-all'].events.click[0]();
assert.equal(execute('projectCutoff'),null);assert.equal(originalRows().length,4);
assert.equal(els['project-recap-section'].hidden,false);assert.equal(els['project-materials-section'].hidden,false);
assert.equal(els['work-review'].hidden,false);assert.equal(calls.length,before);
const old=copy(scene);Object.assign(old,old.snapshots[0]);old.observations=old.observations.filter(item=>item.text==='Original day 0');
respond=()=>old;await execute('selectProjectSnapshot(0)');
assert.equal(originalRows().length,1);assert.equal(els['project-date-start'].textContent,'2026-11-16');assert.equal(els['project-date-end'].textContent,execute('projectCalendarEnd()'));
assert.equal(els['project-date-range'].disabled,false);assert.equal(execute('projectCutoff'),null);
assert(!flat(els['project-date-scope']).includes('2026-12-20'));
''')


def test_type_filters_separate_recap_documents_and_work_without_synthesizing_fields():
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const original=JSON.stringify(execute('projectScene')),before=calls.length;
for(const [mode,section] of [['originals','project-observations-section'],['recap','project-recap-section'],['documents','project-background'],['work','work-review']]){
  els['project-read-mode'].value=mode;els['project-read-mode'].events.change[0]();
  assert.equal(els[section].hidden,false);
  for(const other of ['project-observations-section','project-recap-section','project-background','work-review'])if(other!==section)assert.equal(els[other].hidden,true);
}
assert.equal(els['work-review'].open,true);
execute('restoreProjectRecords()');execute('selectProjectDecision("choice")');
assert(flat(els['project-detail-content']).includes('整理回顾 · 非原话，非新确认'));
assert(html.includes('连线仅表示阅读／整理顺序，不表示因果或依赖。'));
execute('selectProjectDecision("plan")');
assert(flat(els['project-detail-content']).includes('历史文档方案 · 不代表已确认决定'));
assert.equal(JSON.stringify(execute('projectScene')),original);assert.equal(calls.length,before);
''')


def test_pending_project_has_concrete_state_and_no_invented_scene_and_global_return_is_available():
    run_capture(r'''
payload.state.discovered[1].project_id='44444444-4444-4444-8444-444444444444';
respond=url=>url==='/api/capture-state'?payload.state:payload.list;await execute('pollCapture()');
const pending=payload.state.discovered[1],before=calls.length;
assert.equal(els['project-sidebar-list'].children.filter(node=>node.tagName==='BUTTON').length,3);
assert(flat(els['project-sidebar-list']).includes('Discovered only'));
assert(!flat(els['projects-list']).includes('Discovered only'));
assert.equal(execute('showDiscoveredProject("'+pending.project_id+'")'),true);
assert.equal(execute('projectScene'),null);assert.equal(els['project-scene'].hidden,true);
assert.equal(els['project-pending'].hidden,false);assert.equal(els['nav-projects'].hidden,false);
assert(flat(els['project-pending-status']).includes('没有符合捕获条件的对话'));
assert.equal(calls.length,before);
payload.state.discovered[1].eligible_threads=2;
await els['project-pending-refresh'].events.click[0]();
assert(flat(els['project-pending-status']).includes('2 个符合捕获条件的对话'));
assert(flat(els['project-pending-status']).includes('读取与保存仍待完成'));
assert.equal(execute('projectScene'),null);
await execute('showProjectOverview()');assert.equal(els['projects-overview'].hidden,false);
assert.equal(els['project-pending'].hidden,true);
assert.equal(els['capture-details'].open,false);
assert.equal(calls.filter(call=>call.url.startsWith('/api/project?')).length,0);
''')


def test_registration_only_retained_project_opens_materials_without_user_message_claim():
    run_projects(r'''
const scene=copy(sceneA);scene.title='Registered only';scene.decisions=null;
scene.materials[0].title='project-registration.json';scene.snapshots=[scene.snapshots[1]];
respond=()=>scene;await execute('openProject(sceneA.project_id)');
assert.equal(els['project-observations-section'].hidden,true);
assert.equal(els['project-recap-section'].hidden,true);assert.equal(els['project-date-browser'].hidden,false);
assert.equal(els['project-materials-section'].open,true);
assert(flat(els['project-material-list']).includes('仅登记，未保存原对话正文'));
assert(flat(els['project-material-list']).includes('非用户原话或决定'));
assert(flat(els['project-filter-status']).includes('仅有登记/材料，暂无已留存原话'));
assert.equal(els['project-versions'].hidden,true);
assert.equal(els['project-material-list'].children.length,1);
assert.equal(calls.filter(call=>call.url.startsWith('/api/project-material')).length,0);
''')


def test_canonical_list_is_authoritative_without_title_merging_or_legacy_project_resurrection():
    run_capture(r'''
respond=url=>url==='/api/capture-state'?payload.state:{items:[{...payload.list.items[0],title:'Knot'}]};
await execute('pollCapture()');
assert.equal(els['projects-list'].children.filter(node=>node.tagName==='BUTTON').length,1);
assert.equal(execute('projectItems.length'),1);
assert(!els['project-sidebar-list'].children.some(node=>flat(node).includes('Registered A')));
// An unrelated unlinked project with the same spelling remains distinct.
respond=url=>url==='/api/capture-state'?payload.state:{items:payload.list.items.map(item=>({...item,title:'Knot'}))};
await execute('pollCapture()');assert.equal(els['projects-list'].children.filter(node=>node.tagName==='BUTTON').length,2);
assert.equal(execute('projectItems.length'),2);
assert.equal(calls.filter(call=>call.options.method==='POST').length,0);
''')


def test_date_and_type_projection_preserve_work_review_draft_and_prepare_binding():
    run_review(r'''
await openReview();addQuote();
const original=JSON.stringify(execute('workReview')),before=calls.length;
els['project-read-mode'].value='originals';els['project-read-mode'].events.change[0]();
execute('selectProjectDate(0)');
assert.equal(execute('projectCutoff'),null);assert.equal(els['project-date-range'].disabled,true);
assert.equal(els['work-review-completed'].value,'Verified completed work');
assert.equal(JSON.stringify(execute('workReview')),original);assert.equal(calls.length,before);
els['project-show-all'].events.click[0]();
assert.equal(execute('projectCutoff'),null);assert.equal(JSON.stringify(execute('workReview')),original);
await prepareReview();const body=JSON.parse(calls.at(-1).options.body);
assert.equal(body.project_id,sceneA.project_id);assert.equal(body.revision,sceneA.revision);
assert.equal(body.manifest_hash,sceneA.manifest_hash);assert.equal(body.evidence[0].quote,'Original quote 0。');
''')


def test_sidebar_date_and_capture_markup_keep_global_controls_out_of_project_body():
    html = PAGE.read_text(encoding='utf-8')
    structure = Structure()
    structure.feed(html)
    nodes = structure.nodes
    sidebar = nodes['project-navigation']
    assert sidebar[0] == 'nav'
    assert nodes['project-date-range'][1]['aria-orientation'] == 'vertical'
    assert nodes['project-date-range'][1]['type'] == 'range'
    assert 'writing-mode:vertical-lr' in html
    assert html.index('id="project-navigation"') < html.index('id="project-date-browser"') < html.index('</aside>')
    assert html.index('id="project-date-browser"') < html.index('id="project-other-projects"') < html.index('id="capture-details"')
    assert nodes['project-other-projects'][0] == 'section'
    assert 'open' not in nodes['project-other-projects'][1]
    assert '<summary>其他项目</summary>' not in html
    assert any(attrs.get('id') == 'project-other-projects' for _, attrs in nodes['project-sidebar-list'][2])
    assert not any(attrs.get('id') == 'project-navigation' for _, attrs in nodes['project-sidebar-list'][2])
    assert any(attrs.get('id') == 'project-navigation' for _, attrs in nodes['project-current'][2])
    assert html.index('id="capture-details"') < html.index('</aside>')
    assert 'open' not in nodes['capture-details'][1]
    assert '过去完整快照' in html
    assert nodes['project-versions'][0] == 'details'
    assert '高级：实际留存版本' in html
    assert '.project-detail:not(.has-content){display:none}' in html


def test_seven_project_buttons_remain_visible_with_global_date_and_overview_one_step():
    run_capture(r'''
const items=[...payload.list.items,...Array.from({length:5},(_,i)=>({...payload.list.items[0],project_id:'55555555-5555-4555-8555-'+String(i).padStart(12,'0'),title:'Other '+i}))];
respond=url=>url==='/api/capture-state'?payload.state:{items};
await execute('pollCapture()');
assert.equal(els['project-sidebar-list'].children.filter(node=>node.tagName==='BUTTON').length,7);
assert.equal(els['project-other-projects'].hidden,false);assert.equal(els['project-other-projects'].open,false);
assert.equal(els['project-current'].hidden,true);
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
assert.equal(els['project-current'].textContent,sceneA.title);assert.equal(els['project-current'].hidden,false);
assert(flat(els['project-date-scope']).includes('最新'));
assert.equal(els['project-date-browser'].hidden,false);assert.equal(els['project-sidebar-list'].children.filter(node=>node.tagName==='BUTTON').length,7);
assert.equal(els['project-other-projects'].open,false);
respond=()=>sceneB;await els['project-sidebar-list'].children.filter(node=>node.tagName==='BUTTON')[1].events.click[0]();
assert.equal(execute('projectScene.project_id'),sceneB.project_id);
assert.equal(els['project-current'].textContent,sceneB.title);
respond=()=>({items});await els['nav-projects'].events.click[0]();
assert.equal(execute('projectRoute'),'overview');assert.equal(els['projects-overview'].hidden,false);
assert.equal(els['project-current'].hidden,true);assert.equal(els['project-date-browser'].hidden,false);
assert.equal(els['project-sidebar-list'].children.filter(node=>node.tagName==='BUTTON').length,7);assert.equal(els['project-other-projects'].open,false);
''')
