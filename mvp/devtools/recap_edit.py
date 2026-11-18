"""Read-only preparation of a revision to one sourced personal recap item."""
from copy import deepcopy
from mvp import decision_policy as decision
from mvp import project_policy as policy


def prepare_recap(body,token,read_scene,read_material):
    try:
        decision.closed(body,{'project_id','revision','manifest_hash','item_id','title','after','note'})
        decision.uuid(body['project_id']);policy.revision(body['revision'])
        decision.content_hash(body['manifest_hash'])
        decision.text(body['item_id'],80,nonempty=True)
        decision.text(body['title'],256,nonempty=True)
        decision.text(body['after'],2048);decision.text(body['note'],1024)
        decision.sensitive(body,token)
        scene=read_scene(body['project_id'],body['revision'])
        scene=policy.project_response('scene',scene,token,project_id=body['project_id'],revision=body['revision'])
        if scene['manifest_hash']!=body['manifest_hash']:
            raise policy.ProjectError('CONTENT_MISMATCH')
        archive=scene['decisions']
        if scene['has_unavailable'] or archive and archive['has_unavailable']:
            raise policy.ProjectError('ACCESS_DENIED')
        original=next((item for item in (archive or {}).get('items',[]) if item['id']==body['item_id']),None)
        if original is None:raise policy.ProjectError('NOT_FOUND')
        if original['kind']=='document_plan':raise policy.ProjectError('INVALID_ARGUMENTS')
        after=body['after'] if body['after'].strip() else None
        if body['title']==original['title'] and after==original['after'] and not body['note'].strip():
            raise policy.ProjectError('INVALID_ARGUMENTS')
        sources={};items=[]
        for item in archive['items']:
            entry=deepcopy(item);evidence=[]
            for ref in item['evidence']:
                key=ref['asset_id']
                if key not in sources:
                    material=read_material(body['project_id'],body['revision'],ref['asset_id'],ref['content_hash'])
                    material=policy.project_response('material',material,token,project_id=body['project_id'],
                        revision=body['revision'],asset_id=ref['asset_id'],expected_hash=ref['content_hash'])
                    if 'source' not in material:raise policy.ProjectError('READ_UNAVAILABLE')
                    sources[key]=material['source']
                decision.validate_evidence(item,ref,sources[key])
                evidence.append(dict(source_key=key,quote=ref['quote']))
            entry['evidence']=evidence
            if entry['id']==body['item_id']:
                entry['title']=body['title'];entry['after']=after
                if body['note'].strip():
                    entry['caution']=(entry['caution']+'\n' if entry['caution'] else '')+'本次整理备注：'+body['note']
            items.append(entry)
        package=dict(version=decision.IMPORT_VERSION,sources=sources,archive=dict(
            version=decision.ARCHIVE_VERSION,title=archive['title'],method='curated_recap',items=items))
        package=decision.validate_package(package,token)
        policy.validate_import(dict(project_id=scene['project_id'],title=scene['title'],expected_revision=scene['revision'],
            request_id='00000000-0000-4000-8000-000000000000',documents=[],archive_ref=None,recap=package),token)
        result={key:scene[key] for key in ('project_id','revision','manifest_hash')}
        result['recap']=package
        decision.sensitive(result,token);decision.check_response_limit(result)
        return result
    except decision.DecisionError as exc:
        raise policy.ProjectError(exc.code) from None
