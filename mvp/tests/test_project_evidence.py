"""Exercise the private draft and recipient projection through real HTTP."""
from copy import deepcopy
import sqlite3
from uuid import uuid4

import pytest

from mvp.devtools import workbench
from test_project_http import body, call, counts, env


PREFIX = '/api/project-evidence-'


def seed(port):
    first = body('活动报名工具 · 样例', '报名表支持导出 CSV。现场验证通过。')
    first['documents'].append(dict(title='private.txt', text='INTERNAL-ONLY 复用讨论'))
    assert call(port, '/api/project-import', first, broker=True)[0] == 200
    path = '/api/project?project_id=' + first['project_id']
    scene = call(port, path)[1]
    ref1, ref2 = [{key: item[key] for key in ('asset_id', 'content_hash')}
                  for item in scene['materials']]
    draft = {key: scene[key] for key in ('project_id', 'revision', 'manifest_hash')}
    draft['demand'] = dict(title='社区活动报名页', deliverable='可导出报名名单',
        criteria='后台导出 CSV，保留表头', reference='SAMPLE-01', sample=True)
    draft['items'] = [
        dict(**ref1, criterion='导出名单', contribution='我实现了 CSV 导出',
            status='documented', quote='报名表支持导出 CSV。', link='https://portfolio.example.org/project'),
        dict(**ref2, criterion='后续协作', contribution='不可公开的协作细节',
            status='pending', quote='INTERNAL-ONLY', link=''),
    ]
    draft.update(gaps='实际数据规模待确认', approved=[])
    return first, draft


def test_only_selected_content_leaves_and_confirmation_binds_every_field(env):
    db, _, port = env
    _, draft = seed(port)
    before = counts(db)
    status, result, _ = call(port, PREFIX+'prepare', draft, broker=True)
    assert status == 200 and result['card']['items'] == []
    assert call(port, PREFIX+'share', draft | dict(digest=result['digest']), broker=True)[0] == 400
    draft['approved'] = [dict(index=0, quote=True, link=False)]
    status, result, _ = call(port, PREFIX+'prepare', draft, broker=True)
    assert status == 200 and result['card']['items'][0]['link'] == ''
    fixed = draft | dict(digest=result['digest'])
    status, shared, raw = call(port, PREFIX+'share', fixed, broker=True)
    assert status == 200 and shared['card'] == result['card']
    assert '样例' in shared['markdown'] and '本人做过的相关工作' in shared['markdown']
    for forbidden in ('INTERNAL-ONLY', 'portfolio.example.org', '不可公开的协作细节',
                      draft['project_id'], *[item['asset_id'] for item in draft['items']]):
        assert forbidden.encode() not in raw
    changed = deepcopy(fixed)
    changed['approved'][0]['link'] = True
    assert call(port, PREFIX+'share', changed, broker=True)[0] == 400
    changed = deepcopy(fixed)
    changed['demand']['criteria'] += '，并符合数据保留要求'
    assert call(port, PREFIX+'share', changed, broker=True)[0] == 400
    assert counts(db) == before


def test_agent_prompt_reads_only_selected_sources_and_checks_project_membership(env):
    db, _, port = env
    _, draft = seed(port)
    before = counts(db)
    prompt = {key: draft[key] for key in ('project_id', 'revision', 'manifest_hash', 'demand')}
    prompt['sources'] = [{key: draft['items'][0][key] for key in ('asset_id', 'content_hash')}]
    status, result, _ = call(port, PREFIX+'prompt', prompt, broker=True)
    assert status == 200
    assert '报名表支持导出 CSV。' in result['prompt'] and 'INTERNAL-ONLY' not in result['prompt']
    assert '不要把计划或自述当作交付或验收' in result['prompt']
    other = body('Other project', 'Source only available in other project')
    assert call(port, '/api/project-import', other, broker=True)[0] == 200
    other_ref = call(port, '/api/project?project_id='+other['project_id'])[1]['materials'][0]
    prompt['sources'] = [{key: other_ref[key] for key in ('asset_id', 'content_hash')}]
    assert call(port, PREFIX+'prompt', prompt, broker=True)[0] == 403
    assert counts(db) == tuple(value+2 for value in before)


def test_share_rechecks_live_grant_and_version(env):
    db, _, port = env
    origin, draft = seed(port)
    draft['approved'] = [dict(index=0, quote=True, link=False)]
    _, ready, _ = call(port, PREFIX+'prepare', draft, broker=True)
    fixed = draft | dict(digest=ready['digest'])
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=? AND actor=?', (draft['items'][0]['asset_id'], 'A'))
    assert call(port, PREFIX+'share', fixed, broker=True)[0] == 403
    with sqlite3.connect(db) as conn:
        conn.execute('INSERT INTO asset_readers (asset_id, actor) VALUES (?, ?)', (draft['items'][0]['asset_id'], 'A'))
    update = origin | dict(expected_revision=draft['revision'], request_id=str(uuid4()),
                           documents=[dict(title='progress.md', text='New version')])
    assert call(port, '/api/project-import', update, broker=True)[0] == 200
    assert call(port, PREFIX+'share', fixed, broker=True)[0] == 409


def test_share_detects_version_change_during_material_read(env, monkeypatch):
    _, _, port = env
    origin, draft = seed(port)
    draft['approved'] = [dict(index=0, quote=True, link=False)]
    _, ready, _ = call(port, PREFIX+'prepare', draft, broker=True)
    update = origin | dict(expected_revision=draft['revision'], request_id=str(uuid4()),
                           documents=[dict(title='progress.md', text='Concurrent version')])
    original = workbench.project_get
    updated = False

    def project_get(backend, token, action, args):
        nonlocal updated
        result = original(backend, token, action, args)
        if action == 'material' and not updated:
            updated = True
            assert call(port, '/api/project-import', update, broker=True)[0] == 200
        return result

    monkeypatch.setattr(workbench, 'project_get', project_get)
    assert call(port, PREFIX+'share', draft | dict(digest=ready['digest']), broker=True)[0] == 409
    assert updated


def test_developer_link_supplements_a_verified_excerpt(env):
    _, _, port = env
    _, draft = seed(port)
    draft['approved'] = [dict(index=0, quote=False, link=True)]
    status, ready, _ = call(port, PREFIX+'prepare', draft, broker=True)
    assert status == 200 and ready['card']['items'][0]['link']
    assert call(port, PREFIX+'share', draft | dict(digest=ready['digest']), broker=True)[0] == 400
    draft['approved'][0]['quote'] = True
    _, ready, _ = call(port, PREFIX+'prepare', draft, broker=True)
    status, shared, _ = call(port, PREFIX+'share', draft | dict(digest=ready['digest']), broker=True)
    assert status == 200 and '开发者提供的成品链接' in shared['markdown']


@pytest.mark.parametrize('url', [
    'https://portfolio.example.org/project?source=../drafts/notes.txt',
    'https://portfolio.example.org/project?source=%2E%2E%2Fdrafts%2Fnotes.txt',
    'https://portfolio.example.org/project#src/private.py',
])
def test_selected_link_cannot_include_a_private_location(env, url):
    _, _, port = env
    _, draft = seed(port)
    draft['items'][0]['link'] = url
    draft['approved'] = [dict(index=0, quote=True, link=True)]
    assert call(port, PREFIX+'prepare', draft, broker=True)[0] == 400
    draft['approved'][0]['link'] = False
    assert call(port, PREFIX+'prepare', draft, broker=True)[0] == 200


@pytest.mark.parametrize(('change', 'status'), [
    (lambda draft: draft['items'][0].update(quote='未出现的摘录'), 400),
    (lambda draft: draft['items'][0].update(link='http://127.0.0.1/private'), 400),
    (lambda draft: draft['items'][0].update(contribution='查看 C:/Users/Someone/secret.txt'), 400),
    (lambda draft: draft['items'][0].update(contribution='查看 ../drafts/notes.txt'), 400),
    (lambda draft: draft['items'][0].update(contribution='查看 src/private.py'), 400),
    (lambda draft: draft['items'][0].update(contribution=draft['project_id']), 400),
    (lambda draft: draft['approved'][0].update(index=True), 400),
])
def test_invalid_proof_does_not_produce_an_exportable_card(env, change, status):
    db, _, port = env
    _, draft = seed(port)
    draft['approved'] = [dict(index=0, quote=True, link=False)]
    before = counts(db)
    change(draft)
    assert call(port, PREFIX+'prepare', draft, broker=True)[0] == status
    assert call(port, PREFIX+'prepare', draft)[0] == 403
    assert counts(db) == before
