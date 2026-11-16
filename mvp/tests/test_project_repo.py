"""PROJECTS-001: synthetic temporary databases, authority and rollback evidence."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from copy import deepcopy
from hashlib import sha256
import json
import sqlite3
from uuid import uuid4

import pytest

from mvp import decision_policy as decision
from mvp import project_policy as policy
from mvp.backend import decision_archive as archive
from mvp.backend import project_repo as backend
from mvp.backend.init_db import init_database
from mvp.tests.test_decision_archive import item, package, source

TOKEN, OTHER_TOKEN = 'synthetic-project-owner-token', 'synthetic-project-reader-token'
ACTOR, OTHER = 'synthetic-owner', 'synthetic-reader'


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({TOKEN: ACTOR, OTHER_TOKEN: OTHER}))
    path = tmp_path / 'synthetic-projects.db'
    assert init_database(path)['status'] == 'created'
    return path


def body(**changes):
    return dict(project_id=str(uuid4()), title='Synthetic project', expected_revision='0',
                request_id=str(uuid4()), documents=[dict(title='raw.md', text='# Literal\r\n原文 🧶')],
                archive_ref=None) | changes


def counts(db):
    with closing(sqlite3.connect(db)) as conn:
        return tuple(conn.execute('SELECT count(*) FROM ' + table).fetchone()[0]
                     for table in ('assets', 'asset_readers', 'history_events', 'assets_fts'))


def scene(db, request, **kwargs):
    return backend.ProjectRepo(db).read_project(ACTOR, TOKEN, request['project_id'], **kwargs)


def grant(db, aid, actor=OTHER):
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('INSERT INTO asset_readers VALUES (?,?)', (aid, actor))


def manifest_id(db, digest):
    with closing(sqlite3.connect(db)) as conn:
        return conn.execute('SELECT asset_id FROM assets WHERE content_hash=?', (digest,)).fetchone()[0]


def import_archive(db, pkg=None):
    receipt = archive.import_decisions(db, package() if pkg is None else pkg, ACTOR, TOKEN)
    return dict(asset_id=receipt['archive_id'], content_hash=receipt['archive_hash'])


def assert_error(code, action):
    with pytest.raises(policy.ProjectError) as exc:
        action()
    assert exc.value.code == code and str(exc.value) == code
    assert exc.value.__context__ is None


def test_two_projects_restart_raw_text_dedup_and_exact_append_only_history(db):
    repo = backend.ProjectRepo(db)
    first = body()
    original = deepcopy(first)
    receipt = repo.import_project(ACTOR, TOKEN, first)
    second = body(title='Second project', documents=[dict(title='other.txt', text='Independent material')])
    repo.import_project(ACTOR, TOKEN, second)
    repo = backend.ProjectRepo(db)
    value = scene(db, first)
    assert first == original and value['decisions'] is None and not value['has_unavailable']
    assert value['revision'] == '1' and value['snapshots'] == [
        {k: value[k] for k in ('revision', 'manifest_hash', 'saved_at')}]
    ref = value['materials'][0]
    read = repo.read_material(ACTOR, TOKEN, first['project_id'], '1', ref['asset_id'], ref['content_hash'])
    assert read['text'] == first['documents'][0]['text']
    assert len(repo.list_projects(ACTOR, TOKEN)['items']) == 2
    assert counts(db) == (4, 4, 4, 4)
    before = counts(db)
    assert repo.import_project(ACTOR, TOKEN, first) == receipt
    assert counts(db) == before
    update = first | dict(expected_revision='1', request_id=str(uuid4()), title='Renamed',
                         documents=first['documents'] + [dict(title='new.txt', text='New material')])
    repo.import_project(ACTOR, TOKEN, update)
    assert counts(db) == (6, 6, 6, 6)
    assert len(scene(db, first)['materials']) == 2
    assert scene(db, first, revision='1')['title'] == first['title']
    assert [s['revision'] for s in scene(db, first)['snapshots']] == ['1', '2']
    assert repo.import_project(ACTOR, TOKEN, first) == receipt
    assert_error('IDEMPOTENCY_CONFLICT', lambda: repo.import_project(ACTOR, TOKEN, first | {'title': 'Changed'}))
    assert_error('REVISION_CONFLICT', lambda: repo.import_project(
        ACTOR, TOKEN, first | {'request_id': str(uuid4())}))
    assert counts(db) == (6, 6, 6, 6)
    with closing(sqlite3.connect(db)) as conn:
        stored = [json.loads(row[0]) for row in conn.execute(
            'SELECT content_blob FROM assets WHERE media_type=? ORDER BY rowid', (policy.PROJECT_MIME,))]
        assert stored[-1]['owner'] == ACTOR
        assert stored[-1]['previous_hash'] == receipt['manifest_hash']
        assert stored[-1]['request_hash'] == policy.request_hash(ACTOR, update)


def test_material_membership_is_revision_and_project_bound(db):
    repo = backend.ProjectRepo(db)
    first, second = body(), body(documents=[dict(title='other.txt', text='Other body')])
    repo.import_project(ACTOR, TOKEN, first)
    repo.import_project(ACTOR, TOKEN, second)
    foreign = scene(db, second)['materials'][0]
    assert_error('NOT_FOUND', lambda: repo.read_material(ACTOR, TOKEN, first['project_id'], '1',
                 foreign['asset_id'], foreign['content_hash']))
    update = first | dict(expected_revision='1', request_id=str(uuid4()), documents=second['documents'])
    repo.import_project(ACTOR, TOKEN, update)
    assert_error('NOT_FOUND', lambda: repo.read_material(ACTOR, TOKEN, first['project_id'], '1',
                 foreign['asset_id'], foreign['content_hash']))
    ref = scene(db, first)['materials'][0]
    assert_error('CONTENT_MISMATCH', lambda: repo.read_material(ACTOR, TOKEN, first['project_id'], '2',
                 ref['asset_id'], '0' * 64))


def test_configured_identity_owner_only_and_head_revocation_blocks_every_old_path(db):
    repo, request = backend.ProjectRepo(db), body()
    receipt = repo.import_project(ACTOR, TOKEN, request)
    ref = scene(db, request)['materials'][0]
    assert repo.list_projects(OTHER, OTHER_TOKEN) == {'items': []}
    assert_error('ACCESS_DENIED', lambda: repo.import_project(OTHER, OTHER_TOKEN, request))
    assert_error('ACCESS_DENIED', lambda: repo.read_project(OTHER, TOKEN, request['project_id']))
    grant(db, manifest_id(db, receipt['manifest_hash']))
    grant(db, ref['asset_id'])
    assert repo.read_project(OTHER, OTHER_TOKEN, request['project_id'])['materials'] == [ref]
    assert_error('ACCESS_DENIED', lambda: repo.import_project(OTHER, OTHER_TOKEN,
        request | dict(expected_revision='1', request_id=str(uuid4()))))
    update = request | dict(expected_revision='1', request_id=str(uuid4()), documents=[])
    latest = repo.import_project(ACTOR, TOKEN, update)
    # Reader of revision one cannot see or claim the new head.
    assert repo.list_projects(OTHER, OTHER_TOKEN) == {'items': []}
    assert_error('ACCESS_DENIED', lambda: repo.read_project(OTHER, OTHER_TOKEN, request['project_id'], '1'))
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (manifest_id(db, latest['manifest_hash']),))
    assert repo.list_projects(ACTOR, TOKEN) == {'items': []}
    for action in (
        lambda: repo.import_project(ACTOR, TOKEN, request),
        lambda: repo.import_project(ACTOR, TOKEN, update),
        lambda: repo.read_project(ACTOR, TOKEN, request['project_id'], '1'),
        lambda: repo.read_material(ACTOR, TOKEN, request['project_id'], '1', ref['asset_id'], ref['content_hash']),
    ):
        assert_error('ACCESS_DENIED', action)


def test_source_dedup_never_grants_another_actor_and_rolls_back_earlier_new_document(db):
    repo, request = backend.ProjectRepo(db), body()
    repo.import_project(ACTOR, TOKEN, request)
    before = counts(db)
    duplicate = body(documents=[dict(title='new.txt', text='First new document'), *request['documents']])
    assert_error('ACCESS_DENIED', lambda: repo.import_project(OTHER, OTHER_TOKEN, duplicate))
    assert counts(db) == before


@pytest.mark.parametrize('mutation', ['revoke', 'blob', 'hash', 'mime', 'file', 'shape', 'sensitive'])
def test_unavailable_material_suppresses_title_text_and_dependent_decision(db, mutation):
    repo, ref = backend.ProjectRepo(db), import_archive(db)
    request = body(archive_ref=ref, documents=[dict(title='independent.txt', text='Still available')])
    repo.import_project(ACTOR, TOKEN, request)
    initial = scene(db, request)
    assert len(initial['decisions']['items']) == 1 and len(initial['materials']) == 2
    target = initial['decisions']['items'][0]['evidence'][0]
    with closing(sqlite3.connect(db)) as conn, conn:
        if mutation == 'revoke':
            conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (target['asset_id'],))
        elif mutation == 'blob':
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (b'PRIVATE', target['asset_id']))
        elif mutation == 'hash':
            conn.execute('UPDATE assets SET content_hash=? WHERE asset_id=?', ('0' * 64, target['asset_id']))
        elif mutation == 'mime':
            conn.execute('UPDATE assets SET media_type=? WHERE asset_id=?', ('text/plain', target['asset_id']))
        elif mutation == 'file':
            conn.execute('UPDATE assets SET file_path=? WHERE asset_id=?', ('C:/PRIVATE', target['asset_id']))
        else:
            # Preserve recorded hash to exercise corruption before any metadata leaks.
            raw = decision.canonical({'PRIVATE': TOKEN if mutation == 'sensitive' else True})
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (raw, target['asset_id']))
    value = scene(db, request)
    assert value['has_unavailable'] and value['decisions']['has_unavailable']
    assert value['decisions']['items'] == []
    assert [m['title'] for m in value['materials']] == ['independent.txt']
    listing = repo.list_projects(ACTOR, TOKEN)['items'][0]
    assert (listing['material_count'], listing['decision_count']) == (1, 0)
    assert 'PRIVATE' not in json.dumps(value) and target['title'] not in json.dumps(value)
    before = counts(db)
    assert_error('CONTENT_MISMATCH', lambda: repo.import_project(ACTOR, TOKEN,
        request | dict(expected_revision='1', request_id=str(uuid4()))))
    assert counts(db) == before
    # Null means preserve; no automatic archive clearing or fabricated decisions.
    repo.import_project(ACTOR, TOKEN, request | dict(expected_revision='1', request_id=str(uuid4()),
        documents=[], archive_ref=None))
    assert scene(db, request)['decisions']['items'] == []


@pytest.mark.parametrize('mutation,code', [('revoke', 'ACCESS_DENIED'), ('hash', 'CONTENT_MISMATCH'),
                                        ('blob', 'CONTENT_MISMATCH')])
def test_invalid_explicit_archive_parent_rejects_all_writes(db, mutation, code):
    ref = import_archive(db)
    with closing(sqlite3.connect(db)) as conn, conn:
        if mutation == 'revoke':
            conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (ref['asset_id'],))
        elif mutation == 'hash':
            ref['content_hash'] = '0' * 64
        else:
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (b'PRIVATE', ref['asset_id']))
    before = counts(db)
    assert_error(code, lambda: backend.ProjectRepo(db).import_project(ACTOR, TOKEN, body(archive_ref=ref)))
    assert counts(db) == before


def test_archive_only_then_document_update_preserves_archive_and_deduplicates_sources(db):
    repo, ref = backend.ProjectRepo(db), import_archive(db)
    request = body(documents=[], archive_ref=ref)
    repo.import_project(ACTOR, TOKEN, request)
    assert len(scene(db, request)['materials']) == 1
    update = request | dict(expected_revision='1', request_id=str(uuid4()), archive_ref=None,
                            documents=[dict(title='append.txt', text='Literal append')])
    repo.import_project(ACTOR, TOKEN, update)
    assert len(scene(db, request)['materials']) == 2
    assert scene(db, request)['decisions']['archive_id'] == ref['asset_id']
    assert counts(db) == (5, 5, 5, 5)


def test_personal_decision_count_excludes_document_plan_but_scene_keeps_background(db):
    pkg = package()
    pkg['sources']['background'] = source('document', text='Synthetic background plan')
    pkg['archive']['items'].append(item('background', 'document_plan',
                                      quote='background plan', ident='background-plan'))
    request = body(documents=[], archive_ref=import_archive(db, pkg))
    repo = backend.ProjectRepo(db)
    repo.import_project(ACTOR, TOKEN, request)
    value = scene(db, request)
    assert [i['kind'] for i in value['decisions']['items']] == ['direct_user_message', 'document_plan']
    listing = repo.list_projects(ACTOR, TOKEN)['items'][0]
    assert (listing['material_count'], listing['decision_count']) == (2, 1)
    # Only the background remains readable; it still is not a personal decision.
    target = value['decisions']['items'][0]['evidence'][0]['asset_id']
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (target,))
    remaining = scene(db, request)
    assert [i['kind'] for i in remaining['decisions']['items']] == ['document_plan']
    assert remaining['has_unavailable']
    assert repo.list_projects(ACTOR, TOKEN)['items'][0]['decision_count'] == 0


@pytest.mark.parametrize('change', [
    lambda b: b.update(owner=ACTOR), lambda b: b.pop('title'),
    lambda b: b.update(project_id='bad'), lambda b: b.update(request_id='bad'),
    lambda b: b.update(expected_revision=0), lambda b: b.update(expected_revision='01'),
    lambda b: b.update(expected_revision=str(2**63)), lambda b: b.update(title=' '),
    lambda b: b.update(title='中' * 86), lambda b: b.update(documents=[]),
    lambda b: b.update(documents=[dict(title='x', text='x')] * 21),
    lambda b: b['documents'][0].update(text='x' * 65537),
    lambda b: b.update(documents=[dict(title='x', text='x' * 65536)] * 5),
    lambda b: b['documents'][0].update(path='C:/PRIVATE'),
    lambda b: b['documents'][0].update(text='\ud800'),
    lambda b: b.update(archive_ref={'asset_id': str(uuid4()), 'content_hash': 'BAD'}),
])
def test_closed_import_and_utf8_limits_reject_before_writes(db, change):
    request = body()
    change(request)
    assert_error('INVALID_ARGUMENTS', lambda: backend.ProjectRepo(db).import_project(ACTOR, TOKEN, request))
    assert counts(db) == (0, 0, 0, 0)


@pytest.mark.parametrize('secret', [TOKEN, 'PASSWORD=synthetic', 'Authorization: Bearer synthetic'])
def test_sensitive_import_returns_only_finite_error(db, secret):
    assert_error('SENSITIVE_CONTENT', lambda: backend.ProjectRepo(db).import_project(ACTOR, TOKEN,
        body(documents=[dict(title='raw.txt', text=secret)])))
    assert counts(db) == (0, 0, 0, 0)


@pytest.mark.parametrize('failure', ['event', 'scene', 'receipt'])
def test_failure_at_each_late_stage_rolls_back_source_manifest_grants_events_and_fts(db, monkeypatch, failure):
    before = counts(db)
    if failure == 'event':
        original = backend._DecisionRepo.add_event
        def fail(self, *args, **kwargs):
            if kwargs.get('source') == policy.PROJECT_VERSION:
                raise sqlite3.IntegrityError('PRIVATE internal failure')
            return original(self, *args, **kwargs)
        monkeypatch.setattr(backend._DecisionRepo, 'add_event', fail)
    else:
        original = policy.project_response
        def fail(kind, *args, **kwargs):
            if kind == failure:
                raise policy.ProjectError('RESPONSE_LIMIT')
            return original(kind, *args, **kwargs)
        monkeypatch.setattr(policy, 'project_response', fail)
    assert_error('IMPORT_UNAVAILABLE' if failure == 'event' else 'RESPONSE_LIMIT',
                 lambda: backend.ProjectRepo(db).import_project(ACTOR, TOKEN, body()))
    assert counts(db) == before


def test_actual_ascii_envelope_budget_checked_before_commit_and_independently_by_broker(db, monkeypatch):
    repo, request = backend.ProjectRepo(db), body()
    repo.import_project(ACTOR, TOKEN, request)
    value = scene(db, request)
    size = len(json.dumps(dict(contract_version=1, ok=True, value=value), ensure_ascii=True).encode())
    monkeypatch.setattr(policy, 'MAX_RESPONSE_BYTES', size)
    assert scene(db, request) == value
    monkeypatch.setattr(policy, 'MAX_RESPONSE_BYTES', size - 1)
    assert_error('RESPONSE_LIMIT', lambda: scene(db, request))
    assert_error('RESPONSE_LIMIT', lambda: policy.project_response('scene', value, TOKEN,
                 project_id=request['project_id']))
    before = counts(db)
    assert_error('RESPONSE_LIMIT', lambda: repo.import_project(ACTOR, TOKEN, request | dict(
        expected_revision='1', request_id=str(uuid4()), documents=[])))
    assert counts(db) == before


def test_all_caps_refuse_whole_operation_without_truncation(db, monkeypatch):
    repo, request = backend.ProjectRepo(db), body()
    repo.import_project(ACTOR, TOKEN, request)
    before = counts(db)
    monkeypatch.setattr(policy, 'MAX_PROJECTS', 1)
    assert_error('RESPONSE_LIMIT', lambda: repo.import_project(ACTOR, TOKEN, body()))
    monkeypatch.setattr(policy, 'MAX_MANIFESTS', 1)
    assert_error('RESPONSE_LIMIT', lambda: repo.import_project(ACTOR, TOKEN, request | dict(
        expected_revision='1', request_id=str(uuid4()), documents=[])))
    monkeypatch.setattr(policy, 'MAX_MANIFESTS', 1024)
    monkeypatch.setattr(policy, 'MAX_MATERIALS', 1)
    assert_error('INVALID_ARGUMENTS', lambda: repo.import_project(ACTOR, TOKEN, request | dict(
        expected_revision='1', request_id=str(uuid4()), documents=[dict(title='new', text='new')])))
    assert counts(db) == before
    monkeypatch.setattr(policy, 'MAX_PROJECTS', 0)
    assert_error('RESPONSE_LIMIT', lambda: repo.list_projects(ACTOR, TOKEN))
    monkeypatch.setattr(policy, 'MAX_MANIFESTS', 0)
    assert_error('RESPONSE_LIMIT', lambda: scene(db, request))


def test_corrupt_source_bytes_charge_budget_before_hash_or_parse_and_shared_cache_deduplicates(db, monkeypatch):
    repo, request = backend.ProjectRepo(db), body(documents=[
        dict(title='one.txt', text='one'), dict(title='two.txt', text='two')])
    repo.import_project(ACTOR, TOKEN, request)
    refs = scene(db, request)['materials']
    with closing(sqlite3.connect(db)) as conn, conn:
        for ref in refs:
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (b'x' * 60, ref['asset_id']))
    monkeypatch.setattr(policy, 'MAX_READ_BYTES', 100)
    assert_error('RESPONSE_LIMIT', lambda: scene(db, request))
    assert_error('RESPONSE_LIMIT', lambda: repo.list_projects(ACTOR, TOKEN))


def test_one_readonly_snapshot_during_concurrent_revocation(db, monkeypatch):
    repo, request = backend.ProjectRepo(db), body()
    repo.import_project(ACTOR, TOKEN, request)
    ref = scene(db, request)['materials'][0]
    original = backend._asset
    connections = []
    def revoke(conn, *args, **kwargs):
        assert conn.in_transaction
        connections.append(id(conn))
        raw = original(conn, *args, **kwargs)
        with closing(sqlite3.connect(db)) as writer, writer:
            writer.execute('DELETE FROM asset_readers WHERE asset_id=?', (ref['asset_id'],))
        return raw
    monkeypatch.setattr(backend, '_asset', revoke)
    assert len(scene(db, request)['materials']) == 1
    assert len(set(connections)) == 1
    assert scene(db, request)['materials'] == []


def test_concurrent_writers_serialize_expected_revision_and_identical_replay(db):
    repo, request = backend.ProjectRepo(db), body()
    with ThreadPoolExecutor(max_workers=2) as pool:
        receipts = list(pool.map(lambda _: repo.import_project(ACTOR, TOKEN, request), range(2)))
    assert receipts[0] == receipts[1] and counts(db) == (2, 2, 2, 2)
    def append(title):
        try:
            return repo.import_project(ACTOR, TOKEN, request | dict(title=title, documents=[],
                expected_revision='1', request_id=str(uuid4())))['revision']
        except policy.ProjectError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(append, ['one', 'two']))
    assert sorted(results) == ['2', 'REVISION_CONFLICT']
    assert counts(db) == (3, 3, 3, 3)


@pytest.mark.parametrize('mutation', ['blob', 'mime', 'file', 'noncanonical'])
def test_corrupt_current_manifest_never_falls_back_to_old_revision(db, mutation):
    repo, request = backend.ProjectRepo(db), body()
    repo.import_project(ACTOR, TOKEN, request)
    latest = repo.import_project(ACTOR, TOKEN, request | dict(
        expected_revision='1', request_id=str(uuid4()), documents=[]))
    aid = manifest_id(db, latest['manifest_hash'])
    with closing(sqlite3.connect(db)) as conn, conn:
        if mutation == 'blob':
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (b'PRIVATE', aid))
        elif mutation == 'mime':
            conn.execute('UPDATE assets SET media_type=? WHERE asset_id=?', ('text/plain', aid))
        elif mutation == 'file':
            conn.execute('UPDATE assets SET file_path=? WHERE asset_id=?', ('C:/PRIVATE', aid))
        else:
            raw = conn.execute('SELECT content_blob FROM assets WHERE asset_id=?', (aid,)).fetchone()[0] + b' '
            conn.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE asset_id=?',
                         (raw, sha256(raw).hexdigest(), aid))
    for action in (lambda: repo.list_projects(ACTOR, TOKEN), lambda: scene(db, request),
                   lambda: scene(db, request, revision='1'), lambda: repo.import_project(ACTOR, TOKEN, request)):
        with pytest.raises(policy.ProjectError):
            action()


@pytest.mark.parametrize('head_revision', [1, 2])
@pytest.mark.parametrize('operation', [
    'list', 'latest', 'old_revision', 'material', 'replay_first', 'replay_head',
    'update_actual_head', 'update_truncated_head', 'claim_other_actor',
])
def test_missing_manifest_asset_with_retained_import_event_never_falls_back_or_recreates(
        db, head_revision, operation):
    repo, first = backend.ProjectRepo(db), body()
    receipt = repo.import_project(ACTOR, TOKEN, first)
    material = scene(db, first)['materials'][0]
    latest = first
    if head_revision == 2:
        latest = first | dict(expected_revision='1', request_id=str(uuid4()),
                              documents=[dict(title='second.txt', text='Second version material')])
        receipt = repo.import_project(ACTOR, TOKEN, latest)
    aid = manifest_id(db, receipt['manifest_hash'])
    with closing(sqlite3.connect(db)) as conn, conn:
        # Model a damaged store: keep its append-only import evidence even when
        # the corresponding head asset is lost, including a project's sole head.
        conn.execute('DELETE FROM assets WHERE asset_id=?', (aid,))
        assert conn.execute('SELECT count(*) FROM history_events e LEFT JOIN assets a '
            'ON a.asset_id=e.subject WHERE e.event_type=? AND e.source=? '
            'AND a.asset_id IS NULL', ('import', policy.PROJECT_VERSION)).fetchone()[0] == 1
    before = counts(db)
    updates = dict(request_id=str(uuid4()), documents=[dict(title='new.txt', text='New import material')])
    actions = {
        'list': lambda: repo.list_projects(ACTOR, TOKEN),
        'latest': lambda: scene(db, first),
        'old_revision': lambda: scene(db, first, revision='1'),
        'material': lambda: repo.read_material(ACTOR, TOKEN, first['project_id'], '1',
            material['asset_id'], material['content_hash']),
        'replay_first': lambda: repo.import_project(ACTOR, TOKEN, first),
        'replay_head': lambda: repo.import_project(ACTOR, TOKEN, latest),
        'update_actual_head': lambda: repo.import_project(ACTOR, TOKEN, first | updates | dict(
            expected_revision=str(head_revision))),
        'update_truncated_head': lambda: repo.import_project(ACTOR, TOKEN, first | updates | dict(
            expected_revision=str(head_revision - 1))),
        'claim_other_actor': lambda: repo.import_project(OTHER, OTHER_TOKEN, first | updates | dict(
            expected_revision='0')),
    }
    assert_error('CONTENT_MISMATCH', actions[operation])
    assert counts(db) == before


def test_missing_material_with_retained_source_import_event_still_suppresses_only_material(db):
    repo, request = backend.ProjectRepo(db), body()
    repo.import_project(ACTOR, TOKEN, request)
    ref = scene(db, request)['materials'][0]
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM assets WHERE asset_id=?', (ref['asset_id'],))
        assert conn.execute('SELECT 1 FROM history_events WHERE subject=? AND source=?',
                            (ref['asset_id'], decision.SOURCE_VERSION)).fetchone() is not None
    before = counts(db)
    value = scene(db, request)
    assert value['has_unavailable'] and value['materials'] == []
    assert repo.list_projects(ACTOR, TOKEN)['items'][0]['material_count'] == 0
    assert counts(db) == before


def test_missing_db_schema_and_identity_never_create_or_migrate(db, tmp_path, monkeypatch):
    missing = tmp_path / 'must-not-create.db'
    repo = backend.ProjectRepo(missing)
    assert_error('IMPORT_UNAVAILABLE', lambda: repo.import_project(ACTOR, TOKEN, body()))
    assert_error('READ_UNAVAILABLE', lambda: repo.list_projects(ACTOR, TOKEN))
    assert not missing.exists()
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DROP TABLE asset_readers')
    assert_error('READ_UNAVAILABLE', lambda: backend.ProjectRepo(db).import_project(ACTOR, TOKEN, body()))
    monkeypatch.delenv('KNOT_TOKENS')
    assert_error('ACCESS_DENIED', lambda: backend.ProjectRepo(db).list_projects(ACTOR, TOKEN))


@pytest.mark.parametrize('change,code', [
    (lambda v: v.update(extra=True), 'INVALID_ARGUMENTS'),
    (lambda v: v.update(project_id=str(uuid4())), 'CONTENT_MISMATCH'),
    (lambda v: v.update(revision='01'), 'INVALID_ARGUMENTS'),
    (lambda v: v.update(title=TOKEN), 'SENSITIVE_CONTENT'),
    (lambda v: v.update(has_unavailable=0), 'INVALID_ARGUMENTS'),
    (lambda v: v['materials'][0].update(extra=True), 'INVALID_ARGUMENTS'),
    (lambda v: v['snapshots'][0].update(manifest_hash='0' * 64), 'CONTENT_MISMATCH'),
    (lambda v: v['snapshots'].append(v['snapshots'][0]), 'CONTENT_MISMATCH'),
])
def test_broker_independent_closed_validation_binding_and_sensitivity(db, change, code):
    request = body()
    backend.ProjectRepo(db).import_project(ACTOR, TOKEN, request)
    value = scene(db, request)
    change(value)
    assert_error(code, lambda: policy.project_response('scene', value, TOKEN, project_id=request['project_id']))


def test_actual_128_material_limit_and_schema_authority_are_unchanged(db):
    repo, request = backend.ProjectRepo(db), body(documents=[])
    with closing(sqlite3.connect(db)) as conn:
        schema = conn.execute('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').fetchall()
    for start in range(0, 128, 20):
        documents = [dict(title=f'raw-{i}.txt', text=f'Literal source {i}')
                     for i in range(start, min(start + 20, 128))]
        request = request | dict(expected_revision=str(start // 20), request_id=str(uuid4()),
                                 documents=documents)
        repo.import_project(ACTOR, TOKEN, request)
    assert len(scene(db, request)['materials']) == 128
    assert repo.list_projects(ACTOR, TOKEN)['items'][0]['material_count'] == 128
    before = counts(db)
    assert_error('INVALID_ARGUMENTS', lambda: repo.import_project(ACTOR, TOKEN, request | dict(
        expected_revision='7', request_id=str(uuid4()), documents=[dict(title='129.txt', text='Over cap')])) )
    assert counts(db) == before
    with closing(sqlite3.connect(db)) as conn:
        assert conn.execute('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').fetchall() == schema


def test_actual_8mib_budget_includes_corrupt_bytes_at_exact_boundary(db):
    repo, request = backend.ProjectRepo(db), body(documents=[
        dict(title='one.txt', text='one'), dict(title='two.txt', text='two')])
    repo.import_project(ACTOR, TOKEN, request)
    refs = scene(db, request)['materials']
    with closing(sqlite3.connect(db)) as conn, conn:
        for ref in refs:
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?',
                         (b'x' * (4 * 1024 * 1024), ref['asset_id']))
    assert scene(db, request)['has_unavailable']
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?',
                     (b'x' * (4 * 1024 * 1024 + 1), refs[-1]['asset_id']))
    assert_error('RESPONSE_LIMIT', lambda: scene(db, request))
    assert_error('RESPONSE_LIMIT', lambda: repo.list_projects(ACTOR, TOKEN))


def test_actual_100_project_limit_and_101st_refused_atomically(db):
    repo = backend.ProjectRepo(db)
    for index in range(100):
        repo.import_project(ACTOR, TOKEN, body(title=f'Project {index}'))
    listing = repo.list_projects(ACTOR, TOKEN)
    assert len(listing['items']) == 100
    before = counts(db)
    assert_error('RESPONSE_LIMIT', lambda: repo.import_project(ACTOR, TOKEN, body(title='Project 101')))
    assert counts(db) == before


def test_actual_1024_manifest_scan_limit_replay_precedence_and_no_partial_read(db):
    request = body()
    repo = backend.ProjectRepo(db)
    repo.import_project(ACTOR, TOKEN, request)
    latest = scene(db, request)
    # Append synthetic history through the same shared primitives in one transaction.
    # This avoids turning the boundary test into 1024 quadratic API imports.
    storage = backend._DecisionRepo(db)
    with storage.session(), storage.transaction():
        for number in range(2, 1025):
            request = request | dict(expected_revision=str(number - 1), request_id=str(uuid4()), documents=[])
            manifest = dict(version=policy.PROJECT_VERSION, project_id=request['project_id'],
                title=request['title'], revision=str(number), owner=ACTOR,
                previous_hash=latest['manifest_hash'], request_id=request['request_id'],
                request_hash=policy.request_hash(ACTOR, request),
                materials=[{k: m[k] for k in ('asset_id', 'content_hash')} for m in latest['materials']],
                archive_ref=None)
            _, digest, _ = backend._store(storage, policy.validate_manifest(manifest, TOKEN),
                                           policy.PROJECT_MIME, ACTOR)
            latest['manifest_hash'] = digest
    current = scene(db, request)
    assert current['revision'] == '1024' and len(current['snapshots']) == 1024
    assert repo.import_project(ACTOR, TOKEN, request)['manifest_hash'] == current['manifest_hash']
    before = counts(db)
    assert_error('RESPONSE_LIMIT', lambda: repo.import_project(ACTOR, TOKEN, request | dict(
        expected_revision='1024', request_id=str(uuid4()))))
    assert counts(db) == before
    # An overfull authority must be rejected as a whole, including list/old reads.
    manifest = manifest | dict(revision='1025', previous_hash=current['manifest_hash'], request_id=str(uuid4()))
    with storage.session(), storage.transaction():
        backend._store(storage, manifest, policy.PROJECT_MIME, ACTOR)
    assert_error('RESPONSE_LIMIT', lambda: repo.list_projects(ACTOR, TOKEN))
    assert_error('RESPONSE_LIMIT', lambda: scene(db, request, revision='1'))


def test_shared_archive_and_material_sources_charge_once_per_snapshot(db, monkeypatch):
    request = body(documents=[], archive_ref=import_archive(db))
    repo = backend.ProjectRepo(db)
    repo.import_project(ACTOR, TOKEN, request)
    ref = scene(db, request)['materials'][0]
    with closing(sqlite3.connect(db)) as conn:
        size = conn.execute('SELECT length(content_blob) FROM assets WHERE asset_id=?',
                            (ref['asset_id'],)).fetchone()[0]
    monkeypatch.setattr(policy, 'MAX_READ_BYTES', size)
    assert len(scene(db, request)['decisions']['items']) == 1
    assert repo.list_projects(ACTOR, TOKEN)['items'][0]['decision_count'] == 1
    monkeypatch.setattr(policy, 'MAX_READ_BYTES', size - 1)
    assert_error('RESPONSE_LIMIT', lambda: scene(db, request))


def test_new_archive_import_rejects_partial_valid_multi_source_decision(db):
    pkg = package()
    pkg['sources']['two'] = source(text='Second exact source')
    pkg['archive']['items'][0]['evidence'].append(dict(source_key='two', quote='Second'))
    pkg['archive']['items'].append(item('two', quote='Second', ident='independent'))
    ref = import_archive(db, pkg)
    view = archive.read_decision_history(db, ref['asset_id'], ref['content_hash'], ACTOR, TOKEN)
    aid = view['items'][0]['evidence'][0]['asset_id']
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (aid,))
    assert len(archive.read_decision_history(db, ref['asset_id'], ref['content_hash'], ACTOR, TOKEN)['items']) == 1
    before = counts(db)
    assert_error('CONTENT_MISMATCH', lambda: backend.ProjectRepo(db).import_project(
        ACTOR, TOKEN, body(archive_ref=ref)))
    assert counts(db) == before


@pytest.mark.parametrize('kind,change,code', [
    ('receipt', lambda v: v.update(revision='2'), 'CONTENT_MISMATCH'),
    ('receipt', lambda v: v.update(manifest_hash='BAD'), 'INVALID_ARGUMENTS'),
    ('receipt', lambda v: v.update(extra=True), 'INVALID_ARGUMENTS'),
    ('list', lambda v: v['items'][0].update(material_count=True), 'INVALID_ARGUMENTS'),
    ('list', lambda v: v['items'][0].update(decision_count=-1), 'INVALID_ARGUMENTS'),
    ('list', lambda v: v['items'].append(v['items'][0]), 'INVALID_ARGUMENTS'),
    ('material', lambda v: v.update(asset_id=str(uuid4())), 'CONTENT_MISMATCH'),
    ('material', lambda v: v.update(content_hash='0' * 64), 'CONTENT_MISMATCH'),
    ('material', lambda v: v.update(revision='2'), 'CONTENT_MISMATCH'),
    ('material', lambda v: v.update(text=TOKEN), 'SENSITIVE_CONTENT'),
    ('material', lambda v: v.update(extra=True), 'INVALID_ARGUMENTS'),
])
def test_broker_receipt_list_material_are_independently_closed_and_bound(db, kind, change, code):
    repo, request = backend.ProjectRepo(db), body()
    receipt = repo.import_project(ACTOR, TOKEN, request)
    ref = scene(db, request)['materials'][0]
    if kind == 'receipt':
        value, bindings = receipt, dict(project_id=request['project_id'], expected_revision='0')
    elif kind == 'list':
        value, bindings = repo.list_projects(ACTOR, TOKEN), {}
    else:
        bindings = dict(project_id=request['project_id'], revision='1', asset_id=ref['asset_id'],
                        expected_hash=ref['content_hash'])
        value = repo.read_material(ACTOR, TOKEN, **bindings)
    change(value)
    assert_error(code, lambda: policy.project_response(kind, value, TOKEN, **bindings))


def test_exact_utf8_title_document_and_total_import_limits_preserve_literal_unicode(db):
    title = '中' * 85 + 'x'  # 256 UTF-8 bytes.
    text = '🧶' * (64 * 1024 // 4)
    request = body(title=title, documents=[dict(title=str(i) + title[1:] + 'xx', text=text)
                                         for i in range(4)])
    assert len(request['documents'][0]['title'].encode()) == 256
    assert sum(len(d['text'].encode()) for d in request['documents']) == 256 * 1024
    repo = backend.ProjectRepo(db)
    repo.import_project(ACTOR, TOKEN, request)
    value = scene(db, request)
    assert value['title'] == title and len(value['materials']) == 4
    for ref in value['materials']:
        material = repo.read_material(ACTOR, TOKEN, request['project_id'], '1', ref['asset_id'], ref['content_hash'])
        assert material['text'] == text


@pytest.mark.parametrize('mutation,code', [('shape', 'INVALID_ARGUMENTS'),
    ('text_hash', 'CONTENT_MISMATCH'), ('sensitive', 'SENSITIVE_CONTENT'),
    ('noncanonical', 'CONTENT_MISMATCH')])
def test_hash_valid_but_invalid_source_is_suppressed_and_direct_read_refuses(db, mutation, code):
    repo, archive_ref = backend.ProjectRepo(db), import_archive(db)
    request = body(documents=[], archive_ref=archive_ref)
    receipt = repo.import_project(ACTOR, TOKEN, request)
    target = scene(db, request)['materials'][0]
    # Re-hash ancestors to reach closure/sensitivity/canonical checks after the
    # raw hash check, rather than masking every corruption as a bad digest.
    with closing(sqlite3.connect(db)) as conn, conn:
        value = json.loads(conn.execute('SELECT content_blob FROM assets WHERE asset_id=?',
                                        (target['asset_id'],)).fetchone()[0])
        if mutation == 'shape':
            value['extra'] = True
        elif mutation == 'text_hash':
            value['text_sha256'] = '0' * 64
        elif mutation == 'sensitive':
            value['title'] = TOKEN
        raw = decision.canonical(value) + (b' ' if mutation == 'noncanonical' else b'')
        digest = sha256(raw).hexdigest()
        conn.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE asset_id=?',
                     (raw, digest, target['asset_id']))
        parent = json.loads(conn.execute('SELECT content_blob FROM assets WHERE asset_id=?',
                                         (archive_ref['asset_id'],)).fetchone()[0])
        parent['items'][0]['evidence'][0]['content_hash'] = digest
        parent_raw = decision.canonical(parent)
        parent_hash = sha256(parent_raw).hexdigest()
        conn.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE asset_id=?',
                     (parent_raw, parent_hash, archive_ref['asset_id']))
        manifest = json.loads(conn.execute('SELECT content_blob FROM assets WHERE content_hash=?',
                                           (receipt['manifest_hash'],)).fetchone()[0])
        manifest['materials'][0]['content_hash'] = digest
        manifest['archive_ref']['content_hash'] = parent_hash
        manifest_raw = decision.canonical(manifest)
        conn.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE content_hash=?',
                     (manifest_raw, sha256(manifest_raw).hexdigest(), receipt['manifest_hash']))
    current = scene(db, request)
    assert current['has_unavailable'] and current['materials'] == []
    assert current['decisions']['items'] == []
    assert TOKEN not in json.dumps(current)
    assert_error(code, lambda: repo.read_material(ACTOR, TOKEN, request['project_id'], '1',
                                                  target['asset_id'], digest))
    before = counts(db)
    assert_error('CONTENT_MISMATCH', lambda: repo.import_project(ACTOR, TOKEN, body(
        documents=[], archive_ref=archive_ref | {'content_hash': parent_hash})))
    assert counts(db) == before
