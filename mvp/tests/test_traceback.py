"""Strict event provenance, delegated status and a caller-owned read snapshot."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

from mvp.backend import traceback as trace
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.claim_review import review_claim
from mvp.backend.init_db import init_database
from mvp.backend.knot_query import main
from mvp.backend.timeline_query import read_snapshot


class Repo(AssetRepo, EventStore):
    pass


@pytest.fixture
def candidate(tmp_path):
    db = tmp_path / 'trace #%.db'
    assert init_database(db)['status'] == 'created'
    repo = Repo(db)
    for i in range(4):
        data = f'T17-01 source {i}'.encode()
        asset = repo.add_asset(hashlib.sha256(data).hexdigest(), 'text/markdown', content_blob=data,
                               metadata_json=json.dumps({'path': f'source-{i}.md'}))
        repo.add_event('import', subject=asset, event_time=100 + i)
    assert extract_claims(repo, write=True)['inserted'] == 1
    cid = repo._one('SELECT claim_id FROM claims_candidates')['claim_id']
    return repo, cid


def read(candidate, **kwargs):
    repo, cid = candidate
    with read_snapshot(repo.db_path) as conn:
        return trace.trace_claim(conn, cid, **kwargs)


def confirm(candidate, now=1000):
    repo, cid = candidate
    return review_claim(repo, cid, decision='accept', now=now)['event_id']


def set_refs(repo, event_id, refs):
    with closing(sqlite3.connect(repo.db_path)) as conn, conn:
        conn.execute('UPDATE history_events SET evidence_refs=? WHERE event_id=?', (json.dumps(refs), event_id))


def graph_event(conn, event_id, refs):
    conn.execute("INSERT INTO history_events(event_id,event_type,event_time,recorded_at,evidence_refs) "
                 "VALUES (?,'agent_propose',0,0,?)", (event_id, json.dumps(refs)))


def test_confirmed_full_path_assets_and_metadata(candidate):
    root = confirm(candidate)
    result = read(candidate)
    assert result['status'] == 'confirmed'
    assert (len(result['path']), len(result['assets']), result['depth']) == (5, 4, 2)
    assert result['path'][-1]['event_id'] == root  # time sort, not root-first display
    assert result['path'][-1]['depth'] == 1
    assert all(row['depth'] == 2 for row in result['path'][:-1])
    assert result['path'][-1]['evidence_refs'] == result['candidate_sources']
    assert result['missing_refs'] == [] and result['source_members'] == []
    assert [a['asset_id'] for a in result['assets']] == sorted(a['asset_id'] for a in result['assets'])
    assert {a['path'] for a in result['assets']} == {f'source-{i}.md' for i in range(4)}
    assert all(set(a) == {'asset_id', 'content_hash', 'media_type', 'source_uri', 'path'} for a in result['assets'])
    assert all(set(e) == {'event_id', 'event_type', 'subject', 'event_time', 'recorded_at', 'evidence_refs', 'depth'}
               for e in result['path'])


def test_unconfirmed_and_rejected_never_confirmed(candidate):
    result = read(candidate)
    assert result['status'] == 'unconfirmed'
    assert result['path'] == result['assets'] == [] and result['depth'] == 0
    assert len(result['candidate_sources']) == 4
    repo, cid = candidate
    review_claim(repo, cid, decision='reject', now=1000)
    assert read(candidate) == result


def test_revocation_preserves_path(candidate):
    confirm(candidate)
    before = read(candidate)
    repo, cid = candidate
    review_claim(repo, cid, decision='reject', now=2000)
    after = read(candidate)
    assert after['status'] == 'revoked'
    assert after['path'] == before['path'] and after['assets'] == before['assets']
    assert len(after['path']) == 5


def test_sorting_uses_event_time_then_rowid_and_both_timestamps(candidate):
    repo, _ = candidate
    root = confirm(candidate, now=50)  # earlier than material mtime 100..103
    with closing(sqlite3.connect(repo.db_path)) as conn, conn:
        conn.execute("UPDATE history_events SET event_time=100 WHERE event_type='import'")
        expected = [row[0] for row in conn.execute('SELECT event_id FROM history_events ORDER BY event_time,rowid')]
    result = read(candidate)
    assert [e['event_id'] for e in result['path']] == expected
    assert result['path'][0]['event_id'] == root
    assert all(e['recorded_at'] >= e['event_time'] for e in result['path'])
    assert result['path'][0]['event_time'] == 50
    assert [e['event_time'] for e in result['path'][1:]] == [100] * 4
    print('time ordering example:', json.dumps(result['path']))


def test_missing_reference_names_id_and_returns_no_partial_cli(candidate, capsys):
    root = confirm(candidate)
    repo, cid = candidate
    set_refs(repo, root, ['missing-event'])
    with pytest.raises(ValueError, match='missing evidence event: missing-event') as error:
        read(candidate)
    print(str(error.value))
    capsys.readouterr()
    assert main(['trace', '--offline', '--db', str(repo.db_path), '--claim', cid]) == 1
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 1 and set(json.loads(lines[0])) == {'error'}
    assert 'missing-event' in json.loads(lines[0])['error']
    print(str(error.value))


def test_cycle_names_members(candidate):
    root = confirm(candidate)
    repo, _ = candidate
    with closing(sqlite3.connect(repo.db_path)) as conn, conn:
        graph_event(conn, 'A', ['B'])
        graph_event(conn, 'B', ['A'])
    set_refs(repo, root, ['A'])
    with pytest.raises(ValueError, match='cycle:.*A.*B.*A') as error:
        read(candidate)
    print(str(error.value))


def test_six_layer_chain_refuses_five_and_accepts_six(candidate):
    root = confirm(candidate)
    repo, _ = candidate
    with closing(sqlite3.connect(repo.db_path)) as conn, conn:
        for i in range(2, 7):
            graph_event(conn, f'layer-{i}', [f'layer-{i+1}'] if i < 6 else [])
    set_refs(repo, root, ['layer-2'])
    with pytest.raises(ValueError, match='max_depth=5.*layer-6') as error:
        read(candidate)
    print(str(error.value))
    result = read(candidate, max_depth=6)
    assert len(result['path']) == 6 and result['depth'] == 6


def test_shared_dag_is_not_a_cycle_and_long_route_still_bounded(candidate):
    root = confirm(candidate)
    repo, _ = candidate
    with closing(sqlite3.connect(repo.db_path)) as conn, conn:
        graph_event(conn, 's', ['t'])
        graph_event(conn, 't', ['u'])
        graph_event(conn, 'u', [])
        graph_event(conn, 'a', ['s'])
    set_refs(repo, root, ['s', 'a', 's'])
    with pytest.raises(ValueError, match='max_depth=4'):
        read(candidate, max_depth=4)
    result = read(candidate, max_depth=5)
    assert len(result['path']) == 5 and result['depth'] == 5
    assert next(e['depth'] for e in result['path'] if e['event_id'] == 's') == 2


def test_status_is_delegated_with_same_connection(candidate, monkeypatch):
    confirm(candidate)
    native = trace.claim_support
    calls = []

    def changed(conn, cid, *, at):
        calls.append((conn, cid, at))
        return native(conn, cid, at=at) | {'status': 'revoked'}

    monkeypatch.setattr(trace, 'claim_support', changed)
    repo, cid = candidate
    with read_snapshot(repo.db_path) as conn:
        result = trace.trace_claim(conn, cid)
        assert calls == [(conn, cid, calls[0][2])]
        assert type(calls[0][2]) is int
    assert result['status'] == 'revoked' and len(result['path']) == 5


@pytest.mark.parametrize('max_depth', [0, -1, True, 1.5, '5', None])
def test_invalid_depth(candidate, max_depth):
    with pytest.raises(ValueError, match='max_depth'):
        read(candidate, max_depth=max_depth)


@pytest.mark.parametrize('claim_id', ['', None, 1, True])
def test_invalid_claim_id(candidate, claim_id):
    repo, _ = candidate
    with read_snapshot(repo.db_path) as conn, pytest.raises(ValueError, match='claim_id'):
        trace.trace_claim(conn, claim_id)


def test_caller_must_own_transaction(candidate):
    repo, cid = candidate
    with closing(sqlite3.connect(repo.db_path)) as conn, pytest.raises(ValueError, match='read_snapshot'):
        trace.trace_claim(conn, cid)


@pytest.mark.parametrize('raw', ['{', '{}', '[1]', '[""]'])
def test_malformed_evidence_refs_refused(candidate, raw):
    root = confirm(candidate)
    repo, _ = candidate
    with closing(sqlite3.connect(repo.db_path)) as conn, conn:
        conn.execute('UPDATE history_events SET evidence_refs=? WHERE event_id=?', (raw, root))
    with pytest.raises(ValueError, match='evidence_refs'):
        read(candidate)


def test_missing_asset_is_a_defect(candidate):
    confirm(candidate)
    repo, _ = candidate
    with closing(sqlite3.connect(repo.db_path)) as conn, conn:
        conn.execute("UPDATE history_events SET subject='missing-asset' WHERE event_type='import'")
    with pytest.raises(ValueError, match='missing import asset'):
        read(candidate)


def test_cli_one_connection_one_transaction_and_byte_preservation(candidate, monkeypatch, capsys):
    confirm(candidate)
    repo, cid = candidate
    before = repo.db_path.read_bytes()
    original = sqlite3.connect
    opened, statements = [], []

    def connect(*args, **kwargs):
        conn = original(*args, **kwargs)
        opened.append(conn)
        conn.set_trace_callback(statements.append)
        return conn

    monkeypatch.setattr(sqlite3, 'connect', connect)
    assert main(['trace', '--offline', '--db', str(repo.db_path), '--claim', cid]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 1 and len(json.loads(lines[0])['path']) == 5
    assert len(opened) == statements.count('BEGIN') == statements.count('ROLLBACK') == 1
    assert all(sql.split()[0] in ('SELECT', 'BEGIN', 'ROLLBACK') for sql in statements)
    assert repo.db_path.read_bytes() == before
    with pytest.raises(sqlite3.ProgrammingError):
        opened[0].execute('SELECT 1')
    print('trace CLI: connections=1 BEGIN=1 ROLLBACK=1; database SHA256 unchanged')


@pytest.mark.parametrize('options', [['--claim', 'unknown'], ['--claim', 'T17-01'],
                                    ['--claim', '', '--max-depth', '5']])
def test_cli_unknown_or_invalid_claim(candidate, capsys, options):
    repo, _ = candidate
    assert main(['trace', '--offline', '--db', str(repo.db_path), *options]) == 1
    output = capsys.readouterr()
    assert not output.err and len(output.out.splitlines()) == 1
    assert set(json.loads(output.out)) == {'error'}


@pytest.mark.parametrize('depth', ['0', '-1', 'bad'])
def test_cli_invalid_depth(candidate, capsys, depth):
    repo, cid = candidate
    args = ['trace', '--offline', '--db', str(repo.db_path), '--claim', cid, '--max-depth', depth]
    if depth == 'bad':
        with pytest.raises(SystemExit) as error:
            main(args)
        assert error.value.code == 1
    else:
        assert main(args) == 1
    assert set(json.loads(capsys.readouterr().out)) == {'error'}


def test_cli_subprocess_json_and_missing_database(candidate, tmp_path):
    repo, cid = candidate
    root = Path(__file__).resolve().parents[2]
    # Explicit import root allows a working directory outside the checkout.
    script = ('import sys; sys.path.insert(0,sys.argv.pop(1)); '
              'from mvp.backend.knot_query import main; raise SystemExit(main())')
    prefix = [sys.executable, '-c', script, str(root), 'trace']
    result = subprocess.run([*prefix, '--offline', '--db', str(repo.db_path), '--claim', cid],
                            cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0 and not result.stderr
    assert len(result.stdout.splitlines()) == 1
    assert json.loads(result.stdout)['status'] == 'unconfirmed'
    missing = tmp_path / 'missing.db'
    result = subprocess.run([*prefix, '--offline', '--db', str(missing), '--claim', cid],
                            cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 1 and set(json.loads(result.stdout)) == {'error'}
    assert not missing.exists()


def test_concurrent_commit_cannot_mix_status_and_path(candidate, monkeypatch):
    root = confirm(candidate)
    repo, _ = candidate
    native = trace.claim_support

    def concurrent(conn, cid, *, at):
        with closing(sqlite3.connect(repo.db_path, timeout=0)) as writer, writer:
            graph_event(writer, 'later-evidence', [])
            row = writer.execute('SELECT evidence_refs FROM history_events WHERE event_id=?', (root,)).fetchone()
            writer.execute('UPDATE history_events SET evidence_refs=? WHERE event_id=?',
                           (json.dumps(json.loads(row[0]) + ['later-evidence']), root))
        return native(conn, cid, at=at)

    monkeypatch.setattr(trace, 'claim_support', concurrent)
    assert len(read(candidate)['path']) == 5
    monkeypatch.setattr(trace, 'claim_support', native)
    assert len(read(candidate)['path']) == 6
    print('trace barrier: timeout=0 writer committed; same snapshot path=5; next snapshot path=6')
