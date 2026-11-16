"""Bounded synthetic Codex hosts: no personal data or browser automation."""
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import threading
from uuid import uuid4

import pytest

from mvp.devtools import codex_capture as capture
from mvp import project_policy as policy
from mvp.backend.init_db import init_database
from mvp.backend.project_repo import ProjectRepo
from mvp.backend.http_server import Server
from mvp.devtools.project_transport import project_get, project_import
from mvp.devtools.workbench import create_server
from test_workbench import running
from test_project_http import call
from test_contract_schema import definition_validator

TOKEN = 'synthetic-capture-token-20261117'
ACTOR = 'synthetic-capture-owner'


@pytest.fixture
def host(tmp_path):
    home = tmp_path / 'codex'
    home.mkdir(); (home / 'sessions').mkdir()
    with sqlite3.connect(home / 'state_5.sqlite') as c:
        c.executescript('CREATE TABLE projects(id TEXT,name TEXT);'
            'CREATE TABLE project_roots(project_id TEXT,path TEXT);'
            'CREATE TABLE threads(id TEXT,cwd TEXT,project_id TEXT,rollout_path TEXT,'
            'source TEXT,agent_nickname TEXT,agent_role TEXT,updated_at_ms INTEGER,archived INTEGER);')
    return home


def project(host, root, name='Synthetic project'):
    pid = str(uuid4())
    with sqlite3.connect(host / 'state_5.sqlite') as c:
        c.execute('INSERT INTO projects VALUES (?,?)', (pid, name))
        c.execute('INSERT INTO project_roots VALUES (?,?)', (pid, str(root)))
    return pid


def human(text='我希望先保留真实选择。\r\n', mid=None, **changes):
    return dict(type='response_item', payload=dict(type='message', role='user', id=mid or 'msg_' + str(uuid4()),
        content=[dict(type='input_text', text=text)], internal_chat_message_metadata_passthrough=dict(
            create_time=1794700000.125, content_item_kinds=['user.text'],
            content_item_metadata=[dict(provenance=dict(type='user'))])), **changes)


def thread(host, root, messages=None, pid=None, source='vscode', updated=1, archived=0):
    tid = str(uuid4()); path = host / 'sessions' / (tid + '.jsonl')
    values = [dict(type='session_meta', payload=dict(id=tid))] + (messages if messages is not None else [human()])
    path.write_bytes(b''.join(json.dumps(v, ensure_ascii=False).encode('utf8') + b'\n' for v in values))
    with sqlite3.connect(host / 'state_5.sqlite') as c:
        c.execute('INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?)',
            (tid, str(root), pid, str(path), source, None, None, updated, archived))
    return dict(thread_id=tid, path=str(path))


@pytest.fixture
def target(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({TOKEN: ACTOR}))
    db = tmp_path / 'knot.sqlite3'
    assert init_database(db)['status'] == 'created'
    repo = ProjectRepo(db)
    return db, repo


def follower(host, repo, **kw):
    return capture.CodexCapture(host,
        listing=lambda: repo.list_projects(ACTOR, TOKEN),
        reading=lambda pid: repo.read_project(ACTOR, TOKEN, pid),
        importing=lambda body: repo.import_project(ACTOR, TOKEN, body), **kw)


def counts(db):
    with sqlite3.connect(db) as c:
        return tuple(c.execute('SELECT COUNT(*) FROM ' + t).fetchone()[0]
            for t in ('assets', 'history_events', 'asset_readers'))


def test_registry_identity_longest_root_same_name_and_explicit_binding(host, tmp_path):
    outer = tmp_path / 'work'; inner = outer / 'child'
    a = project(host, outer, 'Same name'); b = project(host, inner, 'Same name')
    t = thread(host, inner); outside = thread(host, tmp_path / 'elsewhere')
    thread(host, outer, source='{"subagent":{"other":"guardian"}}')
    thread(host, outer, archived=1)
    target = str(uuid4())
    values, issues = capture.discover(host, {outside['thread_id']: dict(project_id=target, title='Bound')})
    byid = {v['source_id']: v for v in values}
    assert len(values) == 3 and not issues
    assert values[0]['source_id'] == outside['thread_id']
    assert not byid[a]['threads'] and byid[b]['threads'] == [t]
    assert byid[a]['project_id'] != byid[b]['project_id']
    assert byid[outside['thread_id']]['project_id'] == target


def test_ambiguous_root_is_not_assigned_by_name(host, tmp_path):
    project(host, tmp_path, 'Same'); project(host, tmp_path, 'Same'); thread(host, tmp_path)
    projects, issues = capture.discover(host, {})
    assert not any(p['threads'] for p in projects)
    assert issues == {'AMBIGUOUS_PROJECT': 1}


def test_recent_three_and_registry_bound_are_explicit(host, tmp_path, monkeypatch):
    project(host, tmp_path)
    ts = [thread(host, tmp_path, updated=i) for i in range(5)]
    ps, _ = capture.discover(host, {})
    assert ps[0]['threads'] == list(reversed(ts[-3:])) and ps[0]['eligible_threads'] == 5
    monkeypatch.setattr(capture, 'MAX_THREADS', 4)
    with pytest.raises(capture.CaptureError, match='REGISTRY_LIMIT'):
        capture.discover(host, {})


def test_wal_registry_no_host_sidecars_or_modification_and_uncheckpointed_commit_visible(host, tmp_path):
    # Closed WAL-mode database with no sidecars: mode=ro on the original used
    # to create -wal/-shm. The adapter must only SQLite-open its private copy.
    with sqlite3.connect(host / 'state_5.sqlite') as conn:
        conn.execute('PRAGMA journal_mode=WAL')
    conn.close()
    initial = {p.name: p.read_bytes() for p in host.iterdir() if p.is_file()}
    assert set(initial) == {'state_5.sqlite'}
    assert capture.discover(host, {}) == ([], {})
    assert initial == {p.name: p.read_bytes() for p in host.iterdir() if p.is_file()}
    writer = sqlite3.connect(host / 'state_5.sqlite')
    try:
        writer.execute('PRAGMA wal_autocheckpoint=0')
        pid = str(uuid4())
        writer.execute('INSERT INTO projects VALUES (?,?)', (pid, 'Uncheckpointed synthetic project'))
        writer.execute('INSERT INTO project_roots VALUES (?,?)', (pid, str(tmp_path)))
        writer.commit()
        initial = {p.name: p.read_bytes() for p in host.iterdir() if p.is_file()}
        assert 'state_5.sqlite-wal' in initial
        assert capture.discover(host, {})[0][0]['source_id'] == pid
        assert initial == {p.name: p.read_bytes() for p in host.iterdir() if p.is_file()}
    finally:
        writer.close()


def test_unstable_registry_snapshot_fails_closed_and_hot_journal_not_ignored(host, monkeypatch):
    actual = capture._registry_image
    calls = []
    def changing(home):
        image = actual(home); calls.append(True)
        image['state_5.sqlite'] += bytes([len(calls)])
        return image
    monkeypatch.setattr(capture, '_registry_image', changing)
    with pytest.raises(capture.CaptureError, match='REGISTRY_UNAVAILABLE'):
        capture.discover(host, {})
    assert len(calls) == 6
    monkeypatch.setattr(capture, '_registry_image', actual)
    (host / 'state_5.sqlite-journal').write_bytes(b'synthetic live journal')
    with pytest.raises(capture.CaptureError, match='REGISTRY_UNAVAILABLE'):
        capture.discover(host, {})


def test_only_complete_allowlisted_human_original_text_and_time(host, tmp_path):
    good = human(); assistant = human('Assistant is not a decision')
    assistant['payload']['role'] = 'assistant'
    tool = human('Tool notice'); tool['payload']['internal_chat_message_metadata_passthrough']['content_item_kinds'] = ['multi_agent.subagent_notification']
    environment = human('<environment_context>not personal</environment_context>')
    environment['payload']['internal_chat_message_metadata_passthrough']['content_item_metadata'][0]['provenance']['type'] = 'harness'
    missing = human('missing provenance'); missing['payload']['internal_chat_message_metadata_passthrough'] = {}
    incomplete = human('truncated', metadata=dict(retained_source=dict(complete=False)))
    t = thread(host, tmp_path, [good, assistant, tool, environment, missing, incomplete, good])
    before = Path(t['path']).read_bytes()
    Path(t['path']).write_bytes(before + b'{"unfinished":')
    sources, _, issues = capture.read_rollout(host, t, capture.MAX_CYCLE)
    assert len(sources) == 1
    assert sources[0]['text'] == good['payload']['content'][0]['text']
    assert sources[0]['message_time_ms'] == 1794700000125
    assert sources[0]['locator']['thread_id'] == t['thread_id']
    assert issues == {'UNSUPPORTED_MESSAGES': 2, 'INCOMPLETE_MESSAGE': 2}
    assert Path(t['path']).read_bytes() == before + b'{"unfinished":'


@pytest.mark.parametrize('mutation', ['identity', 'outside', 'conflict', 'invalid', 'limit'])
def test_source_failures_never_return_partial_sources(host, tmp_path, monkeypatch, mutation):
    first = human(mid='same-id')
    t = thread(host, tmp_path, [first])
    p = Path(t['path'])
    if mutation == 'identity':
        lines = p.read_bytes().splitlines(); lines[0] = b'{"type":"session_meta","payload":{"id":"wrong"}}'
        p.write_bytes(b'\n'.join(lines) + b'\n')
    elif mutation == 'outside':
        other = tmp_path / 'outside.jsonl'; other.write_bytes(p.read_bytes()); t['path'] = str(other)
    elif mutation == 'conflict':
        with p.open('ab') as f: f.write(json.dumps(human('different', mid='same-id')).encode() + b'\n')
    elif mutation == 'invalid':
        with p.open('ab') as f: f.write(b'{invalid}\n')
    else:
        monkeypatch.setattr(capture, 'MAX_LOG', 2)
    with pytest.raises(capture.CaptureError):
        capture.read_rollout(host, t, capture.MAX_CYCLE)


def test_incremental_restart_no_duplicate_actual_saved_versions_and_no_host_write(host, target, tmp_path):
    db, repo = target; project(host, tmp_path, 'Synthetic alpha')
    good = human(); t = thread(host, tmp_path, [good])
    original = {p.name: sha256(p.read_bytes()).hexdigest() for p in host.rglob('*') if p.is_file()}
    f = follower(host, repo); first = f.run_once()
    assert first['phase'] == 'watching' and first['added_sources'] == 1 and not first['limited']
    pid = first['discovered'][0]['project_id']; s1 = repo.read_project(ACTOR, TOKEN, pid)
    assert s1['observations'][0]['text'] == good['payload']['content'][0]['text']
    assert s1['saved_at'] > s1['observations'][0]['message_time_ms'] and s1['decisions'] is None
    definition_validator('ProjectScene').validate(s1)
    before = counts(db)
    assert f.run_once()['added_sources'] == 0 and counts(db) == before
    assert follower(host, repo).run_once()['added_sources'] == 0 and counts(db) == before
    assert original == {p.name: sha256(p.read_bytes()).hexdigest() for p in host.rglob('*') if p.is_file()}
    with Path(t['path']).open('ab') as out: out.write(json.dumps(human('我决定保留分岔。')).encode() + b'\n')
    assert f.run_once()['added_sources'] == 1
    latest = repo.read_project(ACTOR, TOKEN, pid)
    assert latest['revision'] == '2' and len(latest['observations']) == 2
    old = repo.read_project(ACTOR, TOKEN, pid, '1')
    assert {k: v for k, v in old.items() if k != 'snapshots'} == {k: v for k, v in s1.items() if k != 'snapshots'}
    assert old['snapshots'] == latest['snapshots']
    assert repo.list_projects(ACTOR, TOKEN)['items'][0]['decision_count'] == 0


def test_no_read_or_write_when_paused_and_close_stops_background(host, target, tmp_path):
    db, repo = target; project(host, tmp_path); thread(host, tmp_path)
    f = follower(host, repo, interval=0.02)
    assert f.control(dict(explicit=True, paused=True))['phase'] == 'paused'
    f.start(); assert f.run_once()['scanned_at'] is None
    f.close(); assert not f.thread.is_alive() and counts(db) == (0, 0, 0)
    assert f.run_once()['added_sources'] == 0


def test_unknown_submission_retries_exact_request_then_restart_dedup(host, target, tmp_path):
    db, repo = target; project(host, tmp_path); thread(host, tmp_path)
    f = follower(host, repo); actual = f.importing; calls = []
    def uncertain(body):
        calls.append(deepcopy(body)); actual(body)
        if len(calls) == 1: raise policy.ProjectError('READ_UNAVAILABLE')
        return actual(body)
    f.importing = uncertain
    assert f.run_once()['issues'] == [dict(code='IMPORT_UNAVAILABLE', count=1)]
    before = counts(db)
    retried = f.run_once()
    assert retried['phase'] == 'watching' and retried['added_sources'] == 0
    assert calls[0] == calls[1] and counts(db) == before
    assert follower(host, repo).run_once()['added_sources'] == 0 and counts(db) == before


def test_project_over_budget_does_not_partially_write(host, target, tmp_path, monkeypatch):
    db, repo = target; project(host, tmp_path); thread(host, tmp_path, [human(), human()])
    monkeypatch.setattr(policy, 'MAX_MATERIALS', 1)
    state = follower(host, repo).run_once()
    assert state['issues'] == [dict(code='PROJECT_LIMIT', count=1)] and counts(db) == (0, 0, 0)
    assert not state['discovered'][0]['retained']


def test_failed_logs_consume_whole_cycle_budget(host, target, tmp_path, monkeypatch):
    _, repo = target; project(host, tmp_path)
    logs = [thread(host, tmp_path, [human(mid='same-shape')], updated=i) for i in range(3)]
    for t in logs:
        with Path(t['path']).open('ab') as f: f.write(b'{invalid}\n')
    amount = Path(logs[0]['path']).stat().st_size
    assert all(Path(t['path']).stat().st_size == amount for t in logs)
    monkeypatch.setattr(capture, 'MAX_CYCLE', amount)
    f = follower(host, repo); state = f.run_once()
    assert state['issues'] == [dict(code='ROLLOUT_INVALID', count=1), dict(code='ROLLOUT_LIMIT', count=2)]
    assert state['added_sources'] == 0


def test_close_waits_for_active_read_and_never_starts_next_log(host, target, tmp_path, monkeypatch):
    _, repo = target; project(host, tmp_path)
    for i in range(3): thread(host, tmp_path, updated=i)
    entered, release = threading.Event(), threading.Event()
    original = capture.read_rollout; reads = []
    def slow(*args, **kwargs):
        reads.append(True); entered.set(); assert release.wait(5)
        return original(*args, **kwargs)
    monkeypatch.setattr(capture, 'read_rollout', slow)
    f = follower(host, repo); f.start(); assert entered.wait(5)
    closer = threading.Thread(target=f.close); closer.start()
    assert f.stop_event.wait(1) and closer.is_alive()
    release.set(); closer.join(5)
    assert not closer.is_alive() and not f.thread.is_alive() and len(reads) == 1


def test_state_projection_closed_no_credentials_or_raw_adapter_fields():
    f = capture.CodexCapture(Path('unused'), listing=None, reading=None, importing=None)
    valid = f.state(); assert capture.project_capture_state(valid, TOKEN) == valid
    for bad in (valid | {'raw_path': 'private'}, valid | {'phase': 'invented'},
                valid | {'issues': [dict(code='arbitrary exception', count=1)]},
                valid | {'retained_sources': True}):
        with pytest.raises(ValueError): capture.project_capture_state(bad, TOKEN)


def test_http_existing_service_capture_status_controls_and_close(host, target, tmp_path):
    db, repo = target; project(host, tmp_path); thread(host, tmp_path)
    with running(Server(db, 0)) as core:
        f = capture.CodexCapture(host,
            listing=lambda: project_get(core, TOKEN, 'list', {}),
            reading=lambda pid: project_get(core, TOKEN, 'scene', dict(project_id=pid)),
            importing=lambda body: project_import(core, TOKEN, body))
        # Perform one pass through the actual HTTP service before automatic start.
        assert f.run_once()['added_sources'] == 1
        with running(create_server(core, TOKEN, projects_enabled=True, capture=f)) as ui:
            status, state, raw = call(ui, '/api/capture-state')
            assert status == 200 and TOKEN.encode() not in raw
            assert b'rollout_path' not in raw and b'create_time' not in raw
            assert call(ui, '/api/capture-control', dict(explicit=True, paused=True), broker=True)[1]['phase'] == 'paused'
            assert call(ui, '/api/capture-control', dict(explicit=True, paused=False), broker=True,
                headers={'Origin': 'https://foreign.invalid'})[0] == 403
            assert call(ui, '/api/capture-control', dict(explicit=True, paused=False, path='anywhere'), broker=True)[0] == 400
            assert call(ui, '/api/capture-state?path=anywhere')[0] == 400
        assert not f.thread.is_alive()
        with running(create_server(core, TOKEN, projects_enabled=True)) as disabled:
            assert call(disabled, '/api/capture-state')[0] == 400
            assert call(disabled, '/api/capture-control', dict(explicit=True, paused=True), broker=True)[0] == 405
