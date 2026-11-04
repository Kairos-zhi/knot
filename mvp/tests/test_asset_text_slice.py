import hashlib
import itertools
import sqlite3
import traceback
from contextlib import closing, contextmanager
from uuid import uuid4

import pytest

from mvp.backend import asset_text_slice as subject
from mvp.backend.init_db import init_database
from mvp.text_policy import has_credential_marker


@pytest.fixture
def db(tmp_path):
    path = tmp_path / 'test.db'
    assert init_database(path)['status'] == 'created'
    return path


def add(db, data, *, reader='actor', digest=None, mime='text/plain'):
    aid = str(uuid4())
    digest = digest or hashlib.sha256(data or b'').hexdigest()
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('INSERT INTO assets (asset_id,content_hash,media_type,content_blob,file_path,created_at,imported_at) VALUES (?,?,?,?,?,?,?)',
                  (aid,digest,mime,data,'private/path',0,0))
        if reader:
            c.execute('INSERT INTO asset_readers VALUES (?,?)', (aid,reader))
    return aid, digest


def read(db, aid, digest, offset=0, limit=4, actor='actor', token='secret-token'):
    return subject.read_asset_text_slice(db,aid,digest,offset,limit,actor,token)


def error(code, *args, **kwargs):
    with pytest.raises(subject.TextSliceError) as info:
        read(*args, **kwargs)
    assert str(info.value) == code
    assert info.value.__context__ is None and info.value.__cause__ is None


def test_roundtrip_boundaries_and_empty(db):
    data = ('a😀中文' * 1200).encode()
    aid, digest = add(db, data)
    pos = 0
    chunks = []
    while True:
        item = read(db,aid,digest,pos,5)
        chunks.append(item['text'].encode())
        assert item['offset'] == pos
        pos = item['next_offset']
        if not item['has_more']: break
        assert len(chunks) < len(data)
    assert b''.join(chunks) == data
    assert read(db,aid,digest,len(data))['text'] == ''
    error('INVALID_ARGUMENT',db,aid,digest,2)
    error('INVALID_ARGUMENT',db,aid,digest,len(data)+1)
    empty, eh = add(db,b'')
    assert read(db,empty,eh)['next_offset'] == 0


@pytest.mark.parametrize('kw', [{'offset':True}, {'limit':True}, {'limit':3}, {'limit':8193}, {'actor':''}, {'token':''}])
def test_invalid(db,kw):
    aid,digest=add(db,b'abc')
    error('INVALID_ARGUMENT',db,aid,digest,**kw)


def test_reader_integrity_and_sensitivity(db,monkeypatch):
    monkeypatch.delenv('KNOT_TOKENS',raising=False)
    aid,digest=add(db,b'123 PASSWORD=synthetic')
    error('SENSITIVE_CONTENT',db,aid,digest)
    error('ASSET_UNAVAILABLE',db,aid,digest,actor='other')
    error('ASSET_UNAVAILABLE',db,str(uuid4()),digest)
    error('CONTENT_MISMATCH',db,aid,'0'*64)
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('DELETE FROM asset_readers WHERE asset_id=?',(aid,))
    error('ASSET_UNAVAILABLE',db,aid,digest)
    with closing(sqlite3.connect(db)) as c, c: c.execute('DROP TABLE asset_readers')
    error('READER_TABLE_MISSING',db,aid,digest)


def test_full_document_policy_and_size(db):
    for data, code in [(b'x'*8191+b'secret-token', 'SENSITIVE_CONTENT'),
                       (b'x'*999980+b' PASSWORD=synthetic', 'SENSITIVE_CONTENT'),
                       (b'\xff','UNSUPPORTED_CONTENT'),(b'x\x7f','UNSUPPORTED_CONTENT'),
                       (b'x'*1_000_001,'CONTENT_TOO_LARGE')]:
        aid,digest=add(db,data)
        error(code,db,aid,digest)
    aid,digest=add(db,b'x'*1_000_000)
    assert read(db,aid,digest)['text']=='xxxx'
    ext, digest=add(db,None,digest='b'*64)
    error('UNSUPPORTED_CONTENT',db,ext,digest)


def test_equivalent_marker_short_inputs():
    for word,space,quote,sep,tail in itertools.product(
        ['PASSWORD','password','API_KEY','KNOT_TOKEN','CLIENT_SECRET','OPENAI_API_KEY','AWS_SECRET_ACCESS_KEY'],
        ['',' ','\t','\n'],['',"'",'"'],[':', '=', '-'],['',' ','v',"'v"]):
        value='prefix '+word+space+quote+space+sep+space+tail
        assert subject._sensitive(value,'test-token') == has_credential_marker(value,'test-token')
    for value in ['-----BEGIN PRIVATE KEY-----','Authorization: Bearer value','test-token','unrelated']:
        assert subject._sensitive(value,'test-token') == has_credential_marker(value,'test-token')


def test_long_whitespace():
    assert not subject._sensitive('PASSWORD'+' '*999_900+'x','token')
    assert subject._sensitive('PASSWORD'+' '*999_900+'=v','token')


def test_exception_sanitized_and_close(db,monkeypatch):
    aid,digest=add(db,b'hello')
    @contextmanager
    def broken(*args, **kwargs):
        raise RuntimeError('private/path secret-token')
        yield
    monkeypatch.setattr(subject,'read_snapshot',broken)
    with pytest.raises(subject.TextSliceError) as info: read(db,aid,digest)
    assert str(info.value)=='READ_UNAVAILABLE'
    assert info.value.__context__ is None and info.value.__cause__ is None
    assert 'secret-token' not in ''.join(traceback.format_exception(info.value))


def test_lock_and_uppercase_hash(db):
    aid,digest=add(db,b'content')
    with closing(sqlite3.connect(db)) as c:
        c.execute('PRAGMA journal_mode=DELETE')
        c.execute('BEGIN EXCLUSIVE')
        error('READ_LIMIT_REACHED',db,aid,digest)
        c.rollback()
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('UPDATE assets SET content_hash=? WHERE asset_id=?',(digest.upper(),aid))
    error('CONTENT_MISMATCH',db,aid,digest)


def test_close_failure_and_budget(db,monkeypatch):
    aid,digest=add(db,b'content')
    original=subject.read_snapshot
    @contextmanager
    def bad_close(*args,**kwargs):
        with original(*args,**kwargs) as conn:
            yield conn
        raise OSError('close private data')
    monkeypatch.setattr(subject,'read_snapshot',bad_close)
    error('READ_UNAVAILABLE',db,aid,digest)
    monkeypatch.setattr(subject,'read_snapshot',original)
    clock=iter([0, 2])
    monkeypatch.setattr(subject,'monotonic',lambda: next(clock, 2))
    error('READ_LIMIT_REACHED',db,aid,digest)
