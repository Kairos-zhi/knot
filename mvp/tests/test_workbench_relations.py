"""Relation exploration through page functions and real HTTP, never UI clicks."""
from hashlib import sha256
import json
import shutil
import sqlite3
import subprocess
from uuid import uuid4

import pytest

from test_workbench import environment, running, request, TOKEN
from test_workbench_draft import post
from test_workbench_usability import HARNESS, PAGE, run_logic
from mvp.devtools.workbench import create_server


SETUP = r'''
let serial=1;
ctx.crypto.randomUUID=()=> '50000000-0000-4000-8000-'+String(serial++).padStart(12,'0');
ctx.second={...ref,asset_id:'44444444-4444-4444-8444-444444444444',expected_content_hash:'b'.repeat(64)};
execute('checkpoint.references.push(second);draft=draftFromCheckpoint(checkpoint);renderDraft()');
function fill(label='补充',reason='联系的理由'){
  els['relation-from'].value=ref.asset_id;els['relation-to'].value=ctx.second.asset_id;
  els['relation-label'].value=label;els['relation-reason'].value=reason;
  execute('syncDraftControls()');
}
'''


def test_add_edit_remove_are_local_and_preserve_identity_and_original():
    run_logic(SETUP + r'''
fill();execute('applyRelationForm()');
const first=JSON.parse(execute('JSON.stringify(draft.relations[0])'));
assert.equal(checkpoint.relations.length,0);
assert.equal(first.from_asset_id,ref.asset_id);
assert.equal(first.to_asset_id,ctx.second.asset_id);
assert.equal(els['draft-relations'].children.length,1);
assert(els['relation-editor-title'].focused>0);
ctx.rid=first.relation_id;execute('openRelationEditor(rid)');
assert.equal(els['relation-from'].disabled,true);
els['relation-from'].value=ctx.second.asset_id;els['relation-to'].value=ref.asset_id;
assert.throws(()=>execute('applyRelationForm()'),/解除/);
assert.equal(execute('draft.relations[0].from_asset_id'),ref.asset_id);
els['relation-from'].value=ref.asset_id;els['relation-to'].value=ctx.second.asset_id;
els['relation-label'].value='修订后的联系';els['relation-reason'].value='先前理由不充分';
execute('applyRelationForm()');
assert.equal(execute('draft.relations[0].relation_id'),first.relation_id);
assert.equal(execute('draft.relations[0].label'),'修订后的联系');
assert.equal(execute('draft.relations[0].reason'),'先前理由不充分');
execute('openRelationEditor(rid)');els['relation-label'].value='取消的修改';execute('cancelRelationForm()');
assert.equal(execute('draft.relations[0].label'),'修订后的联系');
assert.equal(els['relation-label'].value,'');
assert(els['relation-editor-title'].focused>=3);
execute('removeDraftRelation(rid)');
assert.equal(execute('draft.relations.length'),0);
assert.equal(execute('draft.references.length'),2);
assert.equal(calls.length,0);
''')


def test_relation_text_limits_use_utf8_and_reject_invalid_characters():
    run_logic(SETUP + r'''
for(const value of ['中'.repeat(42),'x'.repeat(128)]){ctx.value=value;execute('validateRelationText(value,128,true)');}
for(const value of ['中'.repeat(43),'x'.repeat(129),'   ',String.fromCharCode(1),String.fromCharCode(127),String.fromCharCode(0xd800)]){ctx.value=value;assert.throws(()=>execute('validateRelationText(value,128,true)'));}
ctx.value='中'.repeat(170);execute('validateRelationText(value,512)');
ctx.value='中'.repeat(171);assert.throws(()=>execute('validateRelationText(value,512)'));
fill('关系','');execute('applyRelationForm()');assert.equal(execute('draft.relations[0].reason'),null);
assert.equal(calls.length,0);
''')


def test_relation_endpoints_and_count_cannot_expand_selection():
    run_logic(SETUP + r'''
fill();els['relation-to'].value=ref.asset_id;assert.throws(()=>execute('applyRelationForm()'));
fill();execute('draft.references[1].disposition="excluded"');assert.throws(()=>execute('applyRelationForm()'));
assert.equal(execute('draft.references[1].disposition'),'excluded');
execute('draft.references[1].disposition="selected";unavailableAnchors.add(second.asset_id+":"+second.expected_content_hash)');
fill();assert.throws(()=>execute('applyRelationForm()'));
execute('unavailableAnchors.clear()');fill();execute('applyRelationForm()');
execute('draft.relations=Array.from({length:64},(_,i)=>({...draft.relations[0],relation_id:"60000000-0000-4000-8000-"+String(i).padStart(12,"0")}));renderDraft()');
fill();assert.throws(()=>execute('applyRelationForm()'),/64/);
assert.equal(execute('draft.relations.length'),64);assert.equal(calls.length,0);
''')


def test_pending_form_prevents_prepare_and_preserves_inputs_on_navigation():
    run_logic(SETUP + r'''
fill('未应用的联系','保留编辑');
assert.equal(els.prepare.disabled,true);
assert.equal(els['relation-editor-title'].textContent,'联系修改未应用');
assert.equal(els['relation-feedback'].textContent,'展开联系，应用或取消后再保存。');
await assert.rejects(execute('prepareDraft()'),/先应用或取消/);
execute('showPane("search");showPane("write")');
assert.equal(els['relation-label'].value,'未应用的联系');
assert.equal(els['relation-reason'].value,'保留编辑');assert.equal(calls.length,0);
execute('applyRelationForm()');assert.equal(els.prepare.disabled,false);
respond=(url,options)=>{assert.equal(url,'/api/prepare');const body=JSON.parse(options.body);assert.equal(body.relations[0].label,'未应用的联系');return {phase:'prepared',operation_id:'own',digest:'digest'};};
await execute('prepareDraft()');assert.equal(calls.length,1);
assert.equal(els['save-review-relations'].children.length,1);
const row=els['save-review-relations'].children[0];
assert(row.children.some(e=>e.textContent==='未应用的联系'));
assert(row.children.some(e=>e.textContent==='保留编辑'));
assert(row.children.some(e=>e.textContent.includes(' → ')));
assert.equal(els['confirm-save'].disabled,false);
assert.equal(els['relation-label'].disabled,true);
''')


def test_relation_actions_are_locked_for_prepared_unknown_and_unchecked():
    run_logic(SETUP + r'''
fill();execute('applyRelationForm()');ctx.rid=execute('draft.relations[0].relation_id');
for(const phase of ['prepared','unknown','unchecked_pending']){
  ctx.phase=phase;execute('draftOperation="own";showWriteState({phase,operation_id:"own",digest:"digest"})');
  assert.throws(()=>execute('openRelationEditor(rid)'));
  assert.throws(()=>execute('removeDraftRelation(rid)'));
  assert.throws(()=>execute('applyRelationForm()'));
  assert.equal(els['relation-label'].disabled,true);
  assert.equal(els['relation-apply'].disabled,true);
  const row=els['draft-relations'].children[0];
  assert(row.children.filter(e=>e.tagName==='BUTTON').every(e=>e.disabled));
}
assert.equal(execute('draft.relations.length'),1);assert.equal(calls.length,0);
''')


def test_literal_preview_and_revocation_suppress_relation_descriptions():
    run_logic(SETUP + r'''
fill('<img src=x onerror=alert(1)>','PRIVATE relation reason');execute('applyRelationForm()');
ctx.rid=execute('draft.relations[0].relation_id');
execute('loaded={...checkpoint,relations:draft.relations.map(r=>({...r}))};showCheckpoint(loaded);openRelationEditor(rid)');
els['relation-label'].value='未应用的修改';
respond=()=>({error:'ACCESS_DENIED'});
await assert.rejects(execute('read({asset_id:second.asset_id,expected_hash:second.expected_content_hash,offset:"0",limit:"4096"})'));
for(const host of [els.checkpoint,els['draft-relations']]){
  const row=host.children.find(e=>e.className==='relation');
  assert(!row.children.some(e=>e.textContent.includes('PRIVATE')||e.textContent.includes('<img')));
  assert(row.children.some(e=>e.textContent.includes('不可用')));
}
assert.equal(els['relation-fields'].hidden,true);assert.equal(els['relation-apply'].disabled,true);
assert.equal(els['relation-cancel'].disabled,false);
assert.equal(execute('draft.relations[0].reason'),'PRIVATE relation reason');
respond=()=>({text:'Newly authorized material',offset:0,next_offset:25,total_bytes:25,has_more:false});
await execute('read({asset_id:second.asset_id,expected_hash:second.expected_content_hash,offset:"0",limit:"4096"})');
assert.equal(els['relation-fields'].hidden,false);
assert.equal(els['relation-from'].value,ref.asset_id);assert.equal(els['relation-to'].value,ctx.second.asset_id);
assert.equal(els['relation-label'].value,'未应用的修改');
execute('applyRelationForm();draftOperation="own";showWriteState({phase:"prepared",operation_id:"own",digest:"digest"})');
const review=els['save-review-relations'].children[0];assert(review.children.some(e=>e.textContent==='PRIVATE relation reason'));
execute('unavailableAnchors.add(second.asset_id+":"+second.expected_content_hash);renderDraft()');
assert.equal(els['confirm-save'].disabled,true);
assert(els['write-feedback'].textContent.includes('不可用'));
assert(!els['save-review-relations'].children[0].children.some(e=>e.textContent.includes('PRIVATE')));
assert.equal(calls.length,2);
''')


def test_unapplied_new_relation_keeps_endpoints_and_hides_fields_on_revocation():
    run_logic(SETUP + r'''
els['relation-from'].value=ref.asset_id;execute('syncDraftControls()');
assert.equal(els['relation-fields'].hidden,false); // A partial choice must remain editable.
fill('PRIVATE pending label','PRIVATE pending reason');
assert.throws(()=>execute('assertMaterialRelationChange(second.asset_id)'),/应用或取消/);
respond=()=>({error:'ACCESS_DENIED'});
await assert.rejects(execute('read({asset_id:second.asset_id,expected_hash:second.expected_content_hash,offset:"0",limit:"4096"})'));
assert.equal(els['relation-from'].value,ref.asset_id);
assert.equal(els['relation-to'].value,ctx.second.asset_id);
assert.equal(els['relation-fields'].hidden,true);
assert.equal(els['relation-apply'].disabled,true);
assert.equal(els['relation-cancel'].disabled,false);
assert.equal(els.prepare.disabled,true);
assert.equal(els['relation-label'].value,'PRIVATE pending label');
assert.equal(execute('draft.relations.length'),0);
assert.throws(()=>execute('applyRelationForm()'));
assert.equal(calls.length,1); // No automatic retry or preparation.
respond=()=>({text:'Authorized again',offset:0,next_offset:16,total_bytes:16,has_more:false});
await execute('read({asset_id:second.asset_id,expected_hash:second.expected_content_hash,offset:"0",limit:"4096"})');
assert.equal(els['relation-fields'].hidden,false);
assert.equal(els['relation-from'].value,ref.asset_id);
assert.equal(els['relation-to'].value,ctx.second.asset_id);
assert.equal(els['relation-reason'].value,'PRIVATE pending reason');
execute('applyRelationForm()');assert.equal(execute('draft.relations.length'),1);
assert.equal(calls.length,2);
''')


def page_draft(checkpoint, change):
    node = shutil.which('node')
    if not node:
        pytest.skip('Node required for page-to-HTTP evidence')
    code = HARNESS + 'ctx.snapshot=' + json.dumps(checkpoint) + ';\n'
    code += "execute('draft=draftFromCheckpoint(snapshot);renderDraft()');\n" + change
    code += "\nconsole.log(execute('JSON.stringify(draft)'));\n})().catch(e=>{console.error(e);process.exitCode=1;});"
    result = subprocess.run([node, '-e', code, str(PAGE)], capture_output=True,
                            text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_page_relation_lifecycle_through_real_http_preserves_versions(environment, tmp_path):
    _, backend, db, first, digest, eid = environment
    second = str(uuid4())
    body = b'Second synthetic comparison material'
    other_hash = sha256(body).hexdigest()
    with sqlite3.connect(db) as conn:
        conn.execute('INSERT INTO assets (asset_id,content_hash,media_type,content_blob,created_at,imported_at) VALUES (?,?,\'text/plain\',?,0,0)', (second, other_hash, body))
        conn.execute('INSERT INTO asset_readers VALUES (?,?)', (second, 'local-user'))
    with running(create_server(backend, TOKEN, state_root=tmp_path/'journal')) as port:
        def load(revision=None):
            suffix = '' if revision is None else '&revision=' + str(revision)
            return json.loads(request(port, '/api/checkpoint?exploration_id='+eid+suffix)[1])

        initial = load()
        initial['references'].append(dict(asset_id=second, expected_content_hash=other_hash,
                                          disposition='selected', reason=None, status='available'))
        create = (
            'ctx.crypto.randomUUID=()=>"77777777-7777-4777-8777-777777777777";'
            'els["relation-from"].value=' + json.dumps(first) + ';'
            'els["relation-to"].value=' + json.dumps(second) + ';'
            'els["relation-label"].value="需要比较";els["relation-reason"].value="两条路线还没想清楚";'
            'execute("applyRelationForm()");'
        )
        drafts = []
        for expected_revision, change in [(1, create), (2, 'execute("openRelationEditor(draft.relations[0].relation_id)");els["relation-label"].value="补充而非支持";els["relation-reason"].value="修订原判断";execute("applyRelationForm()");'),
                                          (3, 'execute("removeDraftRelation(draft.relations[0].relation_id)");')]:
            draft = page_draft(initial if expected_revision == 1 else load(), change)
            drafts.append(draft)
            status, prepared = post(port, 'prepare', draft)
            assert status == 200 and prepared['phase'] == 'prepared'
            assert load()['revision'] == str(expected_revision)  # Preparation is local only.
            status, saved = post(port, 'confirm', {key: prepared[key] for key in ('operation_id', 'digest')})
            assert status == 200 and saved['phase'] == 'saved'
            assert load()['relations'] == draft['relations']
        assert load(1)['relations'] == []
        assert load(2)['relations'] == drafts[0]['relations']
        assert load(3)['relations'] == drafts[1]['relations']
        assert load(4)['relations'] == []
        assert drafts[0]['relations'][0]['relation_id'] == drafts[1]['relations'][0]['relation_id']
        with sqlite3.connect(db) as conn:
            assert conn.execute('SELECT COUNT(*) FROM exploration_revisions').fetchone()[0] == 4
