import copy
import json
import os
from pathlib import Path
import socket
from uuid import uuid4

from jsonschema import Draft202012Validator
import pytest
from mvp import context_sync_policy as policy
from mvp.devtools import context_packet as cli
from test_exploration_v2_projection import sample
from test_workbench import environment


def build(checkpoint=None,**overrides):
    value=checkpoint or sample()['value']
    options=dict(exploration_id=value['exploration_id'],revision=value['revision'],event_id=value['event_id'],
                 namespace_id=str(uuid4()),project_id=str(uuid4()),task_id=str(uuid4()),instance_id=str(uuid4()),
                 reported_status='in_progress',summary='Operator-authored status',
                 allow_assets=[value['references'][0]['asset_id']],token='synthetic-context-token-20261114')
    options.update(overrides)
    return policy.build_proposal(value,**options)


def test_schema_and_semantics_exclude_source_private_fields():
    value=sample()['value'];value['stop_note']='PRIVATE_SOURCE_STOP_NOTE'
    value['references'][0]['reason']='PRIVATE_SOURCE_REASON'
    proposal=build(value)
    text=policy.canonical(proposal).decode()
    assert 'PRIVATE_SOURCE' not in text
    assert len(proposal['evidence'])==1
    digest=policy.proposal_digest(proposal)
    packet=policy.confirmed_packet(proposal,digest)
    schema=json.loads((Path(__file__).parents[1]/'docs/contracts/context-proposal-v0.1.schema.json').read_text())
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(packet)
    assert packet['local_confirmation']['actor_verified'] is False


@pytest.mark.parametrize('change',[
    lambda p:p.update(capability_tags=['software']),
    lambda p:p['scope'].update(platform_account='invented'),
    lambda p:p['sharing'].update(public_reuse_allowed=True),
    lambda p:p['sharing'].update(raw_content_included=0),
    lambda p:p['checkpoint'].update(revision='9223372036854775808'),
    lambda p:p['checkpoint'].update(revision=True),
    lambda p:p.update(summary='   '),
    lambda p:p['evidence'].append(p['evidence'][0].copy()),
])
def test_closed_contract_and_semantic_limits(change):
    p=build();change(p)
    with pytest.raises(policy.PacketError): policy.validate_proposal(p)


def test_any_proposal_change_requires_new_ack():
    p=build();digest=policy.proposal_digest(p)
    p['scope']['project_id']=str(uuid4())
    with pytest.raises(policy.PacketError,match='ACK_MISMATCH'): policy.confirmed_packet(p,digest)


def test_checkpoint_and_explicit_evidence_authorization():
    value=sample()['value']
    with pytest.raises(policy.PacketError,match='CHECKPOINT_MISMATCH'): build(value,event_id=str(uuid4()))
    with pytest.raises(policy.PacketError,match='INVALID_SELECTION'): build(value,allow_assets=[str(uuid4())])
    value['references'][0]['status']='forbidden';value['references'][0].pop('reason')
    value['stop_note']=None;value['stop_note_reason']='dependency_unavailable'
    r=value['relations'][0];value['relations']=[{k:r[k] for k in ('relation_id','from_asset_id','to_asset_id')}|{'reason_code':'dependency_unavailable'}]
    with pytest.raises(policy.PacketError,match='ASSET_UNAVAILABLE'): build(value)
    assert build(allow_assets=[])['evidence']==[]


def test_credentials_rejected():
    token='synthetic-context-token-20261114'
    with pytest.raises(policy.PacketError,match='SENSITIVE_CONTENT'): build(summary='contains '+token,token=token)


def test_new_private_output_and_no_overwrite(tmp_path):
    path=tmp_path/'proposal.json'
    cli.publish_new(path,build())
    original=path.read_bytes()
    with pytest.raises(FileExistsError): cli.publish_new(path,{'replace':True})
    assert path.read_bytes()==original
    if os.name=='nt':
        # icacls /save emits locale-independent SDDL. Only the explicit
        # current user ACE remains, without inherited ACEs or Everyone.
        import subprocess
        system=Path(os.environ['SystemRoot'])/'System32'
        acl=tmp_path/'acl.txt'
        result=subprocess.run([str(system/'icacls.exe'),str(path),'/save',str(acl)],capture_output=True,timeout=5)
        assert result.returncode==0
        sddl=acl.read_text(encoding='utf-16-le').lstrip('\ufeff')
        assert 'D:P' in sddl and '(A;;FA;;;' in sddl and ';ID;' not in sddl and ';;;WD)' not in sddl
    else: assert path.stat().st_mode&0o777==0o600


def test_failed_privacy_setup_writes_no_private_bytes(tmp_path,monkeypatch):
    def fail(path):
        assert not path.exists()
        raise policy.PacketError('PRIVATE_OUTPUT_REQUIRED')
    monkeypatch.setattr(cli,'_private_create',fail)
    target=tmp_path/'blocked.json'
    with pytest.raises(policy.PacketError):cli.publish_new(target,build())
    assert not target.exists() and not list(tmp_path.glob('.context-*.tmp'))


def test_actual_prepare_one_get_and_offline_export(environment,tmp_path,monkeypatch,capsys):
    _,backend,db,aid,digest,eid=environment
    from mvp.backend.exploration_repo import ExplorationRepo
    saved=ExplorationRepo(db).load_v2('local-user',eid,revision=1)
    monkeypatch.setenv('KNOT_WORKBENCH_TOKEN','workbench-synthetic-secret-20261114')
    summary=tmp_path/'summary.txt';summary.write_text('Explicit project progress',encoding='utf-8')
    proposal_file=tmp_path/'preview.json';packet_file=tmp_path/'packet.json'
    calls=[];actual=cli.project
    def read(*args):calls.append(args);return actual(*args)
    monkeypatch.setattr(cli,'project',read)
    args=['prepare','--origin',f'http://127.0.0.1:{backend}','--exploration-id',eid,'--revision','1','--event-id',saved['event_id'],
          '--namespace-id',str(uuid4()),'--project-id',str(uuid4()),'--task-id',str(uuid4()),'--instance-id',str(uuid4()),
          '--reported-status','blocked','--summary-file',str(summary),'--allow-asset',aid,'--output',str(proposal_file)]
    assert cli.main(args)==0
    result=json.loads(capsys.readouterr().out)
    assert len(calls)==1 and calls[0][2]['revision']=='1'
    proposal=json.loads(proposal_file.read_text())
    assert proposal['checkpoint']['event_id']==saved['event_id']
    assert proposal['evidence']==[{'asset_id':aid,'content_hash':digest}]
    def no_network(*a,**k):raise AssertionError('offline export attempted network')
    monkeypatch.setattr(socket,'create_connection',no_network)
    assert cli.main(['export','--proposal',str(proposal_file),'--ack-sha256',result['proposal_sha256'],'--output',str(packet_file)])==0
    out=json.loads(capsys.readouterr().out)
    assert out['uploaded'] is False and 'Explicit project progress' not in json.dumps(out)
    assert len(calls)==1
    packet=json.loads(packet_file.read_text())
    assert packet['proposal']==proposal and packet['local_confirmation']['action']=='local_export_only'


def test_duplicate_json_input_rejected_without_output(tmp_path,capsys):
    path=tmp_path/'invalid.json';path.write_text('{"a":1,"a":2}')
    out=tmp_path/'none.json'
    assert cli.main(['export','--proposal',str(path),'--ack-sha256','a'*64,'--output',str(out)])==1
    assert not out.exists() and '"a"' not in capsys.readouterr().out


@pytest.mark.parametrize('operation',[cli.read_private_input,lambda p:cli.publish_new(p,{'private':'data'})])
def test_unc_rejected_before_filesystem_access(monkeypatch,operation):
    def forbidden(*a):raise AssertionError('filesystem access attempted')
    monkeypatch.setattr(cli,'_check_path',forbidden)
    with pytest.raises(policy.PacketError,match='LOCAL_FILESYSTEM_REQUIRED'):
        operation('//server/share/private.json')


@pytest.mark.skipif(os.name!='nt',reason='Windows drive mapping check')
@pytest.mark.parametrize('operation',[cli.read_private_input,lambda p:cli.publish_new(p,{'private':'data'})])
def test_mapped_network_drive_rejected_before_access(monkeypatch,operation):
    monkeypatch.setattr(cli,'_windows_drive_type',lambda root:4)
    def forbidden(*a):raise AssertionError('filesystem access attempted')
    monkeypatch.setattr(cli,'_check_path',forbidden)
    with pytest.raises(policy.PacketError,match='LOCAL_FILESYSTEM_REQUIRED'):
        operation('Z:/private.json')


@pytest.mark.skipif(os.name!='nt',reason='Windows creation DACL check')
def test_private_acl_already_present_at_creation_before_writing(tmp_path,monkeypatch):
    import subprocess
    actual=cli._private_create
    observed=[]
    def observe(path):
        fd=actual(path)
        assert path.stat().st_size==0
        system=Path(os.environ['SystemRoot'])/'System32'
        acl=tmp_path/'creation-acl.txt'
        result=subprocess.run([str(system/'icacls.exe'),str(path),'/save',str(acl)],capture_output=True,timeout=5)
        assert result.returncode==0
        text=acl.read_text(encoding='utf-16-le').lstrip('\ufeff')
        assert 'D:P' in text and text.count('(A;')==1 and ';ID;' not in text
        observed.append(True)
        return fd
    monkeypatch.setattr(cli,'_private_create',observe)
    cli.publish_new(tmp_path/'private.json',build())
    assert observed==[True]


@pytest.mark.skipif(os.name!='nt',reason='Windows filesystem ACL capability')
def test_volume_without_persistent_acls_writes_zero_bytes(tmp_path,monkeypatch):
    def no_acl(fd):
        assert os.fstat(fd).st_size==0
        return False
    monkeypatch.setattr(cli,'_persistent_acls',no_acl)
    target=tmp_path/'blocked-volume.json'
    with pytest.raises(policy.PacketError,match='PRIVATE_OUTPUT_REQUIRED'):
        cli.publish_new(target,build())
    assert not target.exists() and not list(tmp_path.glob('.context-*.tmp'))


@pytest.mark.parametrize('operation',[cli.read_private_input,lambda p:cli.publish_new(p,{'private':'data'})])
def test_parent_traversal_rejected_before_mount_or_file_checks(tmp_path,monkeypatch,operation):
    def forbidden(*args):raise AssertionError('drive or file access attempted')
    monkeypatch.setattr(cli,'_windows_drive_type',forbidden)
    monkeypatch.setattr(cli,'_check_path',forbidden)
    with pytest.raises(policy.PacketError,match='LOCAL_FILESYSTEM_REQUIRED'):
        operation(tmp_path/'staging'/'..'/'remote'/'private.json')
