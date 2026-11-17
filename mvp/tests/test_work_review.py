"""Work-review preparation against the real HTTP stack and synthetic projects."""
import sqlite3
from uuid import uuid4

import pytest

from test_project_http import env, body, call, counts


def prepared_input(ui, source_text='Actual retained words: start with the smallest useful result.'):
    project=body(text=source_text)
    assert call(ui,'/api/project-import',project,broker=True)[0]==200
    scene=call(ui,'/api/project?project_id='+project['project_id'])[1]
    ref=scene['materials'][0]
    return dict(project_id=scene['project_id'],revision=scene['revision'],
                manifest_hash=scene['manifest_hash'],day='2026-11-17',
                completed='Implemented a review draft.',blocked='',next='Check it with the user.',
                evidence=[dict(asset_id=ref['asset_id'],content_hash=ref['content_hash'],
                               quote='start with the smallest useful result.')])


def test_prepare_is_read_only_then_document_saves_without_becoming_a_decision(env):
    db,core,ui=env
    supplied=prepared_input(ui);before=counts(db)
    status,value,_=call(ui,'/api/work-review-prepare',supplied,broker=True)
    assert status==200
    assert counts(db)==before
    text=value['document']['text']
    assert all(term in text for term in ('今天完成了什么','卡在哪里','下次接着做什么',
        '尚未记录',supplied['evidence'][0]['quote'],'待本人检查'))
    save=dict(project_id=supplied['project_id'],title='Synthetic alpha',
        expected_revision=supplied['revision'],request_id=str(uuid4()),
        documents=[value['document']],archive_ref=None)
    assert call(ui,'/api/project-import',save,broker=True)[0]==200
    scene=call(ui,'/api/project?project_id='+supplied['project_id'])[1]
    assert scene['revision']=='2' and len(scene['materials'])==2
    assert scene['decisions'] is None
    # Preparing from the pinned older version remains a read, not a rebase.
    assert call(ui,'/api/work-review-prepare',supplied,broker=True)[1]==value


@pytest.mark.parametrize('change,expected',[
    ({'manifest_hash':'0'*64},'CONTENT_MISMATCH'),
    ({'day':'2026-02-30'},'INVALID_ARGUMENTS'),
    ({'completed':'','blocked':'','next':''},'INVALID_ARGUMENTS'),
    ({'extra':'unexpected'},'INVALID_ARGUMENTS'),
    ({'completed':'字'*3000},'INVALID_ARGUMENTS'),
])
def test_invalid_review_never_writes(env,change,expected):
    db,core,ui=env
    supplied=prepared_input(ui);before=counts(db)
    status,value,_=call(ui,'/api/work-review-prepare',supplied|change,broker=True)
    assert status==400 and value=={'error':expected}
    assert counts(db)==before


def test_quote_cross_project_and_revoked_sources_are_checked_on_server(env):
    db,core,ui=env
    supplied=prepared_input(ui);ref=supplied['evidence'][0]
    wrong=supplied|dict(evidence=[ref|dict(quote='invented completed work')])
    before=counts(db)
    assert call(ui,'/api/work-review-prepare',wrong,broker=True)[:2]==(400,{'error':'CONTENT_MISMATCH'})
    other=prepared_input(ui,'Another project: start with the smallest useful result.')
    wrong=supplied|dict(evidence=other['evidence'])
    assert call(ui,'/api/work-review-prepare',wrong,broker=True)[0]==403
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?',(ref['asset_id'],))
    revoked_counts=counts(db)
    assert call(ui,'/api/work-review-prepare',supplied,broker=True)[0]==403
    assert counts(db)==revoked_counts
    assert call(ui,'/api/work-review-prepare',supplied,broker=True,
                headers={'Origin':'https://other.invalid'})[0]==403
