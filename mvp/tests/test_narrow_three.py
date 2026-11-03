"""KNOT-N1-1-NARROW-001 counterexamples and raw receipt evidence."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import threading

from mvp.backend.init_db import init_database
from mvp.backend import http_server as http
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.claim_review import review_claim
from mvp.backend.continuation_bundle import generate_bundle
from mvp.backend.knot_query import read_snapshot
from mvp.backend.traceback import trace_claim
from mvp.contract.selfcheck import Repo, request
from mvp.tests.test_bundle import generate
from mvp.tests.test_init_db import cli


def test_n1_fresh_versions_and_live_service(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.delenv('KNOT_TOKENS', raising=False)
    db = tmp_path / 'fresh.db'
    result = init_database(db)
    print('AC-1 INIT', json.dumps(result))
    with closing(sqlite3.connect(db)) as conn:
        versions = conn.execute('SELECT version FROM schema_version ORDER BY version').fetchall()
        print('AC-1 SELECT version FROM schema_version ORDER BY version:', versions)
        assert versions == [(f'1.{i}',) for i in range(8)]
        assert next(r for r in conn.execute('PRAGMA table_info(continuation_bundles)')
                    if r[1] == 'job_id')[2:] == ('TEXT', 0, None, 0)
        assert [(r[1], *r[2:]) for r in conn.execute('PRAGMA table_info(asset_readers)')] == [
            ('asset_id', 'TEXT', 1, None, 1), ('actor', 'TEXT', 1, None, 2)]
    assert result['status'] == 'created' and result['schema_version'] == '1.7'
    server = http.Server(db, port=0)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    try:
        response = request(f'http://127.0.0.1:{server.server_port}', '/health')
        print('AC-1 HTTP', json.dumps(response))
        print('AC-1 BundleJobs.schema_version:', server.jobs.schema_version)
        assert response[0] == 200
        assert server.jobs.schema_version == response[1]['value']['schema_version'] == '1.7'
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_n1_existing_populated_v14_refused_unchanged(tmp_path):
    db = tmp_path / 'old14.db'
    with closing(sqlite3.connect(db)) as conn:
        conn.executescript(Path('mvp/backend/schema_v1.sql').read_text(encoding='utf-8'))
    repo = Repo(db)
    aid = repo.add_asset('old-asset', 'text/plain', content_blob=b'preserve this')
    repo.add_event('import', subject=aid, event_time=0)

    def snapshot():
        with closing(sqlite3.connect(db)) as conn:
            return dict(versions=conn.execute('SELECT version FROM schema_version ORDER BY version').fetchall(),
                        counts={name: conn.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0]
                                for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")})

    before = snapshot()
    digest = hashlib.sha256(db.read_bytes()).hexdigest()
    print('AC-2 BEFORE', json.dumps(before, sort_keys=True))
    result = cli(db)
    print('AC-2 CLI', result.returncode, result.stdout.strip(), result.stderr.strip())
    after = snapshot()
    print('AC-2 AFTER', json.dumps(after, sort_keys=True))
    print('AC-2 SHA256', digest, hashlib.sha256(db.read_bytes()).hexdigest())
    assert result.returncode == 1
    assert json.loads(result.stdout)['status'] == 'refused'
    assert json.loads(result.stdout)['reason'] == 'target_exists'
    assert before['versions'] == [(f'1.{i}',) for i in range(5)]
    assert before == after and hashlib.sha256(db.read_bytes()).hexdigest() == digest


def test_n2_zero_and_nonzero_exclusions(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.delenv('KNOT_TOKENS', raising=False)
    db = tmp_path / 'counts.db'
    assert init_database(db)['status'] == 'created'
    repo = Repo(db)
    assets = [repo.add_asset(f'hash-{i}', 'text/plain', content_blob=f'source {i}'.encode())
              for i in range(3)]
    full = generate(db, assets)['context_text'].split('## 已确认决策')[0]
    print('AC-3 SINGLE-USER HEADER\n' + full)
    assert '因权限未纳入' not in full
    # Single-user deliberately ignores grants; use actual configured read grants
    # for the unreadable case rather than inventing a single-user denial.
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('CREATE TABLE IF NOT EXISTS asset_readers '
                     '(asset_id TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY(asset_id,actor))')
        conn.executemany('INSERT INTO asset_readers VALUES (?,?)', [(a, 'A') for a in assets])
    monkeypatch.setenv('KNOT_TOKENS', '{"token-a":"A"}')
    configured = generate(db, assets, actor='A')['context_text'].split('## 已确认决策')[0]
    print('AC-3 CONFIGURED ALL HEADER\n' + configured)
    assert '因权限未纳入' not in configured
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (assets[-1],))
    partial = generate(db, assets, actor='A')['context_text'].split('## 已确认决策')[0]
    print('AC-3 CONFIGURED ONE DENIED HEADER\n' + partial)
    assert partial.splitlines()[-2] == '3 个选中资产中 1 个因权限未纳入'


def test_n3_each_decision_two_event_path_order_and_empty_fallback(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.delenv('KNOT_TOKENS', raising=False)
    db = tmp_path / 'trace.db'
    assert init_database(db)['status'] == 'created'
    repo = Repo(db)
    assets, imports = [], []
    for i in range(2):
        data = f'D-{i + 1} decision {i}'.encode()
        aid = repo.add_asset(hashlib.sha256(data).hexdigest(), 'text/markdown', content_blob=data)
        assets.append(aid)
        imports.append(repo.add_event('import', subject=aid, event_time=0))
    extract_claims(repo, write=True)
    claims = repo._all('SELECT claim_id,source_label FROM claims_candidates ORDER BY source_label')
    assert len(claims) == 2
    roots = [review_claim(repo, c['claim_id'], decision='accept', now=1000)['event_id'] for c in claims]
    text = generate(db, assets)['context_text']
    with read_snapshot(db) as conn:
        for i, claim in enumerate(claims):
            trace = trace_claim(conn, claim['claim_id'])
            ids = [e['event_id'] for e in trace['path']]
            assert ids == [imports[i], roots[i]]
            entry = text.split('[' + claim['source_label'] + ']', 1)[1].split('\n- [', 1)[0]
            why = next(line.strip() for line in entry.splitlines() if '为什么：' in line)
            print('AC-4 TRACE', claim['source_label'], json.dumps(ids), why)
            assert why.removeprefix('为什么：').split(' → ') == ids
    # A missing eligible row is an existing invalid-evidence/empty-path fallback.
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM eligible_snapshots WHERE event_id=?', (roots[0],))
    degraded = generate(db, assets)['context_text'].split('## 未决问题', 1)[1].split('## 来源清单', 1)[0]
    print('AC-4 EMPTY PATH FALLBACK\n' + degraded)
    assert '[D-1]' in degraded and '证据无效' in degraded
    assert '为什么：' not in degraded
    assert '证据无效；候选来源事件：' + imports[0] in degraded
