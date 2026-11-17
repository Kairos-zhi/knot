"""Prepare a source-bound work review without writing project state."""
from mvp import decision_policy as decision
from mvp.project_policy import ProjectError, revision


def prepare_review(body, token, read_scene, read_material):
    try:
        decision.closed(body, {'project_id', 'revision', 'manifest_hash', 'day',
                              'completed', 'blocked', 'next', 'evidence'})
        decision.uuid(body['project_id'])
        revision(body['revision'])
        decision.content_hash(body['manifest_hash'])
        if body['day'] is None:
            raise ProjectError('INVALID_ARGUMENTS')
        decision.day(body['day'])
        for key in ('completed', 'blocked', 'next'):
            decision.text(body[key], 8192)
        if not any(body[key].strip() for key in ('completed', 'blocked', 'next')):
            raise ProjectError('INVALID_ARGUMENTS')
        evidence = body['evidence']
        if type(evidence) is not list or len(evidence) > 8:
            raise ProjectError('INVALID_ARGUMENTS')
        for ref in evidence:
            decision.closed(ref, {'asset_id', 'content_hash', 'quote'})
            decision.uuid(ref['asset_id'])
            decision.content_hash(ref['content_hash'])
            decision.text(ref['quote'], 2048, nonempty=True)
        decision.sensitive(body, token)
        scene = read_scene(body['project_id'], body['revision'])
        if any(scene[key] != body[key] for key in ('project_id', 'revision', 'manifest_hash')):
            raise ProjectError('CONTENT_MISMATCH')
        members = {(ref['asset_id'], ref['content_hash']) for ref in scene['materials']}
        lines = ['# '+scene['title']+' · 工作回顾', '', '日期：'+body['day'], '',
                 '工作整理，待本人检查；所附原话用于追溯，不代表每项工作已核验。']
        for key, label in (('completed', '今天完成了什么'), ('blocked', '卡在哪里'),
                           ('next', '下次接着做什么')):
            lines.extend(['', '## '+label, '', body[key] if body[key].strip() else '尚未记录'])
        if evidence:
            lines.extend(['', '## 出处'])
        for ref in evidence:
            if (ref['asset_id'], ref['content_hash']) not in members:
                raise ProjectError('ACCESS_DENIED')
            material = read_material(body['project_id'], body['revision'],
                                     ref['asset_id'], ref['content_hash'])
            if (material['project_id'] != body['project_id']
                    or material['revision'] != body['revision']
                    or material['asset_id'] != ref['asset_id']
                    or material['content_hash'] != ref['content_hash']
                    or ref['quote'] not in material['text']):
                raise ProjectError('CONTENT_MISMATCH')
            lines.extend(['', '### '+material['title'], '',
                          '材料：'+ref['asset_id']+' · '+ref['content_hash'], '',
                          '\n'.join('> '+line for line in ref['quote'].split('\n'))])
        document = dict(title=body['day']+' 工作回顾.md', text='\n'.join(lines)+'\n')
        decision.text(document['text'], 65536)
        result = {key: body[key] for key in ('project_id', 'revision', 'manifest_hash')}
        result['document'] = document
        decision.sensitive(result, token)
        return result
    except decision.DecisionError as exc:
        raise ProjectError(exc.code) from None
