import json
import sqlite3
from http.client import HTTPConnection
from urllib.parse import urlsplit
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
import time
import pytest

from mvp.backend.init_db import init_database
from mvp.backend.exploration_repo import ExplorationRepo
from mvp.backend.http_server import ROUTES, Server, Fault
from mvp.backend.migrate_schema_v1_8 import migrate_schema as migrate8
from mvp.backend.migrate_schema_v1_9 import migrate_schema as migrate9
from mvp.backend.migrate_schema_v1_5 import migrate_schema as migrate5
from mvp.backend.migrate_schema_v1_6 import migrate_schema as migrate6
from mvp.backend.migrate_schema_v1_7 import migrate_schema as migrate7
from mvp.backend import migrate_schema_v1_7
from mvp.contract.selfcheck import request, validate
from mvp.tests.test_http_contract import Live
from mvp.tests.test_exploration_core import asset, db_rows, uid
from mvp.tests.schema_helpers import create_v14

TOKEN = 'synthetic-token-09c3a'

@pytest.fixture
def server(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({TOKEN:'A','synthetic-other':'B'}))
    db=tmp_path/'isolated.db'; assert init_database(db)['status']=='created'
    a,b=asset(db,b'a'),asset(db,b'b')
    live=Live(db)
    try: yield live,db,a,b
    finally: live.stop()


def test_save_load_fork_and_old_guard(server):
    live,db,a,b=server; ident,key=uid(),uid(); rid=uid()
    relation=dict(relation_id=rid,from_asset_id=a['asset_id'],to_asset_id=b['asset_id'],label='related',reason='why')
    body=dict(exploration_id=ident,expected_revision=0,request_key=key,snapshot_version=2,references=[a,b],stop_note='note',relations=[relation])
    status,saved=request(live.base,'/exploration-v2-saves',body,token=TOKEN); assert status==200
    validate(saved, next(r for r in ROUTES if r['path']=='/exploration-v2-saves'))
    path='/explorations/'+ident+'/v2'; value=request(live.base,path,token=TOKEN)[1]['value']
    validate(request(live.base,path,token=TOKEN)[1], next(r for r in ROUTES if r['response']=='ExplorationCheckpointV2'))
    assert value['relations'][0]['label']=='related' and value['origin'] is None
    assert request(live.base,'/explorations/'+ident,token=TOKEN)[1]['error']['detail']['reason']=='snapshot_version_required'
    branch=uid(); fork=dict(source_exploration_id=ident,source_revision=1,source_event_id=saved['value']['event_id'],exploration_id=branch,request_key=uid())
    status,receipt=request(live.base,'/exploration-forks',fork,token=TOKEN); assert status==200
    origin=request(live.base,'/explorations/'+branch+'/v2',token=TOKEN)[1]['value']['origin']
    assert set(origin)=={'source_exploration_id','source_revision','source_event_id','source_snapshot_sha256','target_creation_event_id'}
    assert request(live.base,'/exploration-forks',fork,token=TOKEN)==(status,receipt)
    validate(receipt, next(r for r in ROUTES if r['path']=='/exploration-forks'))
    assert request(live.base,path,token='synthetic-other')[0]==404
    assert request(live.base,path)[0]==403
    db_rows(db,'DELETE FROM asset_readers WHERE asset_id=?',(b['asset_id'],))
    view=request(live.base,path,token=TOKEN)[1]['value']
    assert view['stop_note'] is None and view['relations'][0]['reason_code']=='dependency_unavailable'
    assert 'label' not in view['relations'][0] and 'reason' not in view['relations'][0]
    assert request(live.base,'/exploration-forks',fork,token=TOKEN)==(status,receipt)
    assert db_rows(db,'SELECT count(*) FROM exploration_origins')==[(1,)]


def test_sensitive_and_strict(server):
    live,db,a,b=server; ident=uid()
    base=dict(exploration_id=ident,expected_revision=0,request_key=uid(),snapshot_version=2,references=[a,b],stop_note=None,relations=[])
    for body in (base|{'snapshot_version':True}, {k:v for k,v in base.items() if k!='stop_note'}, base|{'actor':'A'}):
        assert request(live.base,'/exploration-v2-saves',body,token=TOKEN)[0]==400
    rel=dict(relation_id=uid(),from_asset_id=a['asset_id'],to_asset_id=b['asset_id'],label=TOKEN,reason='private')
    result=request(live.base,'/exploration-v2-saves',base|{'relations':[rel]},token=TOKEN)
    assert result[0]==400 and result[1]['error']['detail']['reason']=='sensitive_content'
    assert not db_rows(db,'SELECT * FROM exploration_revisions')


def test_historical_sensitive_content_redacted(server):
    live,db,a,b=server; repo=ExplorationRepo(db); ident=uid()
    relation=dict(relation_id=uid(),from_asset_id=a['asset_id'],to_asset_id=b['asset_id'],label=TOKEN,reason='do not leak')
    saved=repo.save_v2('A',ident,expected_revision=0,request_key=uid(),snapshot_version=2,
                       references=[a,b],stop_note=TOKEN,relations=[relation])
    value=request(live.base,'/explorations/'+ident+'/v2',token=TOKEN)[1]['value']
    assert value['stop_note'] is None and value['stop_note_reason']=='sensitive_content'
    assert value['relations'][0]['reason_code']=='sensitive_content'
    assert 'label' not in value['relations'][0] and 'reason' not in value['relations'][0]
    branch=uid(); fork=dict(source_exploration_id=ident,source_revision=1,source_event_id=saved['event_id'],exploration_id=branch,request_key=uid())
    status,receipt=request(live.base,'/exploration-forks',fork,token=TOKEN)
    assert status==200 and TOKEN not in json.dumps(receipt)
    branch_view=request(live.base,'/explorations/'+branch+'/v2',token=TOKEN)[1]['value']
    assert branch_view['stop_note'] is None and branch_view['relations'][0]['reason_code']=='sensitive_content'
    db_rows(db,'DELETE FROM asset_readers WHERE asset_id=?',(a['asset_id'],))
    value=request(live.base,'/explorations/'+ident+'/v2',token=TOKEN)[1]['value']
    assert value['stop_note_reason']=='dependency_unavailable'
    assert value['relations'][0]['reason_code']=='dependency_unavailable'


def test_schema_matrix(tmp_path,monkeypatch):
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A'})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'matrix.db'; create_v14(db); migrate5(db); migrate6(db); migrate7(db)
    for version in ('1.7','1.8','1.9'):
        live=Live(db)
        try:
            assert request(live.base,'/health')[1]['value']['schema_version']==version
            body=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
            status,answer=request(live.base,'/exploration-v2-saves',body,token=TOKEN)
            if version=='1.7': assert status==409 and answer['error']['detail']['reason']=='exploration_migration_required'
            else: assert status==200
            fork=dict(source_exploration_id=body['exploration_id'],source_revision=1,source_event_id=answer.get('value',{}).get('event_id',uid()),exploration_id=uid(),request_key=uid())
            status,answer=request(live.base,'/exploration-forks',fork,token=TOKEN)
            if version!='1.9': assert status==409 and answer['error']['detail']['reason']=='exploration_migration_required'
            else: assert status==200
        finally: live.stop()
        if version=='1.7': migrate8(db)
        if version=='1.8': migrate9(db)


def test_malformed_raw_and_size(server):
    live,db,a,b=server; origin=urlsplit(live.base)
    for payload in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":"\xff"}', b'['*10000+b'0'+b']'*10000):
        conn=HTTPConnection(origin.hostname,origin.port,timeout=3)
        conn.request('POST','/exploration-v2-saves',payload,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
        response=conn.getresponse(); assert response.status==400; response.read(); conn.close()
    assert not db_rows(db,'SELECT * FROM exploration_revisions')


def test_pending_rejects_replay_until_recovery(tmp_path,monkeypatch):
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A'})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'pending.db'; init_database(db)
    server=Server(db,port=0); thread=Thread(target=server.serve_forever,daemon=True); thread.start()
    base='http://127.0.0.1:'+str(server.server_port)
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    try:
        with server.changed: server.journal['pending']={'body':{},'actor':'A','since':0}
        assert request(base,'/exploration-v2-saves',args,token=TOKEN)[0]==409
        assert not db_rows(db,'SELECT * FROM exploration_revisions')
        with server.changed: server.journal.pop('pending')
        receipt=request(base,'/exploration-v2-saves',args,token=TOKEN); assert receipt[0]==200
        with server.changed: server.jobs.failed=True
        assert request(base,'/exploration-v2-saves',args,token=TOKEN)[0]==409
        with server.changed: server.jobs.failed=False
        assert request(base,'/exploration-v2-saves',args,token=TOKEN)==receipt
        assert db_rows(db,'SELECT count(*) FROM exploration_revisions')==[(1,)]
    finally:
        server.shutdown(); server.server_close(); thread.join()


def test_bad_snapshot_and_structure_have_fixed_errors(server):
    live,db,a,b=server; ident=uid()
    ExplorationRepo(db).save_v2('A',ident,expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    db_rows(db,'DROP TRIGGER exploration_revisions_update')
    db_rows(db,'UPDATE exploration_revisions SET snapshot_json=? WHERE exploration_id=?',('{"broken":"secret"}',ident))
    db_rows(db,migrate_schema_v1_7._DDL['exploration_revisions_update'])
    status,body=request(live.base,'/explorations/'+ident+'/v2',token=TOKEN)
    assert status==500 and body['error']['detail']=={'reason':'exploration_snapshot_invalid'}
    assert 'secret' not in json.dumps(body)
    db_rows(db,'DROP TRIGGER exploration_revisions_update')
    status,body=request(live.base,'/explorations/'+ident+'/v2',token=TOKEN)
    assert status==409 and body['error']['detail']=={'reason':'exploration_schema_invalid'}


def test_token_as_structural_id_is_refused(tmp_path,monkeypatch):
    token=uid(); monkeypatch.setenv('KNOT_TOKENS',json.dumps({token:'A'})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'token.db'; init_database(db)
    repo=ExplorationRepo(db); repo.save_v2('A',token,expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    live=Live(db)
    try:
        status,body=request(live.base,'/explorations/'+token+'/v2',token=token)
        assert status==400 and body['error']['detail']=={'reason':'sensitive_content'} and token not in json.dumps(body)
        args=dict(exploration_id=token,expected_revision=1,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
        assert request(live.base,'/exploration-v2-saves',args,token=token)[1]['error']['detail']['reason']=='sensitive_content'
    finally: live.stop()


def test_http_competition_and_lost_response_recovery(server):
    live,db,a,b=server
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    with ThreadPoolExecutor(max_workers=2) as pool:
        pair=list(pool.map(lambda _: request(live.base,'/exploration-v2-saves',args,token=TOKEN),range(2)))
    assert pair[0]==pair[1] and pair[0][0]==200
    source=pair[0][1]['value']; branch=uid()
    fork=dict(source_exploration_id=args['exploration_id'],source_revision=1,source_event_id=source['event_id'],exploration_id=branch,request_key=uid())
    origin=urlsplit(live.base); conn=HTTPConnection(origin.hostname,origin.port,timeout=3)
    conn.request('POST','/exploration-forks',json.dumps(fork),headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
    conn.close()
    deadline=time.monotonic()+5
    while not db_rows(db,'SELECT * FROM exploration_origins WHERE exploration_id=?',(branch,)) and time.monotonic()<deadline:
        time.sleep(.02)
    assert len(db_rows(db,'SELECT * FROM exploration_origins WHERE exploration_id=?',(branch,)))==1
    saved=request(live.base,'/exploration-forks',fork,token=TOKEN)
    assert saved[0]==200 and request(live.base,'/exploration-forks',fork,token=TOKEN)==saved
    assert request(live.base,'/exploration-forks',fork|{'exploration_id':uid()},token=TOKEN)[1]['error']['detail']['reason']=='idempotency_conflict'


def test_origin_does_not_disclose_actor_equal_to_token(tmp_path,monkeypatch):
    token='synthetic-actor-secret'; monkeypatch.setenv('KNOT_TOKENS',json.dumps({token:token})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'actor.db'; init_database(db)
    repo=ExplorationRepo(db); source=uid()
    first=repo.save_v2(token,source,expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    branch=uid(); repo.fork(token,source,1,first['event_id'],branch,uid())
    live=Live(db)
    try:
        status,body=request(live.base,'/explorations/'+branch+'/v2',token=token)
        assert status==200 and token not in json.dumps(body) and 'actor' not in body['value']['origin']
    finally: live.stop()


def test_bad_receipt_after_commit_is_unknown_then_replay(tmp_path,monkeypatch):
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A'})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'receipt.db'; init_database(db)
    original=ExplorationRepo.save_v2
    def malformed(self,*args,**kwargs):
        original(self,*args,**kwargs)
        return {'revision':1,'exploration_id':'invalid','event_id':uid()}
    server=Server(db,port=0); thread=Thread(target=server.serve_forever,daemon=True); thread.start()
    base='http://127.0.0.1:'+str(server.server_port)
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    try:
        with monkeypatch.context() as patch:
            patch.setattr(ExplorationRepo,'save_v2',malformed)
            status,body=request(base,'/exploration-v2-saves',args,token=TOKEN)
            assert status==500 and body['error']['code']=='INTERNAL'
        assert db_rows(db,'SELECT count(*) FROM exploration_revisions')==[(1,)]
        assert request(base,'/exploration-v2-saves',args,token=TOKEN)[0]==200
        assert db_rows(db,'SELECT count(*) FROM exploration_revisions')==[(1,)]
    finally:
        server.shutdown(); server.server_close(); thread.join()


@pytest.mark.parametrize('damage', ['future', 'partial'])
def test_bad_version_and_partial_origin_fail_startup(tmp_path,damage):
    db=tmp_path/'bad.db'
    if damage=='future': init_database(db)
    else: create_v14(db); migrate5(db); migrate6(db); migrate7(db)
    if damage=='future': db_rows(db,"INSERT INTO schema_version VALUES ('1.10',0,'future')")
    else: db_rows(db,'CREATE TABLE exploration_origins (untrusted TEXT)')
    with pytest.raises(Fault) as exc: Server(db,port=0)
    assert exc.value.code=='SCHEMA_VERSION_UNSUPPORTED'
