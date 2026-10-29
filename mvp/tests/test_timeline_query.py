"""Read-only ownership, deterministic intervals and WAL snapshot isolation."""

import hashlib
import sqlite3
import json
from pathlib import Path
import subprocess
import sys

import pytest

from mvp.backend.init_db import init_database
from mvp.backend.knot_query import main
from mvp.backend.timeline_query import (
    asset_by_hash, claims_by_atom, events_range, read_snapshot,
)


def insert_event(conn, event_id, instant):
    conn.execute(
        "INSERT INTO history_events(event_id,event_type,event_time,recorded_at) "
        "VALUES (?,'import',?,?)", (event_id, instant, instant),
    )


@pytest.fixture
def database(tmp_path):
    path = tmp_path / "candidate #%.db"
    assert init_database(str(path))["status"] == "created"
    with sqlite3.connect(path) as conn:
        for event_id, instant in (("z", 10), ("a", 10), ("end", 20), ("before", 0)):
            insert_event(conn, event_id, instant)
        conn.execute(
            "INSERT INTO assets(asset_id,content_hash,media_type,file_path,created_at,imported_at) "
            "VALUES ('asset','hash','application/zip','does-not-exist.zip',0,0)"
        )
        for label in ("D-02", "D-01"):
            conn.execute(
                "INSERT INTO claims_candidates(claim_id,claim_type,atom,extraction_method,"
                "proposed_at,source_label) VALUES (?,'decision','decision','rule_based',0,?)",
                (label, label),
            )
    return path


def test_half_open_order_and_limits(database):
    with read_snapshot(database) as conn:
        assert [r['event_id'] for r in events_range(conn, start=10, end=20)] == ['z', 'a']
        assert [r['event_id'] for r in events_range(conn, start=10, end=21, limit=1)] == ['z']
        assert events_range(conn, start=10, end=10) == []
        assert events_range(conn, start=0, end=30, limit=0) == []
        with pytest.raises(ValueError):
            events_range(conn, start=20, end=10)


@pytest.mark.parametrize('limit', [-1, True, 1.5, '1', None])
def test_limits_rejected(database, limit):
    with read_snapshot(database) as conn:
        with pytest.raises(ValueError):
            events_range(conn, start=0, end=20, limit=limit)
        with pytest.raises(ValueError):
            claims_by_atom(conn, 'decision', limit=limit)


@pytest.mark.parametrize('instant', [True, 1.5, '1', None])
def test_invalid_times(database, instant):
    with read_snapshot(database) as conn:
        with pytest.raises(ValueError):
            events_range(conn, start=instant, end=20)
        with pytest.raises(ValueError):
            events_range(conn, start=0, end=instant)


def test_asset_complete_row_and_no_external_read(database):
    with read_snapshot(database) as conn:
        assert asset_by_hash(conn, 'hash') == dict(conn.execute('SELECT * FROM assets').fetchone())
        assert asset_by_hash(conn, 'missing') is None
        assert asset_by_hash(conn, 'hash')['file_path'] == 'does-not-exist.zip'


def test_claim_projection_order_and_unknown(database):
    with read_snapshot(database) as conn:
        rows = claims_by_atom(conn, 'decision')
        assert [r['source_label'] for r in rows] == ['D-01', 'D-02']
        assert set(rows[0]) == {'claim_id', 'claim_type', 'atom', 'source_label',
                                'support_sources', 'source_members', 'unverified', 'user_response'}
        assert claims_by_atom(conn, 'unknown') == []
        assert claims_by_atom(conn, 'decision', limit=0) == []


@pytest.mark.parametrize('value', ['', None, 1, [], True])
def test_invalid_lookup_values(database, value):
    with read_snapshot(database) as conn:
        with pytest.raises(ValueError):
            claims_by_atom(conn, value)
        with pytest.raises(ValueError):
            asset_by_hash(conn, value)


def test_two_connection_barrier(database):
    with sqlite3.connect(database) as writer:
        writer.execute('DELETE FROM history_events')
        for i in range(22):
            insert_event(writer, str(i), i)
    with read_snapshot(database) as reader:
        assert len(events_range(reader, start=0, end=100)) == 22
        print('1 reader BEGIN: 22 events')
        # timeout=0 fails immediately on a lock; no sleeps or elapsed-time assertions.
        with sqlite3.connect(database, timeout=0) as writer:
            insert_event(writer, 'new', 30)
        print('2 independent writer INSERT + COMMIT succeeded with timeout=0')
        assert len(events_range(reader, start=0, end=100)) == 22
        print('3 same reader transaction: still 22 events')
    with read_snapshot(database) as reader:
        assert len(events_range(reader, start=0, end=100)) == 23
        print('4 next read transaction: 23 events (prior owner ROLLBACK)')


def test_readonly_hash_and_closed_on_error(database):
    before = hashlib.sha256(database.read_bytes()).hexdigest()
    with pytest.raises(sqlite3.OperationalError, match='attempt to write a readonly database') as error:
        with read_snapshot(database) as conn:
            insert_event(conn, 'forbidden', 40)
    print(str(error.value))
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before
    with pytest.raises(sqlite3.ProgrammingError, match='closed'):
        conn.execute('SELECT 1')


def test_missing_directory_old_schema_no_creation_or_migration(database, tmp_path):
    missing = tmp_path / 'missing' / 'absent.db'
    with pytest.raises(sqlite3.Error):
        with read_snapshot(missing):
            pytest.fail('missing database accepted')
    assert not missing.parent.exists()
    with pytest.raises(sqlite3.Error):
        with read_snapshot(tmp_path):
            pytest.fail('directory accepted')
    with sqlite3.connect(database) as conn:
        conn.execute("DELETE FROM schema_version WHERE version='1.4'")
        conn.execute('ALTER TABLE claims_candidates DROP COLUMN source_label')
        conn.execute('ALTER TABLE claims_candidates DROP COLUMN source_members')
    before = database.read_bytes()
    with pytest.raises(ValueError, match='schema v1.4 required'):
        with read_snapshot(database):
            pytest.fail('old schema accepted')
    assert database.read_bytes() == before


def test_one_connection_for_composed_reads(database, monkeypatch):
    original = sqlite3.connect
    opened = []

    def counted(*args, **kwargs):
        opened.append((args, kwargs))
        return original(*args, **kwargs)

    monkeypatch.setattr(sqlite3, 'connect', counted)
    with read_snapshot(database) as conn:
        events_range(conn, start=0, end=100)
        asset_by_hash(conn, 'hash')
        claims_by_atom(conn, 'decision')
    assert len(opened) == 1
    assert opened[0][0][0].endswith('?mode=ro')
    print('composed events/asset/claims reads: sqlite3.connect calls=1')


@pytest.mark.parametrize('args,expected', [
    (['events', '--start', '0', '--end', '30'], 4),
    (['asset', '--hash', 'hash'], 'asset'),
    (['claims', '--atom', 'decision'], 2),
])
def test_cli_single_connection_and_json(database, monkeypatch, capsys, args, expected):
    original = sqlite3.connect
    connections = []

    def connect(*args, **kwargs):
        conn = original(*args, **kwargs)
        connections.append(conn)
        return conn

    monkeypatch.setattr(sqlite3, 'connect', connect)
    assert main([*args, '--db', str(database)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 1
    result = json.loads(lines[0])
    if isinstance(expected, int):
        assert len(result) == expected
    else:
        assert result['asset_id'] == expected
        assert 'content_blob' not in result
    assert len(connections) == 1
    with pytest.raises(sqlite3.ProgrammingError):
        connections[0].execute('SELECT 1')
    print(f'CLI {args[0]}: sqlite3.connect calls=1; JSON lines=1')


@pytest.mark.parametrize('args,code', [
    ([], 1), (['unknown'], 2), (['support'], 2),
    (['events'], 1), (['events', '--start', 'bad', '--end', '2'], 1),
    (['asset'], 1), (['claims', '--unknown'], 1),
])
def test_cli_parse_errors_one_json(args, code, capsys):
    with pytest.raises(SystemExit) as error:
        main(args)
    assert error.value.code == code
    captured = capsys.readouterr()
    assert not captured.err
    assert len(captured.out.splitlines()) == 1
    assert 'error' in json.loads(captured.out)


@pytest.mark.parametrize('args', [
    ['events', '--start', '2', '--end', '1'],
    ['events', '--start', '0', '--end', '2', '--limit', '-1'],
    ['events', '--start', '0', '--end', str(2**64)],
    ['claims', '--atom', ''], ['asset', '--hash', ''],
])
def test_cli_query_errors(database, args, capsys):
    assert main([*args, '--db', str(database)]) == 1
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 1
    assert 'error' in json.loads(lines[0])


def test_cli_blob_metadata_and_external_working_directory(database, tmp_path):
    with sqlite3.connect(database) as conn:
        conn.execute("INSERT INTO assets(asset_id,content_hash,media_type,content_blob,created_at,imported_at) "
                     "VALUES ('blob','blobhash','application/octet-stream',?,0,0)", (b'\xff\x00',))
    root = Path(__file__).resolve().parents[2]
    # Module launch uses an explicit import root; the database path is absolute.
    script = ('import sys; sys.path.insert(0, sys.argv.pop(1)); '
              'from mvp.backend.knot_query import main; raise SystemExit(main())')
    result = subprocess.run([sys.executable, '-c', script, str(root), 'asset', '--db',
                             str(database), '--hash', 'blobhash'], cwd=tmp_path,
                            capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    assert len(result.stdout.splitlines()) == 1
    assert json.loads(result.stdout)['asset_id'] == 'blob'
    assert 'content_blob' not in json.loads(result.stdout)


def test_cli_missing_database_does_not_create(tmp_path, capsys):
    missing = tmp_path / 'never.db'
    assert main(['asset', '--db', str(missing), '--hash', 'hash']) == 1
    assert 'error' in json.loads(capsys.readouterr().out)
    assert not missing.exists()


def test_cli_directory_and_v13_are_json_errors(database, tmp_path, capsys):
    with sqlite3.connect(database) as conn:
        conn.execute("DELETE FROM schema_version WHERE version='1.4'")
        conn.execute('ALTER TABLE claims_candidates DROP COLUMN source_label')
        conn.execute('ALTER TABLE claims_candidates DROP COLUMN source_members')
    before = database.read_bytes()
    for path in (tmp_path, database):
        assert main(['claims', '--db', str(path), '--atom', 'decision']) == 1
        lines = capsys.readouterr().out.splitlines()
        assert len(lines) == 1
        assert 'error' in json.loads(lines[0])
    assert database.read_bytes() == before
