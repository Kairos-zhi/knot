"""Existing actions remain distinct inside explicit work sections."""
import json
import shutil
import subprocess

import pytest

from test_workbench_usability import HARNESS, PAGE, Structure, run_logic
from test_workbench_history import VIEW


def run_capabilities(dataset, body):
    node = shutil.which('node')
    if not node:
        pytest.skip('Node required for capability workflow contracts')
    declared = 'body:{dataset:{write:"enabled",context:"enabled"}},'
    replacement = '' if dataset is None else 'body:{dataset:' + json.dumps(dataset) + '},'
    assert declared in HARNESS
    script = HARNESS.replace(declared, replacement) + body
    result = subprocess.run([node, '-e', script +
                             '\n})().catch(e=>{console.error(e);process.exitCode=1;});', str(PAGE)],
                            capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr


def test_section_ownership_and_navigation_groups():
    structure = Structure()
    structure.feed(PAGE.read_text(encoding='utf-8'))
    nodes = structure.nodes
    for ident, section in [('stop-note', 'write-copy'), ('new-draft', 'write-copy'),
                           ('draft-materials', 'write-materials'), ('relation-apply', 'write-materials'),
                           ('prepare', 'write-save'), ('confirm-save', 'write-save'),
                           ('recover-save', 'write-save'), ('search', 'search-find')]:
        assert any(attrs.get('id') == section for _, attrs in nodes[ident][2])
    for ident in ('nav-history', 'nav-search', 'nav-continue', 'nav-write'):
        assert any(attrs.get('class') == 'nav-group' for _, attrs in nodes[ident][2])
    for ident in ('history-expand', 'history-collapse', 'history-background-toggle'):
        assert 'disabled' in nodes[ident][1]
    assert nodes['history-background-toggle'][1]['aria-controls'] == 'history-background'


def test_evidence_and_background_actions_are_local_and_synchronized():
    run_logic('respond=()=>('+json.dumps(VIEW)+');'+r'''
await execute('loadDecisionHistory()');
assert.equal(calls.length,1);
assert.equal(els['history-count'].textContent,'2 项记录');
assert.equal(els['history-rail'].children.length,3);
assert.equal(execute('historyEntries[0].rail.attrs["aria-current"]'),'true');
execute('selectHistoryEntry("archived-choice")');
assert.equal(execute('historyEntries[1].rail.attrs["aria-current"]'),'true');
assert.equal(execute('historyEntries[0].rail.attrs["aria-current"]'),'false');
assert.equal(execute('historyEntries[1].heading.focused'),1);
assert(els['history-position'].textContent.includes('Archived choice'));
execute('selectHistoryEntry("plan")');
assert.equal(els['history-background'].open,true);
assert.equal(els['history-background-toggle'].attrs['aria-expanded'],'true');
execute('toggleHistoryBackground()');
assert.equal(execute('historyEntries[0].rail.attrs["aria-current"]'),'true');
execute('toggleHistoryEntry("choice")');
assert.equal(execute('historyEntries[0].rail.attrs["aria-current"]'),'true');
assert.equal(execute('historyEntries[0].button.attrs["aria-expanded"]'),'true');
execute('toggleHistoryEntry("choice")');
assert.equal(els['history-expand'].disabled,false);
assert.equal(els['history-collapse'].disabled,true);
execute('setHistoryEvidence(true)');
assert.equal(els['history-expand'].disabled,true);
assert.equal(els['history-collapse'].disabled,false);
assert(execute('historyEntries.filter(e=>e.personal).every(e=>e.details.open&&e.button.attrs["aria-expanded"]==="true"&&e.button.textContent==="收起原话")'));
assert.equal(execute('!!historyEntries.find(e=>!e.personal).details.open'),false);
execute('setHistoryEntry(historyEntries[0],false)');
assert.equal(els['history-expand'].disabled,false);
execute('setHistoryEvidence(false);toggleHistoryBackground()');
assert.equal(els['history-background'].open,true);
assert.equal(els['history-background-toggle'].attrs['aria-expanded'],'true');
assert.equal(els['history-background-title'].focused,1);
execute('toggleHistoryBackground()');
assert.equal(els['history-background-toggle'].textContent,'查看路线背景');
assert.equal(calls.length,1); // Disclosure never reads a source or writes data.
respond=()=>{throw Error('private upstream failure');};
await assert.rejects(execute('loadDecisionHistory()'));
assert.equal(execute('historyEntries.length'),0);
assert.equal(els['history-rail'].children.length,0);
for(const id of ['history-expand','history-collapse','history-background-toggle'])assert.equal(els[id].disabled,true);
assert.equal(els['history-list'].children.length,0);
assert.equal(els['history-plans'].children.length,0);
assert.equal(calls.length,2);
''')


def test_rail_preserves_package_order_and_empty_state_is_truthful():
    mixed = dict(VIEW, items=[VIEW['items'][2], VIEW['items'][0], VIEW['items'][1]])
    run_logic('respond=()=>('+json.dumps(mixed)+');'+r'''
await execute('loadDecisionHistory()');
assert.equal(execute('historyEntries.map(e=>e.id).join(",")'),'plan,choice,archived-choice');
assert.equal(execute('historyEntries.find(e=>e.personal).rail.attrs["aria-current"]'),'true');
assert.equal(els['history-background'].open,false);
respond=()=>({title:'Empty',items:[],has_unavailable:false});
await execute('loadDecisionHistory()');
assert.equal(els['history-position'].textContent,'暂无可定位记录。');
assert.equal(els['history-rail'].children.length,0);
assert.equal(els['history-background-toggle'].disabled,true);
''')


@pytest.mark.parametrize('write', ['enabled', 'disabled'])
@pytest.mark.parametrize('context', ['enabled', 'disabled'])
def test_two_capabilities_are_independent_and_never_probe(write, context):
    run_capabilities(dict(write=write, context=context), r'''
assert.equal(calls.length,0);
const writable=execute('canWrite'),exportable=execute('canContext');
assert.equal(els['nav-write'].disabled,!writable);
assert.equal(els['reader-write'].disabled,!writable);
assert.equal(els['add-material'].disabled,!writable);
assert.equal(els['context-panel'].hidden,!exportable);
assert.equal(els['context-source'].disabled,!exportable);
assert.equal(els['context-new-ids'].disabled,!exportable);
execute('loaded=checkpoint;showCheckpoint(checkpoint);syncDraftControls();syncContextControls()');
assert.equal(els['continue-writing'].disabled,!writable);
assert.equal(els['context-prepare'].disabled,true); // No fixed source yet.
if(exportable){
  execute('selectContextSource(checkpoint)');
  assert.equal(els['context-prepare'].disabled,false);
  assert.equal(execute('contextAllowed.size'),0); // Loading is not evidence authorization.
  respond=(url,options)=>{
    assert.equal(url,'/api/context-prepare');
    assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body).allow_assets,[]);
    return {packet_id:'synthetic',digest:'digest',proposal:{summary:'local only'}};
  };
  await execute('prepareContext()');
  assert.equal(els['context-export'].disabled,true); // Explicit acknowledgement still required.
  els['context-ack'].checked=true;execute('syncContextControls()');
  assert.equal(els['context-export'].disabled,false);
  respond=(url)=>{assert.equal(url,'/api/context-export');return {filename:'synthetic.json',existing:false};};
  await execute('exportContext()');
  assert.equal(calls.length,2);
  assert.equal(execute('draft'),null);
}else{
  assert.throws(()=>execute('selectContextSource(checkpoint)'));
  await assert.rejects(execute('prepareContext()'));
  await assert.rejects(execute('exportContext()'));
  await assert.rejects(execute('post("context-prepare",{})'));
  assert.equal(calls.length,0);
}
if(!writable){
  const before=calls.length;
  assert(els['reader-target'].textContent.includes('回顾阅读模式'));
  await assert.rejects(execute('beginDraft(false)'));
  await assert.rejects(execute('inspectWrite()'));
  await assert.rejects(execute('prepareDraft()'));
  await assert.rejects(execute('post("prepare",{})'));
  execute('showWriteState({phase:"unknown",operation_id:"old",digest:"digest"})');
  await assert.rejects(execute('sendPrepared("recover")'));
  assert.equal(execute('writeState.phase'),'unknown');
  assert.equal(els['recover-save'].disabled,true);
  assert.equal(calls.length,before); // No guaranteed-to-fail save/state call.
}else{
  execute('draft=draftFromCheckpoint(checkpoint);draftOperation="own";showWriteState({phase:"prepared",operation_id:"own",digest:"digest"})');
  assert.equal(els['confirm-save'].disabled,false);
  assert.equal(els['stop-note'].disabled,true);
  assert.equal(els['add-material'].disabled,true);
  execute('showWriteState({phase:"unknown",operation_id:"own",digest:"digest"})');
  assert.equal(els['confirm-save'].disabled,true);
  assert.equal(els['new-draft'].disabled,true);
  assert.equal(els['recover-save'].disabled,false);
}
''')


@pytest.mark.parametrize('dataset', [None, {}, {'write': 'unknown', 'context': 'unknown'},
                                    {'write': 'ENABLED', 'context': True},
                                    {'write': 'enabled'}, {'context': 'enabled'}])
def test_missing_and_unknown_declarations_fail_closed(dataset):
    run_capabilities(dataset, r'''
assert.equal(calls.length,0);
assert.equal(execute('canWrite'),''' + json.dumps((dataset or {}).get('write') == 'enabled') + r''');
assert.equal(execute('canContext'),''' + json.dumps((dataset or {}).get('context') == 'enabled') + r''');
if(!execute('canWrite')){
  assert.equal(els['nav-write'].disabled,true);
  await assert.rejects(execute('beginDraft(false)'));
  await assert.rejects(execute('sendPrepared("confirm")'));
  assert.equal(execute('draft'),null);
}
if(!execute('canContext')){
  assert.equal(els['context-panel'].hidden,true);
  await assert.rejects(execute('prepareContext()'));
}
assert.equal(calls.length,0);
''')


def test_reading_and_recall_preserve_draft_target_and_explicit_selection():
    run_logic('respond=()=>(' + json.dumps(VIEW) + ');' + r'''
execute('draft=draftFromCheckpoint(checkpoint);draft.stop_note="正在写的原目标";renderDraft();contextAllowed.add("keep-explicit")');
const original=execute('JSON.stringify(draft)');
await execute('loadDecisionHistory()');
execute('selectHistoryEntry("archived-choice");toggleHistoryEntry("choice");toggleHistoryBackground()');
assert.equal(execute('JSON.stringify(draft)'),original);
assert.equal(execute('Array.from(contextAllowed).join(",")'),'keep-explicit');
respond=()=>({text:'另一份材料',offset:0,next_offset:18,total_bytes:18,has_more:false});
await execute('openMaterial({asset_id:"55555555-5555-4555-8555-555555555555",content_hash:"c".repeat(64)})');
assert.equal(execute('JSON.stringify(draft)'),original);
assert.equal(execute('draft.exploration_id'),checkpoint.exploration_id);
assert(els['reader-target'].textContent.includes('正在写的原目标'));
assert.equal(execute('Array.from(contextAllowed).join(",")'),'keep-explicit');
assert.equal(calls.length,2); // Recall + one explicit page, never save/authorization.
const entry=execute('historyEntries[0]');
assert(entry.row.children.some(e=>e.textContent==='此前：Previous direction'));
assert(entry.row.children.some(e=>e.textContent==='方向：Current direction'));
assert(entry.rail.children.some(e=>e.textContent==='Current direction'));
assert.equal(execute('historyDate({kind:"direct_user_message",occurred_on:null})'),'原消息日期未知 · 原话记录');
''')


def test_disabled_writer_still_reads_without_inviting_save_in_empty_state():
    run_capabilities({'write': 'disabled', 'context': 'disabled'}, r'''
respond=()=>({items:[]});
const message=await execute('refreshThoughts()');
assert(!message.includes('开始写'));
assert(!els.list.children.some(e=>e.textContent.includes('留下这次想法')));
respond=()=>({text:'可阅读正文',offset:0,next_offset:15,total_bytes:30,has_more:true});
await execute('runAction(()=>openMaterial(checkpoint.references[0]))');
assert.equal(els.body.textContent,'可阅读正文');
assert.equal(els.next.disabled,false);
assert.equal(els['add-material'].disabled,true);
assert.equal(els['reader-write'].disabled,true);
assert(els['reader-target'].textContent.includes('回顾阅读模式'));
assert.equal(execute('draft'),null);
assert.equal(calls.length,2);
''')
