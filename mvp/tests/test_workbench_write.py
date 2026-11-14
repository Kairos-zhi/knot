import copy
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

import pytest
from mvp.devtools import workbench_write as write

TOKEN='private-journal-synthetic-20261114'
ORIGIN='http://127.0.0.1:12345'


def draft():
    return dict(exploration_id=str(uuid4()),expected_revision='0',snapshot_version=2,
                references=[],stop_note='private body sentinel',relations=[])


def binding(value):
    return {key:value[key] for key in ('operation_id','digest')}


@pytest.fixture
def journal(tmp_path):
    return write.WriteJournal(tmp_path/'journal',ORIGIN,TOKEN)


def install(monkeypatch,results=None):
    calls=[]
    receipts={}
    async def call(origin,name,body,token):
        calls.append(copy.deepcopy(body))
        if results:
            return results.pop(0)
        return receipts.setdefault(body['request_key'],dict(exploration_id=body['exploration_id'],revision=body['expected_revision']+1,event_id=str(uuid4())))
    monkeypatch.setattr(write,'exploration_call',call)
    return calls


def test_prepare_cancel_and_new_operation_do_not_send(journal,monkeypatch):
    calls=install(monkeypatch)
    prepared=journal.prepare(draft())
    assert prepared['phase']=='prepared' and calls==[]
    assert 'private body sentinel' not in json.dumps(prepared) and TOKEN not in journal._path.read_text()
    assert journal.cancel(binding(prepared))['phase']=='cancelled'
    assert journal.prepare(draft())['operation_id']!=prepared['operation_id']
    assert calls==[]


def test_restart_state_is_zero_upstream_then_explicit_confirm(journal,monkeypatch):
    calls=install(monkeypatch)
    prepared=journal.prepare(draft())
    fresh=write.WriteJournal(journal.root,ORIGIN,TOKEN)
    assert fresh.state()==prepared and calls==[]
    saved=fresh.confirm(binding(prepared))
    assert saved['phase']=='saved' and saved['receipt']['revision']=='1' and len(calls)==1
    with pytest.raises(write.WriteError): fresh.confirm(binding(prepared))
    assert len(calls)==1


def test_unknown_is_sticky_across_recovery_refusal(journal,monkeypatch):
    calls=install(monkeypatch,[{'error':'WRITE_OUTCOME_UNKNOWN'},{'error':'ACCESS_DENIED'},{'error':'SERVER_READ_ONLY'}])
    prepared=journal.prepare(draft()); key=binding(prepared)
    assert journal.confirm(key)['phase']=='unknown'
    for error in ('ACCESS_DENIED','SERVER_READ_ONLY'):
        result=journal.recover(key)
        assert result['phase']=='unknown' and result['error']==error
        with pytest.raises(write.WriteError): journal.prepare(draft())
        with pytest.raises(write.WriteError): journal.cancel(key)
    assert len(calls)==3 and calls[0]==calls[1]==calls[2]


def test_initial_canonical_rejection_is_terminal(journal,monkeypatch):
    calls=install(monkeypatch,[{'error':'REVISION_CONFLICT'}])
    first=journal.prepare(draft())
    assert journal.confirm(binding(first))['phase']=='rejected'
    assert journal.prepare(draft())['operation_id']!=first['operation_id']
    assert len(calls)==1


def test_unknown_malformed_result_does_not_expose_upstream(journal,monkeypatch):
    install(monkeypatch,[{'error':'SECRET_RAW_PRIVATE','body':'raw private response'}])
    first=journal.prepare(draft()); result=journal.confirm(binding(first))
    assert result['phase']=='unknown' and result['error']=='WRITE_OUTCOME_UNKNOWN'
    assert 'SECRET_RAW_PRIVATE' not in json.dumps(result)


def test_fail_before_send_is_zero_upstream(journal,monkeypatch):
    calls=install(monkeypatch); first=journal.prepare(draft())
    original=journal._persist
    def fail(record):
        if record['phase']=='unknown': raise OSError('synthetic disk failure')
        return original(record)
    monkeypatch.setattr(journal,'_persist',fail)
    with pytest.raises(write.WriteError): journal.confirm(binding(first))
    assert calls==[] and journal.state()['phase']=='prepared'


def test_receipt_disk_failure_preserves_unknown_and_same_request(journal,monkeypatch):
    calls=install(monkeypatch); first=journal.prepare(draft()); original=journal._persist
    def fail(record):
        if record['phase']=='saved': raise OSError('synthetic receipt failure')
        return original(record)
    monkeypatch.setattr(journal,'_persist',fail)
    assert journal.confirm(binding(first))['phase']=='unknown'
    assert journal.state()['phase']=='unknown'
    monkeypatch.setattr(journal,'_persist',original)
    assert journal.recover(binding(first))['phase']=='saved'
    assert len(calls)==2 and calls[0]==calls[1]


def test_tamper_and_changed_binding_are_zero_upstream(journal,monkeypatch):
    calls=install(monkeypatch); prepared=journal.prepare(draft())
    for origin,token in ((ORIGIN+'1',TOKEN),(ORIGIN,TOKEN+'-different')):
        with pytest.raises(write.WriteError): write.WriteJournal(journal.root,origin,token)
    record=json.loads(journal._path.read_text());record['body']['stop_note']='tampered'
    journal._path.write_text(json.dumps(record))
    with pytest.raises(write.WriteError): journal.confirm(binding(prepared))
    assert calls==[]


def test_bad_confirmation_binding_is_zero_upstream(journal,monkeypatch):
    calls=install(monkeypatch); prepared=journal.prepare(draft())
    with pytest.raises(write.WriteError): journal.confirm(binding(prepared)|{'digest':'0'*64})
    assert calls==[] and journal.state()['phase']=='prepared'


def test_concurrent_confirm_has_one_sender(journal,monkeypatch):
    calls=install(monkeypatch); prepared=journal.prepare(draft())
    def confirm(_):
        try: return journal.confirm(binding(prepared))['phase']
        except write.WriteError: return 'refused'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm,range(2)))==['refused','saved']
    assert len(calls)==1


def test_hardlinked_record_is_rejected(journal,tmp_path):
    journal.prepare(draft())
    os.link(journal._path,tmp_path/'outside-linked-record')
    with pytest.raises(write.WriteError): journal.state()


def test_state_new_python_process_has_no_private_body(journal):
    prepared=journal.prepare(draft())
    code='import json,os,sys;from mvp.devtools.workbench_write import WriteJournal;print(json.dumps(WriteJournal(sys.argv[1],sys.argv[2],os.environ["KNOT_TEST_TOKEN"]).state()))'
    env=os.environ.copy();env['KNOT_TEST_TOKEN']=TOKEN
    result=subprocess.run([sys.executable,'-B','-c',code,str(journal.root),ORIGIN],env=env,capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
    assert json.loads(result.stdout)==prepared
    assert 'private body sentinel' not in result.stdout and TOKEN not in result.stdout
