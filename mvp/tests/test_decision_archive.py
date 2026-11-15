"""Synthetic decision provenance, atomicity, authority and transport contracts."""

from contextlib import closing
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from uuid import uuid4

import pytest

from mvp import decision_policy as policy
from mvp.backend import decision_archive as archive
from mvp.backend.init_db import init_database
from mvp.decision_policy import DecisionError, canonical


TOKEN = 'synthetic-decision-token-731'
OTHER_TOKEN = 'synthetic-other-token-752'
ACTOR = 'synthetic-reader'
STAMP = int(datetime(2026, 11, 14, 16, 1, tzinfo=timezone.utc).timestamp() * 1000)


def source(kind='user_message', text='Synthetic exact source quotation.'):
    return dict(version=policy.SOURCE_VERSION, kind=kind, title='Synthetic source',
                text=text, text_sha256=sha256(text.encode()).hexdigest(),
                message_time_ms=STAMP if kind == 'user_message' else None,
                document_on='2026-11-12' if kind == 'document' else None,
                archived_on='2026-11-13' if kind == 'document' else None,
                locator=dict(channel='chatgpt' if kind == 'user_message' else 'file',
                             thread_id='11111111-1111-4111-8111-111111111111' if kind == 'user_message' else None,
                             message_id=None, section=None))


def item(key='one', kind='direct_user_message', quote='exact source', ident='choice-one'):
    return dict(id=ident, kind=kind, title='Synthetic decision', before=None,
                after='A retrospective explanation, not an approval.', reason=None,
                occurred_on='2026-11-15' if kind == 'direct_user_message' else None,
                archived_on='2026-11-13' if kind == 'archived_user_excerpt' else None,
                document_on='2026-11-12' if kind == 'document_plan' else None,
                caution=None, evidence=[dict(source_key=key, quote=quote)])


def package():
    return dict(version=policy.IMPORT_VERSION, sources={'one': source()},
                archive=dict(version=policy.ARCHIVE_VERSION, title='Synthetic recall',
                             method='curated_recap', items=[item()]))


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    monkeypatch.setenv('KNOT_TOKENS', json.dumps({TOKEN: ACTOR, OTHER_TOKEN: 'other-reader'}))
    path = tmp_path / 'synthetic.db'
    assert init_database(path)['status'] == 'created'
    return path


def imported(db, value=None):
    return archive.import_decisions(db, package() if value is None else value, ACTOR, TOKEN)


def read(db, receipt, actor=ACTOR, token=TOKEN):
    return archive.read_decision_history(db, receipt['archive_id'], receipt['archive_hash'], actor, token)


def counts(db):
    with closing(sqlite3.connect(db)) as conn:
        return tuple(conn.execute('SELECT count(*) FROM ' + table).fetchone()[0]
                     for table in ('assets', 'asset_readers', 'history_events'))


def envelope(value):
    return dict(contract_version=1, ok=True, value=value)


def test_roundtrip_literal_dates_idempotence_and_no_caller_mutation(db):
    pkg = package()
    pkg['sources']['one']['title'] = '<img src=x onerror=synthetic()>'
    before = deepcopy(pkg)
    first = imported(db, pkg)
    assert first.keys() == {'archive_id', 'archive_hash', 'sources_created', 'archive_created'}
    assert first['sources_created'] == 1 and first['archive_created'] is True
    assert pkg == before and counts(db) == (2, 2, 2)
    value = read(db, first)
    assert value['has_unavailable'] is False
    evidence = value['items'][0]['evidence'][0]
    assert evidence['title'] == '<img src=x onerror=synthetic()>'
    assert evidence['quote'] == 'exact source' and evidence['message_time_ms'] == STAMP
    assert evidence['source_url'] == 'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111'
    assert value['items'][0]['occurred_on'] == '2026-11-15'
    assert value['items'][0]['reason'] is None
    second = imported(db, pkg)
    assert second == first | {'sources_created': 0, 'archive_created': False}
    assert counts(db) == (2, 2, 2)
    assert policy.project_decision_history(envelope(value), first['archive_id'], first['archive_hash'], TOKEN) == value


def test_all_kinds_and_all_evidence_are_checked(db):
    pkg = package()
    pkg['sources']['doc'] = source('document')
    pkg['archive']['items'] += [item('doc', 'archived_user_excerpt', ident='archived'),
                                item('doc', 'document_plan', ident='background')]
    receipt = imported(db, pkg)
    values = read(db, receipt)['items']
    assert [v['kind'] for v in values] == ['direct_user_message', 'archived_user_excerpt', 'document_plan']
    assert all(v['evidence'][0]['source_url'] is None for v in values[1:])
    for kind, field in [('direct_user_message', 'occurred_on'),
                        ('archived_user_excerpt', 'archived_on'), ('document_plan', 'document_on')]:
        wrong = deepcopy(pkg)
        target = next(v for v in wrong['archive']['items'] if v['kind'] == kind)
        target[field] = '2026-01-01'
        with pytest.raises(DecisionError, match='CONTENT_MISMATCH'):
            imported(db, wrong)
    assert counts(db) == (3, 3, 3)


@pytest.mark.parametrize('utc,expected', [
    ('1970-01-01T00:00:00+00:00', '1970-01-01'),
    ('1986-07-01T15:30:00+00:00', '1986-07-02'),
    ('1991-07-01T15:30:00+00:00', '1991-07-02'),
    ('1992-07-01T15:30:00+00:00', '1992-07-01'),
    ('2026-11-14T15:59:59.999+00:00', '2026-11-14'),
    ('2026-11-14T16:00:00+00:00', '2026-11-15'),
])
def test_shanghai_day_uses_local_midnight_and_historical_summer_offset(utc, expected):
    instant = datetime.fromisoformat(utc)
    stamp = (instant - datetime(1970, 1, 1, tzinfo=timezone.utc)) // timedelta(milliseconds=1)
    assert policy.message_day(stamp) == expected


@pytest.mark.parametrize('change', [
    lambda p: p.update(extra=True),
    lambda p: p['sources']['one'].update(extra=True),
    lambda p: p['sources']['one']['locator'].update(extra=True),
    lambda p: p['archive'].update(extra=True),
    lambda p: p['archive']['items'][0].update(extra=True),
    lambda p: p['archive']['items'][0]['evidence'][0].update(extra=True),
    lambda p: p['archive']['items'][0].pop('reason'),
    lambda p: p['archive']['items'][0].update(id='not an ASCII slug'),
    lambda p: p['archive']['items'][0].update(reason=42),
    lambda p: p['archive']['items'][0].update(occurred_on='2026-02-30'),
    lambda p: p['archive']['items'][0].update(archived_on='2026-11-15'),
    lambda p: p['archive']['items'][0]['evidence'][0].update(quote='not present'),
    lambda p: p['sources']['one'].update(text_sha256='0' * 64),
    lambda p: p['sources']['one'].update(message_time_ms=True),
    lambda p: p['sources']['one']['locator'].update(section='C:\\synthetic\\private'),
    lambda p: p['sources']['one']['locator'].update(thread_id='/synthetic/private'),
    lambda p: p['sources'].update(unused=source()),
    lambda p: p['archive']['items'].append(deepcopy(p['archive']['items'][0])),
    lambda p: p['archive']['items'][0].update(evidence=[]),
])
def test_closed_shapes_dates_quotes_and_exact_source_set_rejected_before_writes(db, change):
    pkg = package()
    change(pkg)
    with pytest.raises(DecisionError) as exc:
        imported(db, pkg)
    assert exc.value.code in ('INVALID_ARGUMENTS', 'CONTENT_MISMATCH')
    assert counts(db) == (0, 0, 0)


@pytest.mark.parametrize('invalid_id', ['Uppercase', '1number', 'a' * 81])
def test_item_slug_contract_rejected_by_import_and_broker(db, invalid_id):
    pkg = package()
    pkg['archive']['items'][0]['id'] = invalid_id
    with pytest.raises(DecisionError, match='^INVALID_ARGUMENTS$'):
        imported(db, pkg)
    assert counts(db) == (0, 0, 0)
    receipt = imported(db)
    body = envelope(read(db, receipt))
    body['value']['items'][0]['id'] = invalid_id
    with pytest.raises(DecisionError, match='^INVALID_ARGUMENTS$'):
        policy.project_decision_history(body, receipt['archive_id'], receipt['archive_hash'], TOKEN)


@pytest.mark.parametrize('private', ['PASSWORD=synthetic-value', TOKEN, 'Authorization: Bearer synthetic-value'])
def test_secrets_are_rejected_not_modified_or_echoed(db, private):
    pkg = package()
    pkg['sources']['one'] = source(text='exact source ' + private)
    with pytest.raises(DecisionError) as exc:
        imported(db, pkg)
    assert exc.value.code == 'SENSITIVE_CONTENT'
    assert private not in str(exc.value) and exc.value.__context__ is None
    assert counts(db) == (0, 0, 0)


@pytest.mark.parametrize('where', ['source-title', 'archive-title', 'item-title', 'quote'])
@pytest.mark.parametrize('empty', ['', ' \t\n'])
def test_titles_and_quotes_never_accept_empty_or_whitespace_evidence(db, where, empty):
    pkg = package()
    if where == 'source-title':
        pkg['sources']['one']['title'] = empty
    elif where == 'archive-title':
        pkg['archive']['title'] = empty
    elif where == 'item-title':
        pkg['archive']['items'][0]['title'] = empty
    else:
        pkg['archive']['items'][0]['evidence'][0]['quote'] = empty
    with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
        imported(db, pkg)
    assert counts(db) == (0, 0, 0)


@pytest.mark.parametrize('change', [
    lambda p: p['sources']['one'].update(document_on='2026-11-14'),
    lambda p: p['sources']['one'].update(kind='document'),
    lambda p: p['archive']['items'][0].update(kind='archived_user_excerpt'),
    lambda p: p['archive']['items'][0].update(kind='document_plan'),
])
def test_kind_and_date_metadata_do_not_cross_categories(db, change):
    pkg = package()
    change(pkg)
    with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
        imported(db, pkg)
    assert counts(db) == (0, 0, 0)


def test_failed_second_append_rolls_back_source_grant_and_event(db, monkeypatch):
    original = archive._DecisionRepo.add_event
    calls = []
    def fail_second(self, *args, **kwargs):
        calls.append(1)
        if len(calls) == 2:
            raise sqlite3.IntegrityError('PRIVATE synthetic failure')
        return original(self, *args, **kwargs)
    monkeypatch.setattr(archive._DecisionRepo, 'add_event', fail_second)
    with pytest.raises(DecisionError, match='IMPORT_UNAVAILABLE') as exc:
        imported(db)
    assert exc.value.__context__ is None and counts(db) == (0, 0, 0)


def test_identity_and_hash_deduplication_never_claim_other_reader_assets(db):
    receipt = imported(db)
    before = counts(db)
    with pytest.raises(DecisionError, match='ACCESS_DENIED'):
        archive.import_decisions(db, package(), 'other-reader', OTHER_TOKEN)
    with pytest.raises(DecisionError, match='ACCESS_DENIED'):
        archive.import_decisions(db, package(), 'other-reader', TOKEN)
    with pytest.raises(DecisionError, match='ACCESS_DENIED'):
        read(db, receipt, 'other-reader', OTHER_TOKEN)
    assert counts(db) == before
    # Even when sources are granted, an inaccessible duplicate archive stays inaccessible.
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('INSERT INTO asset_readers SELECT asset_id,? FROM assets WHERE media_type=?',
                     ('other-reader', policy.SOURCE_MIME))
    before = counts(db)
    with pytest.raises(DecisionError, match='ACCESS_DENIED'):
        archive.import_decisions(db, package(), 'other-reader', OTHER_TOKEN)
    assert counts(db) == before


def test_duplicate_without_reader_rolls_back_earlier_new_source(db):
    imported(db)
    before = counts(db)
    pkg = package()
    pkg['sources']['aaa-new'] = source(text='A new synthetic quotation.')
    pkg['archive']['items'].append(item('aaa-new', quote='new synthetic', ident='new'))
    with pytest.raises(DecisionError, match='ACCESS_DENIED'):
        archive.import_decisions(db, pkg, 'other-reader', OTHER_TOKEN)
    assert counts(db) == before


@pytest.mark.parametrize('mutation', ['revoke', 'blob', 'mime', 'file', 'metadata', 'quote'])
def test_invalid_dependency_suppresses_entire_item_and_keeps_independent_item(db, mutation):
    pkg = package()
    pkg['sources']['two'] = source(text='Independent synthetic quotation.')
    pkg['archive']['items'][0]['evidence'].append(dict(source_key='two', quote='Independent'))
    pkg['archive']['items'].append(item('two', quote='Independent', ident='independent'))
    receipt = imported(db, pkg)
    value = read(db, receipt)
    aid = value['items'][0]['evidence'][0]['asset_id']
    with closing(sqlite3.connect(db)) as conn, conn:
        if mutation == 'revoke':
            conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (aid,))
        elif mutation == 'blob':
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (b'PRIVATE changed source', aid))
        elif mutation == 'mime':
            conn.execute('UPDATE assets SET media_type=? WHERE asset_id=?', ('text/plain', aid))
        elif mutation == 'file':
            conn.execute('UPDATE assets SET file_path=? WHERE asset_id=?', ('C:/PRIVATE/never-open', aid))
        else:
            src = pkg['sources']['one']
            if mutation == 'metadata':
                src['message_time_ms'] -= 86400000
            else:
                src['text'] = 'Different synthetic source.'
                src['text_sha256'] = sha256(src['text'].encode()).hexdigest()
            raw = canonical(src)
            digest = sha256(raw).hexdigest()
            conn.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE asset_id=?', (raw, digest, aid))
            stored = json.loads(conn.execute('SELECT content_blob FROM assets WHERE asset_id=?', (receipt['archive_id'],)).fetchone()[0])
            stored['items'][0]['evidence'][0]['content_hash'] = digest
            parent = canonical(stored)
            receipt['archive_hash'] = sha256(parent).hexdigest()
            conn.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE asset_id=?',
                         (parent, receipt['archive_hash'], receipt['archive_id']))
    result = read(db, receipt)
    assert result['has_unavailable'] is True
    assert [entry['id'] for entry in result['items']] == ['independent']
    assert 'PRIVATE' not in json.dumps(result)


@pytest.mark.parametrize('mutation', ['revoke', 'blob', 'mime', 'file', 'expected_hash'])
def test_invalid_parent_refuses_whole_history(db, mutation):
    receipt = imported(db)
    with closing(sqlite3.connect(db)) as conn, conn:
        if mutation == 'revoke':
            conn.execute('DELETE FROM asset_readers WHERE asset_id=?', (receipt['archive_id'],))
        elif mutation == 'blob':
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?', (b'PRIVATE', receipt['archive_id']))
        elif mutation == 'mime':
            conn.execute('UPDATE assets SET media_type=? WHERE asset_id=?', ('application/json', receipt['archive_id']))
        elif mutation == 'file':
            conn.execute('UPDATE assets SET file_path=? WHERE asset_id=?', ('C:/PRIVATE', receipt['archive_id']))
        else:
            receipt['archive_hash'] = '0' * 64
    with pytest.raises(DecisionError) as exc:
        read(db, receipt)
    assert 'PRIVATE' not in str(exc.value)


def test_single_readonly_snapshot_survives_concurrent_reader_revocation(db, monkeypatch):
    receipt = imported(db)
    original = archive._asset
    seen = []
    def revoke_after_parent(conn, aid, *args, **kwargs):
        assert conn.in_transaction
        seen.append(id(conn))
        raw = original(conn, aid, *args, **kwargs)
        if aid == receipt['archive_id']:
            with closing(sqlite3.connect(db)) as writer, writer:
                writer.execute('DELETE FROM asset_readers WHERE asset_id<>?', (aid,))
        return raw
    monkeypatch.setattr(archive, '_asset', revoke_after_parent)
    assert len(read(db, receipt)['items']) == 1
    assert len(set(seen)) == 1
    assert read(db, receipt)['items'] == []


def test_duplicate_hash_corrupt_mime_refuses_without_repair(db):
    receipt = imported(db)
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET media_type=? WHERE asset_id=?', ('text/plain', receipt['archive_id']))
    before = counts(db)
    with pytest.raises(DecisionError):
        imported(db)
    assert counts(db) == before


def test_empty_archive_and_no_schema_creation(db, tmp_path):
    pkg = package()
    pkg['sources'] = {}
    pkg['archive']['items'] = []
    result = read(db, imported(db, pkg))
    assert result['items'] == [] and result['has_unavailable'] is False
    nonexistent = tmp_path / 'must-not-be-created.db'
    with pytest.raises(DecisionError, match='IMPORT_UNAVAILABLE'):
        imported(nonexistent, pkg)
    assert not nonexistent.exists()
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('DROP TABLE asset_readers')
    with pytest.raises(DecisionError, match='READ_UNAVAILABLE'):
        imported(db, pkg)


def test_source_size_archive_size_unique_and_cumulative_budgets(db):
    pkg = package()
    pkg['sources']['one'] = source(text='x' * policy.MAX_SOURCE_TEXT_BYTES)
    pkg['archive']['items'][0]['evidence'][0]['quote'] = 'x'
    imported(db, pkg)
    pkg['sources']['one'] = source(text='x' * (policy.MAX_SOURCE_TEXT_BYTES + 1))
    with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
        imported(db, pkg)
    # 33 unique references, without exceeding the per-item evidence cap.
    pkg = package()
    pkg['sources'] = {str(i): source(text='source ' + str(i)) for i in range(33)}
    pkg['archive']['items'] = [item(str(i), quote='source', ident='item-' + str(i)) for i in range(20)]
    for i in range(13):
        pkg['archive']['items'][i]['evidence'].append(dict(source_key=str(i + 20), quote='source'))
    with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
        imported(db, pkg)
    # Sixteen canonical sources exceed the cumulative blob budget despite valid text limits.
    pkg['sources'] = {str(i): source(text='x' * 65536) for i in range(16)}
    for i, src in enumerate(pkg['sources'].values()):
        src['title'] = 'source-' + str(i)
    pkg['archive']['items'] = [item(str(i), quote='x', ident='item-' + str(i)) for i in range(16)]
    with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
        imported(db, pkg)


def test_archive_input_budget_is_independent_of_each_field_budget(db):
    pkg = package()
    pkg['sources']['one'] = source(text='x' * 4096)
    pkg['archive']['items'] = [item(quote='x' * 4096, ident='entry-' + str(i)) for i in range(20)]
    for entry in pkg['archive']['items']:
        entry['before'] = 'x' * 2048
        entry['after'] = 'x' * 2048
    assert len(canonical(pkg['archive'])) > policy.MAX_ARCHIVE_BYTES
    with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
        imported(db, pkg)
    assert counts(db) == (0, 0, 0)


def test_corrupt_blobs_also_consume_read_budget(db):
    pkg = package()
    pkg['sources']['two'] = source(text='Second synthetic source.')
    pkg['archive']['items'][0]['evidence'].append(dict(source_key='two', quote='Second'))
    receipt = imported(db, pkg)
    refs = read(db, receipt)['items'][0]['evidence']
    with closing(sqlite3.connect(db)) as conn, conn:
        for ref in refs:
            conn.execute('UPDATE assets SET content_blob=? WHERE asset_id=?',
                         (b'x' * (600 * 1024), ref['asset_id']))
    with pytest.raises(DecisionError, match='READ_LIMIT_REACHED'):
        read(db, receipt)


@pytest.mark.parametrize('character', ['中', '\U0001f9f6'])
def test_large_unicode_projection_exceeds_old_transport_but_obeys_actual_envelope_limit(db, character):
    pkg = package()
    quote = character * (4096 // len(character.encode()))
    pkg['sources']['one'] = source(text=quote)
    pkg['sources']['one']['title'] = character * (256 // len(character.encode()))
    entries = [item(quote=quote, ident='entry-' + str(i)) for i in range(20)]
    pkg['archive']['items'] = entries
    receipt = imported(db, pkg)
    result = read(db, receipt)
    raw = json.dumps(envelope(result), ensure_ascii=True).encode('utf-8')
    # One evidence per item stays within input; use extra explanatory text to pass 256KiB.
    if len(raw) <= 262144:
        pkg['archive']['items'][0]['before'] = character * (2048 // len(character.encode()))
        for entry in pkg['archive']['items']:
            entry['before'] = pkg['archive']['items'][0]['before']
        receipt = imported(db, pkg)
        result = read(db, receipt)
        raw = json.dumps(envelope(result), ensure_ascii=True).encode('utf-8')
    assert 262144 < len(raw) <= policy.MAX_RESPONSE_BYTES
    assert policy.project_decision_history(envelope(result), receipt['archive_id'], receipt['archive_hash'], TOKEN) == result


def test_full_ascii_encoded_envelope_limit_is_exact_and_raises_response_limit(db, monkeypatch):
    receipt = imported(db)
    value = read(db, receipt)
    body = envelope(value)
    actual = len(json.dumps(body, ensure_ascii=True).encode('utf-8'))
    monkeypatch.setattr(policy, 'MAX_RESPONSE_BYTES', actual)
    assert read(db, receipt) == value
    monkeypatch.setattr(policy, 'MAX_RESPONSE_BYTES', actual - 1)
    for action in (lambda: read(db, receipt), lambda: policy.project_decision_history(
            body, receipt['archive_id'], receipt['archive_hash'], TOKEN)):
        with pytest.raises(DecisionError) as exc:
            action()
        assert exc.value.code == 'RESPONSE_LIMIT' and exc.value.__context__ is None
    monkeypatch.setattr(policy, 'MAX_RESPONSE_BYTES', 1024 * 1024)
    body['value']['title'] = '\U0001f9f6' * 90000
    assert len(json.dumps(body, ensure_ascii=False).encode()) < 1024 * 1024
    with pytest.raises(DecisionError, match='RESPONSE_LIMIT'):
        policy.project_decision_history(body, receipt['archive_id'], receipt['archive_hash'], TOKEN)


@pytest.mark.parametrize('change,code', [
    (lambda env: env.update(extra=True), 'INVALID_ARGUMENTS'),
    (lambda env: env.update(ok=1), 'INVALID_ARGUMENTS'),
    (lambda env: env['value'].update(extra=True), 'INVALID_ARGUMENTS'),
    (lambda env: env['value'].update(archive_id=str(uuid4())), 'CONTENT_MISMATCH'),
    (lambda env: env['value'].update(has_unavailable=0), 'INVALID_ARGUMENTS'),
    (lambda env: env['value']['items'][0]['evidence'][0].update(extra=True), 'INVALID_ARGUMENTS'),
    (lambda env: env['value']['items'][0]['evidence'][0].update(source_url='file:///PRIVATE'), 'INVALID_ARGUMENTS'),
    (lambda env: env['value']['items'][0]['evidence'][0].update(message_time_ms=0), 'INVALID_ARGUMENTS'),
    (lambda env: env['value']['items'][0].update(reason=TOKEN), 'SENSITIVE_CONTENT'),
])
def test_broker_independently_validates_closed_binding_dates_urls_and_secrets(db, change, code):
    receipt = imported(db)
    body = envelope(read(db, receipt))
    change(body)
    with pytest.raises(DecisionError) as exc:
        policy.project_decision_history(body, receipt['archive_id'], receipt['archive_hash'], TOKEN)
    assert exc.value.code == code


@pytest.mark.parametrize('raw', [b'{"version":1,"version":2}', b'{"x":NaN}', b'{"x":Infinity}', b'\xff'])
def test_strict_json_rejects_duplicates_nonfinite_and_bad_utf8(raw):
    with pytest.raises(DecisionError, match='INVALID_ARGUMENTS'):
        policy.decode_json(raw)


def test_cli_explicit_paths_environment_credential_and_fixed_errors(db, tmp_path):
    file = tmp_path / 'synthetic-package.json'
    file.write_bytes(canonical(package()))
    env = os.environ | {'KNOT_TOKEN': TOKEN}
    root = str(Path(__file__).parents[2])
    cmd = [sys.executable, '-B', '-m', 'mvp.devtools.decision_import', '--db', str(db),
           '--package', str(file), '--actor', ACTOR]
    first = subprocess.run(cmd, env=env, cwd=root, capture_output=True, text=True, timeout=20)
    assert first.returncode == 0 and json.loads(first.stdout)['sources_created'] == 1
    assert not first.stderr and TOKEN not in first.stdout and str(file) not in first.stdout
    second = subprocess.run(cmd, env=env, cwd=root, capture_output=True, text=True, timeout=20)
    assert json.loads(second.stdout)['archive_created'] is False
    file.write_bytes(b'{"PRIVATE":NaN}')
    failed = subprocess.run(cmd, env=env, cwd=root, capture_output=True, text=True, timeout=20)
    assert failed.returncode == 1 and json.loads(failed.stdout) == {'error': 'INVALID_ARGUMENTS'}
    assert not failed.stderr and 'PRIVATE' not in failed.stdout
    unknown = subprocess.run(cmd + ['--token', 'PRIVATE'], env=env, cwd=root,
                             capture_output=True, text=True, timeout=20)
    assert unknown.returncode == 1 and 'PRIVATE' not in unknown.stdout + unknown.stderr
