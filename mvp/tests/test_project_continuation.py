"""Read-only continuation preview and export through the running broker."""

import sqlite3
from uuid import uuid4

from mvp.devtools.project_review import BINDING
from test_project_http import body, call, counts, env
from test_project_review import package, seed


PREVIEW = '/api/project-continuation'
EXPORT = '/api/project-continuation-export'


def refs(*sources):
    return [{key: source[key] for key in ('asset_id', 'content_hash')} for source in sources]


def options(scene, sources, *, review=True, gaps=True):
    return {key: scene[key] for key in BINDING} | dict(
        sources=sources, include_review=review, include_gaps=gaps)


def save_review(ui, imported, scene, binding):
    draft = package(binding, scene['materials'])
    draft['milestones'][0]['on'] = None
    status, saved, _ = call(ui, '/api/project-review-prepare', draft, broker=True)
    assert status == 200
    update = imported | dict(expected_revision=scene['revision'], request_id=str(uuid4()),
                             documents=[saved['document']])
    assert call(ui, '/api/project-import', update, broker=True)[0] == 200
    return call(ui, '/api/project?project_id=' + binding['project_id'])[1]


def test_preview_export_checked_saved_review_and_only_explicit_sources(env):
    db, _, ui = env
    imported, scene, binding = seed(ui)
    latest = save_review(ui, imported, scene, binding)
    selection = options(latest, refs(scene['materials'][0]))
    before = counts(db)
    status, preview, _ = call(ui, PREVIEW, selection, broker=True)
    assert status == 200 and preview['review_state'] == 'verified'
    for label in ('现在在做什么', '完成了什么', '卡在哪里', '下次接着做什么', '待核问题', '所选项目材料'):
        assert '## ' + label in preview['markdown']
    assert 'Synthetic exact source quotation' in preview['markdown']
    assert 'manifest_hash' not in preview['markdown']
    export = selection | dict(digest=preview['digest'])
    assert call(ui, EXPORT, export, broker=True)[:2] == (200, preview)
    assert call(ui, EXPORT, export | dict(include_gaps=False), broker=True)[:2] == (
        400, {'error': 'CONTENT_MISMATCH'})
    status, summary, _ = call(ui, PREVIEW, options(latest, [], gaps=False), broker=True)
    assert status == 200 and '待核问题' not in summary['markdown']
    assert 'Synthetic exact source quotation' not in summary['markdown']
    assert counts(db) == before


def test_latest_revision_and_authorized_selection_checked_again_on_export(env):
    db, _, ui = env
    imported, scene, binding = seed(ui)
    latest = save_review(ui, imported, scene, binding)
    source = scene['materials'][0]
    selection = options(latest, refs(source))
    preview = call(ui, PREVIEW, selection, broker=True)[1]
    assert call(ui, PREVIEW, options(scene, refs(source)), broker=True)[:2] == (
        409, {'error': 'REVISION_CONFLICT'})
    foreign = body('Synthetic beta')
    assert call(ui, '/api/project-import', foreign, broker=True)[0] == 200
    other = call(ui, '/api/project?project_id='+foreign['project_id'])[1]
    assert call(ui, PREVIEW, options(latest, refs(other['materials'][0])), broker=True)[0] == 403
    assert call(ui, PREVIEW, selection)[0] == 403
    export = selection | dict(digest=preview['digest'])
    with sqlite3.connect(db) as conn:
        conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (source['asset_id'],))
    before = counts(db)
    assert call(ui, EXPORT, export, broker=True)[:2] == (403, {'error': 'ACCESS_DENIED'})
    assert call(ui, PREVIEW, options(latest, []), broker=True)[0] != 200
    assert counts(db) == before


def test_raw_material_fallback_utf8_excerpt_and_markdown_literal(env):
    _, _, ui = env
    original = '<img src=x>\npip install -e .\n~~~\n' + '字'*1500 + '\nend of raw text'
    imported = body(text=original)
    assert call(ui, '/api/project-import', imported, broker=True)[0] == 200
    scene = call(ui, '/api/project?project_id=' + imported['project_id'])[1]
    status, preview, _ = call(ui, PREVIEW, options(scene, refs(*scene['materials'])), broker=True)
    assert status == 200 and preview['review_state'] == 'missing'
    markdown = preview['markdown']
    assert '原文摘录' in markdown and '项目回顾尚未保存' in markdown
    assert '\n~~~~\n<img src=x>\npip install -e .\n~~~\n' in markdown
    assert markdown.endswith('\n~~~~\n') and scene['materials'][0]['asset_id'] in markdown
    assert 'end of raw text' not in markdown and '\ufffd' not in markdown
