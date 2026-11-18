"""Recap revisions in the existing Node DOM harness; no live project writes."""
import json

import pytest

from test_workbench_projects import PAGE, Structure, run_projects


SETUP = r'''
const original=copy(sceneA.decisions.items[0]);
const form=(values={})=>{for(const [name,value] of Object.entries({title:'Revised <script>title</script>',after:'Revised direction',note:'Current note 😀',...values})){els['recap-edit-'+name].value=value;execute('recapEditChanged()');}};
const openEditor=async()=>{respond=()=>sceneA;await execute('openProject(sceneA.project_id)');execute('selectProjectDecision("choice")');execute('beginRecapEdit("choice")');form();};
const packageFor=(body,scene=sceneA)=>({version:'knot.decision-import/0.1',sources:{synthetic:{title:'Complete source',text:'Exact source'}},archive:{version:'knot.decision-archive/0.1',title:scene.decisions.title,method:'curated_recap',items:scene.decisions.items.map(item=>({...copy(item),...(item.id===body.item_id?{title:body.title,after:body.after.trim()?body.after:null,caution:(item.caution?item.caution+'\n':'')+(body.note.trim()?'本次整理备注：'+body.note:'')}:{})}))}});
const prepare=async(scene=sceneA)=>{respond=(url,options)=>{assert.equal(url,'/api/recap-prepare');assert.equal(options.headers['X-Knot-Action'],'explicit');assert.equal(options.method,'POST');const body=JSON.parse(options.body);return {project_id:body.project_id,revision:body.revision,manifest_hash:body.manifest_hash,recap:packageFor(body,scene)};};return execute('prepareRecapEdit()');};
const receipt={project_id:sceneA.project_id,revision:'3',manifest_hash:'f'.repeat(64)};
const conflict=async()=>{respond=()=>({syntheticError:'REVISION_CONFLICT',status:409});assert.equal(await execute('saveRecapEdit()'),false);};
'''


def run_edit(body, **kwargs):
    run_projects(SETUP + body, **kwargs)


def test_sidebar_entry_has_no_default_requests_does_not_move_cards_and_excludes_document_plans():
    run_edit(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
assert.equal(calls.length,2);assert.equal(els['recap-edit'].hidden,true);
const cards=[...els['project-decisions'].children];execute('selectProjectDecision("choice")');
assert.equal(calls.length,2);assert(flat(els['project-detail-content']).includes('修订这条整理'));
assert(flat(els['project-detail-content']).includes(original.reason));
execute('beginRecapEdit("choice")');assert.equal(calls.length,2);
assert.equal(els['recap-edit-title'].value,original.title);assert.equal(els['recap-edit-after'].value,original.after);assert.equal(els['recap-edit-note'].value,'');
assert.deepEqual(els['project-decisions'].children,cards);
execute('selectProjectDecision("plan")');assert(!flat(els['project-detail-content']).includes('修订这条整理'));
assert.equal(els['recap-edit'].hidden,true);assert.throws(()=>execute('beginRecapEdit("plan")'));assert.equal(calls.length,2);
''')


def test_prepare_closed_binding_literal_preview_and_import_uses_exact_returned_package():
    run_edit(r'''
await openEditor();const cards=[...els['project-decisions'].children],count=calls.length;
assert.equal(await prepare(),true);const input=JSON.parse(calls.at(-1).options.body);
assert.deepEqual(Object.keys(input).sort(),['project_id','revision','manifest_hash','item_id','title','after','note'].sort());
assert.equal(input.project_id,sceneA.project_id);assert.equal(input.revision,'2');assert.equal(input.manifest_hash,sceneA.manifest_hash);assert.equal(input.item_id,'choice');
assert.equal(calls.length,count+1);assert(!calls.some(c=>c.url==='/api/project-import'));
assert(flat(els['recap-edit-preview']).includes('<script>title</script>'));assert(flat(els['recap-edit-preview']).includes(original.reason));
assert(flat(els['recap-edit-preview']).includes(original.evidence[0].quote));assert(flat(els['recap-edit-preview']).includes('原消息日期未知'));assert(flat(els['recap-edit-preview']).includes('本次整理备注：Current note 😀'));
const expected=copy(execute('recapEdit.preview'));respond=()=>receipt;assert.equal(await execute('saveRecapEdit()'),true);
const saved=JSON.parse(calls.at(-1).options.body);
assert.deepEqual(Object.keys(saved).sort(),['project_id','title','expected_revision','request_id','documents','archive_ref','recap'].sort());
assert.equal(saved.project_id,sceneA.project_id);assert.equal(saved.title,sceneA.title);assert.equal(saved.expected_revision,'2');assert.deepEqual(saved.documents,[]);assert.equal(saved.archive_ref,null);
assert.deepEqual(saved.recap,expected);assert.notEqual(saved.title,input.title);assert.equal(sequence,1);
assert.deepEqual(sceneA.decisions.items[0],original);assert.deepEqual(els['project-decisions'].children,cards);assert.equal(execute('projectImport'),null);assert.equal(execute('canWrite'),false);
''')


@pytest.mark.parametrize('values', [dict(title=' '), dict(title='中'*86),
                                    dict(after='中'*683), dict(note='中'*342)])
def test_utf8_limits_fail_before_prepare(values):
    run_edit(r'''
await openEditor();form(''' + json.dumps(values) + r''');const count=calls.length;
await assert.rejects(execute('prepareRecapEdit()'));assert.equal(calls.length,count);assert.equal(sequence,0);
''')


def test_unchanged_and_changed_forms_require_fresh_preview_and_noop_does_not_send():
    run_edit(r'''
await openEditor();form({title:original.title,after:original.after,note:''});const count=calls.length;
await assert.rejects(execute('prepareRecapEdit()'));assert.equal(calls.length,count);
form();await prepare();form({title:'Different title'});assert.equal(els['recap-edit-preview-area'].hidden,true);
await assert.rejects(execute('saveRecapEdit()'));assert.equal(sequence,0);
''')


def test_unknown_result_retries_identical_request_after_switching_projects_and_versions():
    run_edit(r'''
await openEditor();await prepare();respond=()=>{throw Error('network private detail');};
assert.equal(await execute('saveRecapEdit()'),false);const first=calls.at(-1).options.body;
assert.equal(execute('recapEditSaves.get(recapEdit.key).phase'),'unknown');assert.equal(els['recap-edit-fields'].hidden,true);assert.equal(els['recap-edit-refresh'].hidden,true);
await assert.rejects(execute('refreshRecapEdit()'));execute('reviseRecapEdit()');form({title:'Must not replace frozen request'});
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');assert.equal(execute('recapEdit'),null);assert.equal(els['recap-edit-note'].value,'');assert.equal(els['recap-edit-preview-area'].hidden,true);
respond=()=>({...sceneA,revision:'1',manifest_hash:'d'.repeat(64)});await execute('openProject(sceneA.project_id,"1")');execute('selectProjectDecision("choice")');execute('beginRecapEdit("choice")');
assert.equal(els['recap-edit-fields'].hidden,false);assert.equal(els['recap-edit-preview-area'].hidden,true);
respond=()=>sceneA;await execute('openProject(sceneA.project_id,"2")');execute('selectProjectDecision("choice")');execute('beginRecapEdit("choice")');
assert.equal(els['recap-edit-fields'].hidden,true);assert.equal(els['recap-edit-note'].value,'Current note 😀');
respond=()=>receipt;assert.equal(await execute('saveRecapEdit()'),true);assert.equal(calls.at(-1).options.body,first);assert.equal(sequence,1);
''')


@pytest.mark.parametrize('late_result', ['receipt', 'error'])
def test_late_save_result_updates_only_its_own_session(late_result):
    run_edit(r'''
await openEditor();await prepare();let release;respond=()=>new Promise(resolve=>release=resolve);
const pending=execute('saveRecapEdit()'),key=execute('recapEdit.key');
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');execute('selectProjectDecision("choice")');execute('beginRecapEdit("choice")');form({title:'B input'});
const preview=flat(els['recap-edit-preview']),status=els['recap-edit-status'].textContent;
release(''' + ('receipt' if late_result == 'receipt' else "{syntheticError:'READ_UNAVAILABLE',status:503}") + r''');await pending;
assert.equal(execute('projectScene.project_id'),sceneB.project_id);assert.equal(els['recap-edit-title'].value,'B input');assert.equal(flat(els['recap-edit-preview']),preview);assert.equal(els['recap-edit-status'].textContent,status);
assert.equal(execute('recapEditSaves.get('+JSON.stringify(key)+').phase'),''' + json.dumps('saved' if late_result == 'receipt' else 'unknown') + r''');
''')


def test_late_prepare_is_cleared_only_after_explicit_end_editing():
    run_edit(r'''
await openEditor();let release;respond=(url,options)=>new Promise(resolve=>release=()=>{const body=JSON.parse(options.body);resolve({...body,recap:packageFor(body)});});
const pending=execute('prepareRecapEdit()');respond=()=>sceneB;assert.equal(await execute('openProject(sceneB.project_id)'),false);
assert.equal(els['recap-edit-title'].value,'Revised <script>title</script>');execute('endProjectEditing()');await execute('openProject(sceneB.project_id)');
release();assert.equal(await pending,false);assert.equal(execute('recapEdit'),null);assert.equal(els['recap-edit-preview-area'].hidden,true);assert.equal(els['recap-edit-title'].value,'');
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');execute('selectProjectDecision("choice")');execute('beginRecapEdit("choice")');assert.equal(els['recap-edit-title'].value,original.title);assert.equal(els['recap-edit-note'].value,'');
''')


def test_inflight_save_reopened_at_same_binding_receives_its_result_and_does_not_stay_disabled():
    run_edit(r'''
await openEditor();await prepare();let release;respond=()=>new Promise(resolve=>release=resolve);
const pending=execute('saveRecapEdit()');execute('clearProjectDetail()');execute('selectProjectDecision("choice")');execute('beginRecapEdit("choice")');
assert.equal(els['recap-edit-save'].disabled,true);release(receipt);assert.equal(await pending,true);
assert.equal(els['recap-edit-save'].disabled,false);assert.equal(els['recap-edit-save'].textContent,'查看已保存版本');assert(els['recap-edit-status'].textContent.includes('修订已保存'));
''')


def test_invalid_receipt_stays_unknown_and_retries_same_request_then_opens_fixed_saved_version():
    run_edit(r'''
await openEditor();await prepare();respond=()=>({...receipt,project_id:sceneB.project_id});assert.equal(await execute('saveRecapEdit()'),false);
const serialized=calls.at(-1).options.body;assert.equal(execute('recapEditSaves.get(recapEdit.key).phase'),'unknown');
respond=()=>receipt;assert.equal(await execute('saveRecapEdit()'),true);assert.equal(calls.at(-1).options.body,serialized);
respond=(url,options)=>{assert.equal(url,'/api/project?project_id='+sceneA.project_id+'&revision=3');assert(!options.method);return {...copy(sceneA),...receipt};};
assert.equal(await execute('saveRecapEdit()'),true);assert.equal(execute('projectScene.revision'),'3');assert.equal(execute('recapEdit'),null);assert.equal(sequence,1);
''')


@pytest.mark.parametrize('change', ["value.project_id=sceneB.project_id", "value.revision='1'",
                                    "value.manifest_hash='0'.repeat(64)", "value.extra=true",
                                    "value.recap.archive.items[0].title='Wrong edit'"])
def test_prepare_rejects_wrong_binding_or_edited_content(change):
    run_edit(r'''
await openEditor();respond=(url,options)=>{const body=JSON.parse(options.body);const value={project_id:body.project_id,revision:body.revision,manifest_hash:body.manifest_hash,recap:packageFor(body)};
''' + change + r''';return value;};
assert.equal(await execute('prepareRecapEdit()'),false);assert.equal(els['recap-edit-preview-area'].hidden,true);await assert.rejects(execute('saveRecapEdit()'));assert.equal(sequence,0);
''')


def test_conflict_explicitly_refreshes_and_retains_input_then_reprepares_with_new_key():
    run_edit(r'''
await openEditor();await prepare();await conflict();const old=calls.at(-1).options.body,count=calls.length;
assert.equal(els['recap-edit-refresh'].hidden,false);assert.equal(els['recap-edit-save'].hidden,true);assert.equal(els['recap-edit-revise'].hidden,true);assert.equal(await execute('saveRecapEdit()'),false);assert.equal(calls.length,count);
const latest={...copy(sceneA),revision:'3',manifest_hash:'f'.repeat(64)};latest.decisions.items[0].reason='Latest original reason';
respond=(url,options)=>{assert.equal(url,'/api/project?project_id='+sceneA.project_id);assert(!options.method);return latest;};
assert.equal(await execute('refreshRecapEdit()'),true);assert.equal(calls.length,count+1);assert.equal(els['recap-edit-title'].value,'Revised <script>title</script>');assert.equal(els['recap-edit-note'].value,'Current note 😀');assert.equal(els['recap-edit-preview-area'].hidden,true);
await assert.rejects(execute('saveRecapEdit()'));assert.equal(await prepare(latest),true);assert(flat(els['recap-edit-preview']).includes('Latest original reason'));
respond=()=>({...receipt,revision:'4'});await execute('saveRecapEdit()');const next=JSON.parse(calls.at(-1).options.body);
assert.equal(next.expected_revision,'3');assert.equal(next.title,sceneA.title);assert.notEqual(next.request_id,JSON.parse(old).request_id);assert.equal(sequence,2);
''')


def test_missing_item_after_conflict_keeps_text_and_blocks_replacement():
    run_edit(r'''
await openEditor();await prepare();await conflict();const latest={...copy(sceneA),revision:'3',manifest_hash:'f'.repeat(64)};latest.decisions.items=latest.decisions.items.filter(item=>item.id!=='choice');
respond=()=>latest;assert.equal(await execute('refreshRecapEdit()'),false);assert.equal(execute('projectScene.revision'),'3');assert.equal(els['recap-edit-title'].value,'Revised <script>title</script>');assert.equal(els['recap-edit-note'].value,'Current note 😀');
assert(els['recap-edit-status'].textContent.includes('不能自动新增替代'));assert.equal(els['recap-edit-prepare'].disabled,true);assert.equal(els['recap-edit-save'].hidden,true);
const count=calls.length;await assert.rejects(execute('prepareRecapEdit()'));assert.equal(await execute('saveRecapEdit()'),false);assert.equal(calls.length,count);
''')


def test_refresh_failure_and_late_refresh_preserve_conflict_without_cross_project_changes():
    run_edit(r'''
await openEditor();await prepare();await conflict();const serialized=execute('recapEditSaves.get(recapEdit.key).serialized');
respond=()=>({syntheticError:'ACCESS_DENIED'});assert.equal(await execute('refreshRecapEdit()'),false);assert.equal(execute('recapEditSaves.get(recapEdit.key).serialized'),serialized);assert.equal(els['recap-edit-refresh'].hidden,false);
let release;respond=()=>new Promise(resolve=>release=resolve);const pending=execute('refreshRecapEdit()');respond=()=>sceneB;await execute('openProject(sceneB.project_id)');execute('selectProjectDecision("choice")');execute('beginRecapEdit("choice")');form({title:'B preserved'});
const status=els['recap-edit-status'].textContent;release({...sceneA,revision:'3',manifest_hash:'f'.repeat(64)});assert.equal(await pending,false);assert.equal(execute('projectScene.project_id'),sceneB.project_id);assert.equal(els['recap-edit-title'].value,'B preserved');assert.equal(els['recap-edit-status'].textContent,status);
''')


def test_definite_rejection_can_revise_but_server_note_overflow_never_creates_save():
    run_edit(r'''
await openEditor();respond=()=>({syntheticError:'INVALID_ARGUMENTS',status:400});assert.equal(await execute('prepareRecapEdit()'),false);assert.equal(els['recap-edit-note'].value,'Current note 😀');assert.equal(sequence,0);
await prepare();respond=()=>({syntheticError:'ACCESS_DENIED'});assert.equal(await execute('saveRecapEdit()'),false);const first=JSON.parse(calls.at(-1).options.body);
execute('reviseRecapEdit()');assert.equal(els['recap-edit-fields'].hidden,false);assert.equal(els['recap-edit-note'].value,'Current note 😀');form({title:'Revised after definite rejection'});await prepare();respond=()=>receipt;await execute('saveRecapEdit()');assert.notEqual(JSON.parse(calls.at(-1).options.body).request_id,first.request_id);
''')


def test_editor_markup_is_in_sidebar_and_only_three_text_fields_are_editable():
    structure = Structure()
    structure.feed(PAGE.read_text(encoding='utf-8'))
    nodes = structure.nodes
    assert 'hidden' in nodes['recap-edit'][1]
    assert any(attrs.get('id') == 'project-detail' for _, attrs in nodes['recap-edit'][2])
    for field in ('title', 'after', 'note'):
        assert any(attrs.get('id') == 'recap-edit' for _, attrs in nodes['recap-edit-'+field][2])
    for field in ('reason', 'date', 'before', 'evidence'):
        assert 'recap-edit-'+field not in nodes


def test_editor_is_closed_when_projects_are_disabled():
    run_edit(r'''
assert.equal(calls.length,0);assert.throws(()=>execute('beginRecapEdit("choice")'));await assert.rejects(execute('prepareRecapEdit()'));await assert.rejects(execute('saveRecapEdit()'));assert.equal(calls.length,0);
''', dataset={})
