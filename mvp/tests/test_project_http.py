"""Real project/core/broker transport against isolated synthetic stores."""
from http.client import HTTPConnection
import json
import sqlite3
from urllib.parse import urlencode
from uuid import uuid4

import pytest

from mvp.backend.init_db import init_database
from mvp.backend.http_server import Server
from mvp.backend.project_repo import ProjectRepo
from mvp.devtools.workbench import create_server
from test_workbench import running
from test_contract_schema import definition_validator

TOKEN='project-http-synthetic-20261116-secret'
OTHER='project-http-other-synthetic-20261116'


def body(title='Synthetic alpha', text='Alpha source words'):
    return dict(project_id=str(uuid4()),title=title,expected_revision='0',request_id=str(uuid4()),
                documents=[dict(title='note.md',text=text)],archive_ref=None)


def call(port,path,body=None,token=TOKEN,broker=False,headers=None,raw=None):
    supplied={'Authorization':'Bearer '+token} if token else {}
    if body is not None or raw is not None:
        supplied['Content-Type']='application/json'
        if broker:supplied.update(Origin=f'http://127.0.0.1:{port}', **{'X-Knot-Action':'explicit'})
    supplied.update(headers or {})
    connection=HTTPConnection('127.0.0.1',port,timeout=6)
    try:
        connection.request('POST' if body is not None or raw is not None else 'GET',path,
                           body=raw if raw is not None else json.dumps(body,ensure_ascii=False).encode() if body is not None else None,
                           headers=supplied)
        response=connection.getresponse(); data=response.read()
        return response.status,json.loads(data),data
    finally:connection.close()


@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN',raising=False)
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A',OTHER:'B'}))
    db=tmp_path/'projects.sqlite3';assert init_database(db)['status']=='created'
    with running(Server(db,0)) as core:
        with running(create_server(core,TOKEN,projects_enabled=True)) as ui:
            yield db,core,ui


def counts(db):
    with sqlite3.connect(db) as conn:
        return tuple(conn.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]
                     for table in ('assets','history_events','asset_readers'))


def test_two_projects_real_import_read_restart_and_scoped_materials(env):
    db,core,ui=env
    alpha,beta=body(),body('Synthetic beta','Beta source words')
    for supplied in (alpha,beta):
        status,value,_=call(ui,'/api/project-import',supplied,broker=True)
        assert status==200 and value['project_id']==supplied['project_id']
        definition_validator('ProjectImportReceipt').validate(value)
    status,catalog,_=call(ui,'/api/projects')
    assert status==200 and {p['title'] for p in catalog['items']}=={alpha['title'],beta['title']}
    definition_validator('ProjectList').validate(catalog)
    a=call(ui,'/api/project?'+urlencode({'project_id':alpha['project_id']}))[1]
    b=call(ui,'/api/project?'+urlencode({'project_id':beta['project_id']}))[1]
    definition_validator('ProjectScene').validate(a)
    assert a['decisions'] is None and len(a['materials'])==1
    ref=a['materials'][0]
    query=dict(project_id=alpha['project_id'],revision='1',asset_id=ref['asset_id'],expected_hash=ref['content_hash'])
    status,material,_=call(ui,'/api/project-material?'+urlencode(query))
    assert status==200 and material['text']=='Alpha source words'
    definition_validator('ProjectMaterial').validate(material)
    denied=query|dict(asset_id=b['materials'][0]['asset_id'],expected_hash=b['materials'][0]['content_hash'])
    status,_,raw=call(ui,'/api/project-material?'+urlencode(denied))
    assert status in (403,404) and b'Beta source words' not in raw
    before=counts(db)
    # Recreating the browser adapter does not lose project membership or material.
    with running(create_server(core,TOKEN,projects_enabled=True)) as restarted:
        assert call(restarted,'/api/projects')[1]==catalog
    assert counts(db)==before
    assert call(core,'/projects',token=OTHER)[1]['value']['items']==[]


def test_revision_snapshots_and_exact_retry_after_head_advances(env):
    db,core,ui=env
    original=body(); first=call(ui,'/api/project-import',original,broker=True)[1]
    update=original|dict(expected_revision='1',request_id=str(uuid4()),documents=[dict(title='next.md',text='Next actual text')])
    assert call(ui,'/api/project-import',update,broker=True)[0]==200
    before=counts(db)
    assert call(ui,'/api/project-import',original,broker=True)[1]==first
    assert counts(db)==before
    latest=call(ui,'/api/project?project_id='+original['project_id'])[1]
    old=call(ui,'/api/project?'+urlencode(dict(project_id=original['project_id'],revision='1')))[1]
    assert latest['revision']=='2' and len(latest['materials'])==2
    assert old['revision']=='1' and len(old['materials'])==1
    assert [s['revision'] for s in latest['snapshots']]==['1','2']
    assert all(s['saved_at']>0 for s in latest['snapshots'])
    changed=original|dict(title='Changed replay')
    assert call(ui,'/api/project-import',changed,broker=True)[:2]==(409,{'error':'IDEMPOTENCY_CONFLICT'})
    stale=update|dict(request_id=str(uuid4()))
    assert call(ui,'/api/project-import',stale,broker=True)[:2]==(409,{'error':'REVISION_CONFLICT'})


def test_project_origin_identity_closed_queries_and_revoke(env):
    db,core,ui=env
    supplied=body()
    assert call(ui,'/api/project-import',supplied,broker=True,headers={'Origin':'https://foreign.invalid'})[0]==403
    assert counts(db)==(0,0,0)
    assert call(core,'/projects',token=None)[0]==403
    assert call(core,'/projects?extra=1')[0]==400
    assert call(ui,'/api/projects?extra=1')[0]==400
    assert call(core,'/project-imports',raw=b'{"project_id":"x","project_id":"y"}')[0]==400
    assert call(ui,'/api/project-import',supplied,broker=True)[0]==200
    scene=call(ui,'/api/project?project_id='+supplied['project_id'])[1]
    ref=scene['materials'][0]
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?',(ref['asset_id'],'A'))
    status,hidden,raw=call(ui,'/api/project?project_id='+supplied['project_id'])
    assert status==200 and hidden['materials']==[] and hidden['has_unavailable']
    assert b'note.md' not in raw and b'Alpha source words' not in raw
    material=dict(project_id=supplied['project_id'],revision='1',asset_id=ref['asset_id'],expected_hash=ref['content_hash'])
    assert call(ui,'/api/project-material?'+urlencode(material))[0] in (403,404)
    with running(create_server(core,TOKEN)) as disabled:
        assert call(disabled,'/api/projects')[0]==400
        assert call(disabled,'/api/project-import',supplied,broker=True)[0]==405


def test_project_list_folds_empty_projects_and_reports_activity(env):
    db,core,ui=env
    filled,filled_up=body(),body('Synthetic folded','Folded source words')
    for supplied in (filled,filled_up):
        assert call(ui,'/api/project-import',supplied,broker=True)[0]==200
    # Revoking the only material leaves a project with no material and no decision.
    ref=call(ui,'/api/project?'+urlencode({'project_id':filled_up['project_id']}))[1]['materials'][0]
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?',(ref['asset_id'],'A'))
    status,catalog,_=call(ui,'/api/projects')
    assert status==200 and catalog['hidden_count']==1
    assert [p['project_id'] for p in catalog['items']]==[filled['project_id']]
    assert catalog['items'][0]['state']=='active' and catalog['items'][0]['last_activity_at'].endswith('Z')
    definition_validator('ProjectList').validate(catalog)
    assert call(core,'/projects')[1]['value']['hidden_count']==1


def test_pending_core_refuses_new_project_without_partial_write(tmp_path,monkeypatch):
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A'}));monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'pending.sqlite3';assert init_database(db)['status']=='created'
    server=Server(db,0)
    with running(server) as core:
        server.journal['pending']={'test':'synthetic pending'}
        assert call(core,'/project-imports',body())[0]==409
        assert counts(db)==(0,0,0)
        server.journal['pending']=None


def test_invalid_success_receipt_keeps_import_uncertain_and_retry_idempotent(env,monkeypatch):
    db,core,ui=env
    original=ProjectRepo.import_project
    def corrupt_receipt(self,*args,**kwargs):
        return original(self,*args,**kwargs)|dict(project_id=str(uuid4()))
    supplied=body()
    with monkeypatch.context() as patch:
        patch.setattr(ProjectRepo,'import_project',corrupt_receipt)
        assert call(ui,'/api/project-import',supplied,broker=True)[:2]==(503,{'error':'READ_UNAVAILABLE'})
    assert counts(db)==(2,2,2)
    status,receipt,_=call(ui,'/api/project-import',supplied,broker=True)
    assert status==200 and receipt['project_id']==supplied['project_id'] and receipt['revision']=='1'
    assert counts(db)==(2,2,2)


def test_deleted_head_is_unavailable_over_http_and_never_replays_an_old_scene(env):
    db,core,ui=env
    original=body();assert call(ui,'/api/project-import',original,broker=True)[0]==200
    update=original|dict(expected_revision='1',request_id=str(uuid4()),documents=[dict(title='next.md',text='Next text')])
    latest=call(ui,'/api/project-import',update,broker=True)[1]
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM assets WHERE content_hash=?',(latest['manifest_hash'],))
    before=counts(db)
    for path in ('/api/projects','/api/project?project_id='+original['project_id'],
                 '/api/project?'+urlencode(dict(project_id=original['project_id'],revision='1'))):
        status,value,raw=call(ui,path)
        assert (status,value)==(400,{'error':'CONTENT_MISMATCH'})
        assert original['title'].encode() not in raw and b'Alpha source words' not in raw
    assert call(ui,'/api/project-import',original,broker=True)[:2]==(400,{'error':'CONTENT_MISMATCH'})
    assert counts(db)==before
