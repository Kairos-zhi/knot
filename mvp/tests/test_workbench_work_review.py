"""Work review UI contracts in Node DOM; no browser or live business writes."""
import json

import pytest

from test_workbench_projects import PAGE, Structure, run_projects


SETUP = r'''
const source={...sceneA.materials[0],text:'Exact original <script>literal</script> 😀\n'+Array.from({length:10},(_,i)=>'Original quote '+i+'。').join('\n'),message_time_ms:1794700000000,thread_id:'thread-a',message_id:'message-a'};
sceneA.observations=[source];
const receipt={project_id:sceneA.project_id,revision:'3',manifest_hash:'f'.repeat(64)};
const fields=(values={})=>{for(const [name,value] of Object.entries({day:'2026-11-17',completed:'Verified completed work',blocked:'',next:'Continue next',...values})){els['work-review-'+name].value=value;els['work-review-'+name].events.input[0]();}};
const reply=(body)=>({...body,document:{title:body.day+' 工作回顾.md',text:'# Literal <script>review</script>\n'+body.completed+'\n'+body.blocked+'\n'+body.next+'\n'+body.evidence.map(e=>e.quote).join('\n')}});
const openReview=async()=>{respond=()=>sceneA;await execute('openProject(sceneA.project_id)');fields();};
const prepareReview=async()=>{respond=(url,options)=>{assert.equal(url,'/api/work-review-prepare');assert.equal(options.method,'POST');assert.equal(options.headers['X-Knot-Action'],'explicit');return reply(JSON.parse(options.body));};assert.equal(await execute('prepareWorkReview()'),true);};
const addQuote=(quote='Original quote 0。')=>{els['work-review-sources'].value=source.asset_id+':'+source.content_hash;els['work-review-sources'].events.change[0]();els['work-review-quote'].value=quote;els['work-review-quote'].events.input[0]();execute('addWorkReviewEvidence()');};
const checkReview=()=>{els['work-review-checked'].checked=true;els['work-review-checked'].events.change[0]();};
'''


def run_review(body, **kwargs):
    run_projects(SETUP + body, **kwargs)


def test_collapsed_editor_has_no_inferred_results_no_requests_and_reads_existing_reviews_explicitly():
    run_review(r'''
sceneA.materials.push({...sceneA.materials[0],asset_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',title:'2026-11-17 工作回顾.md'});
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
assert.equal(els['work-review'].open,false);
for(const name of ['completed','blocked','next'])assert.equal(els['work-review-'+name].value,'');
assert.equal(els['work-review-evidence'].children.length,0);assert.equal(els['work-review-preview-area'].hidden,true);
assert.equal(calls.length,2);assert.equal(els['work-review-existing'].children.length,1);
respond=(url,options)=>{assert(url.startsWith('/api/project-material?'));assert(!options.method);const ref=sceneA.materials[1];return {...ref,project_id:sceneA.project_id,revision:'2',text:'Previously saved review'};};
await els['work-review-existing'].children[0].events.click[0]();
assert(flat(els['project-detail-content']).includes('Previously saved review'));
assert.equal(els['work-review-completed'].value,'');assert.equal(calls.length,3);
''')


def test_prepare_is_closed_bound_literal_and_does_not_save_or_rebuild_decision_cards():
    run_review(r'''
await openReview();addQuote('Exact original <script>literal</script> 😀');
const cards=[...els['project-decisions'].children],before=calls.length;
await prepareReview();const request=JSON.parse(calls.at(-1).options.body);
assert.deepEqual(Object.keys(request).sort(),['project_id','revision','manifest_hash','day','completed','blocked','next','evidence'].sort());
assert.equal(request.project_id,sceneA.project_id);assert.equal(request.revision,'2');assert.equal(request.manifest_hash,sceneA.manifest_hash);
assert.deepEqual(request.evidence,[{asset_id:source.asset_id,content_hash:source.content_hash,quote:'Exact original <script>literal</script> 😀'}]);
assert(flat(els['work-review-preview']).includes('<script>literal</script>'));assert.equal(els['work-review-preview-area'].hidden,false);
assert.equal(calls.length,before+1);assert(!calls.some(c=>c.url==='/api/project-import'));
assert.deepEqual(els['project-decisions'].children,cards);assert.equal(execute('projectImport'),null);assert.equal(execute('canWrite'),false);
assert.equal(els['work-review-checked'].checked,false);assert.equal(els['work-review-share'].disabled,true);
''')


@pytest.mark.parametrize('values', [dict(completed='', blocked='', next=''), dict(day='2026-02-30'),
                                    dict(completed='中'*2731)])
def test_invalid_date_empty_content_and_utf8_limits_stop_before_request(values):
    run_review(r'''
await openReview();fields(''' + json.dumps(values) + r''');const before=calls.length;
await assert.rejects(execute('prepareWorkReview()'));assert.equal(calls.length,before);
''')


def test_evidence_is_verbatim_in_current_scene_with_eight_quote_limit_and_explicit_removal():
    run_review(r'''
await openReview();
els['work-review-sources'].value=source.asset_id+':'+source.content_hash;execute('workReviewSelectSource()');
assert.equal(els['work-review-source-text'].textContent,source.text);
els['work-review-quote'].value='Invented text';assert.throws(()=>execute('addWorkReviewEvidence()'));
for(let i=0;i<8;i++)addQuote('Original quote '+i+'。');
assert.equal(els['work-review-evidence'].children.length,8);
assert.throws(()=>addQuote('Original quote 8。'));
const row=els['work-review-evidence'].children[0];row.children.find(c=>c.tagName==='BUTTON').events.click[0]();
assert.equal(els['work-review-evidence'].children.length,7);addQuote('Original quote 8。');
await prepareReview();assert.equal(JSON.parse(calls.at(-1).options.body).evidence.length,8);
assert.equal(calls.length,3);
''')


@pytest.mark.parametrize('field', ['day', 'completed', 'blocked', 'next', 'quote', 'source', 'remove'])
def test_any_form_or_evidence_change_invalidates_check_preview_and_local_share(field):
    run_review(r'''
await openReview();addQuote();await prepareReview();
assert.throws(()=>execute('shareWorkReview()'));checkReview();
const count=calls.length;const share=execute('shareWorkReview()');assert(share.includes('Verified completed work'));
assert.equal(els['work-review-share-text'].value,share);assert.equal(calls.length,count);
const field=''' + json.dumps(field) + r''';
if(field==='source')els['work-review-sources'].events.change[0]();
else if(field==='remove')els['work-review-evidence'].children[0].children.find(c=>c.tagName==='BUTTON').events.click[0]();
else {els['work-review-'+field].value+=' edit';els['work-review-'+field].events.input[0]();}
assert.equal(els['work-review-checked'].checked,false);assert.equal(els['work-review-share-area'].hidden,true);
assert.equal(els['work-review-share-text'].value,'');assert.equal(els['work-review-preview-area'].hidden,true);
assert.throws(()=>execute('shareWorkReview()'));assert.equal(calls.length,count);
''')


def test_empty_evidence_is_allowed_and_uncheck_clears_share():
    run_review(r'''
await openReview();await prepareReview();assert.deepEqual(JSON.parse(calls.at(-1).options.body).evidence,[]);
checkReview();execute('shareWorkReview()');els['work-review-checked'].checked=false;execute('checkWorkReview()');
assert.equal(els['work-review-share-text'].value,'');assert.equal(els['work-review-share'].disabled,true);
''')


def test_unknown_save_retries_identical_ordinary_document_without_touching_general_import():
    run_review(r'''
await openReview();addQuote();await prepareReview();execute('beginProjectImport(false)');
const general=execute('projectImport'),cards=[...els['project-decisions'].children];
respond=()=>{throw Error('PRIVATE NETWORK DETAILS');};assert.equal(await execute('saveWorkReview()'),false);
const first=calls.at(-1),body=JSON.parse(first.options.body);
assert.equal(first.url,'/api/project-import');assert.equal(body.archive_ref,null);assert.equal(body.documents.length,1);
assert.equal(body.documents[0].title,'2026-11-17 工作回顾.md');assert.equal(body.expected_revision,'2');
assert.deepEqual(Object.keys(body).sort(),['project_id','title','expected_revision','request_id','documents','archive_ref'].sort());
assert.equal(execute('workReviewSaves.get(workReview.key).phase'),'unknown');
assert.equal(els['work-review-fields'].hidden,true);assert.equal(els['work-review-prepare'].disabled,true);
assert(!els['work-review-status'].textContent.includes('PRIVATE'));
execute('editWorkReview()');await assert.rejects(execute('prepareWorkReview()'));
els['work-review-completed'].value='Different body must never replace retry';execute('workReviewChanged()');
respond=(url,options)=>{assert.equal(options.body,first.options.body);return receipt;};
assert.equal(await execute('saveWorkReview()'),true);assert.equal(execute('workReviewSaves.get(workReview.key).phase'),'saved');
assert.equal(execute('projectImport'),general);assert.deepEqual(els['project-decisions'].children,cards);
assert.equal(execute('projectScene.revision'),'2');assert.equal(calls.length,5);
''')


def test_known_rejection_preserves_request_and_only_explicit_edit_creates_new_request():
    run_review(r'''
await openReview();addQuote();await prepareReview();
respond=()=>({syntheticError:'INVALID_ARGUMENTS',status:400});await execute('saveWorkReview()');
const first=calls.at(-1).options.body;assert.equal(execute('workReviewSaves.get(workReview.key).phase'),'rejected');
await execute('saveWorkReview()');assert.equal(calls.at(-1).options.body,first);
execute('editWorkReview()');assert.equal(els['work-review-completed'].value,'Verified completed work');
assert.equal(execute('workReview.evidence.length'),1);assert.equal(els['work-review-checked'].checked,false);
fields({completed:'Explicitly revised content'});await prepareReview();respond=()=>receipt;await execute('saveWorkReview()');
const second=JSON.parse(calls.at(-1).options.body);assert.notEqual(second.request_id,JSON.parse(first).request_id);
assert(second.documents[0].text.includes('Explicitly revised content'));
''')


@pytest.mark.parametrize('bad', ['project', 'revision', 'manifest', 'document'])
def test_mismatched_prepare_response_never_becomes_a_preview(bad):
    run_review(r'''
await openReview();respond=(url,options)=>{const value=reply(JSON.parse(options.body)),bad=''' + json.dumps(bad) + r''';
if(bad==='project')value.project_id=sceneB.project_id;if(bad==='revision')value.revision='1';if(bad==='manifest')value.manifest_hash='b'.repeat(64);if(bad==='document')value.document.text=3;return value;};
assert.equal(await execute('prepareWorkReview()'),false);assert.equal(els['work-review-preview-area'].hidden,true);
assert.equal(execute('workReview.preview'),null);assert.equal(calls.length,3);
''')


def test_capture_head_advance_recovers_content_on_latest_binding_then_new_preview_and_request():
    run_review(r'''
await openReview();fields({day:'2026-11-16',completed:'Actual work',blocked:'Unresolved',next:'Next work'});addQuote();await prepareReview();checkReview();execute('shareWorkReview()');
// A capture tick advances the advertised head, without replacing the open scene.
execute('projectItems=projectItems.map(item=>item.project_id===projectScene.project_id?{...item,revision:"3",manifest_hash:"f".repeat(64)}:item);syncProjectLatest()');
assert.equal(execute('projectScene.revision'),'2');
respond=()=>({syntheticError:'REVISION_CONFLICT',status:409});await execute('saveWorkReview()');
const oldBody=calls.at(-1).options.body,oldId=JSON.parse(oldBody).request_id;
assert.equal(els['work-review-refresh'].hidden,false);assert.equal(els['work-review-edit'].hidden,true);assert.equal(els['work-review-save'].hidden,true);
const latest=copy(sceneA);latest.revision='3';latest.manifest_hash='f'.repeat(64);latest.snapshots.push({...receipt,saved_at:1794800000000});
respond=(url,options)=>{assert.equal(url,'/api/project?project_id='+sceneA.project_id);assert(!options.method);return latest;};
const before=calls.length;assert.equal(await execute('refreshWorkReview()'),true);assert.equal(calls.length,before+1);
assert.equal(execute('projectScene.revision'),'3');assert.equal(execute('workReview.binding.manifest_hash'),latest.manifest_hash);
for(const [name,value] of Object.entries({day:'2026-11-16',completed:'Actual work',blocked:'Unresolved',next:'Next work'}))assert.equal(els['work-review-'+name].value,value);
assert.equal(execute('workReview.evidence.length'),1);assert.equal(els['work-review-checked'].checked,false);
assert.equal(els['work-review-share-text'].value,'');assert.equal(els['work-review-preview-area'].hidden,true);assert.equal(els['work-review-refresh'].hidden,true);
assert.equal(els['work-review'].open,true);assert.equal(els['work-review-source-warning'].hidden,true);
assert.equal(execute('workReviewSaves.size'),0);assert.throws(()=>execute('shareWorkReview()'));
await assert.rejects(execute('saveWorkReview()'));await prepareReview();
const prepared=JSON.parse(calls.at(-1).options.body);assert.equal(prepared.revision,'3');assert.equal(prepared.manifest_hash,latest.manifest_hash);
respond=()=>({...receipt,revision:'4',manifest_hash:'9'.repeat(64)});await execute('saveWorkReview()');
const body=JSON.parse(calls.at(-1).options.body);assert.equal(body.expected_revision,'3');assert.notEqual(body.request_id,oldId);
assert(body.documents[0].text.includes('Actual work'));assert(body.documents[0].text.includes('Original quote 0。'));
''')


def test_latest_recovery_rechecks_membership_hash_and_quote_and_explicitly_lists_dropped_evidence():
    run_review(r'''
for(let i=1;i<4;i++){
  const ref={...source,asset_id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i).padStart(12,'0'),title:'Source '+i};sceneA.observations.push(ref);sceneA.materials.push({asset_id:ref.asset_id,content_hash:ref.content_hash,title:ref.title});
}
await openReview();addQuote();
for(const ref of sceneA.observations.slice(1)){els['work-review-sources'].value=ref.asset_id+':'+ref.content_hash;els['work-review-quote'].value='Original quote 1。';execute('addWorkReviewEvidence()');}
await prepareReview();respond=()=>({syntheticError:'REVISION_CONFLICT',status:409});await execute('saveWorkReview()');
const latest=copy(sceneA);latest.revision='3';latest.manifest_hash='f'.repeat(64);
latest.materials=latest.materials.filter(ref=>ref.asset_id!==latest.observations[1].asset_id);
latest.materials.find(ref=>ref.asset_id===latest.observations[2].asset_id).content_hash='b'.repeat(64);latest.observations[2].content_hash='b'.repeat(64);
latest.observations[3].text='Quote no longer matches';respond=()=>latest;
assert.equal(await execute('refreshWorkReview()'),true);assert.equal(execute('workReview.evidence.length'),1);
assert.equal(els['work-review-source-warning'].hidden,false);assert(els['work-review-source-warning'].textContent.includes('2、3、4'));
assert(els['work-review-source-warning'].textContent.includes('未加入新回顾'));
await prepareReview();const body=JSON.parse(calls.at(-1).options.body);assert.equal(body.evidence.length,1);assert.equal(body.evidence[0].asset_id,source.asset_id);
assert.equal(els['work-review-source-warning'].hidden,false); // Warning remains visible through the new preview.
''')


def test_unknown_save_never_offers_latest_recovery_and_cannot_change_binding_or_retry_body():
    run_review(r'''
await openReview();await prepareReview();assert.equal(els['work-review-refresh'].hidden,true);
respond=()=>{throw Error('Uncertain network');};await execute('saveWorkReview()');const original=calls.at(-1).options.body,before=calls.length;
assert.equal(els['work-review-refresh'].hidden,true);await assert.rejects(execute('refreshWorkReview()'));
assert.equal(calls.length,before);assert.equal(execute('projectScene.revision'),'2');
respond=(url,options)=>{assert.equal(options.body,original);return receipt;};await execute('saveWorkReview()');
assert.equal(els['work-review-refresh'].hidden,true);
''')


def test_failed_latest_read_preserves_conflicted_request_and_late_recovery_cannot_replace_another_project():
    run_review(r'''
await openReview();addQuote();await prepareReview();respond=()=>({syntheticError:'REVISION_CONFLICT',status:409});await execute('saveWorkReview()');
const key=execute('workReview.key'),serialized=execute('workReviewSaves.get(workReview.key).serialized');
respond=()=>({syntheticError:'READ_UNAVAILABLE',status:503});assert.equal(await execute('refreshWorkReview()'),false);
assert.equal(execute('workReviewSaves.get(workReview.key).serialized'),serialized);assert.equal(els['work-review-refresh'].hidden,false);
assert(els['work-review-status'].textContent.includes('原回顾仍保留'));
let release;respond=()=>new Promise(resolve=>release=resolve);const pending=execute('refreshWorkReview()');
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');fields({completed:'Other project work'});await prepareReview();
const preview=els['work-review-preview'].textContent;release({...sceneA,revision:'3',manifest_hash:'f'.repeat(64)});await pending;
assert.equal(execute('projectScene.project_id'),sceneB.project_id);assert.equal(els['work-review-preview'].textContent,preview);
assert.equal(execute('workReviewSaves.get('+JSON.stringify(key)+').serialized'),serialized);
''')


def test_late_prepare_is_suppressed_and_only_explicit_end_allows_navigation():
    run_review(r'''
await openReview();let release,payload;
respond=(url,options)=>{payload=JSON.parse(options.body);return new Promise(resolve=>release=resolve);};
let pending=execute('prepareWorkReview()');fields({completed:'Changed while preparing'});release(reply(payload));await pending;
assert.equal(execute('workReview.preview'),null);
respond=(url,options)=>{payload=JSON.parse(options.body);return new Promise(resolve=>release=resolve);};
pending=execute('prepareWorkReview()');respond=()=>sceneB;assert.equal(await execute('openProject(sceneB.project_id)'),false);
assert.equal(els['work-review-completed'].value,'Changed while preparing');execute('endProjectEditing()');await execute('openProject(sceneB.project_id)');
release(reply(payload));await pending;
assert.equal(els['work-review-completed'].value,'');assert.equal(els['work-review'].open,false);
assert.equal(els['work-review-preview'].textContent,'');assert.equal(els['work-review-evidence'].children.length,0);
fields();await prepareReview();checkReview();execute('shareWorkReview()');
respond=()=>({...sceneB,...sceneB.snapshots[0]});assert.equal(await execute('selectProjectSnapshot(0)'),false);
assert(els['work-review-share-text'].value);execute('endProjectEditing()');await execute('selectProjectSnapshot(0)');
assert.equal(els['work-review-completed'].value,'');assert.equal(els['work-review-share-text'].value,'');
assert.equal(els['work-review-checked'].checked,false);assert.equal(execute('workReview.binding.revision'),'1');
''')


def test_pending_save_survives_navigation_without_late_response_contaminating_another_scene():
    run_review(r'''
await openReview();addQuote();await prepareReview();let release;
respond=()=>new Promise(resolve=>release=resolve);const pending=execute('saveWorkReview()'),original=calls.at(-1).options.body;
respond=()=>sceneB;await execute('openProject(sceneB.project_id)');fields({completed:'B work'});await prepareReview();
const previewB=els['work-review-preview'].textContent,statusB=els['work-review-status'].textContent;
release({syntheticError:'IMPORT_UNAVAILABLE',status:503});await pending;
assert.equal(els['work-review-preview'].textContent,previewB);assert.equal(els['work-review-status'].textContent,statusB);
assert.equal(execute('projectScene.project_id'),sceneB.project_id);
respond=()=>({...sceneA,...sceneA.snapshots[0]});assert.equal(await execute('openProject(sceneA.project_id,"1")'),false);
assert.equal(els['work-review-preview'].textContent,previewB);execute('endProjectEditing()');await execute('openProject(sceneA.project_id,"1")');
assert.equal(els['work-review-fields'].hidden,false);assert.equal(els['work-review-preview-area'].hidden,true);
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
assert.equal(els['work-review-completed'].value,'');assert.equal(els['work-review-fields'].hidden,true);
assert.equal(els['work-review-checked'].checked,false);assert.equal(els['work-review-share-text'].value,'');
respond=(url,options)=>{assert.equal(options.body,original);return receipt;};await execute('saveWorkReview()');
assert.equal(execute('projectScene.revision'),'2');assert.equal(execute('workReviewSaves.get(workReview.key).phase'),'saved');
''')


def test_withdrawn_source_clears_selected_original_preview_check_and_share():
    run_review(r'''
await openReview();addQuote();await prepareReview();checkReview();execute('shareWorkReview()');
respond=()=>({syntheticError:'ACCESS_DENIED',status:403});await execute('readProjectMaterial(projectScene.materials[0])');
assert.equal(els['work-review-source-text'].textContent,'');assert.equal(els['work-review-preview'].textContent,'');
assert.equal(els['work-review-share-text'].value,'');assert.equal(els['work-review-checked'].checked,false);
assert.equal(execute('workReview.evidence.length'),0);assert.equal(els['work-review-sources'].children.length,1);
''')


def test_work_review_is_closed_without_projects_capability():
    run_review(r'''
assert.equal(calls.length,0);await assert.rejects(execute('prepareWorkReview()'));
await assert.rejects(execute('saveWorkReview()'));assert.throws(()=>execute('shareWorkReview()'));
assert.equal(calls.length,0);
''', dataset=dict(projects='unknown'))


def test_work_review_markup_stays_folded_and_share_is_local_readonly_text():
    structure = Structure()
    structure.feed(PAGE.read_text(encoding='utf-8'))
    nodes = structure.nodes
    assert nodes['work-review'][0] == 'details'
    assert 'open' not in nodes['work-review'][1]
    assert 'readonly' in nodes['work-review-share-text'][1]
    for name in ('day', 'completed', 'blocked', 'next', 'sources', 'prepare', 'save', 'checked', 'share'):
        assert any(attrs.get('id') == 'work-review' for _, attrs in nodes['work-review-'+name][2])
