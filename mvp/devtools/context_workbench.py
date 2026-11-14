"""Local workbench adapter for reviewed context proposal/export primitives."""
import json
from pathlib import Path
import re
import threading

from mvp.context_sync_policy import (PacketError,build_proposal,proposal_digest,
                                     confirmed_packet,canonical,closed)
from mvp.exploration_policy import validate_uuid,validate_revision,strict_json
from mvp.devtools.context_packet import local_path,publish_new,read_private_input
from mvp.devtools.workbench_write import _check_path


class ContextWorkbench:
    def __init__(self,root,token,read_checkpoint):
        self.root=local_path(root)
        _check_path(self.root)
        repo=Path(__file__).resolve().parents[2]
        try:
            self.root.relative_to(repo)
        except ValueError:
            pass
        else:
            raise PacketError('PACKET_ROOT_IN_REPOSITORY')
        if not self.root.is_dir(): raise PacketError('PACKET_ROOT_REQUIRED')
        self.token,self.read_checkpoint=token,read_checkpoint
        self.lock=threading.RLock()

    def prepare(self,body):
        closed(body,('exploration_id','revision','event_id','namespace_id','project_id',
                     'task_id','instance_id','reported_status','summary','allow_assets'))
        for key in ('exploration_id','event_id','namespace_id','project_id','task_id','instance_id'):
            validate_uuid(body[key])
        if type(body['revision']) is not str or not re.fullmatch('[1-9][0-9]{0,18}',body['revision']):
            raise PacketError('INVALID_PROPOSAL')
        revision=int(body['revision']);validate_revision(revision,1)
        with self.lock:
            try:
                checkpoint=self.read_checkpoint(body['exploration_id'],body['revision'])
            except Exception:
                raise PacketError('CHECKPOINT_UNAVAILABLE') from None
            proposal=build_proposal(checkpoint,exploration_id=body['exploration_id'],revision=revision,
                event_id=body['event_id'],namespace_id=body['namespace_id'],project_id=body['project_id'],
                task_id=body['task_id'],instance_id=body['instance_id'],reported_status=body['reported_status'],
                summary=body['summary'],allow_assets=body['allow_assets'],token=self.token)
            digest=proposal_digest(proposal,self.token)
            publish_new(self.root/(proposal['packet_id']+'.preview.json'),proposal)
            return dict(phase='prepared',packet_id=proposal['packet_id'],digest=digest,proposal=proposal)

    def export(self,body):
        closed(body,('packet_id','digest'));validate_uuid(body['packet_id'])
        with self.lock:
            proposal=strict_json(read_private_input(self.root/(body['packet_id']+'.preview.json')))
            if type(proposal) is not dict or proposal.get('packet_id')!=body['packet_id']:
                raise PacketError('PACKET_MISMATCH')
            packet=confirmed_packet(proposal,body['digest'],self.token)
            filename=body['packet_id']+'.packet.json'
            existing=False
            try:
                publish_new(self.root/filename,packet)
            except FileExistsError:
                # Full canonical comparison distinguishes false from zero and
                # rejects extra fields, altered targets, and altered receipts.
                saved=strict_json(read_private_input(self.root/filename))
                if canonical(saved)!=canonical(packet): raise PacketError('OUTPUT_CONFLICT')
                existing=True
            return dict(phase='exported_locally',packet_id=body['packet_id'],digest=body['digest'],
                        filename=filename,uploaded=False,existing=existing)
