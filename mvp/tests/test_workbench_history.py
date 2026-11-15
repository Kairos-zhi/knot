"""Automatic decision recall only for an explicitly bound archive; no browser clicks."""
import json
import shutil
import subprocess

import pytest

from test_workbench_usability import HARNESS, PAGE, Structure, run_logic


VIEW = dict(
    archive_id='11111111-1111-4111-8111-111111111111', archive_hash='a'*64,
    title='Synthetic saved choices', method='curated_recap', has_unavailable=False,
    items=[
        dict(id='choice', kind='direct_user_message', title='<img src=x onerror=alert(1)>',
             before='Previous direction', after='Current direction', reason='Reason from source',
             occurred_on='2024-01-01', archived_on=None, document_on=None, caution=None,
             evidence=[dict(asset_id='22222222-2222-4222-8222-222222222222', content_hash='b'*64,
                            title='Synthetic source', quote='<script>literal quote</script>',
                            message_time_ms=1704038400000,
                            source_url='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333')]),
        dict(id='archived-choice', kind='archived_user_excerpt', title='Archived choice',
             before=None, after='Current direction', reason=None, occurred_on=None,
             archived_on='2024-01-02', document_on=None, caution='Exact message date unknown',
             evidence=[dict(asset_id='22222222-2222-4222-8222-222222222222', content_hash='b'*64,
                            title='Synthetic archive', quote='Original archived words',
                            message_time_ms=None, source_url=None)]),
        dict(id='plan', kind='document_plan', title='Historical proposal',
             before=None, after='Proposed direction', reason=None, occurred_on=None,
             archived_on=None, document_on='2023-12-01', caution='Not proof of user confirmation',
             evidence=[dict(asset_id='22222222-2222-4222-8222-222222222222', content_hash='b'*64,
                            title='Synthetic plan', quote='Pending decision', message_time_ms=None, source_url=None)]),
    ],
)


def test_default_entry_has_no_automatic_requests():
    structure = Structure()
    structure.feed(PAGE.read_text(encoding='utf-8'))
    assert 'hidden' in structure.nodes['nav-history'][1]
    run_logic(r'''
assert.equal(calls.length,0);
assert.equal(els['history-pane'].hidden,true);
assert.equal(execute('autoHistory'),false);
''')


def test_bound_mode_loads_once_and_distinguishes_archive_dates_and_background():
    node = shutil.which('node')
    if not node: pytest.skip('Node required')
    harness = HARNESS.replace('document:{getElementById:',
                             'document:{body:{dataset:{history:"enabled"}},getElementById:')
    harness = harness.replace("let respond=()=>{throw Error('Unexpected request');};",
                              'let respond=()=>('+json.dumps(VIEW)+');')
    harness = harness.replace('assert.equal(calls.length,0);', 'assert.equal(calls.length,1);')
    body = r'''
await execute('historyLoad');
assert.equal(calls.length,1);assert(calls[0].url.startsWith('/api/decisions?'));
assert.equal(els['history-pane'].hidden,false);
assert.equal(els['continue-pane'].hidden,true);
assert.equal(els['nav-history'].hidden,false);
assert.equal(els['history-title'].textContent,'Synthetic saved choices');
assert.equal(els['history-list'].children.length,2);
assert.equal(els['history-plans'].children.length,1);
assert.equal(els['history-background'].hidden,false);
const first=els['history-list'].children[0];
assert(first.children.some(e=>e.textContent==='<img src=x onerror=alert(1)>'));
assert(first.children.find(e=>e.tagName==='DETAILS').children.some(e=>e.textContent==='<script>literal quote</script>'));
const archived=els['history-list'].children[1];
assert(archived.children[0].textContent.includes('原消息日期未知'));
assert(archived.children[0].textContent.includes('2024-01-02'));
assert(archived.children.some(e=>e.className==='history-caution'&&e.textContent==='Exact message date unknown'));
assert.equal(els.notice.hidden,true);
assert(!els['history-list'].children.some(e=>e.children.some(n=>n.textContent==='Historical proposal')));
respond=()=>{throw Error('PRIVATE upstream exception');};
await assert.rejects(execute('loadDecisionHistory()'),e=>!e.message.includes('PRIVATE'));
assert.equal(els['history-list'].children.length,0);
assert.equal(els['history-plans'].children.length,0);
assert.equal(els['history-background'].hidden,true);
assert.equal(calls.length,2); // No automatic retry or body/source prefetch.
'''
    result = subprocess.run([node, '-e', harness+body+"\n})().catch(e=>{console.error(e);process.exitCode=1;});",
                             str(PAGE)], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr


def test_empty_and_withheld_history_have_no_placeholder_decisions():
    run_logic(r'''
respond=()=>({archive_id:'x',archive_hash:'a',title:'Saved choices',method:'curated_recap',items:[],has_unavailable:false});
await execute('loadDecisionHistory()');
assert.equal(els['history-list'].children.length,0);
assert.equal(els['history-plans'].children.length,0);
assert.equal(els['history-state'].textContent,'还没有可读的决定记录。');
respond=()=>({archive_id:'x',archive_hash:'a',title:'Saved choices',method:'curated_recap',items:[],has_unavailable:true});
await execute('loadDecisionHistory()');
assert.equal(els['history-list'].children.length,0);
assert(els['history-state'].textContent.includes('相关记录已隐藏'));
assert.equal(calls.length,2);
''')


def test_history_status_is_separate_from_a_pending_save():
    run_logic(r'''
execute('showWriteState({phase:"unknown",operation_id:"old",digest:"digest"});showPane("history")');
respond=()=>({archive_id:'x',archive_hash:'a',title:'Saved choices',method:'curated_recap',items:[],has_unavailable:false});
await execute('loadDecisionHistory()');
assert.equal(els['focus-status'].textContent,'暂无可读决定');
assert.equal(els.notice.hidden,true);
assert.equal(els['nav-write-state'].hidden,false);
assert.equal(els['nav-write-state'].textContent,'保存结果待查');
execute('showPane("write")');
assert.equal(els.notice.hidden,false);
assert.equal(els['focus-status'].textContent,'上次保存结果待找回');
assert.equal(execute('writeState.phase'),'unknown');
''')
