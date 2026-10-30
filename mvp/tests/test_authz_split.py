"""S3 counterexamples over actual token-configured loopback processes."""

from contextlib import closing
import hashlib
import json
import sqlite3
import subprocess
import sys

import pytest

from mvp.backend.init_db import init_database
from mvp.backend.migrate_schema_v1_5 import migrate_schema as migrate5
from mvp.backend.migrate_schema_v1_6 import migrate_schema as migrate6
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.claim_review import review_claim
from mvp.contract.selfcheck import Repo, request
from mvp.tests.test_http_contract import Live
from mvp.tests.test_bundle import poll
from mvp.backend.migrate_schema_v1_6 import SchemaDriftError


@pytest.fixture
def scoped(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.delenv('KNOT_TOKENS', raising=False)
    db = tmp_path / 'authz.db'
    assert init_database(db)['status'] == 'created'
    migrate5(db)
    repo = Repo(db)
    assets = []
    for text in ('D-12 public decision', 'Q18-01 public question',
                 'D-13 SECRET_BODY_ONLY_B_9f28'):
        data = text.encode()
        aid = repo.add_asset(hashlib.sha256(data).hexdigest(), 'text/markdown', content_blob=data)
        repo.add_event('import', subject=aid, event_time=0)
        assets.append(aid)
    extract_claims(repo, write=True)
    claims = {r['source_label']: r['claim_id'] for r in repo._all('SELECT source_label,claim_id FROM claims_candidates')}
    for label in ('D-12', 'D-13'):
        review_claim(repo, claims[label], decision='accept', now=1000)
    migrate6(db)
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.executemany('INSERT INTO asset_readers VALUES (?,?)', [(a, 'A' if i < 2 else 'B') for i, a in enumerate(assets)])
    return db, assets, claims


def create_bundle(live, assets, token=None, **extra):
    accepted = request(live.base, '/commands', dict(command='bundle.create', args=dict(asset_ids=assets, **extra)), token=token)
    assert accepted[0] == 202, accepted
    done = poll(live.base, accepted[1]['value']['job_id'])
    print('JOB', json.dumps(done, ensure_ascii=False))
    assert done[1]['value']['status'] == 'done', done
    response = request(live.base, '/bundles/' + done[1]['value']['result']['bundle_id'] + '?view=content', token=token)
    assert response[0] == 200, response
    return response


def test_ac1_single_user(scoped):
    db, assets, claims = scoped
    live = Live(db)
    try:
        info = live.get('/contract')
        content = live.get('/assets/' + assets[2] + '?view=content')
        write = live.command('claim.revoke', claims['D-12'])
        print('AC-1 RAW', json.dumps([info, content, write]))
        assert info[1]['value'].get('identity_mode') == 'single-user'
        assert content[0] == write[0] == 200
    finally:
        live.stop()


def test_ac2_configured_two_actors(scoped, monkeypatch):
    db, assets, _ = scoped
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({'token-a': 'A', 'token-b': 'B'}))
    live = Live(db)
    try:
        denied = request(live.base, '/assets/' + assets[2] + '?view=content', token='token-a')
        meta = request(live.base, '/assets/' + assets[2] + '?view=meta', token='token-a')
        owner = request(live.base, '/assets/' + assets[2] + '?view=content', token='token-b')
        reverse = request(live.base, '/assets/' + assets[0] + '?view=content', token='token-b')
        print('AC-2 RAW', json.dumps([denied, meta, owner, reverse]))
        assert denied[0] == reverse[0] == 403
        assert denied[1]['error']['code'] == 'FORBIDDEN_VIEW'
        assert meta[0] == 200 and 'content' not in meta[1]['value']
        assert owner[0] == 200
    finally:
        live.stop()


def test_ac3_selected_intersect_readable(scoped, monkeypatch):
    db, assets, _ = scoped
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({'token-a': 'A', 'token-b': 'B'}))
    live = Live(db)
    try:
        result = create_bundle(live, assets, 'token-a')
        print('AC-3 RAW', json.dumps(result, ensure_ascii=False))
        value = result[1]['value']
        assert value['authorized_assets'] == sorted(assets[:2])
        assert '3 个选中资产中 1 个因权限未纳入' in value['context_text']
        secret = request(live.base, '/assets/' + assets[2] + '?view=content', token='token-b')
        assert secret[0] == 200
        encoded = json.dumps(value, ensure_ascii=False)
        digest = hashlib.sha256(secret[1]['value']['content'].encode()).hexdigest()
        for forbidden in ('SECRET_BODY_ONLY_B_9f28', digest, assets[2], 'D-13'):
            assert forbidden not in encoded
            assert all(forbidden not in encoded[i:i+200] for i in range(len(encoded)))
        print('AC-3 scan full + every 200-char window: PASS')
        bid = value['bundle_id']
        other = request(live.base, '/bundles/' + bid + '?view=content', token='token-b')
        assert other[0] == 403 and other[1]['error']['code'] == 'FORBIDDEN_VIEW'
        export = request(live.base, '/commands', dict(command='bundle.export', args=dict(bundle_id=bid)), token='token-b')
        assert export[0] == 202
        assert poll(live.base, export[1]['value']['job_id'])[1]['value']['status'] == 'failed'
        print('AC-3 cross-actor stored bundle content=403; export=failed')
    finally:
        live.stop()


@pytest.mark.parametrize('include_open_questions', [True, False])
def test_ac4_confirmed_missing_eligible(scoped, include_open_questions):
    db, assets, claims = scoped
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("DELETE FROM eligible_snapshots WHERE event_id IN (SELECT event_id FROM history_events WHERE subject=?)", (claims['D-12'],))
        assert conn.execute('SELECT unverified,user_response FROM claims_candidates WHERE claim_id=?', (claims['D-12'],)).fetchone() == (0, 'accept')
        print('AC-4 fixture: accepted candidate, user_confirm retained, eligible count=0')
    live = Live(db)
    try:
        result = create_bundle(live, assets[:2], include_open_questions=include_open_questions)
        print('AC-4 RAW', json.dumps(result, ensure_ascii=False))
        text = result[1]['value']['context_text']
        confirmed = text.split('## 已确认决策\n', 1)[1].split('## ', 1)[0]
        questions = text.split('## 未决问题\n', 1)[1].split('## ', 1)[0]
        assert 'D-12' not in confirmed
        assert 'D-12' in questions and '证据无效' in questions
        assert claims['D-12'] in result[1]['value']['open_questions']
    finally:
        live.stop()


def test_migration_idempotent_and_atomic(tmp_path):
    db = tmp_path / 'migration.db'
    assert init_database(db)['status'] == 'created'
    migrate5(db)
    repo = Repo(db)
    aid = repo.add_asset('historical', 'text/plain', content_blob=b'historical')
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("CREATE TRIGGER fail_version BEFORE INSERT ON schema_version "
                     "WHEN NEW.version='1.6' BEGIN SELECT RAISE(ABORT,'injected'); END")
    before = db.read_bytes()
    with pytest.raises(sqlite3.IntegrityError, match='injected'):
        migrate6(db)
    assert db.read_bytes() == before
    with closing(sqlite3.connect(db)) as conn, conn:
        assert conn.execute("SELECT 1 FROM sqlite_master WHERE name='asset_readers'").fetchone() is None
        conn.execute('DROP TRIGGER fail_version')
    first = migrate6(db)
    before = db.read_bytes()
    second = migrate6(db)
    assert first == dict(schema_version='1.6', created=True)
    assert second == dict(schema_version='1.6', created=False)
    assert db.read_bytes() == before
    with closing(sqlite3.connect(db)) as conn:
        assert conn.execute('SELECT * FROM asset_readers').fetchall() == [(aid, 'local-user')]
    print('MIGRATION RAW', first, second, 'rerun byte-identical=True; injected failure byte-identical=True; historical reader=local-user')


@pytest.mark.parametrize('versioned', [False, True])
def test_migration_drift_refuses_without_change(tmp_path, versioned):
    db = tmp_path / 'drift.db'
    assert init_database(db)['status'] == 'created'
    migrate5(db)
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('CREATE TABLE asset_readers (asset_id TEXT, actor TEXT)')
        if versioned:
            conn.execute("INSERT INTO schema_version VALUES ('1.6',0,'broken')")
    before = db.read_bytes()
    with pytest.raises(SchemaDriftError):
        migrate6(db)
    assert db.read_bytes() == before


def test_import_actor_grant_and_failure_rollback(tmp_path, monkeypatch):
    from mvp.backend.import_baseline import import_baseline
    from mvp.backend.asset_access import readable
    db = tmp_path / 'import.db'
    assert init_database(db)['status'] == 'created'
    migrate5(db)
    migrate6(db)
    source = tmp_path / 'source'
    source.mkdir()
    data = b'actual external object for S3'
    (source / 'owned.zip').write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    (source / 'MANIFEST.sha256').write_text(digest + '  owned.zip\n', encoding='utf-8')
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({'token-a': 'A', 'token-b': 'B'}))
    # A failed import must not leave a grant or asset committed.
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("CREATE TRIGGER fail_import BEFORE INSERT ON history_events "
                     "BEGIN SELECT RAISE(ABORT,'injected import failure'); END")
    failed = import_baseline(source, db, actor='B')
    assert failed['failed']
    with closing(sqlite3.connect(db)) as conn, conn:
        assert conn.execute('SELECT COUNT(*) FROM assets').fetchone()[0] == 0
        assert conn.execute('SELECT COUNT(*) FROM asset_readers').fetchone()[0] == 0
        conn.execute('DROP TRIGGER fail_import')
    run = subprocess.run([sys.executable, '-m', 'mvp.backend.import_baseline', '--source', str(source),
                          '--db', str(db), '--actor', 'B'], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
    with closing(sqlite3.connect(db)) as conn:
        aid, path = conn.execute('SELECT asset_id,file_path FROM assets WHERE content_hash=?', (digest,)).fetchone()
        assert readable(conn, aid, 'B') and not readable(conn, aid, 'A')
        assert (db.parent / path).read_bytes() == data
    print('IMPORT RAW', run.stdout.strip(), 'reader B=True A=False; failure rolled back asset+grant')


def test_invalid_atom_boolean_downgrades(scoped):
    # A real unconfirmed question with an unsupported atom is still a candidate,
    # and the atom belongs to the existing rule vocabulary.
    from mvp.backend.continuation_bundle import generate_bundle
    db, assets, claims = scoped
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("UPDATE claims_candidates SET atom='conditional_theorem' WHERE claim_id=?", (claims['Q18-01'],))
        result = generate_bundle(conn, assets[:2])
        entry = result['context_text'].split('[Q18-01]', 1)[1].split('\n', 1)[0]
        assert '证据无效' in entry
        assert result['support_view_snapshot'][claims['Q18-01']]['boolean'] is False


def test_single_user_ignores_grants_and_empty_config_denies(scoped, monkeypatch):
    from mvp.backend.continuation_bundle import generate_bundle
    from mvp.backend.asset_access import readable
    from mvp.backend.http_server import authenticate
    db, assets, _ = scoped
    with closing(sqlite3.connect(db)) as conn:
        result = generate_bundle(conn, assets, actor='arbitrary-local-actor')
        assert result['authorized_assets'] == sorted(assets)
        monkeypatch.setenv('KNOT_TOKENS', '{}')
        assert authenticate(None) is None
        assert not readable(conn, assets[0], None)


def test_configured_import_requires_explicit_migration(tmp_path, monkeypatch):
    from mvp.backend.import_baseline import import_baseline
    db = tmp_path / 'old.db'
    assert init_database(db)['status'] == 'created'
    source = tmp_path / 'source'
    source.mkdir()
    (source / 'MANIFEST.sha256').write_text('', encoding='utf-8')
    monkeypatch.setenv('KNOT_TOKENS', '{"token-b":"B"}')
    before = db.read_bytes()
    with pytest.raises(ValueError, match='schema v1.6 required'):
        import_baseline(source, db, actor='B')
    assert db.read_bytes() == before
