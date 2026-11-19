"""Prepare Markdown for resuming an authorized project in another window."""

from hashlib import sha256
from hmac import compare_digest
import re

from mvp import decision_policy as decision
from mvp import project_policy as policy
from mvp.devtools.project_review import BINDING, _Read, _convert, _response, prepare_review, validate_binding


REVIEW_TITLE = '项目主动回顾.json'
MAX_SOURCES = 6
EXCERPT_BYTES = 4096
FIELDS = (*BINDING, 'sources', 'include_review', 'include_gaps')
MARKDOWN = re.compile(r'([\\`*_{}\[\]()#+.!|>~<\-])')


def selectable(title):
    return (title not in (REVIEW_TITLE, 'project-registration.json', '项目关联.json')
            and not title.startswith('历史窗口日回顾索引·'))


def literal(value):
    return MARKDOWN.sub(r'\\\1', value)


def _current(binding, read_scene):
    scene = read_scene(binding['project_id'], None)
    if any(scene[key] != binding[key] for key in BINDING):
        raise policy.ProjectError('REVISION_CONFLICT')
    return scene


def _saved_review(reader, token, read_scene, read_material):
    ref = next((ref for ref in reversed(reader.scene['materials']) if ref['title'] == REVIEW_TITLE), None)
    if ref is None:
        return None, None, 'missing'
    try:
        source = reader.source(ref)
        review = decision.decode_json(source['text'].encode('utf-8'))
        if not isinstance(review, dict) or review.get('project_id') != reader.binding['project_id']:
            return None, None, 'unavailable'
        prepare_review(review, token, read_scene, read_material)
        parts = [review[key] for key in ('origin', 'current', 'completed', 'blocked', 'next')]
        anchors = {(item['asset_id'], item['content_hash'])
                   for part in parts + review['milestones'] for item in part['evidence']}
        if not anchors <= reader.members.keys():
            return None, None, 'unavailable'
        anchors.add((ref['asset_id'], ref['content_hash']))
        return review, anchors, 'verified'
    except (policy.ProjectError, decision.DecisionError):
        return None, None, 'unavailable'


def _summary(lines, review, include_gaps, state, members):
    if review is None:
        if state == 'missing':
            lines.extend(['', '项目回顾尚未保存。以下所选材料供下一窗口接续时查阅。'])
        elif state == 'unavailable':
            lines.extend(['', '项目回顾暂时无法核对出处。请从所选材料重新核对进展。'])
        return
    lines.extend(['', '已保存的项目回顾依据留存版本 ' + review['revision'] + '。概括仍待核对。'])
    for key, label in (('current', '现在在做什么'), ('completed', '完成了什么'),
                       ('blocked', '卡在哪里'), ('next', '下次接着做什么')):
        item = review[key]
        lines.extend(['', '## ' + label, '', literal(item['summary'])])
        if not item['evidence']:
            lines.extend(['', '本项暂无可核出处。'])
        else:
            refs = dict.fromkeys((ref['asset_id'], ref['content_hash']) for ref in item['evidence'])
            lines.extend(['', '出处'])
            lines.extend('- ' + literal(members[ref]['title']) + ' · `' + ref[0] + '`' for ref in refs)
    if include_gaps and review['gaps']:
        lines.extend(['', '## 待核问题', ''])
        lines.extend('- ' + literal(gap).replace('\n', '\n  ') for gap in review['gaps'])


def prepare(body, token, read_scene, read_material, *, export=False):
    try:
        decision.closed(body, (*FIELDS, 'digest') if export else FIELDS)
        decision.sensitive(body, token)
        binding = validate_binding({key: body[key] for key in BINDING}, token)
        if any(type(body[key]) is not bool for key in ('include_review', 'include_gaps')):
            raise decision.DecisionError('INVALID_ARGUMENTS')
        refs = body['sources']
        if type(refs) is not list or len(refs) > MAX_SOURCES:
            raise decision.DecisionError('INVALID_ARGUMENTS')
        scene = _current(binding, read_scene)
        reader = _Read(binding, token, lambda *_: scene, read_material)
        lines = ['# ' + literal(scene['title']) + ' · 项目续接包', '',
                 '项目留存版本 ' + binding['revision']]
        review, required, state = (None, None, 'excluded')
        if body['include_review']:
            review, required, state = _saved_review(reader, token, read_scene, read_material)
        if not refs and review is None:
            raise policy.ProjectError('READ_UNAVAILABLE')
        _summary(lines, review, body['include_gaps'], state, reader.members)
        if refs:
            lines.extend(['', '## 所选项目材料'])
        seen = set()
        for ref in refs:
            decision.closed(ref, ('asset_id', 'content_hash'))
            decision.uuid(ref['asset_id'])
            decision.content_hash(ref['content_hash'])
            key = (ref['asset_id'], ref['content_hash'])
            if key in seen:
                raise decision.DecisionError('INVALID_ARGUMENTS')
            seen.add(key)
            source = reader.source(ref)
            if not selectable(source['title']):
                raise policy.ProjectError('INVALID_ARGUMENTS')
            data = source['text'].encode('utf-8')
            excerpt = data[:EXCERPT_BYTES].decode('utf-8', errors='ignore')
            label = ' · 原文摘录' if len(data) > EXCERPT_BYTES else ''
            day = decision.message_day(source['message_time_ms']) if source['message_time_ms'] is not None else source['document_on']
            lines.extend(['', '### ' + literal(source['title']) + label])
            if day:
                lines.append('日期 ' + day)
            lines.append('来源编号 `' + key[0] + '`')
            fence = '~' * max(3, 1 + max((len(run) for run in re.findall(r'~+', excerpt)), default=0))
            lines.extend(['', fence, excerpt, fence])
        markdown = '\n'.join(lines) + '\n'
        value = dict(**binding, markdown=markdown, source_count=len(seen), review_state=state)
        digest = sha256(decision.canonical({key: body[key] for key in FIELDS} | value)).hexdigest()
        if export:
            decision.content_hash(body['digest'])
            if not compare_digest(digest, body['digest']):
                raise policy.ProjectError('CONTENT_MISMATCH')
            latest = _current(binding, read_scene)
            available = {(ref['asset_id'], ref['content_hash']) for ref in latest['materials']}
            if not (seen | (required or set())) <= available:
                raise policy.ProjectError('ACCESS_DENIED')
        return _response(value | {'digest': digest}, token)
    except decision.DecisionError as exc:
        raise _convert(exc) from None
