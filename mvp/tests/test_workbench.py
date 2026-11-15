from contextlib import contextmanager
from hashlib import sha256
from http.client import HTTPConnection
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import threading
from urllib.parse import urlencode
from uuid import uuid4

import pytest

from mvp.backend.init_db import init_database
from mvp.backend.http_server import Server
from mvp.backend.exploration_repo import ExplorationRepo
from mvp.devtools.workbench import create_server, project
from mvp.devtools import workbench

TOKEN = 'workbench-synthetic-secret-20261114'


@contextmanager
def running(server):
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port
    finally:
        server.shutdown(); thread.join(5); server.server_close()


def request(port, path, method='GET', headers=None):
    conn = HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        return response.status, response.read(), dict(response.getheaders())
    finally:
        conn.close()


@pytest.fixture
def environment(tmp_path, monkeypatch):
    monkeypatch.setenv('KNOT_TOKEN', TOKEN)
    monkeypatch.delenv('KNOT_TOKENS', raising=False)
    db = tmp_path / 'synthetic.db'
    assert init_database(str(db))['status'] == 'created'
    aid, eid = str(uuid4()), str(uuid4())
    body = ('Long synthetic text 中文\n' * 1000).encode()
    digest = sha256(body).hexdigest()
    with sqlite3.connect(db) as conn:
        conn.execute('INSERT INTO assets (asset_id,content_hash,media_type,content_blob,created_at,imported_at) VALUES (?,?,\'text/plain\',?,0,0)', (aid,digest,body))
        conn.execute('INSERT INTO asset_readers VALUES (?,?)', (aid,'local-user'))
    ref = dict(asset_id=aid,expected_content_hash=digest,disposition='selected')
    ExplorationRepo(db).save_v2('local-user',eid,expected_revision=0,request_key=str(uuid4()),snapshot_version=2,references=[ref],stop_note='Synthetic stopping point',relations=[])
    with running(Server(str(db), 0)) as backend:
        with running(create_server(backend,TOKEN)) as port:
            yield port, backend, db, aid, digest, eid


def test_real_backend_projection_and_explicit_single_page(environment):
    port, backend, db, aid, digest, eid = environment
    status, raw, headers = request(port, '/')
    assert status == 200 and TOKEN.encode() not in raw
    assert b'<script src="/workbench.js" defer>' in raw
    assert headers['Cache-Control'] == 'no-store'
    assert 'frame-ancestors' in headers['Content-Security-Policy']
    listing = json.loads(request(port,'/api/explorations')[1])
    assert listing['items'][0]['exploration_id'] == eid
    assert listing['items'][0]['revision'] == '1'
    loaded = json.loads(request(port,'/api/checkpoint?'+urlencode(dict(exploration_id=eid)))[1])
    assert loaded['stop_note'] == 'Synthetic stopping point'
    page = json.loads(request(port,'/api/slice?'+urlencode(dict(asset_id=aid,expected_hash=digest,offset=0,limit=64)))[1])
    assert page['has_more'] is True and len(page['text'].encode()) <= 64
    assert page['next_offset'] <= 64
    source = json.loads(request(port,'/api/source?'+urlencode(dict(asset_id=aid,expected_hash=digest)))[1])
    assert source['source_status'] == 'unknown' and source['provenance_verified'] is False
    # GET projections create no revisions or events.
    with sqlite3.connect(db) as conn:
        assert conn.execute('SELECT COUNT(*) FROM exploration_revisions').fetchone()[0] == 1


def test_reader_revocation_and_bad_hash(environment):
    port, backend, db, aid, digest, eid = environment
    params = dict(asset_id=aid,expected_hash='0'*64,offset=0,limit=64)
    assert 'error' in json.loads(request(port,'/api/slice?'+urlencode(params))[1])
    with sqlite3.connect(db) as conn: conn.execute('DELETE FROM asset_readers')
    params['expected_hash'] = digest
    assert json.loads(request(port,'/api/slice?'+urlencode(params))[1]) == {'error':'ACCESS_DENIED'}
    loaded = json.loads(request(port,'/api/checkpoint?'+urlencode(dict(exploration_id=eid)))[1])
    assert loaded['stop_note'] is None and loaded['references'][0]['status'] == 'forbidden'


@pytest.mark.parametrize('action,args', [
    ('explorations',{}), ('search',{'query':'sample'}),
    ('checkpoint',{'exploration_id':str(uuid4())}),
    ('slice',{'asset_id':str(uuid4()),'expected_hash':'a'*64,'offset':'0','limit':'4'}),
    ('source',{'asset_id':str(uuid4()),'expected_hash':'a'*64}),
])
def test_http_200_error_shaped_content_never_bypasses_projection(monkeypatch,action,args):
    monkeypatch.setattr(workbench,'upstream',lambda *a: {'error':'malicious','raw_private_field':'PRIVATE_SENTINEL'})
    result = project(1,action,args,TOKEN)
    assert result == {'error':'UPSTREAM_ERROR'}
    assert 'PRIVATE_SENTINEL' not in json.dumps(result)


@pytest.mark.parametrize('path,method,headers,status', [
    ('/api/explorations','POST',{},405),
    ('/api/explorations','GET',{'Origin':'https://foreign.example'},403),
    ('/api/explorations','GET',{'Host':'foreign.example'},403),
    ('/api/explorations','GET',{'Sec-Fetch-Site':'cross-site'},403),
    ('/api/explorations?limit=2','GET',{},400),
    ('/api/checkpoint?exploration_id=x&exploration_id=y','GET',{},400),
    ('/api/commands','GET',{},400),
])
def test_boundary(environment,path,method,headers,status):
    assert request(environment[0],path,method,headers)[0] == status


def test_page_logic_without_browser_or_clicks(tmp_path):
    node = shutil.which('node')
    if not node: pytest.skip('Node required for page logic evidence')
    page = Path(__file__).parents[1] / 'devtools' / 'workbench.html'
    script = r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.argv[1],'utf8');
const code=html.split('<script id="workbench-code">')[1].split('</script>')[0];
class E{constructor(){this.children=[];this.dataset={};this.value='';this.textContent='';this.disabled=false;}append(e){this.children.push(e);}replaceChildren(){this.children=[];}addEventListener(){}setAttribute(key,value){this[key]=value;}}
const elements={};for(const match of html.matchAll(/id="([^"]+)"/g))elements[match[1]]=new E();
let count=0;const context=vm.createContext({document:{body:{dataset:{write:"enabled",context:"enabled"}},getElementById:id=>elements[id],createElement:()=>new E()},URLSearchParams,fetch:async()=>{count++;return {ok:true,json:async()=>({text:'one page',offset:0,next_offset:8,total_bytes:16,has_more:true})};}});
vm.runInContext(code,context);assert.equal(count,0);
context.sample={exploration_id:'x',revision:1,origin:null,stop_note:'<img src=x onerror=alert(1)>',references:[],relations:[]};
vm.runInContext('showCheckpoint(sample)',context);
assert(elements.checkpoint.children.some(e=>e.textContent===context.sample.stop_note));
context.sample.references=[{asset_id:'unavailable',expected_content_hash:'a',disposition:'selected',status:'forbidden'}];
context.sample.relations=[{from_asset_id:'a',to_asset_id:'b',reason_code:'dependency_unavailable'}];
vm.runInContext('showCheckpoint(sample)',context);
const material=elements.checkpoint.children.find(e=>e.className==='material');assert(material.children.find(e=>e.textContent==='阅读这份材料').disabled);
assert(elements.checkpoint.children.some(e=>e.className==='relation'));
vm.runInContext('read({asset_id:"a",expected_hash:"b",offset:"0",limit:"8"})',context).then(()=>{assert.equal(count,1);assert.equal(elements.body.textContent,'one page');assert.equal(elements.next.disabled,false);vm.runInContext('choose("different","hash")',context);assert.equal(elements.next.disabled,true);assert.equal(elements.body.textContent,'');console.log('PASS: zero initial reads, literal source text, one page request, reset anchors');}).catch(e=>{console.error(e);process.exitCode=1;});
'''
    result = subprocess.run([node,'-e',script,str(page)],capture_output=True,text=True,timeout=10)
    assert result.returncode == 0, result.stderr
