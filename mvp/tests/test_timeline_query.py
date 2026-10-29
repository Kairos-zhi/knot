"""Read-only ownership, deterministic intervals and WAL snapshot isolation."""

import hashlib
import sqlite3
import json
from pathlib import Path
import subprocess
import sys

import pytest

from mvp.backend.init_db import init_database
from mvp.backend import knot_query as query
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.claim_review import review_claim
from mvp.backend.claim_support import claim_support, claim_support_many
from mvp.backend.support_view import compute_support
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
    assert main([*args, '--offline', '--db', str(database)]) == 0
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
    ([], 1), (['unknown'], 2), (['unsupported-command'], 2),
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
    assert main([*args, '--offline', '--db', str(database)]) == 1
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
    result = subprocess.run([sys.executable, '-c', script, str(root), 'asset', '--offline', '--db',
                             str(database), '--hash', 'blobhash'], cwd=tmp_path,
                            capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    assert len(result.stdout.splitlines()) == 1
    assert json.loads(result.stdout)['asset_id'] == 'blob'
    assert 'content_blob' not in json.loads(result.stdout)


def test_cli_missing_database_does_not_create(tmp_path, capsys):
    missing = tmp_path / 'never.db'
    assert main(['asset', '--offline', '--db', str(missing), '--hash', 'hash']) == 1
    assert 'error' in json.loads(capsys.readouterr().out)
    assert not missing.exists()


def test_cli_directory_and_v13_are_json_errors(database, tmp_path, capsys):
    with sqlite3.connect(database) as conn:
        conn.execute("DELETE FROM schema_version WHERE version='1.4'")
        conn.execute('ALTER TABLE claims_candidates DROP COLUMN source_label')
        conn.execute('ALTER TABLE claims_candidates DROP COLUMN source_members')
    before = database.read_bytes()
    for path in (tmp_path, database):
        assert main(['claims', '--offline', '--db', str(path), '--atom', 'decision']) == 1
        lines = capsys.readouterr().out.splitlines()
        assert len(lines) == 1
        assert 'error' in json.loads(lines[0])
    assert database.read_bytes() == before


class Repo(AssetRepo, EventStore):
    pass


@pytest.fixture
def support_repo(tmp_path):
    path = tmp_path / 'support #%.db'
    assert init_database(path)['status'] == 'created'
    repo = Repo(path)
    data = b'D-01 D-02 T17-01 T17-02'
    asset = repo.add_asset(hashlib.sha256(data).hexdigest(), 'text/markdown', content_blob=data)
    repo.add_event('import', subject=asset, event_time=0)
    assert extract_claims(repo, write=True)['inserted'] == 4
    return repo


def claim_id(repo, label):
    return repo._one('SELECT claim_id FROM claims_candidates WHERE source_label=?', (label,))['claim_id']


def run_support(repo, capsys, *options):
    code = query.main(['support', '--offline', '--db', str(repo.db_path), *options])
    captured = capsys.readouterr()
    assert not captured.err
    assert len(captured.out.splitlines()) == 1
    return code, json.loads(captured.out)


def test_support_cli_native_single_batch_and_atom_views(support_repo, capsys):
    repo = support_repo
    cid = claim_id(repo, 'T17-01')
    event = review_claim(repo, cid, decision='accept', now=100)['event_id']
    code, single = run_support(repo, capsys, '--at', '100', '--claim', cid)
    assert code == 0
    with read_snapshot(repo.db_path) as conn:
        assert single == claim_support(conn, cid, at=100)
        assert single['atom_view'] == compute_support(conn, 100)['atoms'][single['atom']]
        expected = claim_support_many(conn, at=100)
    assert single['minimal_roots'] == [[event]]
    code, batch = run_support(repo, capsys, '--at', '100')
    assert code == 0 and batch == expected
    code, filtered = run_support(repo, capsys, '--at', '100', '--atom', 'conditional_theorem')
    assert code == 0 and len(filtered['claims']) == 2
    assert filtered['counts'] == dict(confirmed=1, revoked=0, unconfirmed=1)
    assert all(c['atom'] == 'conditional_theorem' for c in filtered['claims'])
    code, absent = run_support(repo, capsys, '--at', '100', '--atom', 'unknown')
    assert code == 0 and absent == dict(at=100, counts=dict(confirmed=0, revoked=0, unconfirmed=0), claims=[])


def test_support_cli_unconditional_atom_does_not_confirm_claim(support_repo, capsys):
    code, result = run_support(support_repo, capsys, '--at', '100', '--atom', 'decision')
    assert code == 0
    assert len(result['claims']) == 2
    for claim in result['claims']:
        assert claim['status'] == 'unconfirmed'
        assert (claim['boolean'], claim['minimal_roots']) == (False, [])
        assert claim['atom_view'] == dict(boolean=True, minimal_roots=[[]])


def test_support_cli_one_read_transaction_no_changes(support_repo, capsys, monkeypatch):
    original = sqlite3.connect
    traces, connections = [], []
    before = support_repo.db_path.read_bytes()

    def connect(*args, **kwargs):
        conn = original(*args, **kwargs)
        connections.append(conn)
        conn.set_trace_callback(traces.append)
        return conn

    monkeypatch.setattr(sqlite3, 'connect', connect)
    code, result = run_support(support_repo, capsys, '--at', '100', '--atom', 'decision')
    assert code == 0 and len(result['claims']) == 2
    assert len(connections) == 1
    assert traces.count('BEGIN') == traces.count('ROLLBACK') == 1
    assert all(sql.split()[0] in ('BEGIN', 'SELECT', 'ROLLBACK') for sql in traces)
    assert support_repo.db_path.read_bytes() == before
    with pytest.raises(sqlite3.ProgrammingError):
        connections[0].execute('SELECT 1')
    print('support CLI: connect=1 BEGIN=1 ROLLBACK=1; no writes; byte-identical DB')


def test_support_cli_concurrent_commit_does_not_mix_views(support_repo, capsys, monkeypatch):
    repo = support_repo
    cid = claim_id(repo, 'D-01')
    native = query.claim_support_many

    def concurrent(conn, **kwargs):
        # read_snapshot's schema SELECT already fixed the snapshot before dispatch.
        assert conn.in_transaction
        with sqlite3.connect(repo.db_path, timeout=0) as writer:
            writer.execute("INSERT INTO history_events(event_id,event_type,subject,event_time,recorded_at) "
                           "VALUES ('confirm','user_confirm',?,100,100)", (cid,))
            writer.execute("INSERT INTO event_atom_map(event_id,atom,created_at) VALUES ('confirm','decision',100)")
            writer.execute("INSERT INTO eligible_snapshots(snapshot_id,snapshot_time,event_id,is_eligible,trust_level) "
                           "VALUES ('snapshot',100,'confirm',1,'trusted')")
        return native(conn, **kwargs)

    monkeypatch.setattr(query, 'claim_support_many', concurrent)
    code, old = run_support(repo, capsys, '--at', '100', '--atom', 'decision')
    assert code == 0 and old['counts']['confirmed'] == 0
    monkeypatch.setattr(query, 'claim_support_many', native)
    code, new = run_support(repo, capsys, '--at', '100', '--atom', 'decision')
    assert code == 0 and new['counts']['confirmed'] == 1
    confirmed = next(c for c in new['claims'] if c['claim_id'] == cid)
    assert confirmed['minimal_roots'] == [['confirm']]
    print('support CLI barrier: timeout=0 writer COMMIT succeeded; same call confirmed=0; next call confirmed=1')


@pytest.mark.parametrize('options', [
    ['--at', '-1'], ['--at', str(2**63)], ['--at', '100', '--atom', ''],
    ['--at', '100', '--claim', ''], ['--at', '100', '--claim', 'unknown'],
])
def test_support_cli_query_errors(support_repo, capsys, options):
    code, result = run_support(support_repo, capsys, *options)
    assert code == 1 and set(result) == {'error'}


@pytest.mark.parametrize('options', [
    [], ['--at', 'bad'], ['--at', '100', '--atom', 'decision', '--claim', 'id'],
])
def test_support_cli_parse_errors(support_repo, capsys, options):
    with pytest.raises(SystemExit) as error:
        query.main(['support', '--offline', '--db', str(support_repo.db_path), *options])
    assert error.value.code == 1
    output = capsys.readouterr()
    assert not output.err and len(output.out.splitlines()) == 1
    assert set(json.loads(output.out)) == {'error'}


def test_support_cli_missing_database_never_creates(tmp_path, capsys):
    path = tmp_path / 'absent.db'
    assert query.main(['support', '--offline', '--db', str(path), '--at', '0']) == 1
    assert set(json.loads(capsys.readouterr().out)) == {'error'}
    assert not path.exists()


def test_support_cli_atom_filter_is_not_truncated_at_500(support_repo, capsys):
    with sqlite3.connect(support_repo.db_path) as conn:
        conn.executemany(
            "INSERT INTO claims_candidates(claim_id,claim_type,atom,extraction_method,proposed_at,source_label) "
            "VALUES (?,'decision','decision','rule_based',0,?)",
            [(f'bulk-{i}', f'D-{i+1000}') for i in range(501)],
        )
    code, result = run_support(support_repo, capsys, '--at', '100', '--atom', 'decision')
    assert code == 0 and len(result['claims']) == 503
    assert result['counts'] == dict(confirmed=0, revoked=0, unconfirmed=503)


def test_support_cli_subprocess_json(support_repo):
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, '-m', 'mvp.backend.knot_query', 'support', '--offline', '--db', str(support_repo.db_path),
         '--at', '100', '--atom', 'decision'], cwd=root, capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert not result.stderr and len(result.stdout.splitlines()) == 1
    value = json.loads(result.stdout)
    assert value['counts'] == dict(confirmed=0, revoked=0, unconfirmed=2)
    assert all(c['atom_view']['boolean'] and not c['boolean'] for c in value['claims'])
