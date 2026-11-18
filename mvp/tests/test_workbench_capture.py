"""Capture UI contracts using synthetic sources and the existing Node DOM model."""
import copy
import json
import shutil
import subprocess

import pytest

from test_workbench_projects import A, B, HARNESS, LIST, PAGE, SCENE_A, SCENE_B, Structure


STATE = dict(phase='watching', scanned_at=1794700000000, last_saved_at=1794600000000,
             discovered=[dict(source_id=A, title='Registered A', project_id=A,
                              retained=True, eligible_threads=2),
                         dict(source_id=B, title='Discovered only', project_id=B,
                              retained=False, eligible_threads=0)],
             added_sources=1, retained_sources=8, issues=[], limited=False)


def observation(text, index=0, **overrides):
    return dict(asset_id=f'aaaaaaaa-aaaa-4aaa-8aaa-{index:012d}', content_hash='a'*64,
                title=f'Original source {index}', text=text, message_time_ms=1794500000000+index,
                thread_id=f'thread-{index}', message_id=f'message-{index}', **overrides)


def reply(answer, question='你希望首页第一眼更接近哪种画面？'):
    return '<send_user_message_question_reply>\n' + json.dumps(
        [dict(questionItemId='[...]', question=question, answer=answer)],
        ensure_ascii=False) + '\n</send_user_message_question_reply>'


CAPTURE_HARNESS = HARNESS.replace(
    'const calls=[];let sequence=0;',
    'const calls=[];let sequence=0;const timers=[];'
).replace(
    "if(url==='/api/projects')return payload.list;",
    "if(url==='/api/capture-state')return payload.state;"
    "if(url==='/api/projects')return payload.list;"
).replace(
    'const ctx=vm.createContext({document:',
    'const ctx=vm.createContext({...(payload.timers?{setTimeout:(fn,delay)=>'
    '{timers.push({fn,delay});return timers.length;}}:{}),document:'
).replace(
    "await execute('historyLoad');",
    "await execute('historyLoad');await execute('captureLoad');"
)


def run_capture(body, *, dataset=None, state=None, observations=None, timers=True):
    node = shutil.which('node')
    if not node:
        pytest.skip('Node required for capture UI contracts')
    scene = copy.deepcopy(SCENE_A)
    scene['observations'] = observations if observations is not None else [
        observation('我希望首页先看到几张重要决定卡片。\n完整原文 <img src=x onerror=alert(1)>')]
    result = subprocess.run(
        [node, '-e', CAPTURE_HARNESS + body +
         '\n})().catch(e=>{console.error(e);process.exitCode=1;});'],
        input=json.dumps(dict(page=str(PAGE), dataset=dataset if dataset is not None else
                             dict(projects='enabled', capture='enabled', write='disabled'),
                             list=LIST, state=STATE if state is None else state,
                             sceneA=scene, sceneB=SCENE_B, timers=timers)),
        capture_output=True, text=True, encoding='utf-8', timeout=20)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize('capture', [None, 'unknown', 'ENABLED', True, 'disabled'])
def test_legacy_project_mode_has_no_capture_request_or_timer(capture):
    dataset = dict(projects='enabled')
    if capture is not None:
        dataset['capture'] = capture
    run_capture(r'''
assert.deepEqual(calls.map(c=>c.url),['/api/projects']);
assert.equal(timers.length,0);
assert.equal(els['capture-line'].hidden,true);
assert.equal(await execute('pollCapture()'),false);
assert.equal(await execute('controlCapture()'),false);
assert.equal(calls.length,1);
''', dataset=dataset)


def test_capture_flag_alone_does_not_open_old_ui_or_start_polling():
    run_capture(r'''
assert.equal(calls.length,0);assert.equal(timers.length,0);
assert.equal(els['projects-pane'].hidden,true);
''', dataset=dict(capture='enabled'))


@pytest.mark.parametrize('timers', [True, False])
def test_explicit_capture_loads_one_state_and_tolerates_missing_timer_api(timers):
    run_capture(r'''
assert.deepEqual(calls.map(c=>c.url),['/api/projects','/api/capture-state']);
assert.equal(els['capture-line'].hidden,false);
assert.equal(els['capture-details'].open,false);
assert.equal(timers.length,payload.timers?1:0);
if(payload.timers)assert.equal(timers[0].delay,30000);
assert(flat(els['capture-status']).includes('最近对话'));
assert(flat(els['capture-discovered']).includes('Discovered only · 已发现，尚未留存'));
assert(!flat(els['projects-list']).includes('Discovered only'));
assert(!flat(els['capture-discovered']).includes('Registered A'));
assert(flat(els['projects-list']).includes('1 项整理回顾'));
''', timers=timers)


@pytest.mark.parametrize('phase,label', [('starting', '正在准备'), ('watching', '正在跟随'),
                                        ('paused', '已暂停'), ('unavailable', '暂不可用')])
def test_closed_phases_show_only_returned_status(phase, label):
    state = copy.deepcopy(STATE)
    state['phase'] = phase
    state['scanned_at'] = state['last_saved_at'] = None
    run_capture('assert(flat(els["capture-status"]).includes(' + json.dumps(label) + '));'
                'assert(flat(els["capture-times"]).includes("尚无记录"));', state=state)


def test_issue_codes_map_to_friendly_labels_unknown_code_is_never_echoed():
    codes = ['REGISTRY_UNAVAILABLE', 'REGISTRY_LIMIT', 'ROLLOUT_UNAVAILABLE', 'ROLLOUT_LIMIT',
             'ROLLOUT_INVALID', 'UNSUPPORTED_MESSAGES', 'INCOMPLETE_MESSAGE', 'MESSAGE_CONFLICT',
             'PROJECT_LIMIT', 'IMPORT_UNAVAILABLE', 'ACCESS_DENIED', 'AMBIGUOUS_PROJECT',
             'PRIVATE C:/sensitive/path', '__proto__']
    state = copy.deepcopy(STATE)
    state.update(issues=[dict(code=code, count=1) for code in codes], limited=True)
    run_capture(r'''
assert(flat(els['capture-status']).includes('本轮范围受限'));
assert(!flat(els['capture-issues']).includes('PRIVATE'));
assert(!flat(els['capture-issues']).includes('__proto__'));
assert.equal(els['capture-issues'].children.length,payload.state.issues.length);
for(const issue of payload.state.issues)assert(!flat(els['capture-issues']).includes(issue.code));
assert(flat(els['capture-issues']).includes('等待完整消息'));
''', state=state)


@pytest.mark.parametrize('change', [dict(phase='complete'), dict(scanned_at='yesterday'),
                                  dict(retained_sources=-1), dict(limited='yes'),
                                  dict(discovered=[dict(title='fake')])])
def test_invalid_state_is_not_presented_as_success(change):
    state = {**STATE, **change}
    run_capture(r'''
assert(flat(els['capture-status']).includes('待核对'));
assert.equal(els['capture-control'].disabled,false);
assert(!flat(els['capture-status']).includes('已暂停'));
assert.equal(els['projects-list'].children.filter(node=>node.tagName==='BUTTON').length,2);
''', state=state)


@pytest.mark.parametrize('count,accepted', [(116, True), (117, False)])
def test_discovery_limit_includes_sixteen_explicit_bindings(count, accepted):
    state = copy.deepcopy(STATE)
    state['discovered'] = [dict(source_id=f'11111111-1111-4111-8111-{index:012d}',
                                project_id=f'22222222-2222-4222-8222-{index:012d}',
                                title=f'Registered {index}', retained=False, eligible_threads=0)
                           for index in range(count)]
    run_capture('assert.equal(execute("captureFailure"),' + json.dumps(not accepted) + ');'
                'assert.equal(els["projects-list"].children.filter(node=>node.tagName==="BUTTON").length,2);', state=state)


def test_source_counts_do_not_turn_captured_messages_into_curated_decisions():
    run_capture(r'''
respond=url=>url==='/api/capture-state'?{...payload.state,limited:true}:
  {items:payload.list.items.map((item,index)=>({...item,title:index?'KNOT':'Knot',material_count:index?14:37,decision_count:index?0:4}))};
await execute('pollCapture()');
const cards=els['projects-list'].children.filter(node=>node.tagName==='BUTTON');
assert.equal(cards.length,2);assert.equal(cards[0].children[0].textContent,'Knot');assert.equal(cards[1].children[0].textContent,'KNOT');
assert(flat(cards[0]).includes('当前留存 37 份材料 · 4 项整理回顾'));
assert(flat(cards[1]).includes('当前留存 14 份材料'));
assert(!flat(cards[1]).includes('决定'));
const scene=copy(sceneA);scene.decisions=null;respond=()=>scene;await execute('openProject(sceneA.project_id)');
assert.equal(els['project-decisions-empty'].textContent,'暂无原回顾决定。');
assert.equal(originalRows().length,1);
''')


def test_control_posts_only_explicit_boolean_and_uses_the_returned_phase():
    run_capture(r'''
respond=(url,options)=>{
  assert.equal(url,'/api/capture-control');assert.equal(options.method,'POST');
  assert.equal(options.headers['X-Knot-Action'],'explicit');
  assert.equal(options.headers['Content-Type'],'application/json');
  const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body).sort(),['explicit','paused']);
  assert.equal(body.explicit,true);assert.equal(body.paused,true);
  return {...payload.state,phase:'watching'}; // requested pause is not a confirmed pause
};
await execute('controlCapture()');
assert(!flat(els['capture-status']).includes('已暂停'));
respond=()=>({...payload.state,phase:'paused'});await execute('controlCapture()');
assert(flat(els['capture-status']).includes('已暂停'));
assert.equal(els['capture-control'].textContent,'恢复');
respond=(url,options)=>{assert.equal(JSON.parse(options.body).paused,false);return payload.state;};
await execute('controlCapture()');assert.equal(els['capture-control'].textContent,'暂停');
const before=calls.length;
await assert.rejects(execute('captureRequest({explicit:true,paused:true,path:"C:/private"})'));
assert.equal(calls.length,before);
''')


def test_failed_control_recovers_controls_and_requires_state_check_without_repost():
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const card=originalRows()[0];
execute('selectProjectObservation(projectCards.find(c=>c.observation).id)');
const detail=[...els['project-detail-content'].children];
respond=()=>{throw Error('PRIVATE NETWORK PATH');};
await execute('controlCapture()');
assert.equal(els['capture-control'].disabled,false);
assert.equal(els['capture-control'].textContent,'核对状态');
assert(flat(els['capture-status']).includes('待核对'));
assert(!flat(els['capture-status']).includes('已暂停'));
assert(!flat(els['capture-status']).includes('PRIVATE'));
assert.equal(originalRows()[0],card);
assert.deepEqual(els['project-detail-content'].children,detail);
respond=(url,options)=>{assert(!options.method);return url==='/api/projects'?payload.list:{...payload.state,phase:'paused'};};
await execute('controlCapture()');
assert.equal(els['capture-control'].textContent,'恢复');
assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
assert.equal(els['project-detail-content'].children.length,0);
assert.equal(execute('projectSceneInvalidated'),true); // Legacy list cannot reauthorize cached originals.
''')


def test_inflight_control_blocks_poll_and_second_control_until_confirmed():
    run_capture(r'''
let release;respond=()=>new Promise(resolve=>release=resolve);
const pending=execute('controlCapture()'),before=calls.length;
assert.equal(els['capture-control'].disabled,true);
await execute('pollCapture()');await execute('controlCapture()');assert.equal(calls.length,before);
assert(!flat(els['capture-status']).includes('已暂停'));
release({...payload.state,phase:'paused'});await pending;
assert.equal(els['capture-control'].disabled,false);
assert(flat(els['capture-status']).includes('已暂停'));
''')


def test_timer_refresh_invalidates_legacy_reading_and_preserves_query_and_target():
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
execute('selectProjectObservation(projectCards.find(c=>c.observation).id)');
els['project-material-query'].value='my query';
const card=originalRows()[0],old=execute('projectScene');
const sidebar=[...els['project-detail-content'].children],focus=els['project-detail-title'].focused;
respond=url=>url==='/api/capture-state'?{...payload.state,last_saved_at:1794900000000}:
  {items:payload.list.items.map(item=>item.project_id===sceneA.project_id?{...item,revision:'3',manifest_hash:'f'.repeat(64)}:item)};
await timers.shift().fn();
assert.equal(timers.length,1);assert.equal(timers[0].delay,30000);
assert.equal(execute('projectScene'),old);assert.equal(originalRows().length,0);
assert.equal(els['project-detail-content'].children.length,0);assert.equal(execute('projectSceneInvalidated'),true);
assert.equal(els['project-detail-title'].focused,focus);assert.equal(els['project-material-query'].value,'my query');
assert.equal(els['project-latest'].hidden,false);
assert.equal(calls.filter(c=>c.url.startsWith('/api/project?')).length,2);
respond=()=>({...sceneA,revision:'3',manifest_hash:'f'.repeat(64),snapshots:[...sceneA.snapshots,{revision:'3',manifest_hash:'f'.repeat(64),saved_at:1794900000000}]});
await els['project-latest'].events.click[0]();
// The event handler starts the explicit project action; settle its fetch and render.
await new Promise(resolve=>setImmediate(resolve));
assert.equal(execute('projectScene.revision'),'3');assert.equal(els['project-latest'].hidden,true);
''')


def test_global_new_save_other_project_does_not_claim_current_project_changed():
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
respond=url=>url==='/api/capture-state'?{...payload.state,added_sources:99,last_saved_at:1794900000000}:
  {items:payload.list.items.map(item=>item.project_id===sceneB.project_id?{...item,revision:'3'}:item)};
await execute('pollCapture()');assert.equal(els['project-latest'].hidden,true);
''')


def test_overview_poll_is_non_destructive_on_failure_and_ignores_late_route_response():
    run_capture(r'''
const cards=[...els['projects-list'].children];
respond=url=>url==='/api/capture-state'?payload.state:{syntheticError:'ACCESS_DENIED'};
await execute('pollCapture()');assert.deepEqual(els['projects-list'].children,cards);
assert(flat(els['capture-counts']).includes('概览暂未更新'));
let release;respond=url=>url==='/api/capture-state'?payload.state:new Promise(resolve=>release=resolve);
const pending=execute('pollCapture()');await new Promise(resolve=>setImmediate(resolve));
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');
execute('selectProjectDecision("choice")');const sidebar=[...els['project-detail-content'].children];
release({items:[]});await pending;
assert.equal(execute('projectScene.project_id'),sceneB.project_id);
assert.deepEqual(els['project-detail-content'].children,sidebar);
respond=()=>{throw Error('PRIVATE');};await execute('pollCapture()');
assert.deepEqual(els['project-detail-content'].children,sidebar);
assert.equal(execute('projectScene.project_id'),sceneB.project_id);
''')


def test_overview_only_updates_on_real_list_change_and_never_invents_discovered_cards():
    run_capture(r'''
const original=[...els['projects-list'].children];
await execute('pollCapture()');assert.deepEqual(els['projects-list'].children,original);
respond=url=>url==='/api/capture-state'?payload.state:{items:[payload.list.items[0]]};
await execute('pollCapture()');assert.equal(els['projects-list'].children.filter(node=>node.tagName==='BUTTON').length,1);
assert(!flat(els['projects-list']).includes('Discovered only'));
''')


def test_all_originals_are_readable_without_three_excerpt_cap_or_keyword_classification():
    sources = [observation(f'我希望首页呈现重要选择与短原因，版本{i}。', i) for i in range(5)]
    sources += [observation('继续推进下一步并运行测试。', 10),
                observation('运行日志：我希望这一行不成为卡片。', 11),
                observation('我希望首页呈现重要选择与短原因，版本4。', 12)]
    run_capture(r'''
const scene=copy(sceneA);scene.decisions.items=Array.from({length:4},(_,i)=>({...scene.decisions.items[0],id:'decision-'+i}));
respond=()=>scene;await execute('openProject(sceneA.project_id)');
assert.equal(originalRows().length,scene.observations.length);
assert.equal(els['project-decisions'].children.length,4);
assert(flat(els['project-observations']).includes('运行日志'));
assert(flat(els['project-observations']).includes('继续推进'));
assert(!flat(els['project-observations']).includes('原因未知'));
for(const card of execute('projectCards.filter(c=>c.observation)')){
  assert.equal(card.excerpt,null);
  assert(flat(els['project-observations']).includes(card.observation.text));
  assert.equal(card.item,undefined); // sources never become archive/user-confirm records
}
els['project-read-mode'].value='clues';execute('setProjectReadMode()');
assert.equal(originalRows().length,0); // Preference words alone establish no candidate.
assert.equal(execute('projectScene.decisions.items.length'),4);
execute('restoreProjectRecords()');assert.equal(originalRows().length,scene.observations.length);
''', observations=sources)


def test_form_answer_is_verbatim_question_only_in_sidebar_full_source_and_time_literal():
    answer = '  几张重要决定卡片，点开才看到前因后果  '
    sources = [observation(reply(answer))]
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const source=sceneA.observations[0],answer=JSON.parse(source.text.split('\n')[1])[0].answer;
const original=[...originalRows()],recap=[...els['project-decisions'].children];
assert.equal(original[0].children.find(node=>node.tagName==='PRE').textContent,answer);
assert(!flat(original[0]).includes('你希望首页'));
const selected=execute('projectCards.find(c=>c.observation)');execute('selectProjectObservation('+JSON.stringify(selected.id)+')');
assert.deepEqual(originalRows(),original);assert.deepEqual(els['project-decisions'].children,recap);
const detail=els['project-detail-content'];
assert(detail.children.some(node=>node.tagName==='PRE'&&node.textContent===answer));
assert(flat(detail).includes('你希望首页第一眼'));
assert(flat(detail).includes('原消息时间：'+execute('captureDate(projectScene.observations[0].message_time_ms)')));
for(const value of [source.asset_id,source.content_hash,source.thread_id,source.message_id])assert(flat(detail).includes(value));
const record=detail.children.find(node=>node.tagName==='DETAILS');
assert(record);assert.equal(record.open,false);assert.equal(record.children[0].textContent,'来源记录');
assert(record.children.some(node=>node.tagName==='PRE'&&node.textContent===source.text));
assert.equal(record.children.filter(node=>node.tagName==='CODE').length,4);
assert(!detail.children.some(node=>node.tagName==='CODE'));
assert(!flat(detail).includes('原因'));assert(!flat(detail).includes('user_confirm'));
execute('clearProjectDetail(true)');assert.equal(selected.button.focused,1);
assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
''', observations=sources)


@pytest.mark.parametrize('text', [
    '继续', '继续推进下一步并运行测试。', '我选择先执行下一步并跑测试。', '运行日志：我希望首页显示这段日志。',
    '我希望首页显示卡片吗？',
    reply('几张重要决定卡片，点开才看到前因后果').replace('</send_user_message_question_reply>', ''),
    reply('几张重要决定卡片，点开才看到前因后果') + ' trailing',
    '<send_user_message_question_reply>[{"questionItemId":"x","question":"q","answer":true}]</send_user_message_question_reply>',
    '<send_user_message_question_reply>[{"question":"q","answer":"几张重要决定卡片"}]</send_user_message_question_reply>',
    '<send_user_message_question_reply>{"questionItemId":"x","question":"q","answer":"几张重要决定卡片"}</send_user_message_question_reply>',
    '<send_user_message_question_reply>not json 我希望不能用普通原话兜底。</send_user_message_question_reply>',
    reply('继续推进下一步并运行测试。'),
])
def test_commands_questions_and_malformed_forms_remain_readable_but_make_no_candidates(text):
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
assert.equal(originalRows().length,1);
assert(flat(els['project-observations']).includes(execute('observationNaturalText(projectScene.observations[0])')));
assert.equal(els['project-decisions'].children.length,1);
els['project-read-mode'].value='clues';execute('setProjectReadMode()');
assert.equal(originalRows().length,0);
assert.equal(els['project-observations-empty'].hidden,false);
assert.equal(execute('projectScene.decisions.items.length'),2);
execute('restoreProjectRecords()');assert.equal(originalRows().length,1);
''', observations=[observation(text)])


def test_search_covers_unselected_body_and_progress_messages_but_not_other_scene_or_revision():
    sources = [observation('普通记录：正文里的独特检索词，不是偏好。', 0)] + [
        observation(f'我希望首页呈现几张重要选择卡片，条目{i}。', i+1) for i in range(4)]
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const cards=[...originalRows()],before=calls.length;
els['project-material-query'].value='独特检索词';execute('renderProjectMaterials()');
assert.equal(calls.length,before);assert.deepEqual(originalRows(),cards);
const result=els['project-material-list'].children[0],reader=result.children.find(node=>node.tagName==='BUTTON');
reader.events.click[0]();assert(flat(els['project-detail-content']).includes('独特检索词'));
respond=()=>({...sceneA,revision:'1',observations:[]});await execute('openProject(sceneA.project_id,"1")');
els['project-material-query'].value='独特检索词';execute('renderProjectMaterials()');
assert(!flat(els['project-material-list']).includes('Original source'));
assert(!flat(els['project-detail-content']).includes('独特检索词'));
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');reader.events.click[0]();
assert.equal(els['project-detail-content'].children.length,0);
assert.equal(originalRows().length,0);
''', observations=sources)


def test_search_distinguishes_same_day_titles_with_literal_matching_snippets():
    sources = [observation('前文😀'*40 + 'UniqueMarker <img src=x onerror=alert(1)> 原话尾部'*4, 0),
               observation('另一句原话里的 UniqueMarker，是不同的项目偏好。', 1)]
    for source in sources:
        source['title'] = 'Codex·2026-11-17'
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const before=calls.length;
els['project-material-query'].value='UNIQUEMARKER';execute('renderProjectMaterials()');
const rows=els['project-material-list'].children;
assert.equal(rows.length,2);
const snippets=rows.map(row=>row.children.find(node=>node.className==='observation-match').textContent);
assert.notEqual(snippets[0],snippets[1]);
for(let i=0;i<rows.length;i++){
  assert.equal(rows[i].children[0].textContent,'Codex·2026-11-17');
  assert(Array.from(snippets[i]).length<=80);assert(snippets[i].includes('UniqueMarker'));
  assert(sceneA.observations[i].text.includes(snippets[i]));
}
assert(snippets[0].includes('<img src=x onerror=alert(1)>'));
rows[0].children.find(node=>node.tagName==='BUTTON').events.click[0]();
assert(els['project-detail-content'].children.some(node=>node.tagName==='PRE'&&node.textContent===sceneA.observations[0].text));
assert.equal(calls.length,before); // search and disclosure use the selected retained scene
''', observations=sources)


def test_form_search_prefers_answer_then_question_and_omits_wrapper_metadata():
    items = [dict(questionItemId='首页-包装标识-99', question='首页第一眼应该更接近哪种画面？',
                  answer='几张首页重要决定卡片，原话含"引号"与😀')]
    raw = '<send_user_message_question_reply>\n' + json.dumps(items) + '\n</send_user_message_question_reply>'
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const source=sceneA.observations[0],item=JSON.parse(source.text.split('\n')[1])[0];
for(const [query,expected] of [['首页',item.answer],['第一眼',item.question]]){
  els['project-material-query'].value=query;execute('renderProjectMaterials()');
  const row=els['project-material-list'].children[0];
  assert.equal(row.children.find(node=>node.className==='observation-match').textContent,expected);
  row.children.find(node=>node.tagName==='BUTTON').events.click[0]();
  const record=els['project-detail-content'].children.find(node=>node.tagName==='DETAILS');
  assert(record.children.some(node=>node.tagName==='PRE'&&node.textContent===source.text));
  assert(els['project-detail-content'].children.some(node=>node.tagName==='PRE'&&node.textContent===item.answer));
}
for(const query of ['包装标识-99','questionItemId','send_user_message_question_reply']){
  els['project-material-query'].value=query;execute('renderProjectMaterials()');
  assert(!els['project-material-list'].children.some(row=>row.children.some(node=>node.className==='observation-match')));
}
''', observations=[observation(raw)])


def test_matching_snippet_caps_eighty_characters_without_splitting_unicode_or_rewriting():
    raw = '前文😀'*80 + '匹配' + '😀'*75 + '原样尾部'
    run_capture(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
const query='匹配'+'😀'.repeat(75);
els['project-material-query'].value=query;execute('renderProjectMaterials()');
const row=els['project-material-list'].children[0];
const snippet=row.children.find(node=>node.className==='observation-match').textContent;
assert.equal(Array.from(snippet).length,80);assert(snippet.includes(query));
assert(sceneA.observations[0].text.includes(snippet));
assert(!Array.from(snippet).some(character=>/^[\uD800-\uDFFF]$/.test(character)));
''', observations=[observation(raw)])


def test_untrusted_full_text_is_literal_and_revoked_source_has_no_projection_residue():
    run_capture(r'''
const scene=copy(sceneA);scene.observations[0].asset_id=scene.materials[0].asset_id;
respond=()=>scene;await execute('openProject(sceneA.project_id)');
const id=execute('projectCards.find(c=>c.observation).id');execute('selectProjectObservation('+JSON.stringify(id)+')');
assert(flat(els['project-detail-content']).includes('<img src=x onerror=alert(1)>'));
respond=()=>({syntheticError:'ACCESS_DENIED'});await execute('readProjectMaterial(projectScene.materials[0])');
assert.equal(originalRows().length,0);
assert(!flat(els['project-detail-content']).includes('<img'));
assert(!execute('selectProjectObservation('+JSON.stringify(id)+')'));
''')


def test_observations_are_optional_and_bad_identity_hash_or_time_are_not_displayed():
    run_capture(r'''
const scene=copy(sceneA),source=scene.observations[0];
scene.observations=[{...source,asset_id:'bad'},{...source,content_hash:'bad'},{...source,message_time_ms:null},{...source,message_id:''}];
respond=()=>scene;await execute('openProject(sceneA.project_id)');assert.equal(originalRows().length,0);
delete scene.observations;await execute('openProject(sceneA.project_id)');
assert.equal(els['project-observations-section'].hidden,true);assert.equal(els['project-decisions'].children.length,1);
''')


def test_capture_markup_keeps_details_outside_cards_and_import_secondary():
    structure = Structure()
    html = PAGE.read_text(encoding='utf-8')
    structure.feed(html)
    nodes = structure.nodes
    assert 'primary' not in nodes['project-import-new'][1].get('class', '').split()
    assert nodes['capture-details'][0] == 'details'
    assert 'open' not in nodes['capture-details'][1]
    assert 'hidden' in nodes['capture-line'][1]
    assert 'data-capture' not in html.split('<body', 1)[1].split('>', 1)[0]
    assert not any(attrs.get('id') == 'project-observations'
                   for _, attrs in nodes['project-detail'][2])
    assert nodes['project-observations-section'][0] == 'section'
    assert 'position:fixed' in html and '.project-detail.has-content' in html
