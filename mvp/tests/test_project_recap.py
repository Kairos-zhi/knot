"""Agent-authored recaps append reversible project views over real source refs."""
from copy import deepcopy
from uuid import uuid4

import pytest

from test_project_repo import db, body, counts, ACTOR, TOKEN, package, backend, policy
from test_contract_schema import definition_validator
from test_project_http import env, call


def test_agent_can_reorganize_recap_without_changing_sources_or_old_version(db):
    repo=backend.ProjectRepo(db)
    request=body(documents=[],recap=package())
    definition_validator('ProjectImportRequest').validate(request)
    first=repo.import_project(ACTOR,TOKEN,request)
    old=repo.read_project(ACTOR,TOKEN,request['project_id'])
    original=deepcopy(request)
    before=counts(db)
    assert repo.import_project(ACTOR,TOKEN,request)==first and counts(db)==before
    revision=deepcopy(request)
    revision.update(expected_revision='1',request_id=str(uuid4()))
    revision['recap']['archive']['title']='A different way to read the same sources'
    revision['recap']['archive']['items'][0]['title']='Reorganized, still a curated recap'
    repo.import_project(ACTOR,TOKEN,revision)
    latest=repo.read_project(ACTOR,TOKEN,request['project_id'])
    assert latest['revision']=='2'
    assert latest['materials']==old['materials']
    assert latest['decisions']['items'][0]['title']=='Reorganized, still a curated recap'
    assert repo.read_project(ACTOR,TOKEN,request['project_id'],'1')['decisions']==old['decisions']
    assert request==original


def test_recap_and_project_failure_roll_back_together(db,monkeypatch):
    repo=backend.ProjectRepo(db)
    request=body()
    repo.import_project(ACTOR,TOKEN,request)
    before=counts(db)
    update=request|dict(expected_revision='1',request_id=str(uuid4()),documents=[],recap=package())
    monkeypatch.setattr(policy,'MAX_MATERIALS',1)
    with pytest.raises(policy.ProjectError):
        repo.import_project(ACTOR,TOKEN,update)
    assert counts(db)==before
    assert repo.read_project(ACTOR,TOKEN,request['project_id'])['revision']=='1'


def test_unquoted_or_ambiguous_recaps_are_rejected_without_writes(db):
    repo=backend.ProjectRepo(db)
    request=body(documents=[],recap=package())
    request['recap']['archive']['items'][0]['evidence'][0]['quote']='Invented source quotation'
    with pytest.raises(policy.ProjectError):repo.import_project(ACTOR,TOKEN,request)
    assert counts(db)==(0,0,0,0)
    request=body(documents=[],recap=package(),archive_ref=dict(asset_id=str(uuid4()),content_hash='a'*64))
    with pytest.raises(policy.ProjectError):repo.import_project(ACTOR,TOKEN,request)
    assert counts(db)==(0,0,0,0)


def test_same_project_operation_accepts_agent_recap_through_real_http(env):
    database,core,ui=env
    request=body(documents=[],recap=package())
    status,receipt,_=call(ui,'/api/project-import',request,broker=True)
    assert status==200 and receipt['revision']=='1'
    value=call(ui,'/api/project?project_id='+request['project_id'])[1]
    assert value['decisions']['items'][0]['title']==request['recap']['archive']['items'][0]['title']
    before=counts(database)
    assert call(ui,'/api/project-import',request,broker=True)[1]==receipt
    assert counts(database)==before
