"""Recap editing through the real core/broker stack and retained evidence."""
from copy import deepcopy
from hashlib import sha256
import sqlite3
from urllib.parse import urlencode
from uuid import uuid4

import pytest

from mvp import decision_policy as decision
from mvp import project_policy as policy
from mvp.devtools.recap_edit import prepare_recap
from test_project_http import env, call, counts, TOKEN
from test_project_repo import body
from test_decision_archive import package, source, item
from test_contract_schema import definition_validator


def seed(ui):
    recap=package();recap['archive']['items'][0].update(reason='exact source',caution='Original caution')
    recap['archive']['items'].append(item(ident='choice-two'))
    recap['sources']['doc']=source(kind='document')
    recap['archive']['items'].append(item(key='doc',kind='document_plan',ident='background'))
    request=body(documents=[],recap=recap)
    assert call(ui,'/api/project-import',request,broker=True)[0]==200
    scene=call(ui,'/api/project?project_id='+request['project_id'])[1]
    edit=dict(project_id=scene['project_id'],revision=scene['revision'],manifest_hash=scene['manifest_hash'],
              item_id='choice-one',title='Revised reading <script>literal</script>',after='A clearer direction',note='Current editorial note')
    return request,scene,edit


def test_prepare_exports_exact_sources_is_read_only_and_saves_only_target_revision(env):
    db,core,ui=env
    request,scene,edit=seed(ui);before=counts(db)
    status,prepared,_=call(ui,'/api/recap-prepare',edit,broker=True)
    assert status==200 and counts(db)==before
    first=prepared['recap']['archive']['items'][0]
    assert first['title']==edit['title'] and first['after']==edit['after']
    assert first['caution']=='Original caution\n本次整理备注：'+edit['note']
    assert first['reason']==scene['decisions']['items'][0]['reason']
    source_keys=set(prepared['recap']['sources'])
    assert len(source_keys)==2
    for ref in scene['materials']:
        material=call(ui,'/api/project-material?'+urlencode(dict(project_id=scene['project_id'],revision='1',
            asset_id=ref['asset_id'],expected_hash=ref['content_hash'])))[1]
        definition_validator('ProjectMaterial').validate(material)
        assert sha256(decision.canonical(material['source'])).hexdigest()==ref['content_hash']
        assert material['source']['text']==material['text']
    save=request|dict(expected_revision='1',request_id=str(uuid4()),recap=prepared['recap'])
    status,receipt,_=call(ui,'/api/project-import',save,broker=True)
    assert status==200 and receipt['revision']=='2'
    latest=call(ui,'/api/project?project_id='+scene['project_id'])[1]
    assert latest['decisions']['items'][1:]==scene['decisions']['items'][1:]
    updated=latest['decisions']['items'][0];original=scene['decisions']['items'][0]
    assert all(updated[key]==original[key] for key in original if key not in ('title','after','caution'))
    assert latest['materials']==scene['materials']
    old=call(ui,'/api/project?'+urlencode(dict(project_id=scene['project_id'],revision='1')))[1]
    assert old['decisions']==scene['decisions']
    after=counts(db);assert call(ui,'/api/project-import',save,broker=True)[1]==receipt and counts(db)==after
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM history_events WHERE event_type='user_confirm'").fetchone()[0]==0


@pytest.mark.parametrize('change',[
    {'manifest_hash':'0'*64},{'item_id':'background'},{'item_id':'missing'},
    {'title':''},{'note':'字'*342},{'after':'字'*683},{'reason':'Invented reason'},
    {'title':'Synthetic decision','after':'A retrospective explanation, not an approval.','note':''},
])
def test_invalid_or_unchanged_edit_never_writes(env,change):
    db,core,ui=env
    request,scene,edit=seed(ui);before=counts(db)
    status,value,_=call(ui,'/api/recap-prepare',edit|change,broker=True)
    assert status in (400,404) and 'error' in value and counts(db)==before


def test_revoked_source_refuses_incomplete_recap_and_foreign_origin(env):
    db,core,ui=env
    request,scene,edit=seed(ui);ref=scene['materials'][0]
    assert call(ui,'/api/recap-prepare',edit,broker=True,headers={'Origin':'https://other.invalid'})[0]==403
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?',(ref['asset_id'],))
    before=counts(db)
    assert call(ui,'/api/recap-prepare',edit,broker=True)[:2]==(403,{'error':'ACCESS_DENIED'})
    assert counts(db)==before


def test_missing_or_forged_source_export_cannot_be_reconstructed(env):
    db,core,ui=env
    request,scene,edit=seed(ui)
    def read(pid,rev):return scene
    def material(pid,rev,aid,digest):
        return call(ui,'/api/project-material?'+urlencode(dict(project_id=pid,revision=rev,asset_id=aid,expected_hash=digest)))[1]
    def missing(*args):
        result=material(*args);result.pop('source');return result
    with pytest.raises(policy.ProjectError,match='READ_UNAVAILABLE'):
        prepare_recap(edit,TOKEN,read,missing)
    def forged(*args):
        result=material(*args);result['source']['archived_on']='2026-11-01';return result
    with pytest.raises(policy.ProjectError,match='CONTENT_MISMATCH'):
        prepare_recap(edit,TOKEN,read,forged)


def test_appended_note_respects_existing_caution_budget(env):
    db,core,ui=env
    request,scene,edit=seed(ui)
    recap=deepcopy(request['recap'])
    recap['archive']['items'][0]['caution']='x'*2040
    update=request|dict(expected_revision='1',request_id=str(uuid4()),recap=recap)
    assert call(ui,'/api/project-import',update,broker=True)[0]==200
    latest=call(ui,'/api/project?project_id='+scene['project_id'])[1]
    before=counts(db)
    supplied=edit|dict(revision=latest['revision'],manifest_hash=latest['manifest_hash'])
    assert call(ui,'/api/recap-prepare',supplied,broker=True)[:2]==(400,{'error':'INVALID_ARGUMENTS'})
    assert counts(db)==before
