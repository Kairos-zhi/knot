import hashlib
import json
import sqlite3
import threading
from contextlib import closing
from http.client import HTTPConnection
from urllib.parse import urlencode
from uuid import uuid4

import pytest
from mvp.backend import http_server as http
from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import validate


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({'synthetic-token-123':'A','other-token-456':'B'}))
    db=tmp_path/'test.db'
    assert init_database(db)['status']=='created'
    data=('汉😀"\\' * 1800).encode()
    aid=str(uuid4()); digest=hashlib.sha256(data).hexdigest()
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('INSERT INTO assets(asset_id,content_hash,media_type,content_blob,created_at,imported_at) VALUES(?,?,?,?,?,?)',(aid,digest,'text/plain',data,0,0))
        c.execute('INSERT INTO asset_readers VALUES (?,?)',(aid,'A'))
    server=http.Server(db,port=0); thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
    try: yield server,db,aid,digest,data
    finally: server.shutdown(); server.server_close(); thread.join()


def get(server, query, token='synthetic-token-123'):
    conn=HTTPConnection('127.0.0.1',server.server_port,timeout=3)
    headers={} if token is None else {'Authorization':'Bearer '+token}
    try:
        conn.request('GET','/asset-text-slices?'+query,headers=headers)
        response=conn.getresponse(); raw=response.read()
        assert int(response.getheader('Content-Length'))==len(raw)
        return response.status,json.loads(raw),raw
    finally: conn.close()


def args(aid,digest,offset=0,limit=8192):
    return urlencode(dict(asset_id=aid,expected_hash=digest,offset=offset,limit=limit))


def test_pages_and_authorization(service):
    server,db,aid,digest,data=service; offset=0; out=b''
    route=next(r for r in http.ROUTES if r['response']=='AssetTextSlice')
    while True:
        status,body,raw=get(server,args(aid,digest,offset))
        assert status==200 and len(raw)<=65536
        validate(body,route); value=body['value']; out+=value['text'].encode()
        offset=value['next_offset']
        if not value['has_more']: break
    assert out==data and get(server,args(aid,digest,len(data)))[1]['value']['text']==''
    assert get(server,args(aid,digest),None)[0]==403
    assert get(server,args(aid,digest),'other-token-456')[0]==403
    with closing(sqlite3.connect(db)) as c, c: c.execute('DELETE FROM asset_readers WHERE asset_id=?',(aid,))
    assert get(server,args(aid,digest))[0]==403


def test_bad_query_and_sensitive(service):
    server,db,aid,digest,data=service; good=args(aid,digest)
    for query in (good+'&offset=0',good+'&actor=A',good.replace('offset=0','offset=00'),good.replace('limit=8192','limit=3'),good.replace('offset=0','offset=%FF'),good+'&bad=%',good.replace(digest,digest.upper())):
        assert get(server,query)[0]==400
    sensitive=b'x'*9000+b' PASSWORD=value'; digest=hashlib.sha256(sensitive).hexdigest()
    with closing(sqlite3.connect(db)) as c, c: c.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE asset_id=?',(sensitive,digest,aid))
    status,body,_=get(server,args(aid,digest))
    assert status==400 and body['error']['detail']['reason']=='sensitive_content'


def test_fixed_failures_and_budget(service,monkeypatch):
    server,db,aid,digest,data=service
    def too_large(*args): return {'text':'x'*70000}
    monkeypatch.setattr(http,'read_asset_text_slice',too_large)
    status,body,raw=get(server,args(aid,digest))
    assert status==500 and b'x'*100 not in raw
    def fail(*args): raise ValueError('secret private input')
    monkeypatch.setattr(http,'read_asset_text_slice',fail)
    status,body,raw=get(server,args(aid,digest))
    assert status==500 and b'secret' not in raw
    def fail_code(*args): raise http.TextSliceError('READ_LIMIT_REACHED')
    monkeypatch.setattr(http,'read_asset_text_slice',fail_code)
    status,body,_=get(server,args(aid,digest))
    assert status==503 and body['error']['detail']['reason']=='text_slice_limit'


@pytest.mark.parametrize('code,status,reason', [
    ('INVALID_ARGUMENT',400,None),('ASSET_UNAVAILABLE',403,None),('READER_TABLE_MISSING',403,None),
    ('UNSUPPORTED_CONTENT',400,'unsupported_content'),('CONTENT_TOO_LARGE',400,'content_too_large'),
    ('CONTENT_MISMATCH',400,'content_mismatch'),('SENSITIVE_CONTENT',400,'sensitive_content'),
    ('READ_LIMIT_REACHED',503,'text_slice_limit'),('READ_UNAVAILABLE',500,None),('UNEXPECTED',500,None)])
def test_core_error_mapping(service,monkeypatch,code,status,reason):
    server,db,aid,digest,data=service
    def fail(*args): raise http.TextSliceError(code)
    monkeypatch.setattr(http,'read_asset_text_slice',fail)
    actual,body,raw=get(server,args(aid,digest))
    assert actual==status and body['error']['detail'].get('reason')==reason
    assert b'synthetic-token-123' not in raw


def test_success_envelope_token_guard(service,monkeypatch):
    server,db,aid,digest,data=service
    def fake(*args): return {'text':'synthetic-token-123'}
    monkeypatch.setattr(http,'read_asset_text_slice',fake)
    status,body,raw=get(server,args(aid,digest))
    assert status==400 and body['error']['detail']['reason']=='sensitive_content'
    assert b'synthetic-token-123' not in raw


def test_rejections_before_core_and_single_user(service,monkeypatch):
    server,db,aid,digest,data=service
    def forbidden(*args): pytest.fail('core called')
    monkeypatch.setattr(http,'read_asset_text_slice',forbidden)
    assert get(server,args(aid,digest)+'&offset=1')[0]==400
    assert get(server,args(aid,digest),None)[0]==403
    monkeypatch.delenv('KNOT_TOKENS')
    assert get(server,args(aid,digest))[0]==403


def test_hash_change_and_missing_reader_table(service):
    server,db,aid,digest,data=service
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('UPDATE assets SET content_blob=? WHERE asset_id=?',(b'changed',aid))
    status,body,_=get(server,args(aid,digest))
    assert status==400 and body['error']['detail']['reason']=='content_mismatch'
    with closing(sqlite3.connect(db)) as c, c: c.execute('DROP TABLE asset_readers')
    assert get(server,args(aid,digest))[0]==403
