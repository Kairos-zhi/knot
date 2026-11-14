"""Human workflow contracts exercised as data/DOM logic, without browser clicks."""
from html.parser import HTMLParser
from pathlib import Path
import shutil
import subprocess

import pytest


PAGE = Path(__file__).parents[1] / 'devtools' / 'workbench.html'


class Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.nodes = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            assert attrs['id'] not in self.nodes, 'Duplicate DOM identity'
            self.nodes[attrs['id']] = (tag, attrs, list(self.stack))
        if tag not in {'input', 'meta', 'br', 'hr', 'img', 'link'}:
            self.stack.append((tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break


def test_technical_fields_are_disclosed_separately_from_work_and_recovery():
    structure = Structure()
    structure.feed(PAGE.read_text(encoding='utf-8'))
    nodes = structure.nodes
    for ident in ('exploration', 'revision', 'asset', 'hash', 'offset', 'limit',
                  'page-meta', 'source-result', 'write-summary', 'context-project',
                  'context-task', 'context-preview', 'context-export'):
        assert any(tag == 'details' and 'open' not in attrs
                   for tag, attrs in nodes[ident][2]), ident
    for ident in ('write-feedback', 'recover-save', 'write-state', 'confirm-save',
                  'reader-target', 'stop-note', 'new-draft'):
        assert all(tag != 'details' for tag, _ in nodes[ident][2]), ident
    for pane in ('continue', 'search', 'write'):
        assert nodes['nav-' + pane][0] == 'button'
    assert 'hidden' not in nodes['continue-pane'][1]
    assert 'hidden' in nodes['search-pane'][1]
    assert 'hidden' in nodes['write-pane'][1]
    assert nodes['focus-title'][1]['tabindex'] == '-1'


HARNESS = r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.argv[1],'utf8');
class E {
  constructor(tag='DIV') {this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.attrs={};this.focused=0;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  addEventListener(){}
  setAttribute(key,value){this.attrs[key]=value;}
  focus(){this.focused++;}
  scrollIntoView(){}
  set innerHTML(value){throw Error('Text must never become HTML');}
}
const els={};
for(const m of html.split('<script')[0].matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g))els[m[2]]=new E(m[1]);
const calls=[];
let respond=()=>{throw Error('Unexpected request');};
const ctx=vm.createContext({document:{getElementById:id=>els[id],createElement:tag=>new E(tag),querySelectorAll:()=>Object.values(els).filter(e=>['BUTTON','INPUT','TEXTAREA','SELECT'].includes(e.tagName))},URLSearchParams,crypto:{randomUUID:()=> '33333333-3333-4333-8333-333333333333'},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>respond(url,options)};}});
const execute=code=>vm.runInContext(code,ctx);
execute(html.split('<script id="workbench-code">')[1].split('</script>')[0]);
assert.equal(calls.length,0);
const ref={asset_id:'11111111-1111-4111-8111-111111111111',expected_content_hash:'a'.repeat(64),disposition:'selected',reason:null,status:'available'};
const checkpoint={exploration_id:'22222222-2222-4222-8222-222222222222',revision:'9223372036854775806',event_id:'event',origin:null,stop_note:'<img src=x onerror=alert(1)>',stop_note_reason:null,references:[ref],relations:[]};
ctx.checkpoint=checkpoint;
(async()=>{
'''


def run_logic(body):
    node = shutil.which('node')
    if not node:
        pytest.skip('Node required for programmatic workflow contracts')
    script = HARNESS + body + "\n})().catch(e=>{console.error(e);process.exitCode=1;});"
    result = subprocess.run([node, '-e', script, str(PAGE)], capture_output=True,
                            text=True, timeout=15)
    assert result.returncode == 0, result.stderr


def test_navigation_reads_only_explicit_record_and_single_page():
    run_logic(r'''
assert.equal(els['continue-pane'].hidden,false);
assert.equal(els['search-pane'].hidden,true);
assert.equal(els['write-pane'].hidden,true);
respond=url=>{assert(url.startsWith('/api/checkpoint?'));return checkpoint;};
await execute('openCheckpoint(checkpoint.exploration_id,null)');
assert.equal(calls.length,1);
assert(els.checkpoint.children.some(e=>e.textContent===checkpoint.stop_note));
assert.equal(els['focus-status'].textContent,'已打开保存内容');
respond=url=>{assert(url.startsWith('/api/slice?'));return {text:'<script>literal material</script>\n正文',offset:0,next_offset:24,total_bytes:48,has_more:true};};
await execute('openMaterial(checkpoint.references[0])');
assert.equal(calls.length,2);
assert.equal(els.body.textContent,'<script>literal material</script>\n正文');
assert.equal(els['search-pane'].hidden,false);
assert.equal(els.next.disabled,false);
assert.equal(execute('referenceLabel(checkpoint.references[0])'),'<script>literal material</script>');
ctx.changed={...ref,expected_content_hash:'b'.repeat(64)};
assert.equal(execute('referenceLabel(changed)'),'材料 1（点开阅读）');
ctx.changed={...ref,status:'forbidden'};
assert.equal(execute('referenceLabel(changed)'),'材料 1（目前无法读取）');
execute('showPane("continue")');
assert.equal(calls.length,2); // Navigation never refreshes or prefetches.
assert.equal(els.body.textContent,'<script>literal material</script>\n正文');
assert(els['focus-title'].focused>0);
assert.equal(els['nav-continue'].attrs['aria-pressed'],'true');
''')


def test_draft_target_and_review_survive_other_record_navigation():
    run_logic(r'''
respond=()=>({phase:'empty'});
await execute('beginDraft(false)');
execute('draft.stop_note="保留中的草稿A";renderDraft()');
execute('loaded=checkpoint;showCheckpoint(checkpoint);showPane("search")');
assert(els['reader-target'].textContent.includes('保留中的草稿A'));
assert(!els['reader-target'].textContent.includes(checkpoint.stop_note));
await execute('beginDraft(true)'); // An existing draft is preserved, never silently replaced.
assert.equal(execute('draft.stop_note'),'保留中的草稿A');
assert.equal(execute('draft.expected_revision'),'0');
assert(els['write-feedback'].textContent.includes('保留'));
assert.equal(calls.length,2); // Only explicit local save-state inspection.
execute('draftOperation="own";showWriteState({phase:"prepared",operation_id:"own",digest:"digest"},true)');
assert.equal(els['save-review'].hidden,false);
assert.equal(els['save-review-note'].textContent,'保留中的草稿A');
assert.equal(els['confirm-save'].disabled,false);
assert.equal(els['stop-note'].disabled,true);
assert.equal(els.prepare.className,'');
assert(els['save-review-title'].focused>0);
assert.equal(els['continue-writing'].textContent,'返回未保存草稿');
assert(els['draft-source'].textContent.includes('保留中的草稿A'));
execute('showWriteState({phase:"cancelled",operation_id:"own"},true)');
assert(els['stop-note'].focused>0);
assert.equal(els['stop-note'].disabled,false);
execute('showWriteState({phase:"prepared",operation_id:"own",digest:"digest"},true)');
execute('showPane("continue");showPane("write")');
assert.equal(calls.length,2); // Prepared navigation never confirms.
assert.equal(els['save-review-note'].textContent,'保留中的草稿A');
assert.equal(els['focus-status'].textContent,'等待核对与确认');
execute('draft=null;draftOperation=null;showWriteState({phase:"prepared",operation_id:"own",digest:"digest"})');
assert.equal(els['confirm-save'].disabled,true); // After refresh no unseen body can be confirmed.
assert.equal(els['confirm-save'].hidden,true);
assert.equal(els['cancel-save'].disabled,false);
assert(els['write-feedback'].textContent.includes('原文'));
''')


def test_action_result_is_not_replaced_by_stale_reader_or_loaded_record():
    run_logic(r'''
execute('loaded=checkpoint;showPane("search")');
els.body.textContent='之前读过的正文';
respond=url=>{assert(url.startsWith('/api/search?'));return {items:[],has_more:false};};
await execute('runAction(searchMaterials)');
assert(els.notice.textContent.includes('没找到'));
assert(!els.notice.textContent.includes('已打开'));
assert.equal(els.body.textContent,'之前读过的正文');
respond=url=>{assert(url.startsWith('/api/explorations?'));return {items:[]};};
execute('showPane("continue")');
await execute('runAction(refreshThoughts)');
assert(els.notice.textContent.includes('还没有已保存'));
assert(!els.notice.textContent.includes('请选择一份'));
assert.equal(calls.length,2);
execute('showPane("write");draft={exploration_id:checkpoint.exploration_id,expected_revision:"1",stop_note:"已保存的文字",references:[],relations:[]};draftOperation="own";showWriteState({phase:"saved",operation_id:"own",receipt:{exploration_id:checkpoint.exploration_id,revision:"2"}},true)');
assert.equal(execute('draft'),null);
assert(els['write-feedback'].textContent.includes('已经保存'));
assert(els['write-feedback'].focused>0);
''')


def test_prepared_without_body_can_cancel_then_explicitly_start_again():
    run_logic(r'''
execute('showPane("write");showWriteState({phase:"prepared",operation_id:"old",digest:"digest"})');
assert.equal(execute('draft'),null);
assert.equal(els['confirm-save'].disabled,true);
assert.equal(els['cancel-save'].disabled,false);
respond=(url,options)=>{assert.equal(url,'/api/cancel');assert.equal(options.method,'POST');return {phase:'cancelled',operation_id:'old',digest:'digest'};};
await execute('sendPrepared("cancel")');
assert.equal(calls.length,1);
assert.equal(els['new-draft'].hidden,false);
assert.equal(els['new-draft'].disabled,false);
assert(els['new-draft'].focused>0);
assert.equal(els['stop-note'].disabled,true);
assert(els['write-feedback'].textContent.includes('没有原文'));
assert(els['write-feedback'].textContent.includes('开始写一份新想法'));
respond=url=>{assert(url.startsWith('/api/write-state?'));return {phase:'cancelled',operation_id:'old'};};
await execute('beginDraft(false)');
assert.equal(calls.length,2); // Explicit inspection only, no automatic new preparation/save.
assert.equal(execute('draft.expected_revision'),'0');
assert.equal(execute('draft.stop_note'),null);
assert.equal(els['stop-note'].disabled,false);
assert.equal(els.prepare.disabled,false);
assert.equal(els['new-draft'].hidden,true);
''')


def test_rejected_reread_suppresses_previously_read_name_then_explicitly_recovers():
    run_logic(r'''
execute('loaded=checkpoint;draft=draftFromCheckpoint(checkpoint);renderDraft()');
respond=()=>({text:'PRIVATE first line\n正文',offset:0,next_offset:20,total_bytes:40,has_more:true});
await execute('openMaterial(checkpoint.references[0])');
assert.equal(els['reader-title'].textContent,'PRIVATE first line');
assert.equal(execute('referenceLabel(checkpoint.references[0])'),'PRIVATE first line');
respond=url=>{assert(url.startsWith('/api/search?'));return {items:[{asset_id:ref.asset_id,content_hash:ref.expected_content_hash}],has_more:false};};
await execute('searchMaterials()');
assert(els.results.children[0].children.some(e=>e.textContent==='PRIVATE first line'));
respond=()=>({error:'ACCESS_DENIED'});
await assert.rejects(execute('read({...anchor(),offset:"0",limit:"4096"})'));
assert.equal(els.body.textContent,'');
assert(!els['reader-title'].textContent.includes('PRIVATE'));
assert(els['reader-title'].textContent.includes('无法读取'));
assert.equal(execute('referenceLabel(checkpoint.references[0])'),'材料 1（目前无法读取）');
assert.equal(execute('readLabels.size'),0);
assert.equal(els.next.disabled,true);
assert.equal(els['add-material'].disabled,true);
assert.equal(els['retry-read'].hidden,false);
for(const host of [els.checkpoint,els['draft-materials'],els.results]){
  const row=host.children.find(e=>e.className==='material');
  assert(!row.children.some(e=>e.textContent.includes('PRIVATE')));
}
const row=els.checkpoint.children.find(e=>e.className==='material');
assert(row.children.find(e=>e.textContent==='阅读这份材料').disabled);
assert(els.results.children[0].children.find(e=>e.textContent==='阅读这份材料').disabled);
assert.equal(calls.length,3); // Failure never auto-retries.
respond=()=>({text:'Newly authorized first line',offset:0,next_offset:26,total_bytes:26,has_more:false});
await execute('read({...anchor(),offset:"0",limit:"4096"})');
assert.equal(calls.length,4);
assert.equal(execute('referenceLabel(checkpoint.references[0])'),'Newly authorized first line');
assert.equal(els['retry-read'].hidden,true);
''')


def test_unknown_and_transport_uncertainty_remain_visible_and_locked():
    run_logic(r'''
execute('showWriteState({phase:"unknown",operation_id:"old",digest:"digest"})');
await execute('runAction(async()=>showPane("continue"))');
assert.equal(calls.length,0);
assert(els.notice.textContent.includes('不能确定'));
assert(!els.notice.textContent.includes('已完成'));
assert.equal(els['focus-status'].textContent,'上次保存结果待找回');
assert.equal(els['recover-save'].hidden,false);
assert.equal(els['recover-save'].disabled,false);
assert.equal(els['cancel-save'].disabled,true);
assert.equal(els['new-draft'].disabled,true);
assert.equal(els['add-material'].disabled,true);
respond=()=>({phase:'unknown',operation_id:'old',digest:'digest'});
assert.equal(await execute('beginDraft(false)'),false);
assert.equal(calls.length,1);
assert.equal(execute('draft'),null);
ctx.fetch=async()=>{throw Error('PRIVATE transport details');};
await assert.rejects(execute('sendPrepared("recover")'),e=>!e.message.includes('PRIVATE'));
assert.equal(execute('writeState.phase'),'unchecked_pending');
assert.equal(els['write-state'].hidden,false);
assert.equal(els['recover-save'].disabled,true); // Inspect state before trying the same recovery again.
assert.equal(els['cancel-save'].disabled,true);
''')
