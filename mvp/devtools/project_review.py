"""Read-only, source-bound project prompts and review document preparation."""
from mvp import decision_policy as decision
from mvp import project_policy as policy
from mvp.project_review_prompt import (
    BINDING, SECTIONS, VERSION, _convert, _response, build_prompt, validate_binding,
)


class _Read:
    """One aggregate budget and cache across independently bounded source calls."""
    def __init__(self, binding, token, read_scene, read_material):
        self.binding, self.token, self.read_material = binding, token, read_material
        self.remaining, self.cache = policy.MAX_READ_BYTES, {}
        scene = read_scene(binding['project_id'], binding['revision'])
        self.charge(scene)
        self.scene = policy.project_response('scene', scene, token,
            project_id=binding['project_id'], revision=binding['revision'])
        if self.scene['manifest_hash'] != binding['manifest_hash']:
            raise policy.ProjectError('CONTENT_MISMATCH')
        self.members = {(r['asset_id'], r['content_hash']): r for r in self.scene['materials']}

    def charge(self, value):
        self.remaining -= len(decision.canonical(value))
        if self.remaining < 0:
            raise policy.ProjectError('RESPONSE_LIMIT')

    def source(self, ref):
        key = (ref['asset_id'], ref['content_hash'])
        if key not in self.members:
            raise policy.ProjectError('ACCESS_DENIED')
        if key not in self.cache:
            b = self.binding
            material = self.read_material(b['project_id'], b['revision'], *key)
            self.charge(material)
            material = policy.project_response('material', material, self.token,
                project_id=b['project_id'], revision=b['revision'],
                asset_id=key[0], expected_hash=key[1])
            if material['title'] != self.members[key]['title']:
                raise policy.ProjectError('CONTENT_MISMATCH')
            if 'source' not in material:
                raise policy.ProjectError('READ_UNAVAILABLE')
            self.cache[key] = material['source']
        return self.cache[key]


def prepare_prompt(body, token, read_scene, read_material):
    try:
        binding = validate_binding(body, token)
        reader = _Read(binding, token, read_scene, read_material)
        return build_prompt(binding, token, reader.scene, reader.source)
    except decision.DecisionError as exc:
        raise _convert(exc) from None

def _evidence(refs, minimum=0):
    if type(refs) is not list or not minimum <= len(refs) <= 4:
        raise policy.ProjectError('INVALID_ARGUMENTS')
    for ref in refs:
        decision.closed(ref, {'asset_id', 'content_hash', 'quote'})
        decision.uuid(ref['asset_id'])
        decision.content_hash(ref['content_hash'])
        decision.text(ref['quote'], 2048, nonempty=True)


def prepare_review(body, token, read_scene, read_material):
    try:
        decision.closed(body, set(BINDING) | {'version', 'milestones', 'gaps'} | {k for k, _ in SECTIONS})
        binding = validate_binding({key: body[key] for key in BINDING}, token)
        if body['version'] != VERSION:
            raise policy.ProjectError('INVALID_ARGUMENTS')
        for key, _ in SECTIONS:
            decision.closed(body[key], {'summary', 'evidence'})
            decision.text(body[key]['summary'], 8192, nonempty=True)
            _evidence(body[key]['evidence'])
        if type(body['milestones']) is not list or len(body['milestones']) > 12:
            raise policy.ProjectError('INVALID_ARGUMENTS')
        ids = set()
        for milestone in body['milestones']:
            decision.closed(milestone, {'id', 'title', 'summary', 'on', 'evidence'})
            for key, limit in (('id', 80), ('title', 256), ('summary', 8192)):
                decision.text(milestone[key], limit, nonempty=True)
            if milestone['id'] in ids:
                raise policy.ProjectError('INVALID_ARGUMENTS')
            ids.add(milestone['id'])
            decision.day(milestone['on'])
            _evidence(milestone['evidence'], 1)
        if type(body['gaps']) is not list or len(body['gaps']) > 12:
            raise policy.ProjectError('INVALID_ARGUMENTS')
        for gap in body['gaps']:
            decision.text(gap, 1024, nonempty=True)
        decision.sensitive(body, token)
        text = decision.canonical(body).decode('utf-8')
        if len(text.encode('utf-8')) > policy.MAX_DOCUMENT_BYTES:
            raise policy.ProjectError('RESPONSE_LIMIT')
        reader = _Read(binding, token, read_scene, read_material)

        def verify(item):
            days = set()
            for ref in item['evidence']:
                source = reader.source(ref)
                if ref['quote'] not in source['text']:
                    raise policy.ProjectError('CONTENT_MISMATCH')
                if source['message_time_ms'] is not None:
                    days.add(decision.message_day(source['message_time_ms']))
                if source['document_on'] is not None:
                    days.add(source['document_on'])
                # A retained connector index has a turn-time basis, explicitly
                # separate from a user's unavailable independent message time.
                if source['kind']=='document' and source['title'].startswith('历史窗口日回顾索引·'):
                    try:
                        record=decision.decode_json(source['text'].encode('utf-8'))
                        if (type(record) is dict and record.get('version')=='knot.history-window-days/0.1'
                                and record.get('project_id')==binding['project_id']
                                and type(record.get('days')) is list and len(record['days'])<=366):
                            for day in record['days']:
                                for window in day.get('windows',[]):
                                    for excerpt in window.get('excerpts',[]):
                                        if (excerpt.get('time_basis')=='turn_started_at'
                                                and decision.canonical(excerpt).decode('utf-8') in ref['quote']
                                                and decision.message_day(excerpt.get('turn_time_ms'))==day.get('on')):
                                            days.add(day['on'])
                    except (decision.DecisionError,AttributeError,TypeError):
                        pass
            if item.get('on') is not None and item['on'] not in days:
                raise policy.ProjectError('CONTENT_MISMATCH')

        for key, _ in SECTIONS:
            verify(body[key])
        for milestone in body['milestones']:
            verify(milestone)
        lines = ['# ' + reader.scene['title'] + ' · 项目主动回顾', '',
                 'Agent 概括，待人核对。出处校验仅检查项目成员、当前可读来源、hash 和原话对应；不认证摘要语义事实，不产生用户确认。',
                 '项目：' + binding['project_id'] + ' · 版本：' + binding['revision'],
                 'Manifest：' + binding['manifest_hash']]

        def render(label, item):
            lines.extend(['', '## ' + label, '', item['summary']])
            if not item['evidence']:
                lines.extend(['', '无出处待核：本段没有证据，不作为完成证明。'])
            for ref in item['evidence']:
                source = reader.source(ref)
                lines.extend(['', '出处：' + source['title'],
                              '材料：' + ref['asset_id'] + ' · ' + ref['content_hash'],
                              '\n'.join('> ' + line for line in ref['quote'].split('\n'))])

        for key, label in SECTIONS[:2]:
            render(label, body[key])
        lines.extend(['', '## 里程碑'])
        if not body['milestones']:
            lines.append('尚无有出处的里程碑。')
        for milestone in body['milestones']:
            render(milestone['title'] + ' · ' + (milestone['on'] or '日期未知'), milestone)
        for key, label in SECTIONS[2:]:
            render(label, body[key])
        lines.extend(['', '## 缺口与待核问题', ''])
        lines.extend(['- ' + gap for gap in body['gaps']] or ['尚未列出；不表示没有缺口。'])
        return _response(dict(**binding, document=dict(title='项目主动回顾.json', text=text),
                              human_view='\n'.join(lines) + '\n'), token)
    except decision.DecisionError as exc:
        raise _convert(exc) from None
