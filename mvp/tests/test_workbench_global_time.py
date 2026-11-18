"""Global date projections in Node DOM; reusable with GET catalog/scene payloads.

run_global(body, catalog=<ProjectList>, scenes={<project_id>: <ProjectScene>})
accepts arbitrary authorized responses. GLOBAL_HARNESS also accepts that JSON
through stdin (list/scenes/page/dataset/state/timers/sceneA/sceneB keys).
No browser, screenshots, simulated clicks, live stores, or deployment.
"""
import copy
import json
import shutil
import sqlite3
import subprocess

import pytest

from test_workbench_capture import CAPTURE_HARNESS, STATE, observation
from test_workbench_projects import A, B, LIST, PAGE, SCENE_A, SCENE_B, Structure
from test_workbench_recap_edit import SETUP as EDIT_SETUP
from test_workbench_work_review import SETUP as REVIEW_SETUP
from test_project_http import env, call, body as http_import
from test_project_repo import captured_source
from test_contract_schema import definition_validator
from mvp.devtools.codex_capture import registration_document


EARLY = 1792166400000  # 2026-10-17 in Shanghai
LATER = EARLY + 10 * 86400000
LAST = LATER + 20 * 86400000
UNKNOWN = '33333333-3333-4333-8333-333333333333'


def chronology(stamp, basis='registry_created', times=()):
    value = dict(appearance_at=stamp, appearance_basis=basis,
                 observation_times=list(times), observation_count=len(times))
    if basis != 'first_saved':
        value['appearance_source'] = dict(asset_id=SCENE_A['materials'][0]['asset_id'],
                                          content_hash='a'*64)
    return value


CATALOG = copy.deepcopy(LIST)
CATALOG['items'][0]['chronology'] = chronology(EARLY, times=[EARLY, LAST])
CATALOG['items'][1]['chronology'] = chronology(LATER, 'first_message', [LATER])
CATALOG['items'].append(dict(CATALOG['items'][0], project_id=UNKNOWN, title='Legacy'))
del CATALOG['items'][-1]['chronology']
SCENES = {A: copy.deepcopy(SCENE_A), B: copy.deepcopy(SCENE_B)}
for project_id, stamps in ((A, (EARLY, LAST)), (B, (LATER,))):
    scene = SCENES[project_id]
    scene['observations'] = []
    for index, stamp in enumerate(stamps):
        source = observation(f'{scene["title"]} exact original {index}', index)
        source['message_time_ms'] = stamp
        scene['observations'].append(source)
    scene['materials'] += [{k: source[k] for k in ('asset_id', 'content_hash', 'title')}
                           for source in scene['observations']]


GLOBAL_HARNESS = CAPTURE_HARNESS.replace(
    "if(url==='/api/projects')return payload.list;",
    "if(url==='/api/projects')return payload.list;"
    "if(url.startsWith('/api/project?')){"
    "const params=new URLSearchParams(url.split('?')[1]);"
    "const scene=payload.scenes[params.get('project_id')];"
    "if(!scene)throw Error('Scene not supplied');return scene;}"
)


def run_global(body, *, catalog=None, scenes=None, dataset=None):
    """Run the real page script against supplied catalog/scenes, with no live IO."""
    node = shutil.which('node')
    assert node, 'Node is required for global-time DOM evidence'
    scene_map = SCENES if scenes is None else scenes
    supplied = list(scene_map.values())
    payload = dict(page=str(PAGE), list=CATALOG if catalog is None else catalog,
                   scenes=scene_map, sceneA=supplied[0] if supplied else SCENE_A,
                   sceneB=supplied[1] if len(supplied) > 1 else SCENE_B,
                   state=STATE, timers=True,
                   dataset=dataset if dataset is not None else dict(projects='enabled'))
    result = subprocess.run(
        [node, '-e', GLOBAL_HARNESS + body +
         '\n})().catch(e=>{console.error(e);process.exitCode=1;});'],
        input=json.dumps(payload, ensure_ascii=False), capture_output=True,
        text=True, encoding='utf-8', timeout=20)
    assert result.returncode == 0, result.stderr
    return result


HELPERS = r'''
const projectButtons=id=>els[id].children.filter(node=>node.tagName==='BUTTON');
const ids=id=>projectButtons(id).map(node=>node.dataset.projectId);
const days=()=>Array.from(execute('projectDateDays()'));
const selectDay=day=>execute('selectProjectDate('+execute('projectCalendarIndex('+JSON.stringify(day)+')')+')');
const early=days()[0],middle=days()[1],last=days().at(-1);
'''


def test_global_stations_and_collection_change_immediately_without_reads():
    run_global(HELPERS + r'''
assert.equal(execute('projectCutoff'),null);
assert.equal(els['project-date-browser'].hidden,false);
assert.equal(days().length,3);
assert.equal(els['project-date-start'].textContent,early);
assert.equal(els['project-date-end'].textContent,execute('projectCalendarEnd()'));
assert(flat(els['project-date-scope']).includes('最新'));
assert.equal(Number(els['project-date-range'].max),execute('projectCalendarIndex(projectCalendarEnd())'));
const before=calls.length;
selectDay(early);
assert.deepEqual(ids('projects-list'),[sceneA.project_id,payload.list.items[2].project_id]);
assert.equal(ids('project-sidebar-list').length,payload.list.items.length);assert(flat(els['project-sidebar-list']).includes('此日之后'));
assert(projectButtons('projects-list')[0].className.includes('is-new'));
assert(flat(projectButtons('projects-list')[0]).includes('当天出现'));
assert(flat(els['projects-list']).includes('日期待核'));
selectDay(middle);
assert.equal(projectButtons('projects-list')[0].dataset.projectId,sceneB.project_id);
assert(flat(projectButtons('projects-list')[0]).includes('当天出现'));
assert.equal(projectButtons('projects-list')[1].className,'project-card');
assert(flat(els['projects-list']).includes('当前留存'));
assert(flat(els['projects-list']).includes('当前持有'));
assert(flat(els['projects-list']).includes('非历史完整快照'));
assert(els['focus-subtitle'].textContent.includes(middle));
assert.equal(calls.length,before);
execute('latestProjectDate()');assert.equal(execute('projectCutoff'),null);
assert.equal(ids('projects-list').length,payload.list.items.length);
''')


def test_enter_overview_switch_pending_and_version_keep_one_global_date():
    run_global(HELPERS + r'''
selectDay(middle);const originalDays=days();
await execute('openProject(sceneA.project_id)');
assert.equal(execute('projectCutoff'),middle);
assert(originalRows().length>=1);
assert(flat(els['project-observations']).includes('exact original 1')); // Date focus does not truncate the scrollable retained records.
await execute('showProjectOverview()');assert.equal(execute('projectCutoff'),middle);
assert.equal(els['project-date-browser'].hidden,false);assert.deepEqual(days(),originalDays);
await execute('openProject(sceneB.project_id)');assert.equal(execute('projectCutoff'),middle);
assert(originalRows().length>=1);
respond=()=>({...sceneB,...sceneB.snapshots[0]});
await execute('selectProjectSnapshot(0)');assert.equal(execute('projectCutoff'),middle);
assert.deepEqual(days(),originalDays);
assert(els['focus-subtitle'].textContent.includes(middle));
assert.equal(els['focus-status'].hidden,true);
const pending={project_id:'66666666-6666-4666-8666-666666666666',title:'Pending',retained:false,eligible_threads:0};
execute('captureState='+JSON.stringify({discovered:[pending]}));
assert.equal(execute('showDiscoveredProject('+JSON.stringify(pending.project_id)+')'),true);
assert.equal(execute('projectCutoff'),middle);assert.equal(execute('projectScene'),null);
''')


def test_project_before_appearance_explains_and_offers_today_without_switching_target():
    run_global(HELPERS + r'''
await execute('openProject(sceneB.project_id)');selectDay(early);
assert.equal(execute('projectScene.project_id'),sceneB.project_id);
assert.equal(els['project-before-appearance'].hidden,false);
assert(flat(els['project-before-description']).includes('最早已留存原话'));
assert(flat(els['project-before-description']).includes('编辑目标保持不变'));
assert.deepEqual(ids('project-day-projects'),[sceneA.project_id]);
assert.equal(originalRows().length,1);assert(els['focus-subtitle'].textContent.includes('全部可读记录'));
assert.equal(els['focus-title'].textContent,sceneB.title);
await execute('openProject(sceneA.project_id)');assert.equal(execute('projectCutoff'),early);
assert.equal(els['project-before-appearance'].hidden,true);
execute('latestProjectDate()');assert.equal(execute('projectCutoff'),null);
assert.equal(originalRows().length,2);
''')


def test_all_appearance_bases_are_literal_and_legacy_saved_at_never_establishes_creation():
    catalog = copy.deepcopy(CATALOG)
    catalog['items'].append(dict(catalog['items'][0], project_id='44444444-4444-4444-8444-444444444444',
                                 title='<script>Same title</script>',
                                 chronology=chronology(LAST, 'first_saved')))
    catalog['items'][0]['title'] = '<script>Same title</script>'
    run_global(HELPERS + r'''
assert(flat(els['projects-list']).includes('登记材料记载的登记时间'));
assert(flat(els['projects-list']).includes('最早已留存原话'));
assert(flat(els['projects-list']).includes('首次留存'));
assert.equal(projectButtons('projects-list').length,payload.list.items.length);
assert.equal(new Set(ids('projects-list')).size,payload.list.items.length);
assert.equal(days().length,3);
assert(!days().includes(execute('projectMessageDay(projectItems[2].saved_at)')));
assert(flat(els['projects-list']).includes('<script>Same title</script>'));
''', catalog=catalog)


@pytest.mark.parametrize('change', [
    {'appearance_source': None}, {'appearance_basis': 'invented'},
    {'appearance_at': -1}, {'observation_times': [LAST, EARLY]},
])
def test_invalid_chronology_stays_readable_as_unknown(change):
    catalog = copy.deepcopy(CATALOG)
    catalog['items'] = [catalog['items'][0]]
    catalog['items'][0]['chronology'].update(change)
    run_global(HELPERS + r'''
assert.equal(projectButtons('projects-list').length,1);
assert(flat(els['projects-list']).includes('日期待核'));
assert.equal(days().length,0);assert.equal(els['project-date-range'].disabled,true);
assert.equal(els['project-date-browser'].hidden,false);
''', catalog=catalog)


def test_polling_updates_global_stations_without_resetting_cursor_scene_or_detail():
    run_global(HELPERS + r'''
selectDay(middle);await execute('openProject(sceneA.project_id)');
execute('selectProjectObservation(projectCards.find(card=>card.observation).id)');
const body=els['project-detail-content'].children.slice(),scene=execute('projectScene');
const extra={...payload.list.items[0],project_id:'55555555-5555-4555-8555-555555555555',title:'Newly appeared',chronology:{...payload.list.items[0].chronology,appearance_at:Date.parse(middle+'T00:00:00+08:00'),observation_times:[],observation_count:0}};
respond=url=>url==='/api/capture-state'?payload.state:{items:[...payload.list.items,extra]};
await execute('pollCapture()');
assert.equal(execute('projectCutoff'),middle);assert.equal(execute('projectScene'),scene);
assert.deepEqual(els['project-detail-content'].children,body);
assert(ids('projects-list').includes(extra.project_id));
assert(projectButtons('projects-list').filter(node=>flat(node).includes('当天出现')).length>=2);
assert(els['project-date-range'].attrs['aria-valuetext'].includes(middle));
assert.equal(calls.filter(call=>call.url.startsWith('/api/project?')).length,1);
''', dataset=dict(projects='enabled', capture='enabled'))


def test_work_and_recap_edits_block_date_latest_and_navigation_until_explicit_end():
    run_global(REVIEW_SETUP + HELPERS + r'''
await openReview();addQuote();const before=calls.length,binding=execute('workReview.binding.project_id');
assert.equal(els['project-date-range'].disabled,true);
assert.equal(execute('selectProjectDate(0)'),false);
assert.equal(execute('latestProjectDate()'),false);
assert.equal(await execute('showProjectOverview()'),false);
assert.equal(await execute('openProject(sceneB.project_id)'),false);
assert.equal(els['work-review-completed'].value,'Verified completed work');
assert.equal(execute('workReview.binding.project_id'),binding);assert.equal(calls.length,before);
assert.equal(els['project-edit-warning'].hidden,false);
execute('endProjectEditing()');respond=url=>url==='/api/projects'?payload.list:sceneB;
assert.equal(await execute('openProject(sceneB.project_id)'),true);
''')
    run_global(EDIT_SETUP + HELPERS + r'''
await openEditor();const before=calls.length;
assert.equal(execute('selectProjectDate(0)'),false);
assert.equal(execute('latestProjectDate()'),false);
assert.equal(await execute('openProject(sceneB.project_id)'),false);
assert.equal(execute('clearProjectDetail(true)'),false);
assert.equal(els['recap-edit-title'].value,'Revised <script>title</script>');
assert.equal(calls.length,before);execute('endProjectEditing()');
assert.equal(execute('recapEdit'),null);assert.equal(execute('selectProjectDate(0)'),true);
''')


def test_unknown_save_maps_survive_date_and_navigation_with_identical_retry():
    run_global(REVIEW_SETUP + HELPERS + r'''
await openReview();await prepareReview();respond=()=>{throw Error('Lost reply');};
await execute('saveWorkReview()');const serialized=calls.at(-1).options.body,key=execute('workReview.key');
assert.equal(execute('workReviewSaves.get(workReview.key).phase'),'unknown');
assert.equal(els['project-date-range'].disabled,false);
selectDay(early);respond=url=>url==='/api/projects'?payload.list:sceneB;
await execute('openProject(sceneB.project_id)');await execute('showProjectOverview()');
assert.equal(execute('projectCutoff'),early);
assert.equal(execute('workReviewSaves.get('+JSON.stringify(key)+').serialized'),serialized);
execute('latestProjectDate()');respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
respond=(url,options)=>{assert.equal(options.body,serialized);return receipt;};
await execute('saveWorkReview()');assert.equal(execute('workReviewSaves.get(workReview.key).phase'),'saved');
''')


def test_sidebar_is_open_global_and_compact_on_narrow_screens():
    html = PAGE.read_text(encoding='utf-8')
    structure = Structure()
    structure.feed(html)
    assert structure.nodes['project-other-projects'][0] == 'section'
    assert '<summary>其他项目</summary>' not in html
    assert html.index('id="project-date-start"') < html.index('id="project-date-end"')
    assert '.project-date-track input{direction:ltr}' in html
    compact = html.rsplit('@media(max-width:700px)', 1)[1].split('</style>')[0]
    assert '.app-shell{grid-template-columns:minmax(0,1fr)}' in compact
    assert 'position:static;min-height:0;max-height:none' in compact
    assert '.project-date-track input{height:88px}' in compact
    assert '#project-sidebar-list{max-height:200px;overflow-y:auto}' in compact


def test_same_day_projects_keep_stable_order_and_newest_projects_lead_overview():
    catalog = copy.deepcopy(CATALOG)
    twin = dict(catalog['items'][1], project_id='77777777-7777-4777-8777-777777777777', title='Same day')
    catalog['items'].append(twin)
    run_global(HELPERS + r'''
assert.deepEqual(ids('projects-list').slice(0,3),[sceneB.project_id,payload.list.items[3].project_id,sceneA.project_id]);
selectDay(middle);
assert.deepEqual(ids('projects-list').slice(0,2),[sceneB.project_id,payload.list.items[3].project_id]);
assert(projectButtons('projects-list').slice(0,2).every(node=>flat(node).includes('当天出现')));
assert.equal(els['project-date-range'].value,String(execute('projectCalendarIndex('+JSON.stringify(middle)+')')));
''', catalog=catalog)


def test_appearance_source_uses_existing_material_reader_only_in_latest_context():
    run_global(HELPERS + r'''
await execute('openProject(sceneA.project_id)');const before=calls.length;
assert(flat(els['project-appearance-info']).includes('登记材料记载的登记时间'));
assert(flat(els['project-appearance-info']).includes('阅读当前出现依据'));
assert.equal(calls.length,before);
respond=(url,options)=>{assert(url.startsWith('/api/project-material?'));assert(!options.method);return {...sceneA.materials[0],project_id:sceneA.project_id,revision:sceneA.revision,text:'Current appearance source'};};
await execute('readProjectMaterial(projectScene.materials[0])');
assert(flat(els['project-detail-content']).includes('Current appearance source'));
selectDay(early);assert.equal(els['project-detail-view'].hidden,true);
assert(flat(els['project-appearance-info']).includes('阅读当前出现依据'));
assert.equal(await execute('readProjectMaterial(projectScene.materials[0])'),true);
assert.equal(calls.length,before+2);
''')


@pytest.mark.parametrize('revoke_all', [False, True])
def test_real_http_revocation_cannot_resurrect_dates_or_cached_scene_detail(env, revoke_all):
    """Feed actual broker GET responses to Node, including omitted observations."""
    database, core, ui = env
    request = http_import()
    request['documents'] = [registration_document(dict(
        source_id=A, project_id=request['project_id'], title=request['title'],
        created_at_ms=EARLY - 86400000))]
    request['sources'] = [captured_source(text='Retained early original', message_id='early') | dict(message_time_ms=EARLY),
                          captured_source(text='Revoked late original', message_id='late') | dict(message_time_ms=LAST)]
    assert call(ui, '/api/project-import', request, broker=True)[0] == 200
    status, catalog, _ = call(ui, '/api/projects')
    assert status == 200
    status, original, _ = call(ui, '/api/project?project_id=' + request['project_id'])
    assert status == 200
    revoked = original['observations'] if revoke_all else [original['observations'][1]]
    with sqlite3.connect(database) as conn:
        conn.executemany('DELETE FROM asset_readers WHERE actor=? AND asset_id=?',
                         [('A', source['asset_id']) for source in revoked])
    status, after_catalog, _ = call(ui, '/api/projects')
    assert status == 200
    status, after_scene, _ = call(ui, '/api/project?project_id=' + request['project_id'])
    assert status == 200
    for value in (catalog, after_catalog):
        definition_validator('ProjectList').validate(value)
    for value in (original, after_scene):
        definition_validator('ProjectScene').validate(value)
    assert after_scene['has_unavailable']
    if revoke_all:
        assert 'observations' not in after_scene  # Real backend shape, not observations: [].
    run_global('const afterCatalog=' + json.dumps(after_catalog) + ';const afterScene=' + json.dumps(after_scene) + ';' + r'''
await execute('openProject(sceneA.project_id)');
execute('selectProjectObservation(projectCards.filter(card=>card.observation).at(-1).id)');
const revokedDay=execute('projectMessageDay(projectObservations().at(-1).message_time_ms)');
assert(Array.from(execute('projectDateDays()')).includes(revokedDay));
respond=()=>afterCatalog;await execute('refreshCapturedProjects()');
assert(!Array.from(execute('projectDateDays()')).includes(revokedDay));
assert.equal(execute('projectSceneInvalidated'),true);
assert.equal(originalRows().length,0);
assert.equal(els['project-detail-content'].children.length,0);
assert.equal(els['project-read-stale'].hidden,false);
execute('renderProjectScene()');execute('latestProjectDate()');
assert(!Array.from(execute('projectDateDays()')).includes(revokedDay));
assert(!flat(els['project-detail-content']).includes('Revoked late original'));
respond=()=>afterScene;assert.equal(await execute('recheckProjectScene()'),true);
assert.equal(execute('projectSceneInvalidated'),false);
assert(!Array.from(execute('projectDateDays()')).includes(revokedDay));
assert(!flat(els['project-observations']).includes('Revoked late original'));
assert.equal(calls.filter(call=>call.options.method==='POST').length,0);
''', catalog=catalog, scenes={request['project_id']: original})


def test_legacy_fallback_expires_on_unchanged_catalog_and_denied_reread_stays_hidden():
    legacy = copy.deepcopy(CATALOG)
    for item in legacy['items']:
        item.pop('chronology', None)
    run_global(r'''
await execute('openProject(sceneA.project_id)');
const oldDays=Array.from(execute('projectDateDays()'));assert(oldDays.length>0);
respond=()=>({syntheticError:'ACCESS_DENIED'});await execute('readProjectMaterial(projectScene.materials[0])');
assert.equal(execute('projectUnavailableMaterials.size'),1);
respond=()=>payload.list;await execute('refreshCapturedProjects()');
assert.equal(execute('projectSceneInvalidated'),true);
assert.equal(execute('projectDateDays().length'),0);
assert.equal(originalRows().length,0);
respond=()=>({syntheticError:'ACCESS_DENIED'});assert.equal(await execute('recheckProjectScene()'),false);
assert.equal(execute('projectDateDays().length'),0);assert.equal(els['project-read-stale'].hidden,false);
respond=()=>sceneA;assert.equal(await execute('recheckProjectScene()'),true);
assert.deepEqual(Array.from(execute('projectDateDays()')),oldDays);
assert.equal(execute('projectUnavailableMaterials.size'),0);
respond=()=>({...sceneA.materials[0],project_id:sceneA.project_id,revision:sceneA.revision,text:'Restored authorized material'});
assert.equal(await execute('readProjectMaterial(projectScene.materials[0])'),true);
assert(flat(els['project-detail-content']).includes('Restored authorized material'));
''', catalog=legacy)


def test_chronology_dates_never_borrow_scene_times_even_before_refresh():
    scene = copy.deepcopy(SCENES[A])
    scene['observations'][1]['message_time_ms'] = LAST + 86400000
    run_global(HELPERS + r'''
await execute('openProject(sceneA.project_id)');
assert.deepEqual(days(),[early,middle,last]);
''', scenes={A: scene, B: SCENES[B]})


def test_auth_invalidation_preserves_work_inputs_unknown_request_and_cancels_late_material():
    run_global(REVIEW_SETUP + r'''
await openReview();addQuote();await prepareReview();checkReview();execute('shareWorkReview()');
respond=()=>{throw Error('Lost reply');};await execute('saveWorkReview()');
const key=execute('workReview.key'),serialized=execute('workReviewSaves.get(workReview.key).serialized');
const input=els['work-review-completed'].value,quote=els['work-review-quote'].value;
let release;respond=()=>new Promise(resolve=>release=resolve);
const pending=execute('readProjectMaterial(projectScene.materials[0])');
respond=()=>({items:payload.list.items.map(item=>item.project_id===sceneA.project_id?{...item,material_count:0,chronology:{appearance_at:item.saved_at,appearance_basis:'first_saved',observation_times:[],observation_count:0}}:item)});
await execute('refreshCapturedProjects()');
assert.equal(els['work-review-completed'].value,input);assert.equal(els['work-review-quote'].value,quote);
assert.equal(execute('workReviewSaves.get('+JSON.stringify(key)+').serialized'),serialized);
assert.equal(els['work-review-preview'].textContent,'');assert.equal(els['work-review-share-text'].value,'');
assert.equal(els['work-review-source-text'].textContent,'');
release({...sceneA.materials[0],project_id:sceneA.project_id,revision:sceneA.revision,text:'Late revoked material'});
assert.equal(await pending,false);assert.equal(els['project-detail-content'].children.length,0);
respond=(url,options)=>{assert.equal(options.body,serialized);return receipt;};
await execute('saveWorkReview()');assert.equal(execute('workReviewSaves.get(workReview.key).phase'),'saved');
assert.equal(execute('projectSceneInvalidated'),true);assert.equal(els['work-review-preview'].textContent,'');
''')


def test_auth_invalidation_preserves_recap_inputs_pending_request_and_rejects_late_prepare():
    run_global(EDIT_SETUP + r'''
await openEditor();let release;
respond=(url,options)=>new Promise(resolve=>release=()=>{const body=JSON.parse(options.body);resolve({...body,recap:packageFor(body)});});
const pending=execute('prepareRecapEdit()');
respond=()=>({items:payload.list.items.filter(item=>item.project_id!==sceneA.project_id)});
await execute('refreshCapturedProjects()');release();assert.equal(await pending,false);
assert.equal(els['recap-edit-title'].value,'Revised <script>title</script>');
assert.equal(els['recap-edit-note'].value,'Current note 😀');
assert.equal(els['recap-edit-preview'].children.length,0);assert.equal(els['project-detail-content'].children.length,0);
await assert.rejects(execute('prepareRecapEdit()'));assert.equal(els['recap-edit-prepare'].disabled,true);
respond=()=>sceneA;assert.equal(await execute('recheckProjectScene()'),true);
await prepare();respond=()=>{throw Error('Lost save reply');};await execute('saveRecapEdit()');
const serialized=execute('recapEditSaves.get(recapEdit.key).serialized');
respond=()=>({items:[]});await execute('refreshCapturedProjects()');
assert.equal(execute('recapEditSaves.get(recapEdit.key).serialized'),serialized);
assert.equal(els['recap-edit-title'].value,'Revised <script>title</script>');
assert.equal(els['recap-edit-preview'].children.length,0);
respond=()=>({...sceneA,decisions:null,has_unavailable:true});
assert.equal(await execute('recheckProjectScene()'),true);
assert.equal(els['recap-edit-title'].value,'Revised <script>title</script>');
assert.equal(els['recap-edit-preview'].children.length,0);assert.equal(execute('recapEdit.missing'),true);
assert.equal(execute('recapEditSaves.get(recapEdit.key).serialized'),serialized);
respond=(url,options)=>{assert.equal(options.body,serialized);return receipt;};await execute('saveRecapEdit()');
assert.equal(execute('recapEditSaves.get(recapEdit.key).phase'),'saved');assert.equal(els['recap-edit-preview'].children.length,0);
''')


def test_late_scene_read_after_catalog_revocation_is_not_rendered_or_added_to_axis():
    run_global(HELPERS + r'''
let release;respond=()=>new Promise(resolve=>release=resolve);
const pending=execute('openProject(sceneA.project_id)');
respond=()=>({items:payload.list.items.filter(item=>item.project_id!==sceneA.project_id)});
await execute('refreshCapturedProjects()');release(sceneA);
assert.equal(await pending,false);assert.equal(execute('projectSceneInvalidated'),true);
assert.equal(originalRows().length,0);
assert.equal(els['project-detail-content'].children.length,0);
assert(!days().includes(last));assert.equal(els['project-read-stale'].hidden,false);
''')
