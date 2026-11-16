"""Synthetic project contracts in a Node DOM model; no browser or simulated clicks."""
import json
import shutil
import subprocess

import pytest

from test_workbench_usability import PAGE, Structure


A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
ASSET_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ASSET_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def synthetic_scene(project_id, asset_id, title, revision='2', decisions=True):
    return dict(
        project_id=project_id, title=title, revision=revision, manifest_hash='c'*64,
        saved_at=1794700000000,
        snapshots=[dict(revision='1', manifest_hash='d'*64, saved_at=1794600000000),
                   dict(revision='2', manifest_hash='c'*64, saved_at=1794700000000)],
        materials=[dict(asset_id=asset_id, content_hash='a'*64, title=title+' synthetic material')],
        decisions=(dict(archive_id='33333333-3333-4333-8333-333333333333',
                        archive_hash='e'*64, title='Synthetic curated recap', method='curated_recap',
                        has_unavailable=False, items=[
            dict(id='choice', kind='archived_user_excerpt', title=title+' synthetic choice',
                 before='Synthetic prior direction', after='Synthetic new direction',
                 reason='Synthetic reason <script>literal</script>', occurred_on=None,
                 archived_on='2026-11-03', document_on=None, caution='Original message date unknown',
                 evidence=[dict(asset_id=asset_id, content_hash='a'*64,
                                title=title+' synthetic material', quote='<img src=x onerror=alert(1)>',
                                message_time_ms=None, source_url=None)]),
            dict(id='plan', kind='document_plan', title='Synthetic historical proposal',
                 before=None, after='Synthetic proposal', reason=None, occurred_on=None,
                 archived_on=None, document_on='2026-10-18', caution='Not a confirmed choice',
                 evidence=[dict(asset_id=asset_id, content_hash='a'*64,
                                title=title+' synthetic material', quote='Pending proposal',
                                message_time_ms=None, source_url=None)]),
        ]) if decisions else None), has_unavailable=False)


SCENE_A = synthetic_scene(A, ASSET_A, 'A')
SCENE_B = synthetic_scene(B, ASSET_B, 'B')
LIST = dict(items=[dict(project_id=s['project_id'], title=s['title'], revision=s['revision'],
                        manifest_hash=s['manifest_hash'], saved_at=s['saved_at'],
                        material_count=1, decision_count=1) for s in (SCENE_A, SCENE_B)])


HARNESS = r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {TextDecoder,TextEncoder}=require('util');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
const html=fs.readFileSync(payload.page,'utf8');
class E {
  constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.open=false;this.attrs={};this.files=[];this.focused=0;this.events={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(event,handler){(this.events[event]??=[]).push(handler);}
  setAttribute(key,value){this.attrs[key]=value;}
  focus(){this.focused++;}
  scrollIntoView(){}
  set innerHTML(value){throw Error('Project/source content must remain literal text');}
}
const els={};
for(const m of html.split('<script')[0].matchAll(/<([A-Za-z0-9_-]+)[^>]* id="([^"]+)"[^>]*>/g)){
  const node=new E(m[1]);node.hidden=m[0].includes(' hidden');node.disabled=m[0].includes(' disabled');els[m[2]]=node;
}
const calls=[];let sequence=0;
let respond=async(url)=>{
  if(url==='/api/projects')return payload.list;
  if(url==='/api/decisions?')return {title:'Synthetic old history',items:[],has_unavailable:false};
  throw Error('Unexpected request');
};
const ctx=vm.createContext({document:{body:{dataset:payload.dataset},getElementById:id=>els[id],createElement:tag=>new E(tag),querySelectorAll:()=>Object.values(els).filter(e=>['BUTTON','INPUT','TEXTAREA','SELECT'].includes(e.tagName))},TextDecoder,TextEncoder,URLSearchParams,crypto:{randomUUID:()=>`99999999-9999-4999-8999-${String(++sequence).padStart(12,'0')}`},fetch:async(url,options)=>{
  calls.push({url,options});const result=await respond(url,options);
  if(result?.syntheticError)return {ok:false,status:result.status||403,json:async()=>({error:result.syntheticError})};
  return {ok:true,status:200,json:async()=>result};
}});
const execute=code=>vm.runInContext(code,ctx);
const sceneA=payload.sceneA,sceneB=payload.sceneB;ctx.sceneA=sceneA;ctx.sceneB=sceneB;
const copy=value=>JSON.parse(JSON.stringify(value));
const flat=node=>[node.textContent,...node.children.flatMap(flat)].join('\n');
function file(name,text){const bytes=new TextEncoder().encode(text);return {name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};}
function selectFile(title='Synthetic project',name='source.md',content='# Synthetic source\r\nLiteral <script>text</script>'){
  els['project-import-name'].value=title;els['project-import-files'].files=[file(name,content)];
}
execute(html.split('<script id="workbench-code">')[1].split('</script>')[0]);
(async()=>{await execute('projectsLoad');await execute('historyLoad');
'''


def run_projects(body, dataset=None, listing=None):
    node = shutil.which('node')
    if not node:
        pytest.skip('Node required for project workflow contracts')
    result = subprocess.run(
        [node, '-e', HARNESS + body + '\n})().catch(e=>{console.error(e);process.exitCode=1;});'],
        input=json.dumps(dict(page=str(PAGE), dataset=dataset if dataset is not None else
                             dict(projects='enabled', write='disabled', context='disabled'),
                             list=listing if listing is not None else LIST,
                             sceneA=SCENE_A, sceneB=SCENE_B)),
        capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr


def test_project_mode_priority_is_one_list_and_never_reads_old_history():
    run_projects(r'''
assert.deepEqual(calls.map(c=>c.url),['/api/projects']);
assert.equal(els['projects-list'].children.length,2);
assert.equal(els['legacy-navigation'].hidden,true);
assert.equal(els['context-panel'].hidden,true);
assert.equal(els['projects-pane'].hidden,false);
assert.equal(els['history-pane'].hidden,true);
assert.equal(els['project-import-new'].disabled,false);
assert.equal(execute('canWrite'),false);
assert(flat(els['projects-list']).includes('1 项决定'));
''', dict(projects='enabled', history='enabled', write='disabled', context='enabled'))


@pytest.mark.parametrize('dataset', [{}, {'projects': 'unknown'}, {'projects': 'ENABLED'},
                                    {'projects': True}, {'projects': 'disabled'}])
def test_missing_or_unknown_projects_capability_is_closed(dataset):
    run_projects(r'''
assert.equal(execute('canProjects'),false);
assert.equal(calls.length,0);
assert.equal(els['projects-pane'].hidden,true);
assert.throws(()=>execute('beginProjectImport(false)'));
await assert.rejects(execute('openProject(sceneA.project_id)'));
await assert.rejects(execute('projectRequest("projects")'));
assert.equal(calls.length,0);
''', dataset)


def test_old_history_mode_still_loads_once_when_projects_unknown():
    run_projects(r'''
assert.deepEqual(calls.map(c=>c.url),['/api/decisions?']);
assert.equal(els['history-pane'].hidden,false);
assert.equal(els['projects-pane'].hidden,true);
''', dict(projects='unknown', history='enabled'))


def test_no_synthetic_project_or_choice_is_inserted_for_empty_list():
    run_projects(r'''
assert.equal(els['projects-list'].children.length,0);
assert.equal(els['projects-empty'].hidden,false);
assert.equal(execute('projectItems.length'),0);
assert.equal(calls.length,1);
''', listing={'items': []})


def test_card_detail_preserves_card_objects_and_background_type_and_dates():
    run_projects(r'''
respond=async(url)=>{assert.equal(url,'/api/project?project_id='+sceneA.project_id);return sceneA;};
await execute('openProject(sceneA.project_id)');
assert.equal(els['project-decisions'].children.length,1);
assert.equal(els['project-background-cards'].children.length,1);
assert.equal(els['project-background'].open,false);
assert(!flat(els['project-decisions']).includes('historical proposal'));
assert(flat(els['project-decisions']).includes('Synthetic reason <script>literal</script>'));
const original=[...els['project-decisions'].children];
const originalBackground=els['project-background-cards'].children[0];
execute('selectProjectDecision("choice")');
assert.equal(els['project-decisions'].children[0],original[0]);
assert.equal(els['project-background-cards'].children[0],originalBackground);
assert.equal(els['project-detail-view'].hidden,false);
assert(flat(els['project-detail-content']).includes('原消息日期未知'));
assert(flat(els['project-detail-content']).includes('<img src=x onerror=alert(1)>'));
assert.equal(original[0].attrs['aria-expanded'],'true');
execute('clearProjectDetail(true)');
assert.equal(original[0].focused,1);
execute('selectProjectDecision("plan")');
assert(flat(els['project-detail-content']).includes('2026-10-18 · 文档方案'));
assert.equal(els['project-decisions'].children[0],original[0]);
assert.equal(calls.length,2); // Side disclosure never fetches or writes.
assert.equal(execute('draft'),null);
assert.equal(execute('contextAllowed.size'),0);
''')


def test_scene_late_response_and_failed_refresh_never_restore_other_project():
    run_projects(r'''
let releaseA;
respond=(url)=>url.includes(sceneA.project_id)?new Promise(resolve=>releaseA=resolve):sceneB;
const pendingA=execute('openProject(sceneA.project_id)');
await execute('openProject(sceneB.project_id)');
execute('selectProjectDecision("choice")');
releaseA(sceneA);await pendingA;
assert.equal(execute('projectScene.project_id'),sceneB.project_id);
assert.equal(els['project-detail-title'].textContent,sceneB.decisions.items[0].title);
assert(!flat(els['project-decisions']).includes('A synthetic'));
respond=()=>({syntheticError:'ACCESS_DENIED',status:403});
await assert.rejects(execute('openProject(sceneA.project_id)'));
assert.equal(execute('projectScene'),null);
assert.equal(els['project-decisions'].children.length,0);
assert.equal(els['project-detail-content'].children.length,0);
assert.equal(els['project-detail-title'].textContent,'');
assert(!flat(els['project-material-list']).includes('B synthetic'));
assert.equal(els['project-timeline'].disabled,true);
''')


def test_material_metadata_filter_does_not_read_and_late_body_is_suppressed():
    run_projects(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
els['project-material-query'].value='no match';execute('renderProjectMaterials()');
assert.equal(calls.length,2);
assert(!flat(els['project-material-list']).includes('A synthetic material'));
els['project-material-query'].value='A';execute('renderProjectMaterials()');
let releaseBody;respond=(url)=>{assert(url.startsWith('/api/project-material?'));const q=new URLSearchParams(url.split('?')[1]);assert.equal(q.get('revision'),'2');assert.equal(q.get('asset_id'),sceneA.materials[0].asset_id);assert.equal(q.get('expected_hash'),sceneA.materials[0].content_hash);return new Promise(resolve=>releaseBody=resolve);};
const body=execute('readProjectMaterial(projectScene.materials[0])');
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');
releaseBody({...sceneA.materials[0],project_id:sceneA.project_id,revision:'2',text:'PRIVATE A BODY'});await body;
assert.equal(els['project-material-query'].value,'');
assert.equal(els['project-detail-content'].children.length,0);
assert(!flat(els['project-material-list']).includes('A synthetic'));
const before=calls.length;
await assert.rejects(execute('readProjectMaterial(sceneA.materials[0])'));
assert.equal(calls.length,before); // Cross-project anchor rejected before HTTP.
''')


def test_explicit_material_read_binds_all_fields_and_suppresses_stale_sources():
    run_projects(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
respond=()=>({...sceneA.materials[0],project_id:sceneA.project_id,revision:'2',text:'Literal <script>source</script>'});
await execute('readProjectMaterial(projectScene.materials[0])');
assert.equal(els['project-detail-content'].children[0].textContent,'Literal <script>source</script>');
respond=()=>({syntheticError:'ACCESS_DENIED',status:403});
await execute('readProjectMaterial(projectScene.materials[0])');
assert(!flat(els['project-detail-content']).includes('Literal <script>source</script>'));
assert(!flat(els['project-material-list']).includes('A synthetic material'));
assert.equal(els['project-decisions'].children.length,0);
assert.equal(els['project-background-cards'].children.length,0);
assert(els['project-decisions-empty'].textContent.includes('已隐藏'));
''')


def test_snapshots_are_real_versions_not_message_dates_and_material_only_is_empty():
    run_projects(r'''
const scene=copy(sceneA);scene.decisions=null;
scene.revision='9007199254740993';scene.snapshots=[{revision:scene.revision,manifest_hash:'c'.repeat(64),saved_at:1794700000000}];
respond=()=>scene;await execute('openProject(sceneA.project_id)');
assert.equal(els['project-timeline'].disabled,true);
assert.equal(els['project-timeline'].max,'0');
assert(els['project-snapshot-label'].textContent.includes('仅一个留存版本'));
assert.equal(els['project-decisions'].children.length,0);
assert.equal(els['project-decisions-empty'].textContent,'材料已导入，尚未整理决定');
assert(flat(els['project-material-list']).includes('synthetic material'));
assert.equal(execute('projectScene.revision'),'9007199254740993');
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
respond=(url)=>{assert.equal(url,'/api/project?project_id='+sceneA.project_id+'&revision=1');return {...sceneA,...sceneA.snapshots[0]};};
await execute('selectProjectSnapshot(0)');
assert.equal(execute('projectScene.revision'),'1');
assert.equal(els['project-import-append'].disabled,true);
assert.throws(()=>execute('beginProjectImport(true)'));
''')


def test_import_preview_and_explicit_post_are_independent_of_writer():
    run_projects(r'''
execute('beginProjectImport(false)');selectFile();
await execute('prepareProjectImport()');
assert.equal(calls.length,1); // File reading and preview stay local.
assert.equal(els['project-import-confirm'].disabled,false);
assert(flat(els['project-import-list']).includes('source.md'));
const body=JSON.parse(execute('projectImport.serialized'));
assert.deepEqual(Object.keys(body).sort(),['archive_ref','documents','expected_revision','project_id','request_id','title']);
assert.equal(body.expected_revision,'0');assert.equal(body.archive_ref,null);
assert.equal(body.documents[0].text,'# Synthetic source\r\nLiteral <script>text</script>');
respond=(url,options)=>{assert.equal(url,'/api/project-import');assert.equal(options.method,'POST');assert.equal(options.headers['X-Knot-Action'],'explicit');assert.equal(options.headers['Content-Type'],'application/json');assert.equal(options.body,execute('projectImport.serialized'));return {project_id:body.project_id,revision:'1',manifest_hash:'f'.repeat(64)};};
await execute('confirmProjectImport()');
assert.equal(execute('projectImport.phase'),'saved');
assert.equal(execute('canWrite'),false);
assert.equal(execute('draft'),null);
assert.equal(calls.length,2); // No implicit scene/list/source refresh after POST.
''')


def test_append_keeps_original_project_name_while_new_project_name_is_editable():
    run_projects(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
execute('beginProjectImport(true)');
assert.equal(els['project-import-name'].disabled,true);
assert.equal(els['project-import-name'].value,sceneA.title);
selectFile('Unintended rename');await execute('prepareProjectImport()');
const appendBody=JSON.parse(execute('projectImport.serialized'));
assert.equal(appendBody.project_id,sceneA.project_id);
assert.equal(appendBody.title,sceneA.title);
assert(els['project-import-target'].textContent.includes('追加到：'+sceneA.title));
assert(!els['project-import-target'].textContent.includes('Unintended rename'));
execute('editProjectImport()');
assert.equal(els['project-import-name'].disabled,true);
execute('dismissProjectImport();beginProjectImport(false)');
assert.equal(els['project-import-name'].disabled,false);
selectFile('My chosen new name');await execute('prepareProjectImport()');
assert.equal(JSON.parse(execute('projectImport.serialized')).title,'My chosen new name');
assert.equal(calls.length,2); // Only initial list + explicit scene, no import sent.
''')


def test_unknown_import_retains_exact_request_and_body_for_explicit_retry():
    run_projects(r'''
execute('beginProjectImport(false)');selectFile();await execute('prepareProjectImport()');
const original=execute('projectImport.serialized');respond=()=>{throw Error('PRIVATE NETWORK ERROR');};
await execute('confirmProjectImport()');
assert.equal(execute('projectImport.phase'),'unknown');
assert.equal(els['project-import-name'].disabled,true);
assert.equal(els['project-import-dismiss'].disabled,true);
assert(!els['project-import-status'].textContent.includes('PRIVATE'));
assert.throws(()=>execute('beginProjectImport(false)'));
assert.throws(()=>execute('dismissProjectImport()'));
execute('editProjectImport()');assert.equal(execute('projectImport.serialized'),original);
respond=(url,options)=>{assert.equal(options.body,original);return {project_id:JSON.parse(original).project_id,revision:'1',manifest_hash:'f'.repeat(64)};};
await execute('confirmProjectImport()');
assert.equal(calls[1].options.body,calls[2].options.body);
assert.equal(execute('projectImport.phase'),'saved');
''')


def test_late_import_receipt_does_not_rebind_another_project_scene():
    run_projects(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
execute('beginProjectImport(true)');selectFile('A');await execute('prepareProjectImport()');
const body=JSON.parse(execute('projectImport.serialized'));
assert.equal(body.project_id,sceneA.project_id);assert.equal(body.expected_revision,'2');
let release;respond=()=>new Promise(resolve=>release=resolve);
const pending=execute('confirmProjectImport()');
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');
execute('selectProjectDecision("choice")');
const card=els['project-decisions'].children[0];
release({project_id:sceneA.project_id,revision:'3',manifest_hash:'f'.repeat(64)});await pending;
assert.equal(execute('projectScene.project_id'),sceneB.project_id);
assert.equal(els['project-decisions'].children[0],card);
assert.equal(els['project-detail-title'].textContent,sceneB.decisions.items[0].title);
assert.equal(execute('projectImport.body.project_id'),sceneA.project_id);
assert(els['project-import-status'].textContent.includes('「A」'));
''')


@pytest.mark.parametrize('code,status', [('ACCESS_DENIED', 403), ('REVISION_CONFLICT', 409),
                                        ('IDEMPOTENCY_CONFLICT', 409), ('RESPONSE_LIMIT', 503)])
def test_import_errors_keep_request_and_show_finite_feedback(code, status):
    run_projects(r'''
execute('beginProjectImport(false)');selectFile();await execute('prepareProjectImport()');
const before=execute('projectImport.serialized');
respond=()=>({syntheticError:''' + json.dumps(code) + ',status:' + str(status) + r'''});
await execute('confirmProjectImport()');
assert.equal(execute('projectImport.serialized'),before);
assert.notEqual(execute('projectImport.phase'),'saved');
assert(els['project-import-status'].textContent.length>0);
assert.equal(calls.length,2);
''')


@pytest.mark.parametrize('kind', ['extension', 'file_size', 'total_size', 'count', 'utf8', 'read_error'])
def test_invalid_import_files_never_send(kind):
    run_projects(r'''
execute('beginProjectImport(false)');selectFile();
const kind=''' + json.dumps(kind) + r''';
if(kind==='extension')els['project-import-files'].files=[file('script.html','text')];
if(kind==='file_size')els['project-import-files'].files=[file('large.txt','x'.repeat(65537))];
if(kind==='total_size')els['project-import-files'].files=Array.from({length:5},(_,i)=>file(i+'.txt','x'.repeat(65536)));
if(kind==='count')els['project-import-files'].files=Array.from({length:21},(_,i)=>file(i+'.txt','x'));
if(kind==='utf8')els['project-import-files'].files=[{name:'bad.txt',size:2,arrayBuffer:async()=>new Uint8Array([0xc3,0x28]).buffer}];
if(kind==='read_error')els['project-import-files'].files=[{name:'bad.txt',size:2,arrayBuffer:async()=>{throw Error('PRIVATE LOCAL PATH');}}];
await assert.rejects(execute('prepareProjectImport()'));
assert.equal(execute('projectImport.body'),null);
assert.equal(execute('projectImport.serialized'),null);
assert.equal(calls.length,1);
assert(!els['project-import-status'].textContent.includes('PRIVATE'));
''')


def test_project_markup_has_no_inferred_edges_and_detail_is_a_sibling():
    structure = Structure()
    html = PAGE.read_text(encoding='utf-8')
    structure.feed(html)
    nodes = structure.nodes
    assert nodes['project-detail'][0] == 'aside'
    assert not any(attrs.get('id') == 'project-decisions' for _, attrs in nodes['project-detail'][2])
    assert any(attrs.get('id') == 'project-scene' for _, attrs in nodes['project-detail'][2])
    assert nodes['project-import-files'][1]['accept'] == '.md,.txt'
    assert 'multiple' in nodes['project-import-files'][1]
    assert 'disabled' in nodes['project-timeline'][1]
    assert '<svg' not in html
    assert '<canvas' not in html
