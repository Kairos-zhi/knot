"""Scoped claims over isolated project material and legacy review evidence."""
import sqlite3
from urllib.parse import urlencode

from test_contract_schema import definition_validator
from test_project_http import OTHER, body, call, env


def test_scoped_claims_lifecycle_and_legacy_privacy(env):
    db, core, _ = env
    original = '😀 intro\n  **Decision:** preserve the source.\n  **Decision:** preserve the source.'
    project = body(text=original)
    other = body(text=original)
    status, imported, _ = call(core, '/project-imports', project)
    assert status == 200
    assert call(core, '/project-imports', other)[0] == 200
    binding = dict(project_id=project['project_id'], revision='1')
    listing = '/project-claims?' + urlencode(binding)
    generate = '/project-claims/extract'
    review = '/project-claims/review'
    assert call(core, listing)[1]['value']['items'] == []
    assert call(core, listing, token=OTHER)[0] == 403
    assert call(core, generate, binding, token=OTHER)[0] == 403
    outside = call(core, '/snapshot')[1]['value']['counts']
    receipt = call(core, generate, binding)[1]['value']
    definition_validator('ProjectClaimExtraction').validate(receipt)
    assert receipt == binding | dict(inserted=2, unchanged=0, readable_materials=1,
                                     skipped_materials=0, has_unavailable=False)
    assert call(core, generate, binding)[1]['value']['unchanged'] == 2
    assert call(core, '/project-claims?' + urlencode(binding | {'project_id': other['project_id']}))[1]['value']['items'] == []
    view = call(core, listing + '&status=pending')[1]['value']
    definition_validator('ProjectClaims').validate(view)
    assert view['can_write'] is True
    assert len({c['claim_id'] for c in view['items']}) == 2
    for item in view['items']:
        start = item['quote_start']
        quote = item['quote']
        assert quote == '**Decision:** preserve the source.'
        assert original[start:start + len(quote)] == quote
        with sqlite3.connect(db) as conn:
            assert conn.execute(
                'SELECT subject,event_time FROM history_events WHERE event_id=?',
                (item['event_id'],)).fetchone() == (item['asset_id'], item['saved_at'])
        assert item['event_time'] == item['saved_at']
        assert item['message_time_ms'] is item['document_on'] is None
    assert len({c['quote_start'] for c in view['items']}) == 2
    claim = view['items'][0]
    accept = binding | dict(claim_id=claim['claim_id'], decision='accept')
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO asset_readers (asset_id,actor) SELECT asset_id,'B' FROM assets "
                     "WHERE asset_id=? OR content_hash=?",
                     (claim['asset_id'], imported['value']['manifest_hash']))
    assert call(core, listing, token=OTHER)[1]['value'] == view | {'can_write': False}
    assert call(core, review, accept, token=OTHER)[0] == 403
    assert call(core, review, accept | {'project_id': other['project_id']})[0] == 404
    assert call(core, '/commands', dict(command='claim.confirm', args={'claim_id': claim['claim_id']}))[0] == 404
    result = call(core, review, accept)[1]['value']
    definition_validator('ProjectClaimReview').validate(result)
    assert result['status'] == 'confirmed'
    assert call(core, review, accept)[1]['value']['status'] == 'already_accepted'
    assert call(core, listing + '&status=accepted')[1]['value']['items'][0]['claim_id'] == claim['claim_id']
    assert call(core, generate, binding)[1]['value']['unchanged'] == 2
    assert call(core, review, accept | {'decision': 'reject'})[1]['value']['status'] == 'revoked'
    assert call(core, review, accept)[1]['value']['status'] == 'restored'
    assert call(core, '/claims/' + claim['claim_id'])[0] == 404
    assert call(core, '/trace/' + claim['claim_id'])[0] == 404
    assert claim['claim_id'].encode() not in call(core, '/claims')[2]
    assert result['event_id'].encode() not in call(core, '/timeline?start=0&end=9999999999999')[2]
    snapshot = call(core, '/snapshot')
    assert snapshot[1]['value']['counts'] == outside
    assert result['event_id'].encode() not in snapshot[2]

    with sqlite3.connect(db) as conn:
        conn.execute("DELETE FROM asset_readers WHERE asset_id=? AND actor='A'", (claim['asset_id'],))
    unavailable = call(core, listing)[1]['value']
    assert unavailable['has_unavailable'] and unavailable['items'] == []
    assert call(core, review, accept)[0] == 404
    receipt = call(core, generate, binding)[1]['value']
    assert receipt['readable_materials'] == 0 and receipt['skipped_materials'] == 1


def test_scoped_claims_keep_material_membership_across_appended_revisions(env):
    _, core, _ = env
    project = body(text='Question: initial material')
    assert call(core, '/project-imports', project)[0] == 200
    bind = dict(project_id=project['project_id'], revision='1')
    old_listing = '/project-claims?' + urlencode(bind)
    generate = '/project-claims/extract'
    assert call(core, generate, bind)[1]['value']['inserted'] == 1
    first = call(core, old_listing)[1]['value']['items'][0]
    patch = body(text='Counterexample: newly appended material')
    patch.update(project_id=project['project_id'], expected_revision='1')
    assert call(core, '/project-imports', patch)[0] == 200
    assert call(core, generate, bind)[0] == 409
    assert call(core, '/project-claims/review', bind | dict(claim_id=first['claim_id'], decision='accept'))[0] == 409
    head = bind | {'revision': '2'}
    receipt = call(core, generate, head)[1]['value']
    assert (receipt['inserted'], receipt['unchanged']) == (1, 1)
    assert call(core, old_listing)[1]['value']['items'] == [first]
    assert call(core, old_listing)[1]['value']['can_write'] is False
    assert {i['claim_type'] for i in call(core, '/project-claims?' + urlencode(head))[1]['value']['items']} == {
        'question', 'counterexample'}


def test_relation_extraction_requires_specific_evidence_type(env):
    _, core, _ = env
    project = body(text='Relation: two projects share an owner.\n'
                        'Support relation: note A supports note B.\n'
                        'Conditional theorem: under conditions A and B, C follows.')
    assert call(core, '/project-imports', project)[0] == 200
    bind = dict(project_id=project['project_id'], revision='1')
    assert call(core, '/project-claims/extract', bind)[1]['value']['inserted'] == 2
    items = call(core, '/project-claims?' + urlencode(bind))[1]['value']['items']
    assert [(item['claim_type'], item['atom']) for item in items] == [
        ('relation', 'support_relation'), ('relation', 'conditional_theorem')]
