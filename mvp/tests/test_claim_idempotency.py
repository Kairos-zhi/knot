"""Actor-bound claim replay through real HTTP, including process restart."""

import json
import sqlite3

import pytest

from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import request, seed
from mvp.tests.test_http_contract import Live


def state(db):
    with sqlite3.connect(db) as conn:
        dump = tuple(conn.iterdump())
    return dump, (db.parent / '.knot' / 'http.seq').read_bytes()


@pytest.fixture
def material(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.delenv('KNOT_TOKENS', raising=False)
    db = tmp_path / 'claim-replay.db'
    assert init_database(db)['status'] == 'created'
    _, claim = seed(db)
    return db, claim


def assert_conflict(result):
    status, body = result
    assert status == 400, result
    assert body['error']['code'] == 'BAD_REQUEST'
    assert body['error']['detail']['reason'] == 'idempotency_key_conflict'
    assert 'value' not in body


@pytest.mark.parametrize('command', ['claim.confirm', 'claim.revoke', 'claim.restore'])
@pytest.mark.parametrize('configured', [True, False])
def test_claim_replay_identity_and_restart(material, monkeypatch, command, configured):
    db, claim = material
    if configured:
        monkeypatch.setenv('KNOT_TOKENS', json.dumps({'a': 'A', 'a2': 'A', 'b': 'B'}))
    token = 'a' if configured else None
    live = Live(db)
    try:
        def send(name, **extra):
            return request(live.base, '/commands',
                           dict(command=name, args=dict(claim_id=claim), **extra), token=token)

        if command != 'claim.confirm':
            assert send('claim.confirm')[0] == 200
        if command == 'claim.restore':
            assert send('claim.revoke')[0] == 200
        body = dict(command=command, args=dict(claim_id=claim), idempotency_key='same-key')
        accepted = request(live.base, '/commands', body, token=token)
        assert accepted[0] == 200 and accepted[1]['value']['event_id'], accepted

        for restart in (False, True):
            if restart:
                live.stop()
                live.start()
            before = state(db)
            if configured:
                assert_conflict(request(live.base, '/commands', body, token='b'))
                assert request(live.base, '/commands', body, token='invalid')[0] == 401
            assert request(live.base, '/commands', body,
                           token='a2' if configured else None) == accepted
            other = body | {'args': {'claim_id': 'other-claim'}}
            assert_conflict(request(live.base, '/commands', other, token=token))
            assert state(db) == before  # Includes all business rows and journal seq/frames/keys.

        key = json.loads((db.parent / '.knot' / 'http.seq').read_text())['keys']['same-key']
        assert key['actor'] == ('A' if configured else 'local-user')
    finally:
        if live.process.poll() is None:
            live.stop()


@pytest.mark.parametrize('configured', [True, False])
def test_legacy_claim_key_refused_without_rewriting(material, monkeypatch, configured):
    db, claim = material
    if configured:
        monkeypatch.setenv('KNOT_TOKENS', json.dumps({'a': 'A', 'b': 'B'}))
    token = 'a' if configured else None
    live = Live(db)
    body = dict(command='claim.confirm', args=dict(claim_id=claim), idempotency_key='legacy')
    try:
        assert request(live.base, '/commands', body, token=token)[0] == 200
        live.stop()
        path = db.parent / '.knot' / 'http.seq'
        journal = json.loads(path.read_text())
        journal['keys']['legacy'].pop('actor', None)
        path.write_text(json.dumps(journal), encoding='utf8')  # Offline, disposable fixture only.
        live.start()
        before = state(db)
        for actor_token in (['a', 'b'] if configured else [None]):
            assert_conflict(request(live.base, '/commands', body, token=actor_token))
            assert state(db) == before
        # Unrelated, explicitly new action remains usable; old key is never repaired.
        revoke = dict(command='claim.revoke', args=dict(claim_id=claim), idempotency_key='new-action')
        assert request(live.base, '/commands', revoke, token=token)[0] == 200
        after = json.loads(path.read_text())
        assert after['keys']['legacy'] == journal['keys']['legacy']
    finally:
        if live.process.poll() is None:
            live.stop()
