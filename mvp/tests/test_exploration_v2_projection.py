import copy
from uuid import uuid4
import pytest
from mvp.plugin_projection import project_exploration_checkpoint_v2, project_exploration_receipt_v2


def uid(): return str(uuid4())


def sample():
    a,b,ident,event,rid=uid(),uid(),uid(),uid(),uid()
    refs=[dict(asset_id=x,expected_content_hash='a'*64,disposition='selected',reason=None,status='available') for x in (a,b)]
    relation=dict(relation_id=rid,from_asset_id=a,to_asset_id=b,label='related',reason='why')
    value=dict(exploration_id=ident,revision=1,event_id=event,saved_at=1,references=refs,stop_note='note',stop_note_reason=None,snapshot_version=2,relations=[relation],origin=None)
    return {'contract_version':1,'ok':True,'value':value}


def test_valid_projection_and_credential_redaction():
    env=sample(); v=env['value']; v['relations'][0]['reason']='token-secret'
    result=project_exploration_checkpoint_v2(env,v['exploration_id'],1,'token-secret')
    assert result['relations'][0]['reason_code']=='sensitive_content'
    assert 'label' not in result['relations'][0] and 'reason' not in result['relations'][0]


@pytest.mark.parametrize('mutate', [
    lambda v:v.update(snapshot_version=True), lambda v:v.update(extra=1),
    lambda v:v['relations'][0].update(extra='bad'),
    lambda v:v['relations'][0].update(from_asset_id=v['relations'][0]['to_asset_id']),
    lambda v:v['relations'].append(copy.deepcopy(v['relations'][0])),
    lambda v:v['references'][0].update(status='forbidden'),
    lambda v:v.update(snapshot_version=1),
    lambda v:v['relations'][0].pop('reason'),
])
def test_untrusted_shapes_fail_closed(mutate):
    env=sample(); v=env['value']; mutate(v)
    assert project_exploration_checkpoint_v2(env,v['exploration_id'],1,'token')=={'error':'UPSTREAM_ERROR'}


def test_origin_and_opaque_receipt():
    env=sample(); v=env['value']; origin=dict(source_exploration_id=uid(),source_revision=2,source_event_id=uid(),source_snapshot_sha256='b'*64,target_creation_event_id=v['event_id']); v['origin']=origin
    assert project_exploration_checkpoint_v2(env,v['exploration_id'],1,'token')['origin']==origin
    origin['source_event_id']=origin['target_creation_event_id']
    assert project_exploration_checkpoint_v2(env,v['exploration_id'],1,'token')=={'error':'UPSTREAM_ERROR'}
    origin['target_creation_event_id']=uid(); v['revision']=2
    assert project_exploration_checkpoint_v2(env,v['exploration_id'],2,'token')=={'error':'UPSTREAM_ERROR'}
    rec={'contract_version':1,'ok':True,'value':dict(exploration_id=v['exploration_id'],revision=1,event_id=v['event_id'])}
    assert project_exploration_receipt_v2(rec,v['exploration_id'],0,v['event_id'])=={'error':'WRITE_OUTCOME_UNKNOWN'}
