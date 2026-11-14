from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import shutil
import socket
import subprocess
from uuid import uuid4

import pytest
from test_workbench import environment,running,request,TOKEN
from test_workbench_draft import post
from mvp.backend import http_server
from mvp.backend.exploration_repo import ExplorationRepo
from mvp.devtools.workbench import create_server
from mvp.devtools.context_packet import publish_new
from mvp.context_sync_policy import PacketError


def inputs(environment):
    _,_,db,aid,_,eid=environment
    snapshot=ExplorationRepo(db).load_v2('local-user',eid,revision=1)
    return dict(exploration_id=eid,revision='1',event_id=snapshot['event_id'],namespace_id=str(uuid4()),
                project_id=str(uuid4()),task_id=str(uuid4()),instance_id=str(uuid4()),reported_status='blocked',
                summary='Operator project summary',allow_assets=[aid])


def start(environment,tmp_path):
    root=tmp_path/'private-packets';root.mkdir()
    return create_server(environment[1],TOKEN,packet_root=root),root


def test_form_prepare_one_get_export_offline_and_repeat(environment,tmp_path,monkeypatch):
    server,root=start(environment,tmp_path)
    body=inputs(environment)
    original_reply=http_server.Handler.reply;reads=[]
    def reply(handler,status,value):
        if '/v2' in handler.path:reads.append(handler.path)
        return original_reply(handler,status,value)
    monkeypatch.setattr(http_server.Handler,'reply',reply)
    with running(server) as port:
        assert server.writer is None
        status,preview=post(port,'context-prepare',body)
        assert status==200 and preview['phase']=='prepared'
        assert len(reads)==1 and 'revision=1' in reads[0]
        assert preview['proposal']['scope']['project_id']==body['project_id']
        assert preview['proposal']['evidence'][0]['asset_id']==environment[3]
        assert 'Synthetic stopping point' not in json.dumps(preview)
        assert str(root) not in json.dumps(preview) and TOKEN not in json.dumps(preview)
        actual=socket.create_connection
        def offline(address,*a,**kw):
            assert address[1]==port,'export connected to a non-workbench port'
            return actual(address,*a,**kw)
        monkeypatch.setattr(socket,'create_connection',offline)
        binding={k:preview[k] for k in ('packet_id','digest')}
        status,result=post(port,'context-export',binding)
        assert status==200 and result['uploaded'] is False and result['existing'] is False
        target=root/result['filename'];original=target.read_bytes()
        assert json.loads(original)['proposal']==preview['proposal']
        assert post(port,'context-export',binding)[1]['existing'] is True
        assert target.read_bytes()==original and len(reads)==1


def test_defaults_and_closed_inputs(environment,tmp_path):
    with running(create_server(environment[1],TOKEN)) as port:
        assert post(port,'context-prepare',inputs(environment))[0]==405
    server,root=start(environment,tmp_path)
    with running(server) as port:
        assert post(port,'context-prepare',inputs(environment)|{'output':'outside.json'})[0]==409
        assert post(port,'context-export',{'packet_id':'../../outside','digest':'a'*64})[0]==400
        assert not list(root.iterdir())
        body=inputs(environment);body['allow_assets']=[]
        preview=post(port,'context-prepare',body)[1]
        assert preview['proposal']['evidence']==[]


def test_reader_change_pin_and_cross_origin(environment,tmp_path):
    server,root=start(environment,tmp_path)
    body=inputs(environment)
    with running(server) as port:
        assert post(port,'context-prepare',body,{'Origin':'https://foreign.example'})[0]==403
        assert post(port,'context-prepare',body|{'event_id':str(uuid4())})[0]==409
        import sqlite3
        with sqlite3.connect(environment[2]) as conn:conn.execute('DELETE FROM asset_readers')
        assert post(port,'context-prepare',body)[0]==409
        assert not list(root.iterdir())


@pytest.mark.parametrize('change',[
    lambda p:p.update(extra='bad'),
    lambda p:p['local_confirmation'].update(actor_verified=0),
    lambda p:p['proposal']['scope'].update(task_id=str(uuid4())),
])
def test_unknown_existing_packet_is_not_overwritten(environment,tmp_path,change):
    server,root=start(environment,tmp_path)
    with running(server) as port:
        preview=post(port,'context-prepare',inputs(environment))[1]
        binding={k:preview[k] for k in ('packet_id','digest')}
        result=post(port,'context-export',binding)[1];target=root/result['filename']
        altered=json.loads(target.read_bytes());change(altered)
        target.unlink()  # Test-owned synthetic file only.
        publish_new(target,altered);before=target.read_bytes()
        status,error=post(port,'context-export',binding)
        assert status==409 and error=={'error':'OUTPUT_CONFLICT'}
        assert target.read_bytes()==before


def test_concurrent_exports_publish_one_verified_packet(environment,tmp_path):
    server,root=start(environment,tmp_path)
    preview=server.context.prepare(inputs(environment));binding={k:preview[k] for k in ('packet_id','digest')}
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:server.context.export(binding),range(2)))
        assert sorted(r['existing'] for r in results)==[False,True]
        assert len(list(root.glob('*.packet.json')))==1
    finally:server.server_close()


def test_failed_private_publish_never_reports_success(environment,tmp_path,monkeypatch):
    server,root=start(environment,tmp_path)
    from mvp.devtools import context_workbench
    def fail(*a):raise PacketError('PRIVATE_OUTPUT_REQUIRED')
    with running(server) as port:
        preview=post(port,'context-prepare',inputs(environment))[1]
        monkeypatch.setattr(context_workbench,'publish_new',fail)
        status,error=post(port,'context-export',{k:preview[k] for k in ('packet_id','digest')})
        assert status==409 and error=={'error':'PRIVATE_OUTPUT_REQUIRED'}
        assert not list(root.glob('*.packet.json'))


def test_context_form_logic_without_clicks():
    node=shutil.which('node')
    if not node:pytest.skip('Node required')
    page=Path(__file__).parents[1]/'devtools/workbench.html'
    script=r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.argv[1],'utf8');
class E{constructor(tag='DIV'){this.tagName=tag;this.children=[];this.value='';this.checked=false;this.disabled=false;this.style={};this.dataset={};this.textContent='';}append(e){this.children.push(e);}replaceChildren(){this.children=[];}addEventListener(){}}
const els={};for(const m of html.matchAll(/id="([^"]+)"/g))els[m[1]]=new E();
let calls=[],resolve;const ctx=vm.createContext({document:{getElementById:id=>els[id],createElement:t=>new E(t.toUpperCase())},URLSearchParams,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:()=>new Promise(r=>resolve=r)};}});
vm.runInContext(html.split('<script id="workbench-code">')[1].split('</script>')[0],ctx);assert.equal(calls.length,0);
ctx.source={exploration_id:'source',revision:'9223372036854775806',event_id:'event',references:[{asset_id:'a',expected_content_hash:'hash',disposition:'selected',status:'available'}]};
vm.runInContext('selectContextSource(source)',ctx);assert.equal(els['context-evidence'].children[0].children[0].checked,false);assert.equal(vm.runInContext('contextBody().allow_assets.length',ctx),0);assert.equal(vm.runInContext('contextBody().revision',ctx),'9223372036854775806');
vm.runInContext('contextPreview={packet_id:"old",digest:"old"};document.getElementById("context-ack").checked=true;invalidateContext()',ctx);assert.equal(els['context-export'].disabled,true);assert.equal(els['context-ack'].checked,false);
(async()=>{const promise=vm.runInContext('prepareContext()',ctx);await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(calls.length,1);await assert.rejects(vm.runInContext('prepareContext()',ctx));assert.equal(calls.length,1);vm.runInContext('invalidateContext()',ctx);resolve({phase:'prepared',packet_id:'stale',digest:'stale',proposal:{summary:'old'}});await assert.rejects(promise);assert.equal(vm.runInContext('contextPreview',ctx),null);assert.equal(els['context-export'].disabled,true);
ctx.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({phase:'prepared',packet_id:'current',digest:'hash',proposal:{summary:'<img src=x onerror=alert(1)>'}})};};await vm.runInContext('prepareContext()',ctx);assert(els['context-preview'].textContent.includes('<img src=x'));assert.equal(els['context-ack'].checked,false);await assert.rejects(vm.runInContext('exportContext()',ctx));assert.equal(calls.length,2);
let finishExport;ctx.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:()=>new Promise(r=>finishExport=r)};};els['context-ack'].checked=true;const exported=vm.runInContext('exportContext()',ctx);await Promise.resolve();await Promise.resolve();await Promise.resolve();vm.runInContext('clearContextSource()',ctx);finishExport({filename:'old.packet.json',existing:false});await assert.rejects(exported);assert.equal(vm.runInContext('contextPreview',ctx),null);assert.equal(els['context-export'].disabled,true);assert(!els['context-feedback'].textContent.includes('已在本机导出'));console.log('PASS: no auto calls, unchecked evidence, exact pin, request exclusion, stale preview/export rejected, literal text, explicit ack required');})().catch(e=>{console.error(e);process.exitCode=1;});
'''
    result=subprocess.run([node,'-e',script,str(page)],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
