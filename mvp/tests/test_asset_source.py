import hashlib
import json
import sqlite3
from contextlib import closing
from urllib.parse import quote
from uuid import uuid4

import pytest
from mvp.backend import asset_source as s
from mvp.backend.init_db import init_database
from mvp.backend.import_baseline import import_baseline


@pytest.fixture
def db(tmp_path):
    p = tmp_path / 'test.db'
    init_database(p)
    return p


def add(db, uri='file://folder/a.md', meta=None):
    aid = str(uuid4())
    digest = hashlib.sha256(aid.encode()).hexdigest()
    if meta is None:
        meta = json.dumps({'origin':'v0.4','path':'folder/a.md'})
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('INSERT INTO assets(asset_id,content_hash,media_type,source_uri,metadata_json,created_at,imported_at,content_blob) VALUES (?,?,?,?,?,?,?,?)', (aid,digest,'text/plain',uri,meta,0,0,b'x'))
        c.execute('INSERT INTO asset_readers VALUES (?,?)',(aid,'actor'))
    return aid,digest


def read(db, item, actor='actor', token='synthetic-token'):
    return s.read_asset_source(db,*item,actor,token)


def test_actual_importer_and_duplicate(db,tmp_path):
    src=tmp_path/'source'; src.mkdir()
    (src/'a.md').write_bytes(b'example')
    (src/'MANIFEST.sha256').write_text(hashlib.sha256(b'example').hexdigest()+'  a.md\n',encoding='utf-8')
    import_baseline(src,db,actor='actor')
    with closing(sqlite3.connect(db)) as c:
        aid,digest=c.execute("SELECT asset_id,content_hash FROM assets WHERE source_uri='file://a.md'").fetchone()
    result=read(db,(aid,digest))
    assert result == dict(asset_id=aid,content_hash=digest,source_status='recorded_file_reference',relative_path='a.md',reason=None,provenance_verified=False,import_evidence_checked=False)
    import_baseline(src,db,actor='actor')
    with closing(sqlite3.connect(db)) as c:
        assert c.execute('SELECT count(*) FROM assets WHERE content_hash=?',(digest,)).fetchone()[0] == 1


@pytest.mark.parametrize('uri,meta,reason', [
    ('', '{}','missing_source'), ('conversation://x','{}','unsupported_source'),
    ('file://x','{}','invalid_source'), ('file://x','{"origin":"v0.4","origin":"v0.4","path":"x"}','invalid_source'),
    ('file://wrong','{"origin":"v0.4","path":"x"}','inconsistent_source'),
    ('file://x','{"origin":"v0.4","path":"\\ud800"}','invalid_source'),
    ('file://x','{"origin":"v0.4","path":"PASSWORD=abc"}','sensitive_source'),
    ('file://'+'x'*4097,'{}','source_limit')])
def test_unknown(db,uri,meta,reason):
    result=read(db,add(db,uri,meta))
    assert result['reason']==reason and result['relative_path'] is None


@pytest.mark.parametrize('path',['../a','/a','a//b','a\\b','C:x','a%2fb','a?b','a@b','a\u202eb',' a','a/..','a'*256])
def test_paths(db,path):
    meta=json.dumps({'origin':'v0.4','path':path})
    assert read(db,add(db,'file://'+quote(path,safe='/'),meta))['reason']=='invalid_source'


def test_permission_hash_and_no_context(db):
    item=add(db)
    for actor,digest,code in [('other',item[1],'ASSET_UNAVAILABLE'),('actor','0'*64,'CONTENT_MISMATCH')]:
        with pytest.raises(s.SourceError) as ex:
            read(db,(item[0],digest),actor)
        assert str(ex.value)==code and ex.value.__context__ is None and ex.value.__cause__ is None
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('DELETE FROM asset_readers')
    with pytest.raises(s.SourceError,match='ASSET_UNAVAILABLE'):
        read(db,item)
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('DROP TABLE asset_readers')
    with pytest.raises(s.SourceError,match='READER_TABLE_MISSING'):
        read(db,item)


def test_output_token_collision_and_no_write(db):
    item=add(db)
    before=hashlib.sha256(db.read_bytes()).digest()
    with pytest.raises(s.SourceError,match='SENSITIVE_CONTENT'):
        read(db,item,token='asset_id')
    assert read(db,item)['relative_path']=='folder/a.md'
    assert hashlib.sha256(db.read_bytes()).digest()==before


def test_internal_error_is_fixed(db, monkeypatch):
    item=add(db)
    def fail(*args):
        raise s.SourceError('PRIVATE DETAIL')
    monkeypatch.setattr(s,'_source',fail)
    with pytest.raises(s.SourceError) as ex:
        read(db,item)
    assert str(ex.value)=='READ_UNAVAILABLE' and ex.value.__context__ is None


def test_no_body_path_event_query_and_snapshot(db, monkeypatch):
    item=add(db)
    statements=[]
    original=s._source
    def inspect(conn,*args):
        conn.set_trace_callback(statements.append)
        return original(conn,*args)
    monkeypatch.setattr(s,'_source',inspect)
    read(db,item)
    assert not any(x in q.lower() for q in statements for x in ('content_blob','file_path','history_events'))


def test_lock_deadline_and_malformed_text(db):
    item=add(db)
    with closing(sqlite3.connect(db)) as c:
        c.execute('PRAGMA journal_mode=DELETE')
        c.execute('BEGIN EXCLUSIVE')
        with pytest.raises(s.SourceError,match='READ_LIMIT_REACHED'):
            read(db,item)
        c.rollback()
    with closing(sqlite3.connect(db)) as c, c:
        c.execute("UPDATE assets SET source_uri=CAST(X'FF' AS TEXT) WHERE asset_id=?",(item[0],))
    with pytest.raises(s.SourceError) as ex:
        read(db,item)
    assert str(ex.value)=='READ_UNAVAILABLE' and ex.value.__context__ is None


def test_wal_snapshot_revocation(db,monkeypatch):
    item=add(db)
    with closing(sqlite3.connect(db)) as c:
        c.execute('PRAGMA journal_mode=WAL')
    original=s._source
    def concurrent(conn,*args):
        conn.execute('SELECT count(*) FROM asset_readers').fetchone()
        with closing(sqlite3.connect(db)) as writer, writer:
            writer.execute('DELETE FROM asset_readers WHERE asset_id=?',(item[0],))
        return original(conn,*args)
    monkeypatch.setattr(s,'_source',concurrent)
    assert read(db,item)['source_status']=='recorded_file_reference'
    monkeypatch.setattr(s,'_source',original)
    with pytest.raises(s.SourceError,match='ASSET_UNAVAILABLE'):
        read(db,item)
