"""Synthetic loopback tests for the reader-scoped recorded source transport."""
import hashlib
import json
import sqlite3
import threading
from contextlib import closing
from http.client import HTTPConnection
from urllib.parse import quote, urlencode
from uuid import uuid4

import pytest
from mvp.backend import http_server as http
from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import validate

TOKEN = 'synthetic-source-token-123'
KEYS = {'asset_id', 'content_hash', 'source_status', 'relative_path', 'reason',
        'provenance_verified', 'import_evidence_checked'}


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({TOKEN: 'A', 'rotated-source-token': 'A', 'other-source-token': 'B'}))
    db = tmp_path / 'source.db'
    assert init_database(db)['status'] == 'created'
    aid = str(uuid4()); digest = hashlib.sha256(b'synthetic').hexdigest()
    path = 'notes/汉😀".md'
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('INSERT INTO assets(asset_id,content_hash,media_type,content_blob,source_uri,metadata_json,created_at,imported_at) VALUES(?,?,?,?,?,?,?,?)',
                     (aid, digest, 'application/octet-stream', b'not read', 'file://' + quote(path, safe='/'), json.dumps(dict(origin='v0.4', path=path)), 0, 0))
        conn.execute('INSERT INTO asset_readers VALUES (?,?)', (aid, 'A'))
    server = http.Server(db, port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    try:
        yield server, db, aid, digest, path
    finally:
        server.shutdown(); server.server_close(); thread.join()


def query(aid, digest):
    return urlencode(dict(asset_id=aid, expected_hash=digest))


def get(server, query_string, token=TOKEN):
    conn = HTTPConnection('127.0.0.1', server.server_port, timeout=3)
    try:
        headers = {} if token is None else {'Authorization': 'Bearer ' + token}
        conn.request('GET', '/asset-sources?' + query_string, headers=headers)
        response = conn.getresponse(); raw = response.read()
        assert int(response.getheader('Content-Length')) == len(raw)
        assert response.getheader('Content-Type') == 'application/json'
        return response.status, json.loads(raw), raw
    finally:
        conn.close()


def test_recorded_exact_once_and_no_auxiliary_reads(service, monkeypatch):
    server, db, aid, digest, path = service
    calls = []; original = http.read_asset_source
    def read(*args):
        calls.append(args)
        return original(*args)
    monkeypatch.setattr(http, 'read_asset_source', read)
    def forbidden(*args, **kwargs):
        pytest.fail('transport performed auxiliary read')
    monkeypatch.setattr(http, 'read_snapshot', forbidden)
    monkeypatch.setattr(http, 'readable', forbidden)
    status, body, raw = get(server, query(aid, digest))
    assert status == 200 and set(body) == {'contract_version', 'ok', 'value'}
    assert body['contract_version'] == 1 and body['ok'] is True
    assert set(body['value']) == KEYS
    assert body['value'] == dict(asset_id=aid, content_hash=digest, source_status='recorded_file_reference',
                                relative_path=path, reason=None, provenance_verified=False, import_evidence_checked=False)
    assert calls == [(server.db, aid, digest, 'A', TOKEN)]
    assert len(raw) <= 32768 and b'\\u6c49' in raw and b'\\ud83d' in raw
    route = next(r for r in http.ROUTES if r['response'] == 'AssetSource')
    validate(body, route)
    for forbidden_key in ('source_uri', 'metadata_json', 'content_blob', 'actor', 'token'):
        assert forbidden_key not in body['value']


@pytest.mark.parametrize('uri,metadata,reason', [
    (None, None, 'missing_source'), ('https://example.invalid/source', None, 'unsupported_source'),
    ('file://a.md', '{"origin":"v0.4","path":"../a.md"}', 'invalid_source'),
    ('file://other.md', '{"origin":"v0.4","path":"a.md"}', 'inconsistent_source'),
    ('file://PASSWORD=hidden', None, 'sensitive_source'), ('x' * 4097, None, 'source_limit'),
])
def test_unknown_is_closed_success(service, uri, metadata, reason):
    server, db, aid, digest, path = service
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET source_uri=?,metadata_json=? WHERE asset_id=?', (uri, metadata, aid))
    status, body, raw = get(server, query(aid, digest))
    assert status == 200
    assert body['value'] == dict(asset_id=aid, content_hash=digest, source_status='unknown',
        relative_path=None, reason=reason, provenance_verified=False, import_evidence_checked=False)
    validate(body, next(r for r in http.ROUTES if r['response'] == 'AssetSource'))
    assert b'PASSWORD' not in raw


def test_invalid_queries_before_core(service, monkeypatch):
    server, db, aid, digest, path = service
    def forbidden(*args):
        pytest.fail('core called for invalid query')
    monkeypatch.setattr(http, 'read_asset_source', forbidden)
    good = query(aid, digest)
    bad = ['', 'asset_id=' + aid, good + '&asset_id=' + aid, good.replace(aid, ''),
           good.replace(aid, aid.upper()), good.replace(digest, digest.upper()), good.replace(aid, aid + '%0A'),
           good.replace(digest, digest + '%0A'), good.replace(aid, 'not-uuid'),
           good.replace(aid, '%FF'), good + '&bad=%', good.replace(aid, '%0'),
           good.replace(aid, '%GG'), good.replace(digest, digest[:-1])]
    bad += [good + '&' + k + '=x' for k in ('actor', 'token', 'view', 'require_reader', 'as_of', 'offset', 'limit')]
    for item in bad:
        status, body, raw = get(server, item, None)
        assert status == 400 and body['error']['code'] == 'BAD_REQUEST', item


def test_percent_encoded_canonical_values(service, monkeypatch):
    server, db, aid, digest, path = service
    calls = []; original = http.read_asset_source
    def read(*args):
        calls.append(args)
        return original(*args)
    monkeypatch.setattr(http, 'read_asset_source', read)
    encoded = lambda value: ''.join('%%%02X' % ord(c) for c in value)
    assert get(server, 'asset_id=' + encoded(aid) + '&expected_hash=' + encoded(digest))[0] == 200
    assert calls == [(server.db, aid, digest, 'A', TOKEN)]


def test_authentication_before_core(service, monkeypatch):
    server, db, aid, digest, path = service
    def forbidden(*args):
        pytest.fail('core called without configured authentication')
    monkeypatch.setattr(http, 'read_asset_source', forbidden)
    good = query(aid, digest)
    for token in (None, 'invalid-source-token'):
        assert get(server, good, token)[0:2] == (403, http.error('FORBIDDEN_VIEW'))
    monkeypatch.setenv('KNOT_TOKENS', '{}')
    assert get(server, good)[0] == 403
    monkeypatch.delenv('KNOT_TOKENS')
    assert get(server, good)[0] == 403


def test_reader_rotation_revocation_missing_and_anchor(service):
    server, db, aid, digest, path = service; good = query(aid, digest)
    assert get(server, good, 'rotated-source-token')[0] == 200
    forbidden = get(server, good, 'other-source-token')
    assert forbidden[0] == 403
    assert get(server, query(str(uuid4()), digest))[1] == forbidden[1]
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET content_hash=? WHERE asset_id=?', ('0' * 64, aid))
    status, body, _ = get(server, good)
    assert status == 400 and body['error']['detail'] == {'reason': 'content_mismatch'}
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET content_hash=? WHERE asset_id=?', (digest, aid))
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (aid,))
    assert get(server, good)[1] == forbidden[1]
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DROP TABLE asset_readers')
    assert get(server, good)[1] == forbidden[1]


@pytest.mark.parametrize('code,status,public,reason', [
    ('INVALID_ARGUMENT', 400, 'BAD_REQUEST', None),
    ('ASSET_UNAVAILABLE', 403, 'FORBIDDEN_VIEW', None),
    ('READER_TABLE_MISSING', 403, 'FORBIDDEN_VIEW', None),
    ('CONTENT_MISMATCH', 400, 'BAD_REQUEST', 'content_mismatch'),
    ('SENSITIVE_CONTENT', 400, 'BAD_REQUEST', 'sensitive_content'),
    ('SOURCE_LIMIT_REACHED', 500, 'INTERNAL', None),
    ('READ_LIMIT_REACHED', 503, 'SERVER_BUSY', 'source_limit'),
    ('READ_UNAVAILABLE', 500, 'INTERNAL', None), ('secret unknown code', 500, 'INTERNAL', None),
])
def test_fixed_core_failures(service, monkeypatch, code, status, public, reason):
    server, db, aid, digest, path = service
    def fail(*args):
        raise http.SourceError(code)
    monkeypatch.setattr(http, 'read_asset_source', fail)
    actual, body, raw = get(server, query(aid, digest))
    assert actual == status and body['error']['code'] == public
    assert body['error']['detail'] == ({} if reason is None else {'reason': reason})
    assert b'secret' not in raw and TOKEN.encode() not in raw and 'value' not in body


@pytest.mark.parametrize('exc', [ValueError('secret private input'), TypeError('secret'), RuntimeError('secret')])
def test_unexpected_core_exception(service, monkeypatch, exc):
    server, db, aid, digest, path = service
    def fail(*args): raise exc
    monkeypatch.setattr(http, 'read_asset_source', fail)
    assert get(server, query(aid, digest))[0:2] == (500, http.error('INTERNAL'))


@pytest.mark.parametrize('token,payload', [
    (TOKEN, TOKEN), ('source"quoted', 'source"quoted'),
    ('source\\backslash', 'source\\backslash'), ('source-é', 'source-é'),
    ('ok', 'safe'),
])
def test_actual_envelope_token_guard(service, monkeypatch, token, payload):
    server, db, aid, digest, path = service
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({token: 'A'}))
    monkeypatch.setattr(http, 'read_asset_source', lambda *args: {'label': payload})
    calls = []; original = http.Handler.reply_bytes
    def reply(handler, status, data):
        calls.append((status, data)); return original(handler, status, data)
    monkeypatch.setattr(http.Handler, 'reply_bytes', reply)
    status, body, raw = get(server, query(aid, digest), token)
    assert status == 400 and body == http.error('BAD_REQUEST', reason='sensitive_content')
    assert len(calls) == 1 and calls[0] == (400, raw)
    # 'ok' occurs only in envelope; arbitrary short-token error collisions are not prohibited.
    if token != 'ok':
        assert token.encode() not in raw and json.dumps(token)[1:-1].encode() not in raw


@pytest.mark.parametrize('value', [dict(label='汉' * 6000), dict(label={1, 2})])
def test_overflow_and_serialization_are_internal_before_success_headers(service, monkeypatch, value):
    server, db, aid, digest, path = service
    monkeypatch.setattr(http, 'read_asset_source', lambda *args: value)
    statuses = []; original = http.Handler.send_response
    def send(handler, code, *args):
        statuses.append(code); return original(handler, code, *args)
    monkeypatch.setattr(http.Handler, 'send_response', send)
    status, body, raw = get(server, query(aid, digest))
    assert (status, body) == (500, http.error('INTERNAL')) and statuses == [500]
    assert b'\\u6c49' not in raw


def test_unicode_serialization_failure_is_internal(service, monkeypatch):
    server, db, aid, digest, path = service
    original = http.json.dumps
    def dumps(value, *args, **kwargs):
        if type(value) is dict and value.get('ok') is True:
            raise UnicodeError('secret serializer failure')
        return original(value, *args, **kwargs)
    monkeypatch.setattr(http.json, 'dumps', dumps)
    assert get(server, query(aid, digest))[0:2] == (500, http.error('INTERNAL'))


def test_exact_guarded_bytes_and_cap_boundary(service, monkeypatch):
    server, db, aid, digest, path = service
    # Deliberate core stub isolates transport cap from the frozen core's 16 KiB cap.
    base = dict(contract_version=1, ok=True, value={'label': ''})
    overhead = len(json.dumps(base, ensure_ascii=True).encode('utf-8'))
    payload = 'x' * (32768 - overhead)
    monkeypatch.setattr(http, 'read_asset_source', lambda *args: {'label': payload})
    status, body, raw = get(server, query(aid, digest))
    assert status == 200 and len(raw) == 32768
    assert raw == json.dumps(base | {'value': {'label': payload}}, ensure_ascii=True).encode('utf-8')
    payload += 'x'
    assert get(server, query(aid, digest))[0:2] == (500, http.error('INTERNAL'))