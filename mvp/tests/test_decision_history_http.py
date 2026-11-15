"""Decision archive transport and proxy integration, using synthetic sources only."""
from copy import deepcopy
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import sqlite3
from urllib.parse import urlencode
from uuid import uuid4

import pytest

from mvp.backend.init_db import init_database
from mvp.backend.http_server import Server
from mvp.backend import http_server
from mvp.backend.decision_archive import import_decisions
from mvp.decision_policy import DecisionError
from mvp.backend.continuation_bundle import generate_bundle
from mvp.devtools.workbench import create_server
from test_workbench import running, request
from test_contract_schema import definition_validator


TOKEN = 'decision-http-synthetic-secret-20261115'
OTHER = 'decision-http-other-identity-20261115'
MILLIS = 1704038400000  # 2024-01-01 00:00 Asia/Shanghai.


def package(quote='先缩小范围。', reason='便于实际使用。', count=1):
    source = dict(
        version='knot.decision-source/0.1', kind='user_message',
        title='Synthetic user conversation', text=quote,
        text_sha256=sha256(quote.encode()).hexdigest(),
        message_time_ms=MILLIS, document_on=None, archived_on=None,
        locator=dict(channel='chatgpt', thread_id='11111111-1111-4111-8111-111111111111',
                     message_id='message-1', section=None),
    )
    item = dict(id='synthetic-choice', kind='direct_user_message', title='Synthetic important choice',
                before=None, after='Synthetic next direction', reason=reason,
                occurred_on='2024-01-01', archived_on=None, document_on=None, caution=None,
                evidence=[dict(source_key='s', quote=quote)])
    return dict(version='knot.decision-import/0.1', sources={'s': source},
                archive=dict(version='knot.decision-archive/0.1', title='Synthetic decision history',
                             method='curated_recap',
                             items=[deepcopy(item) | {'id': 'synthetic-choice-'+str(i)} for i in range(count)]))


@pytest.fixture
def archive_env(tmp_path, monkeypatch):
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({TOKEN: 'A', OTHER: 'B'}))
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    db = tmp_path/'history.sqlite3'
    assert init_database(db)['status'] == 'created'
    imported = import_decisions(db, package(), 'A', TOKEN)
    with running(Server(db, 0)) as backend:
        yield db, backend, imported


def target(imported):
    return '/decision-history?' + urlencode(dict(asset_id=imported['archive_id'], expected_hash=imported['archive_hash']))


def read(port, path, token=TOKEN):
    status, raw, _ = request(port, path, headers={'Authorization': 'Bearer '+token} if token else {})
    return status, json.loads(raw)


def test_real_http_reads_saved_quotes_and_broker_pins_archive(archive_env):
    _, backend, imported = archive_env
    status, body = read(backend, target(imported))
    assert status == 200
    value = body['value']
    definition_validator('DecisionHistory').validate(value)
    assert value['items'][0]['evidence'][0]['quote'] == '先缩小范围。'
    assert value['items'][0]['occurred_on'] == '2024-01-01'
    assert value['method'] == 'curated_recap'
    with running(create_server(backend, TOKEN, history_asset=imported['archive_id'], history_hash=imported['archive_hash'])) as ui:
        assert b'data-history="enabled"' in request(ui, '/')[1]
        status, raw, _ = request(ui, '/api/decisions')
        assert status == 200 and json.loads(raw) == value
        assert TOKEN.encode() not in raw
        assert request(ui, '/api/decisions?asset_id='+str(uuid4()))[0] == 400
        assert request(ui, '/api/decisions', headers={'Origin': 'https://foreign.example'})[0] == 403
    with running(create_server(backend, TOKEN)) as ui:
        assert b'data-history="enabled"' not in request(ui, '/')[1]
        assert request(ui, '/api/decisions')[0] == 400


def test_slug_boundaries_match_import_and_http_contract(archive_env):
    db, backend, _ = archive_env
    for identifier in ('Uppercase', '1numeric', 'a' * 81):
        supplied = package()
        supplied['archive']['items'][0]['id'] = identifier
        with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
            import_decisions(db, supplied, 'A', TOKEN)
    supplied = package()
    supplied['archive']['items'][0]['id'] = 'a' * 80
    imported = import_decisions(db, supplied, 'A', TOKEN)
    status, body = read(backend, target(imported))
    assert status == 200
    definition_validator('DecisionHistory').validate(body['value'])
    assert body['value']['items'][0]['id'] == 'a' * 80


@pytest.mark.parametrize('token', [None, 'not-a-token', OTHER])
def test_history_requires_reader_identity(archive_env, token):
    _, backend, imported = archive_env
    status, body = read(backend, target(imported), token)
    assert status == 403
    assert 'Synthetic important choice' not in json.dumps(body)
    assert '先缩小范围。' not in json.dumps(body, ensure_ascii=False)


@pytest.mark.parametrize('suffix', [
    '&unknown=1', '&asset_id=00000000-0000-4000-8000-000000000000',
    '&expected_hash=%ZZ',
])
def test_history_query_is_closed(archive_env, suffix):
    _, backend, imported = archive_env
    assert read(backend, target(imported)+suffix)[0] == 400


def test_revoked_or_changed_source_removes_entire_derived_record(archive_env):
    db, backend, imported = archive_env
    original = read(backend, target(imported))[1]['value']
    source = original['items'][0]['evidence'][0]
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?', (source['asset_id'], 'A'))
    status, body = read(backend, target(imported))
    assert status == 200 and body['value']['items'] == [] and body['value']['has_unavailable']
    assert 'Synthetic important choice' not in json.dumps(body)
    with sqlite3.connect(db) as conn:
        conn.execute('INSERT INTO asset_readers VALUES (?,?)', (source['asset_id'], 'A'))
        conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (b'private-corruption-sentinel', source['asset_id']))
    status, body = read(backend, target(imported))
    assert status == 200 and body['value']['items'] == [] and body['value']['has_unavailable']
    assert 'private-corruption-sentinel' not in json.dumps(body)


def test_raw_asset_and_bundle_cannot_bypass_derived_source_permissions(archive_env):
    db, backend, imported = archive_env
    asset_path = '/assets/' + imported['archive_id'] + '?view=content'
    original = read(backend, target(imported))[1]['value']
    source_id = original['items'][0]['evidence'][0]['asset_id']
    for revoked in (False, True):
        if revoked:
            with sqlite3.connect(db) as conn:
                conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?', (source_id, 'A'))
        status, body = read(backend, asset_path)
        assert status == 403
        assert '先缩小范围。' not in json.dumps(body, ensure_ascii=False)
        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            bundle = generate_bundle(conn, [imported['archive_id']], actor='A')
            assert imported['archive_id'] not in bundle['authorized_assets']
            assert '先缩小范围。' not in bundle['context_text']
        status, body = read(backend, target(imported))
        assert status == 200
        assert bool(body['value']['items']) is not revoked


def test_large_unicode_history_passes_new_route_without_expanding_old_budget(archive_env):
    db, backend, _ = archive_env
    supplied = package(quote='😀'*900, reason='中'*600, count=20)
    assert len(json.dumps(supplied['archive'], ensure_ascii=False).encode()) < 131072
    imported = import_decisions(db, supplied, 'A', TOKEN)
    status, raw, _ = request(backend, target(imported), headers={'Authorization': 'Bearer '+TOKEN})
    assert status == 200 and 262144 < len(raw) <= 1048576
    with running(create_server(backend, TOKEN, history_asset=imported['archive_id'], history_hash=imported['archive_hash'])) as ui:
        status, raw, _ = request(ui, '/api/decisions')
        assert status == 200 and len(raw) > 262144
        assert json.loads(raw)['items'][0]['evidence'][0]['quote'] == '😀'*900


def test_actual_http_encoded_budget_rejects_before_returning_content(archive_env, monkeypatch):
    _, backend, imported = archive_env
    monkeypatch.setattr(http_server, 'read_decision_history',
                        lambda *args: dict(title='😀'*100000, private_field='NEVER_DISCLOSE'))
    status, body = read(backend, target(imported))
    assert status == 503 and body['error']['code'] == 'SERVER_BUSY'
    assert body['error']['detail']['reason'] == 'decision_response_limit'
    assert 'NEVER_DISCLOSE' not in json.dumps(body)
    with running(create_server(backend, TOKEN, history_asset=imported['archive_id'], history_hash=imported['archive_hash'])) as ui:
        status, raw, _ = request(ui, '/api/decisions')
        assert status == 503 and json.loads(raw) == {'error': 'SERVER_BUSY', 'reason': 'decision_response_limit'}


def test_broker_detects_oversized_raw_response_and_never_relays_it():
    class Huge(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            raw = b'NEVER_DISCLOSE'+b' '*(1048577)
            self.send_response(200)
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            try: self.wfile.write(raw)
            except (ConnectionError, OSError): pass
    with running(ThreadingHTTPServer(('127.0.0.1', 0), Huge)) as backend:
        with running(create_server(backend, TOKEN, history_asset=str(uuid4()), history_hash='a'*64)) as ui:
            status, raw, _ = request(ui, '/api/decisions')
            assert status == 503 and json.loads(raw) == {'error': 'SERVER_BUSY', 'reason': 'decision_response_limit'}
            assert b'NEVER_DISCLOSE' not in raw


def test_history_configuration_must_be_complete(archive_env):
    _, backend, imported = archive_env
    with pytest.raises(ValueError):
        create_server(backend, TOKEN, history_asset=imported['archive_id'])
    with pytest.raises(ValueError):
        create_server(backend, TOKEN, history_hash=imported['archive_hash'])
