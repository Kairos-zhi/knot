"""Programmatic browser logic and actual HTTP save bridge checks; no UI clicks."""
from http.client import HTTPConnection
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import socket

import pytest
from test_workbench import environment, running, request, TOKEN
from mvp.devtools.workbench import create_server
from mvp.backend import http_server


def post(port,action,value,headers=None):
    conn=HTTPConnection('127.0.0.1',port,timeout=5)
    standard={'Origin':f'http://127.0.0.1:{port}','X-Knot-Action':'explicit','Content-Type':'application/json'}
    standard.update(headers or {})
    try:
        conn.request('POST','/api/'+action,body=json.dumps(value),headers=standard)
        result=conn.getresponse()
        return result.status,json.loads(result.read())
    finally: conn.close()


def test_http_preparation_confirmation_and_restart(environment,tmp_path):
    _,backend,db,aid,digest,eid=environment
    root=tmp_path/'private-save-journal'
    draft=dict(exploration_id=eid,expected_revision='1',snapshot_version=2,
               references=[dict(asset_id=aid,expected_content_hash=digest,disposition='selected',reason=None)],
               stop_note='Private pending question',relations=[])
    with running(create_server(backend,TOKEN,state_root=root)) as port:
        status,value=post(port,'prepare',draft)
        assert status==200 and value['phase']=='prepared'
        assert 'Private pending question' not in json.dumps(value)
        binding={k:value[k] for k in ('operation_id','digest')}
        with sqlite3.connect(db) as conn:
            assert conn.execute('SELECT COUNT(*) FROM exploration_revisions').fetchone()[0]==1
    # Reopening the bridge does not send the prepared request.
    with running(create_server(backend,TOKEN,state_root=root)) as port:
        state=json.loads(request(port,'/api/write-state')[1])
        assert state['phase']=='prepared'
        status,saved=post(port,'confirm',binding)
        assert status==200 and saved['phase']=='saved'
        assert saved['receipt']['revision']=='2'
        checkpoint=json.loads(request(port,'/api/checkpoint?exploration_id='+eid+'&revision=2')[1])
        assert checkpoint['stop_note']=='Private pending question'
        assert post(port,'confirm',binding)[0]==409
        assert json.loads(request(port,'/api/write-state')[1])['phase']=='saved'
        with sqlite3.connect(db) as conn:
            assert conn.execute('SELECT COUNT(*) FROM exploration_revisions').fetchone()[0]==2


@pytest.mark.parametrize('headers',[
    {'Origin':'https://foreign.example'}, {'X-Knot-Action':'automatic'},
    {'Content-Type':'text/plain'}, {'Sec-Fetch-Site':'cross-site'},
])
def test_writes_require_explicit_same_origin(environment,tmp_path,headers):
    with running(create_server(environment[1],TOKEN,state_root=tmp_path/'journal')) as port:
        assert post(port,'prepare',{},headers)[0]==403
        assert json.loads(request(port,'/api/write-state')[1])['phase']=='empty'


def test_committed_save_lost_response_then_explicit_recovery(environment,tmp_path,monkeypatch):
    _,backend,db,aid,digest,eid=environment
    root=tmp_path/'lost-response-journal'
    original=http_server.Handler.reply
    writes=[]
    drop=[True]
    def reply(handler,status,body):
        if handler.path=='/exploration-v2-saves':
            writes.append(body)
            if drop[0] and status==200:
                drop[0]=False
                handler.close_connection=True
                handler.connection.shutdown(socket.SHUT_RDWR)
                return
        return original(handler,status,body)
    monkeypatch.setattr(http_server.Handler,'reply',reply)
    draft=dict(exploration_id=eid,expected_revision='1',snapshot_version=2,
               references=[dict(asset_id=aid,expected_content_hash=digest,disposition='selected',reason=None)],
               stop_note='Original uncertain save',relations=[])
    with running(create_server(backend,TOKEN,state_root=root)) as port:
        _,prepared=post(port,'prepare',draft)
        binding={k:prepared[k] for k in ('operation_id','digest')}
        _,unknown=post(port,'confirm',binding)
        assert unknown['phase']=='unknown'
        assert len(writes)==1
    with running(create_server(backend,TOKEN,state_root=root)) as port:
        assert json.loads(request(port,'/api/write-state')[1])['phase']=='unknown'
        assert len(writes)==1  # No startup or state read automatically sends.
        assert post(port,'prepare',draft)[0]==409
        assert post(port,'cancel',binding)[0]==409
        monkeypatch.setenv('KNOT_TOKEN',TOKEN+'-rotated')
        _,denied=post(port,'recover',binding)
        assert denied['phase']=='unknown' and denied['error']=='ACCESS_DENIED'
        assert post(port,'prepare',draft)[0]==409
        monkeypatch.setenv('KNOT_TOKEN',TOKEN)
        _,saved=post(port,'recover',binding)
        assert saved['phase']=='saved' and saved['receipt']['revision']=='2'
        assert len(writes)==3
        assert writes[0]==writes[2]  # Same event receipt replayed by real backend.
        with sqlite3.connect(db) as conn:
            assert conn.execute('SELECT COUNT(*) FROM exploration_revisions').fetchone()[0]==2
            assert conn.execute('SELECT COUNT(DISTINCT event_id) FROM exploration_revisions').fetchone()[0]==2


def test_draft_programmatic_semantics(tmp_path):
    node=shutil.which('node')
    if not node: pytest.skip('Node unavailable')
    page=Path(__file__).parents[1]/'devtools'/'workbench.html'
    code=r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.argv[1],'utf8');
class E{constructor(tag='DIV'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.dataset={};this.disabled=false;}append(e){this.children.push(e);}replaceChildren(){this.children=[];}addEventListener(){}}
const els={};for(const m of html.matchAll(/id="([^"]+)"/g))els[m[1]]=new E();
let calls=[];let answer={phase:'prepared',operation_id:'op',digest:'digest'};
const ctx=vm.createContext({document:{getElementById:id=>els[id],createElement:t=>new E(t.toUpperCase())},URLSearchParams,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>answer};}});
vm.runInContext(html.split('<script id="workbench-code">')[1].split('</script>')[0],ctx);assert.equal(calls.length,0);
const ref={asset_id:'a',expected_content_hash:'b',disposition:'selected',reason:'why',status:'available'};
ctx.checkpoint={exploration_id:'x',revision:'9223372036854775806',stop_note:'pending',stop_note_reason:null,references:[ref],relations:[]};
vm.runInContext('draft=draftFromCheckpoint(checkpoint);renderDraft()',ctx);
assert.equal(vm.runInContext('draft.expected_revision',ctx),'9223372036854775806');
ctx.checkpoint.references[0].status='forbidden';assert.throws(()=>vm.runInContext('draftFromCheckpoint(checkpoint)',ctx));
ctx.checkpoint.references[0].status='available';delete ctx.checkpoint.references[0].reason;assert.throws(()=>vm.runInContext('draftFromCheckpoint(checkpoint)',ctx));
vm.runInContext('draftOperation="op";showWriteState({phase:"prepared",operation_id:"op",digest:"digest"})',ctx);
assert.equal(els['stop-note'].disabled,true);assert.equal(els['confirm-save'].disabled,false);assert.equal(els['recover-save'].disabled,true);
vm.runInContext('showWriteState({phase:"unknown",operation_id:"op",digest:"digest",error:"ACCESS_DENIED"})',ctx);
assert.equal(els['cancel-save'].disabled,true);assert.equal(els['recover-save'].disabled,false);assert.equal(calls.length,0);
vm.runInContext('draftOperation=null;draft.stop_note="newer unsaved B";showWriteState({phase:"saved",operation_id:"oldA",receipt:{exploration_id:"oldA",revision:"2"}})',ctx);assert.equal(vm.runInContext('draft.stop_note',ctx),'newer unsaved B');
vm.runInContext('post("prepare",draft)',ctx).then(async()=>{assert.equal(calls.length,1);assert(calls[0].url.endsWith('/prepare'));assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.headers['X-Knot-Action'],'explicit');ctx.fetch=async()=>({ok:true,json:async()=>{throw Error('SECRET_PRIVATE_PARSE');}});for(const expression of ['get("write-state")','post("confirm",{})']){try{await vm.runInContext(expression,ctx);assert.fail('must reject malformed JSON');}catch(e){assert(!e.message.includes('SECRET'));}}console.log('PASS: zero auto send, exact revision, suppressed draft rejected, explicit post, locked unknown, unrelated draft preserved, fixed parse errors');}).catch(e=>{console.error(e);process.exitCode=1;});
'''
    result=subprocess.run([node,'-e',code,str(page)],capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
