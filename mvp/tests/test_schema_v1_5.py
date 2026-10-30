"""S2 explicit migration: old data, existing column, drift and rollback."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

from mvp.backend import migrate_schema_v1_5 as migration
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.continuation_bundle import generate_bundle
from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import seed
from mvp.tests.test_http_contract import Live


def digest(db):
    return hashlib.sha256(db.read_bytes()).hexdigest()


def read(db, sql):
    with closing(sqlite3.connect(db)) as conn:
        return conn.execute(sql).fetchall()


@pytest.fixture
def old_db(tmp_path):
    db = tmp_path / 'old.db'
    assert init_database(db)['status'] == 'created'
    asset, _ = seed(db)
    with closing(sqlite3.connect(db)) as conn:
        generate_bundle(conn, [asset])
        conn.execute('ALTER TABLE continuation_bundles DROP COLUMN job_id')
        conn.commit()
    return db


def test_ac3_data_preserved_and_three_runs(old_db):
    tables = [row[0] for row in read(old_db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    before = {t: read(old_db, f'SELECT * FROM "{t}"') for t in tables}
    print('AC-3 OLD_BUNDLE ' + json.dumps(before['continuation_bundles'], ensure_ascii=True))
    print('AC-3 OLD_COLUMNS ' + json.dumps(read(old_db, 'PRAGMA table_info(continuation_bundles)')))
    first = migration.migrate_schema(old_db)
    assert first == dict(schema_version='1.5', created=True)
    for table in tables:
        after = read(old_db, f'SELECT * FROM "{table}"')
        if table == 'continuation_bundles':
            assert [r[:-1] for r in after] == before[table] and all(r[-1] is None for r in after)
        elif table == 'schema_version':
            assert after[:-1] == before[table] and after[-1][0] == '1.5'
        else:
            assert after == before[table]
    before_hash = digest(old_db)
    print('AC-3 FIRST ' + json.dumps(first))
    for number in (2, 3):
        rerun = migration.migrate_schema(old_db)
        after_hash = digest(old_db)
        print(f'AC-3 RUN {number} ' + json.dumps(dict(result=rerun, before_sha256=before_hash, after_sha256=after_hash)))
        assert rerun == dict(schema_version='1.5', created=False) and after_hash == before_hash
    assert read(old_db, 'PRAGMA integrity_check') == [('ok',)]


def test_existing_column_skipped(tmp_path):
    db = tmp_path / 'new.db'
    assert init_database(db)['status'] == 'created'
    info = read(db, 'PRAGMA table_info(continuation_bundles)')
    assert migration.migrate_schema(db)['created'] is True
    assert read(db, 'PRAGMA table_info(continuation_bundles)') == info
    before = digest(db)
    assert migration.migrate_schema(db)['created'] is False
    assert digest(db) == before


def test_old_db_create_refused_explicitly_without_writes(old_db, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    live = Live(old_db)
    before = digest(old_db)
    journal = (old_db.parent / '.knot/http.seq')
    try:
        from mvp.contract.selfcheck import request
        response = request(live.base, '/commands', dict(command='bundle.create', args=dict(asset_ids=['any'])))
        assert response[0] == 409 and response[1]['error']['code'] == 'SCHEMA_VERSION_UNSUPPORTED'
        assert response[1]['error']['detail']['reason'] == 'job_provenance_migration_required'
        assert digest(old_db) == before and not journal.exists()
    finally:
        live.stop()


def test_job_id_write_failure_leaves_no_bundle(tmp_path):
    from mvp.backend.http_server import Server
    db = tmp_path / 'atomic.db'
    assert init_database(db)['status'] == 'created'
    asset, _ = seed(db)
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("CREATE TRIGGER deny_job BEFORE UPDATE OF job_id ON continuation_bundles "
                     "BEGIN SELECT RAISE(ABORT, 'synthetic job write failure'); END")
    server = Server(db, port=0)
    try:
        with pytest.raises(sqlite3.IntegrityError, match='synthetic job write failure'):
            server.jobs._execute('bundle.create', dict(asset_ids=[asset]), jid='synthetic-job')
        assert read(db, 'SELECT count(*) FROM continuation_bundles') == [(0,)]
    finally:
        server.server_close()


@pytest.mark.parametrize('drift', ['wrong_type', 'missing', 'future', 'old'])
def test_drift_refusal_unchanged(old_db, drift):
    with closing(sqlite3.connect(old_db)) as conn, conn:
        if drift == 'wrong_type':
            conn.execute('ALTER TABLE continuation_bundles ADD COLUMN job_id INTEGER')
        elif drift in ('missing', 'future'):
            conn.execute('INSERT INTO schema_version VALUES (?,0,?)', ('1.5' if drift == 'missing' else '1.6', 'synthetic'))
        else:
            conn.execute("DELETE FROM schema_version WHERE version='1.4'")
    before = digest(old_db)
    with pytest.raises(ValueError):
        migration.migrate_schema(old_db)
    assert digest(old_db) == before


def test_failed_marker_insert_rolls_back_column_and_data(old_db, monkeypatch):
    original = sqlite3.connect
    def denied(*args, **kwargs):
        conn = original(*args, **kwargs)
        conn.set_authorizer(lambda action, table, *rest: sqlite3.SQLITE_DENY
                            if action == sqlite3.SQLITE_INSERT and table == 'schema_version' else sqlite3.SQLITE_OK)
        return conn
    before = digest(old_db)
    with monkeypatch.context() as patch:
        patch.setattr(migration.sqlite3, 'connect', denied)
        with pytest.raises(sqlite3.DatabaseError):
            migration.migrate_schema(old_db)
    assert digest(old_db) == before
    assert 'job_id' not in [r[1] for r in read(old_db, 'PRAGMA table_info(continuation_bundles)')]


def test_ac4_selfcheck_with_objects_and_live_hash(old_db, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    migration.migrate_schema(old_db)
    data = b'S2 external object\x00\xff'
    sha = hashlib.sha256(data).hexdigest()
    relative = f'objects/{sha[:2]}/{sha}'
    target = old_db.parent / relative
    target.parent.mkdir(parents=True)
    target.write_bytes(data)
    AssetRepo(old_db).add_asset(sha, 'application/zip', file_path=relative)
    before = digest(old_db)
    result = subprocess.run([sys.executable, '-m', 'mvp.contract.selfcheck', '--db', str(old_db)],
                            capture_output=True, text=True, timeout=30)
    print('AC-4 COMMAND ' + subprocess.list2cmdline(result.args))
    print(result.stdout, end='')
    print(result.stderr, end='')
    assert result.returncode == 0 and 'FAIL ' not in result.stdout
    assert digest(old_db) == before and target.read_bytes() == data
    live = Live(old_db)
    try:
        response = live.get('/contract')
        actual = hashlib.sha256((Path(__file__).resolve().parents[1] / 'contract/v1/schema.json').read_bytes()).hexdigest()
        print('AC-4 CONTRACT ' + json.dumps(dict(response=response, actual_schema_sha256=actual, object_sha256=sha)))
        assert response[0] == 200 and response[1]['value']['schema_sha256'] == actual
        assert live.get('/health')[1]['value']['schema_version'] == '1.5'
    finally:
        live.stop()
