"""Cited project appearance from retained authorized facts, through real APIs."""
from contextlib import closing
from copy import deepcopy
import json
import sqlite3
from uuid import uuid4

import pytest

from test_project_repo import db, body, ACTOR, TOKEN, OTHER, OTHER_TOKEN, backend, grant, manifest_id, captured_source as original_source
from test_contract_schema import definition_validator
from test_project_http import env, call
from mvp import project_policy as policy
from mvp.devtools.codex_capture import registration_document


EARLY, LATE = 1790000000000, 1794000000000


def captured_source(*, message_time_ms, **kwargs):
    return original_source(**kwargs) | dict(message_time_ms=message_time_ms)


def registration(pid, stamp=EARLY):
    return registration_document(dict(source_id=str(uuid4()), project_id=pid,
                                      title='Registry title', created_at_ms=stamp))


def listing(repo, actor=ACTOR, token=TOKEN):
    value = repo.list_projects(actor, token)
    definition_validator('ProjectList').validate(value)
    return value['items'][0]


def test_registration_and_message_dates_are_cited_sorted_and_counted(db):
    repo = backend.ProjectRepo(db)
    request = body(documents=[], sources=[captured_source(message_id='later', message_time_ms=LATE),
        captured_source(message_id='same-time', message_time_ms=LATE),
        captured_source(message_id='earlier', message_time_ms=LATE - 1000)])
    request['documents'] = [registration(request['project_id'])]
    repo.import_project(ACTOR, TOKEN, request)
    scene = repo.read_project(ACTOR, TOKEN, request['project_id'])
    chronology = listing(repo)['chronology']
    assert chronology == dict(appearance_at=EARLY, appearance_basis='registry_created',
        appearance_source={k: scene['materials'][0][k] for k in ('asset_id', 'content_hash')},
        observation_times=[LATE - 1000, LATE], observation_count=3)
    # A migration/late registration must not hide already-retained earlier messages.
    other = body(documents=[], sources=[captured_source(message_time_ms=EARLY - 1000)])
    other['documents'] = [registration(other['project_id'])]
    repo.import_project(ACTOR, TOKEN, other)
    result = next(p['chronology'] for p in repo.list_projects(ACTOR, TOKEN)['items'] if p['project_id'] == other['project_id'])
    assert result['appearance_at'] == EARLY - 1000 and result['appearance_basis'] == 'first_message'
    assert result['appearance_source']['asset_id'] == repo.read_project(ACTOR, TOKEN, other['project_id'])['observations'][0]['asset_id']


@pytest.mark.parametrize('change', [dict(project_id=str(uuid4())), dict(created_at_ms=True),
    dict(created_at_ms=-1), dict(created_at_ms=None), dict(source='another_registry'),
    dict(version='unknown'), dict(source_id='invalid')])
def test_invalid_or_different_project_registration_does_not_invent_dates(db, change):
    repo, request = backend.ProjectRepo(db), body(documents=[])
    document = registration(request['project_id'])
    record = json.loads(document['text']) | change
    request['documents'] = [document | dict(text=json.dumps(record))]
    repo.import_project(ACTOR, TOKEN, request)
    result = listing(repo)['chronology']
    assert result['appearance_basis'] == 'first_saved' and 'appearance_source' not in result
    assert result['observation_count'] == 0 and result['observation_times'] == []


def test_revoke_registration_and_message_removes_their_dates_without_stale_cache(db):
    repo, request = backend.ProjectRepo(db), body(documents=[], sources=[captured_source(message_time_ms=LATE)])
    request['documents'] = [registration(request['project_id'])]
    receipt = repo.import_project(ACTOR, TOKEN, request)
    scene = repo.read_project(ACTOR, TOKEN, request['project_id'])
    grant(db, manifest_id(db, receipt['manifest_hash']))
    for ref in scene['materials']:
        grant(db, ref['asset_id'])
    assert listing(repo, OTHER, OTHER_TOKEN)['chronology']['appearance_at'] == EARLY
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?', (scene['materials'][0]['asset_id'], OTHER))
    result = listing(repo, OTHER, OTHER_TOKEN)['chronology']
    assert result['appearance_at'] == LATE and result['appearance_basis'] == 'first_message'
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?', (scene['observations'][0]['asset_id'], OTHER))
    result = listing(repo, OTHER, OTHER_TOKEN)['chronology']
    assert result['appearance_basis'] == 'first_saved' and 'appearance_source' not in result
    assert result['observation_times'] == [] and result['observation_count'] == 0


def test_first_saved_only_uses_readable_snapshots(db):
    repo, request = backend.ProjectRepo(db), body()
    first = repo.import_project(ACTOR, TOKEN, request)
    latest = repo.import_project(ACTOR, TOKEN, request | dict(expected_revision='1', request_id=str(uuid4()), documents=[]))
    grant(db, manifest_id(db, latest['manifest_hash']))
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET created_at=11 WHERE content_hash=?', (first['manifest_hash'],))
        conn.execute('UPDATE assets SET created_at=22 WHERE content_hash=?', (latest['manifest_hash'],))
    assert listing(repo)['chronology']['appearance_at'] == 11
    assert listing(repo, OTHER, OTHER_TOKEN)['chronology']['appearance_at'] == 22


def test_optional_old_projection_and_malformed_new_chronology(db):
    repo, request = backend.ProjectRepo(db), body(sources=[captured_source(message_time_ms=LATE)])
    repo.import_project(ACTOR, TOKEN, request)
    value = repo.list_projects(ACTOR, TOKEN)
    old = deepcopy(value)
    old['items'][0].pop('chronology')
    assert policy.project_response('list', old, TOKEN) == old
    definition_validator('ProjectList').validate(old)
    valid = value['items'][0]['chronology']
    bad = [valid | dict(appearance_at=LATE + 1), valid | dict(observation_times=[LATE, LATE]),
        valid | dict(observation_times=[LATE, EARLY]), valid | dict(observation_count=True),
        valid | dict(appearance_source={}), valid | dict(appearance_basis='first_saved'),
        {k: v for k, v in valid.items() if k != 'appearance_source'}]
    for chronology in bad:
        changed = deepcopy(value)
        changed['items'][0]['chronology'] = chronology
        with pytest.raises(policy.ProjectError):
            policy.project_response('list', changed, TOKEN)


def test_chronology_survives_core_and_broker_projection(env):
    database, core, ui = env
    request = body(documents=[], sources=[captured_source(message_time_ms=LATE)])
    request['documents'] = [registration(request['project_id'])]
    assert call(ui, '/api/project-import', request, broker=True)[0] == 200
    status, result, _ = call(ui, '/api/projects')
    assert status == 200
    definition_validator('ProjectList').validate(result)
    assert result['items'][0]['chronology']['appearance_basis'] == 'registry_created'


def test_visibility_hash_distinguishes_equal_date_and_count_grant_exchange(db):
    repo=backend.ProjectRepo(db)
    request=body(documents=[],sources=[captured_source(message_time_ms=LATE,message_id='one'),
        captured_source(message_time_ms=LATE,message_id='two')])
    receipt=repo.import_project(ACTOR,TOKEN,request)
    scene=repo.read_project(ACTOR,TOKEN,request['project_id'])
    grant(db,manifest_id(db,receipt['manifest_hash']))
    first,second=scene['observations']
    grant(db,first['asset_id'])
    before=listing(repo,OTHER,OTHER_TOKEN)
    with closing(sqlite3.connect(db)) as conn,conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?',(first['asset_id'],OTHER))
        conn.execute('INSERT INTO asset_readers VALUES (?,?)',(second['asset_id'],OTHER))
    after=listing(repo,OTHER,OTHER_TOKEN)
    assert before['chronology']['observation_times']==after['chronology']['observation_times']
    assert before['material_count']==after['material_count']==1
    assert before['visibility_hash']!=after['visibility_hash']
    assert before['chronology']['observation_count']==after['chronology']['observation_count']==1


def test_earlier_retained_window_record_has_its_own_time_basis_not_message_time(db):
    from mvp import decision_policy as decision
    repo=backend.ProjectRepo(db)
    request=body(documents=[])
    stamp=EARLY-1000
    index=dict(version='knot.history-window-days/0.1',project_id=request['project_id'],
        days=[dict(on=decision.message_day(stamp),windows=[dict(excerpts=[dict(
            time_basis='turn_started_at',turn_time_ms=stamp)])])])
    request['documents']=[registration(request['project_id']),dict(title='历史窗口日回顾索引·1.json',text=decision.canonical(index).decode())]
    repo.import_project(ACTOR,TOKEN,request)
    result=listing(repo)['chronology']
    assert result['appearance_basis']=='first_window_record' and result['appearance_at']==stamp
    assert result['observation_times']==[] and result['observation_count']==0
    scene=repo.read_project(ACTOR,TOKEN,request['project_id'])
    assert result['appearance_source']['asset_id']==scene['materials'][1]['asset_id']
