"""Resolve an explicitly installed association from retained project evidence."""
from mvp import decision_policy as decision
from mvp.project_policy import ProjectError, revision


def association_aliases(record, read_scene):
    """An association changes navigation/capture, never old identities or history."""
    try:
        decision.closed(record, {'version', 'canonical_project_id', 'source_projects', 'basis'})
        if record['version']!='knot.project-association/0.1':
            raise ProjectError('INVALID_ARGUMENTS')
        target=record['canonical_project_id'];decision.uuid(target)
        scene=read_scene(target,None)
        basis=record['basis']
        decision.closed(basis,{'asset_id','content_hash','quote'})
        decision.uuid(basis['asset_id']);decision.content_hash(basis['content_hash'])
        decision.text(basis['quote'],2048,nonempty=True)
        if not any(source['asset_id']==basis['asset_id'] and source['content_hash']==basis['content_hash']
                   and basis['quote'] in source['text'] for source in scene.get('observations',[])):
            raise ProjectError('CONTENT_MISMATCH')
        origins=record['source_projects']
        if type(origins) is not list or not 1<=len(origins)<=8:
            raise ProjectError('INVALID_ARGUMENTS')
        members={(ref['asset_id'],ref['content_hash']) for ref in scene['materials']}
        aliases={}
        for origin in origins:
            decision.closed(origin,{'project_id','revision','manifest_hash'})
            pid=origin['project_id'];decision.uuid(pid);revision(origin['revision'])
            decision.content_hash(origin['manifest_hash'])
            if pid==target or pid in aliases:
                raise ProjectError('INVALID_ARGUMENTS')
            source=read_scene(pid,origin['revision'])
            if source['manifest_hash']!=origin['manifest_hash'] or source['has_unavailable']:
                raise ProjectError('CONTENT_MISMATCH')
            if any((ref['asset_id'],ref['content_hash']) not in members for ref in source['materials']):
                raise ProjectError('CONTENT_MISMATCH')
            aliases[pid]=target
        return aliases
    except decision.DecisionError as exc:
        raise ProjectError(exc.code) from None


def associated_listing(value, aliases):
    """Fold an origin only when its authorized canonical project is visible."""
    visible={item['project_id'] for item in value['items']}
    return value|dict(items=[item for item in value['items']
        if aliases.get(item['project_id']) not in visible])
