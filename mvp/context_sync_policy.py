"""Draft local context proposal policy; no platform identity or network writes."""
from hashlib import sha256
import hmac
import json
import re
from uuid import uuid4

from mvp.exploration_policy import validate_uuid, validate_revision, validate_text
from mvp.plugin_projection import project_exploration_checkpoint_v2
from mvp.text_policy import has_credential_marker


class PacketError(ValueError):
    pass


VERSION='knot.context-proposal/0.1-draft'
SHARING=dict(purpose='local_export_review',raw_content_included=False,
             public_reuse_allowed=False,completion_verified=False)


def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')


def closed(value,fields):
    if type(value) is not dict or value.keys()!=set(fields): raise PacketError('INVALID_PROPOSAL')


def validate_proposal(value,token=None):
    try:
        closed(value,('version','packet_id','producer','scope','checkpoint','reported_status','summary','evidence','sharing'))
        if value['version']!=VERSION: raise PacketError('INVALID_PROPOSAL')
        validate_uuid(value['packet_id'])
        producer,scope,checkpoint=value['producer'],value['scope'],value['checkpoint']
        closed(producer,('host','instance_id','identity_status'))
        if producer['host']!='codex' or producer['identity_status']!='local_unverified': raise PacketError('INVALID_PROPOSAL')
        validate_uuid(producer['instance_id'])
        closed(scope,('namespace_id','project_id','task_id','binding_status'))
        for field in ('namespace_id','project_id','task_id'): validate_uuid(scope[field])
        if scope['binding_status']!='user_assigned_unverified': raise PacketError('INVALID_PROPOSAL')
        closed(checkpoint,('exploration_id','revision','event_id'))
        validate_uuid(checkpoint['exploration_id']);validate_uuid(checkpoint['event_id'])
        if type(checkpoint['revision']) is not str or not re.fullmatch('[1-9][0-9]{0,18}',checkpoint['revision']): raise PacketError('INVALID_PROPOSAL')
        validate_revision(int(checkpoint['revision']),1)
        if type(value['reported_status']) is not str or value['reported_status'] not in ('in_progress','blocked','ready_for_review','reported_done'): raise PacketError('INVALID_PROPOSAL')
        validate_text(value['summary'],1024)
        if not value['summary'].strip(): raise PacketError('INVALID_PROPOSAL')
        if type(value['evidence']) is not list or len(value['evidence'])>32: raise PacketError('INVALID_PROPOSAL')
        seen=set()
        for ref in value['evidence']:
            closed(ref,('asset_id','content_hash'));validate_uuid(ref['asset_id'])
            if ref['asset_id'] in seen or type(ref['content_hash']) is not str or not re.fullmatch('[0-9a-f]{64}',ref['content_hash']): raise PacketError('INVALID_PROPOSAL')
            seen.add(ref['asset_id'])
        closed(value['sharing'],SHARING)
        if (value['sharing']['purpose']!=SHARING['purpose'] or
                any(value['sharing'][k] is not False for k in SHARING if k!='purpose')): raise PacketError('INVALID_PROPOSAL')
        # All variable strings, including identifiers, pass the finite marker
        # rules. This is not a general secret classifier.
        def scan(item):
            if type(item) is str and has_credential_marker(item,token): raise PacketError('SENSITIVE_CONTENT')
            if type(item) is dict:
                for child in item.values(): scan(child)
            if type(item) is list:
                for child in item: scan(child)
        scan(value)
        canonical(value)
        return value
    except PacketError:
        raise
    except (ValueError,TypeError,KeyError,UnicodeError,RecursionError):
        raise PacketError('INVALID_PROPOSAL') from None


def proposal_digest(proposal,token=None):
    return sha256(canonical(validate_proposal(proposal,token))).hexdigest()


def build_proposal(checkpoint,*,exploration_id,revision,event_id,namespace_id,project_id,
                   task_id,instance_id,reported_status,summary,allow_assets,token):
    try:
        checked=project_exploration_checkpoint_v2({'contract_version':1,'ok':True,'value':checkpoint},exploration_id,revision,token)
        if 'error' in checked or checked['event_id']!=event_id: raise PacketError('CHECKPOINT_MISMATCH')
        if any(r['status']!='available' for r in checked['references']): raise PacketError('ASSET_UNAVAILABLE')
        if type(allow_assets) is not list or len(allow_assets)!=len(set(allow_assets)): raise PacketError('INVALID_SELECTION')
        selected={r['asset_id']:r['expected_content_hash'] for r in checked['references'] if r['disposition']=='selected'}
        if any(aid not in selected for aid in allow_assets): raise PacketError('INVALID_SELECTION')
        proposal=dict(version=VERSION,packet_id=str(uuid4()),
            producer=dict(host='codex',instance_id=instance_id,identity_status='local_unverified'),
            scope=dict(namespace_id=namespace_id,project_id=project_id,task_id=task_id,binding_status='user_assigned_unverified'),
            checkpoint=dict(exploration_id=exploration_id,revision=str(revision),event_id=event_id),
            reported_status=reported_status,summary=summary,
            evidence=[dict(asset_id=aid,content_hash=selected[aid]) for aid in allow_assets],sharing=SHARING.copy())
        return validate_proposal(proposal,token)
    except PacketError: raise
    except (ValueError,TypeError,KeyError): raise PacketError('INVALID_PROPOSAL') from None


def confirmed_packet(proposal,ack_sha256,token=None):
    digest=proposal_digest(proposal,token)
    if type(ack_sha256) is not str or not re.fullmatch('[0-9a-f]{64}',ack_sha256) or not hmac.compare_digest(digest,ack_sha256):
        raise PacketError('ACK_MISMATCH')
    return dict(proposal=proposal,local_confirmation=dict(action='local_export_only',proposal_sha256=digest,actor_verified=False))
