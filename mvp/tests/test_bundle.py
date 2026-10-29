"""Real bundle content and durable asynchronous command lifecycle (AC-8b)."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import threading
import time
from uuid import uuid4

import pytest

from mvp.backend import http_server as http
from mvp.backend.bundle_jobs import BundleJobs
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.claim_review import review_claim
from mvp.backend.continuation_bundle import generate_bundle
from mvp.backend.init_db import init_database
from mvp.backend.knot_query import read_snapshot
from mvp.backend.traceback import trace_claim
from mvp.contract.selfcheck import Repo, request, validate
from mvp.tests.test_http_contract import Live


@pytest.fixture
def material(tmp_path):
    db = tmp_path / 'bundle.db'
    assert init_database(db)['status'] == 'created'
    repo = Repo(db)
    assets = []
    for text in ('D-12 选择本地事件作为事实来源\nT17-01 条件支持需保留来源',
                 'P17-01 反例不自动变成决策\nQ18-01 仍需核验导出后的续接',
                 'T17-02 未选择来源，不得进入续接包'):
        data = text.encode('utf-8')
        aid = repo.add_asset(hashlib.sha256(data).hexdigest(), 'text/markdown', content_blob=data)
        repo.add_event('import', subject=aid, event_time=0)
        assets.append(aid)
    extract_claims(repo, write=True)
    claims = {r['source_label']: r['claim_id'] for r in repo._all('SELECT source_label,claim_id FROM claims_candidates')}
    for label in ('D-12', 'T17-01', 'P17-01', 'T17-02'):
        review_claim(repo, claims[label], decision='accept', now=1000)
    return db, assets, claims


def generate(db, assets, **kwargs):
    with closing(sqlite3.connect(db)) as conn:
        return generate_bundle(conn, assets, **kwargs)


def test_selected_content_provenance_and_persistence(material):
    db, assets, claims = material
    result = generate(db, assets[:2])
    text = result['context_text']
    for excerpt in ('选择本地事件作为事实来源', '条件支持需保留来源', '反例不自动变成决策', '仍需核验导出后的续接'):
        assert excerpt in text
    for heading in ('已确认决策', '条件性定理', '反例', '未决问题', '来源清单'):
        assert '## ' + heading in text
    assert 'T17-02' not in text and assets[2] not in json.dumps(result)
    with read_snapshot(db) as conn:
        for label in ('D-12', 'T17-01', 'P17-01'):
            trace = trace_claim(conn, claims[label])
            why = next(line.strip() for line in text.split('[' + label + ']')[1].splitlines() if '为什么：' in line)
            assert why.removeprefix('为什么：').split(' → ') == [e['event_id'] for e in trace['path']]
        for aid in assets[:2]:
            digest = conn.execute('SELECT content_hash FROM assets WHERE asset_id=?', (aid,)).fetchone()[0]
            assert digest[:12] in text
        stored = dict(conn.execute('SELECT * FROM continuation_bundles').fetchone())
        assert stored['context_text'] == text
        assert json.loads(stored['authorized_assets']) == sorted(assets[:2])
        assert stored['user_scoped'] == 1 and stored['exported'] == 0
    print('CONTEXT_TEXT\n' + text)


@pytest.mark.parametrize('selection', [[], None, 'all', ['missing'], [1]])
def test_bad_selection_writes_nothing(material, selection):
    db, _, _ = material
    with pytest.raises(ValueError):
        generate(db, selection)
    with closing(sqlite3.connect(db)) as conn:
        assert conn.execute('SELECT COUNT(*) FROM continuation_bundles').fetchone()[0] == 0


def test_questions_optout_revocation_and_caller_rollback(material):
    db, assets, claims = material
    review_claim(Repo(db), claims['D-12'], decision='reject', now=2000)
    result = generate(db, assets[:2], include_open_questions=False)
    assert 'Q18-01' not in result['context_text'] and 'D-12' not in result['context_text']
    assert result['open_questions'] == []
    with closing(sqlite3.connect(db)) as conn:
        conn.execute('BEGIN')
        other = generate_bundle(conn, assets[:2])
        assert conn.in_transaction
        conn.rollback()
        assert conn.execute('SELECT 1 FROM continuation_bundles WHERE bundle_id=?', (other['bundle_id'],)).fetchone() is None


def test_partial_candidate_sources_and_broken_trace_fail_closed(material):
    db, assets, claims = material
    with closing(sqlite3.connect(db)) as conn, conn:
        refs = [r[0] for r in conn.execute("SELECT event_id FROM history_events WHERE event_type='import'")]
        conn.execute('UPDATE claims_candidates SET support_sources=? WHERE claim_id=?', (json.dumps(refs), claims['T17-01']))
    assert 'T17-01' not in generate(db, assets[:2])['context_text']
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("UPDATE history_events SET evidence_refs='[\"missing\"]' WHERE event_type='user_confirm' AND subject=?", (claims['D-12'],))
    with pytest.raises(ValueError, match='missing evidence event'):
        generate(db, assets[:2])
    with closing(sqlite3.connect(db)) as conn:
        assert conn.execute('SELECT COUNT(*) FROM continuation_bundles').fetchone()[0] == 1


def poll(base, jid):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        response = request(base, '/jobs/' + jid)
        assert response[0] == 200
        validate(response[1], next(r for r in http.ROUTES if r['response'] == 'Job'))
        if response[1]['value']['status'] in ('done', 'failed'):
            return response
        time.sleep(.01)
    raise AssertionError('job did not finish')


def test_ac8b_raw_lifecycle_export_and_failure(material, tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    db, assets, _ = material
    pending, running, release_pending, release_running = (threading.Event() for _ in range(4))
    original_run, original_execute = BundleJobs._run, BundleJobs._execute

    def held_run(self, *args):
        pending.set()
        assert release_pending.wait(5)
        return original_run(self, *args)

    def held_execute(self, *args):
        running.set()
        assert release_running.wait(5)
        return original_execute(self, *args)

    monkeypatch.setattr(BundleJobs, '_run', held_run)
    monkeypatch.setattr(BundleJobs, '_execute', held_execute)
    server = http.Server(db, port=0)
    server.jobs.exports = tmp_path / 'exports'
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        body = dict(command='bundle.create', args=dict(asset_ids=assets[:2]), idempotency_key='bundle-1')
        accepted = request(base, '/commands', body)
        assert accepted[0] == 202
        value = accepted[1]['value']
        assert value == dict(command='bundle.create', status='queued', event_id=None, job_id=value['job_id'])
        validate(accepted[1], next(r for r in http.ROUTES if r['response'] == 'CommandResult'))
        assert pending.wait(5)
        first = request(base, '/jobs/' + value['job_id'])
        assert first[1]['value']['status'] == 'pending'
        release_pending.set()
        assert running.wait(5)
        second = request(base, '/jobs/' + value['job_id'])
        assert second[1]['value']['status'] == 'running'
        release_running.set()
        done = poll(base, value['job_id'])
        assert done[1]['value']['status'] == 'done'
        bid = done[1]['value']['result']['bundle_id']
        assert request(base, '/commands', body) == accepted
        assert request(base, '/commands', body | {'args': dict(asset_ids=assets)})[0] == 400
        print('AC-8b RAW ' + json.dumps([accepted, first, second, done], ensure_ascii=False))
        for response in (first, second, done):
            validate(response[1], next(r for r in http.ROUTES if r['response'] == 'Job'))
        export = request(base, '/commands', dict(command='bundle.export', args=dict(bundle_id=bid)))
        assert export[0] == 202 and export[1]['value']['status'] == 'queued'
        exported = poll(base, export[1]['value']['job_id'])
        result = exported[1]['value']['result']
        assert result == dict(bundle_id=bid, exported=True, path='exports/' + bid + '.md')
        target = tmp_path / result['path']
        with read_snapshot(db) as conn:
            row = conn.execute('SELECT context_text,exported FROM continuation_bundles WHERE bundle_id=?', (bid,)).fetchone()
        assert target.read_text(encoding='utf-8') == row[0] and row[1] == 1
        assert not Path(result['path']).is_absolute()
        bad = request(base, '/commands', dict(command='bundle.create', args=dict(asset_ids=['missing'])))
        failed = poll(base, bad[1]['value']['job_id'])
        assert failed[1]['value']['status'] == 'failed' and failed[1]['value']['error']['code'] == 'BAD_REQUEST'
        absent = request(base, '/commands', dict(command='bundle.export', args=dict(bundle_id=str(uuid4()))))
        assert poll(base, absent[1]['value']['job_id'])[1]['value']['error']['code'] == 'NOT_FOUND'
        for args in ({}, {'asset_ids': []}, {'asset_ids': assets, 'include_open_questions': 1}):
            assert request(base, '/commands', dict(command='bundle.create', args=args))[0] == 400
        assert request(base, '/commands', dict(command='bundle.export', args=dict(bundle_id='../outside')))[0] == 400
        assert request(base, '/jobs/unknown')[1]['error']['code'] == 'NOT_FOUND'
        print('AC-8b EXPORT ' + json.dumps([export, exported]))
        print('AC-8b FAILED ' + json.dumps([bad, failed]))
    finally:
        release_pending.set()
        release_running.set()
        server.shutdown()
        server.server_close()
        thread.join()
    # Real OS process starts, reads the durable job, exits, then restarts.
    live = Live(db)
    try:
        after = live.get('/jobs/' + value['job_id'])
        assert after == done
        live.stop()
        live.start()
        assert live.get('/jobs/' + value['job_id']) == done
        assert request(live.base, '/commands', body) == accepted
        print('AC-8b RESTART ' + json.dumps(after))
    finally:
        live.stop()


def test_interrupted_jobs_become_failed_without_replay(material):
    db, _, _ = material
    server = http.Server(db, port=0)
    job = dict(job_id='interrupted', command='bundle.create', status='running', created_at=1,
               updated_at=1, result=None, error=None)
    server.journal['jobs']['interrupted'] = job
    server.persist(server.journal)
    server.server_close()
    server = http.Server(db, port=0)
    try:
        assert server.jobs.get('interrupted')['status'] == 'failed'
        assert server.jobs.get('interrupted')['error']['message'] == 'interrupted_job_requires_review'
        with read_snapshot(db) as conn:
            assert conn.execute('SELECT COUNT(*) FROM continuation_bundles').fetchone()[0] == 0
    finally:
        server.server_close()


@pytest.mark.parametrize('at', ['running', 'done'])
def test_job_journal_failure_degrades_and_blocks(material, monkeypatch, at):
    db, assets, _ = material
    server = http.Server(db, port=0)
    persist = server.persist
    def failing(journal):
        if any(j['status'] == at for j in journal.get('jobs', {}).values()):
            raise OSError('synthetic failure with private host path')
        persist(journal)
    monkeypatch.setattr(server, 'persist', failing)
    try:
        value = server.command(dict(command='bundle.create', args=dict(asset_ids=assets[:2])), 'local-user')
        server.jobs.close()
        assert server.jobs.failed
        assert server.jobs.get(value['job_id'])['status'] == ('pending' if at == 'running' else 'running')
        handler = object.__new__(http.Handler)
        handler.server = server
        assert handler.read('Health', {})['read_only'] is True
        assert handler.read('Health', {})['status'] == 'degraded'
        with pytest.raises(http.Fault) as exc:
            server.command(dict(command='bundle.create', args=dict(asset_ids=assets[:2])), 'local-user')
        assert exc.value.code == 'INTERNAL'
    finally:
        server.server_close()
