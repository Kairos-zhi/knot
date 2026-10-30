"""S7' live retrieval, exact line pointers and bounded rendered context."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import threading

import pytest

from mvp.backend import http_server as http
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.claim_review import review_claim
from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import Repo, request
from mvp.tests.test_bundle import generate


@pytest.fixture
def sources(tmp_path):
    db = tmp_path / 'source.db'
    assert init_database(db)['status'] == 'created'
    repo = Repo(db)
    assets, originals = [], {}
    for index, label in enumerate(('D-12', 'Q1-2')):
        # Indentation, CRLF, repeated labels and >200 characters expose stripping,
        # off-by-one line numbers, accidental deduplication and whole-line copies.
        text = ('标题\r\n\r\n  ' + label + ' 来源行 ' + '甲乙丙丁' * 70 +
                '\r\n' + label + ' 另一次命中 ' + '戊己庚辛' * 70 + '\r\n末行')
        data = text.encode()
        filename = '任务卡.md' if index == 0 else 'fallback/questions.md'
        aid = repo.add_asset(hashlib.sha256(data).hexdigest(), 'text/markdown',
                             content_blob=data, file_path='fallback/questions.md',
                             metadata_json=json.dumps({'path': filename}) if index == 0 else None)
        repo.add_event('import', subject=aid, event_time=0)
        assets.append(aid)
        originals[aid] = (text, filename)
    extract_claims(repo, write=True)
    claim = repo._one("SELECT claim_id FROM claims_candidates WHERE source_label='D-12'")['claim_id']
    review_claim(repo, claim, decision='accept', now=1000)
    return db, assets, originals


def test_ac1_full_id_fetch_and_short_id_404(sources, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    db, assets, originals = sources
    text = generate(db, assets)['context_text']
    entries = re.findall(r'^- asset (\S+) 文件名：(.*) sha256: ([0-9a-f]{64})$', text, re.M)
    assert {aid for aid, _, _ in entries} == set(assets)
    server = http.Server(db, port=0)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        for aid, filename, digest in entries:
            path = '/assets/' + aid + '?view=content'
            full = request(base, path)
            short = request(base, '/assets/' + aid[:8] + '?view=content')
            assert full[0] == 200 and full[1]['value']['content'] == originals[aid][0]
            assert short[0] == 404 and short[1]['error']['code'] == 'NOT_FOUND'
            assert json.loads(filename) == originals[aid][1]
            assert hashlib.sha256(full[1]['value']['content'].encode()).hexdigest() == digest
            print('AC-1 ' + json.dumps(dict(base=base, path=path, full=full, short=short,
                                          filename=json.loads(filename), sha256=digest), ensure_ascii=False))
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_ac2_every_entry_exact_original_line(sources):
    db, assets, originals = sources
    text = generate(db, assets)['context_text']
    checked = 0
    for entry in re.split(r'(?m)(?=^- \[)', text)[1:]:
        label = re.match(r'- \[([^]]+)\]', entry)[1]
        pointers = re.findall(r'^  > ([^:]+):(\d+) (.*)$', entry, re.M)
        assert len(pointers) == 2
        for aid, number, raw_anchor in pointers:
            line = originals[aid][0].splitlines()[int(number) - 1]
            anchor = json.loads(raw_anchor)
            assert label in line and anchor == line[:40]
            assert len(anchor) == 40
            assert int(number) in (3, 4)
            checked += 1
            print('AC-2 ' + json.dumps(dict(label=label, asset_id=aid, line_number=int(number),
                                          anchor=anchor, original_prefix=line[:40], exact=True), ensure_ascii=False))
    assert checked == 4


def asset_growth(text, originals):
    """Count changed rendering per asset, without executing a historical module.

    The old list/anchor formats are fixed measurement references, not a second
    bundle generator. Attribute shared headings and deduplicated old lines to
    their first source in each entry; include whitespace and punctuation.
    """
    growth = {}
    for aid, filename, digest in re.findall(
            r'^- asset (\S+) 文件名：(.*) sha256: ([0-9a-f]{64})$', text, re.M):
        current = f'- asset {aid} 文件名：{filename} sha256: {digest}'
        previous = f'- asset {aid[:8]} (SHA: {digest[:12]})'
        growth[aid] = dict(list_delta=len(current) - len(previous), anchor_delta=0)
    assert set(growth) == set(originals)
    for entry in re.split(r'(?m)(?=^- \[)', text)[1:]:
        pointers = re.findall(r'^  > ([^:]+):(\d+) (.*)$', entry, re.M)
        seen_old = set()
        for index, (aid, number, anchor) in enumerate(pointers):
            line = originals[aid][0].splitlines()[int(number) - 1]
            assert json.loads(anchor) == line[:40]
            current = f'  > {aid}:{number} {anchor}'
            previous = '  > ' + line.strip()
            # Both joined blocks omit one final newline, so those cancel.
            delta = len(current) + 1
            if previous not in seen_old:
                delta -= len(previous) + 1
                seen_old.add(previous)
            if index == 0:
                delta += len('来源：\n') - len('  来源原文：\n')
            growth[aid]['anchor_delta'] += delta
    for values in growth.values():
        values['total_delta'] = values['list_delta'] + values['anchor_delta']
    return growth


def assert_asset_budget(text, originals):
    growth = asset_growth(text, originals)
    for aid, values in growth.items():
        assert values['total_delta'] <= 250, (aid, values)
    return growth


def test_ac3_per_asset_growth_and_no_full_text(sources):
    db, assets, originals = sources
    after = generate(db, assets)['context_text']
    growth = assert_asset_budget(after, originals)
    windows = 0
    for original, _ in originals.values():
        assert original not in after
        for start in range(len(original) - 199):
            assert original[start:start + 200] not in after
            windows += 1
    print('AC-3 ' + json.dumps(dict(per_asset=growth, limit_chars=250,
                                  checked_200_char_windows=windows,
                                  full_text_present=False)))


def test_ac3_short_assets_fixed_overhead(tmp_path):
    db = tmp_path / 'short.db'
    assert init_database(db)['status'] == 'created'
    repo = Repo(db)
    originals = {}
    for index in range(5):
        text = f'source {index}'
        aid = repo.add_asset(hashlib.sha256(text.encode()).hexdigest(), 'text/markdown',
                             content_blob=text.encode(), metadata_json='{"path":"task.md"}')
        repo.add_event('import', subject=aid, event_time=0)
        originals[aid] = (text, 'task.md')
    after = generate(db, list(originals))['context_text']
    growth = assert_asset_budget(after, originals)
    assert all(values == dict(list_delta=95, anchor_delta=0, total_delta=95)
               for values in growth.values())
    assert all(original not in after for original, _ in originals.values())
    print('AC-3 SHORT ' + json.dumps(dict(per_asset=growth, limit_chars=250)))


def test_ac3_many_entries_in_one_asset(tmp_path):
    # Same ten source-line lengths as the walkthrough, with synthetic content.
    # This exposes repeated locator-heading overhead that averages can hide.
    db = tmp_path / 'dense.db'
    assert init_database(db)['status'] == 'created'
    labels = [f'Q1-{n}' for n in range(1, 8)] + ['D-1', 'D-2', 'D-3']
    lengths = [126, 86, 121, 59, 42, 34, 47, 56, 32, 25]
    text = '\n'.join(label + ' ' + '甲' * (length - len(label) - 1)
                     for label, length in zip(labels, lengths))
    repo = Repo(db)
    aid = repo.add_asset(hashlib.sha256(text.encode()).hexdigest(), 'text/markdown',
                         content_blob=text.encode(), metadata_json='{"path":"dense-questions.md"}')
    repo.add_event('import', subject=aid, event_time=0)
    extract_claims(repo, write=True)
    for claim in repo._all("SELECT claim_id FROM claims_candidates WHERE claim_type='decision'"):
        review_claim(repo, claim['claim_id'], decision='accept', now=1000)
    after = generate(db, [aid])['context_text']
    assert len(re.findall(r'^  > ', after, re.M)) == 10
    growth = assert_asset_budget(after, {aid: (text, 'dense-questions.md')})
    assert 0 < growth[aid]['anchor_delta']
    print('AC-3 DENSE ' + json.dumps(dict(per_asset=growth, limit_chars=250)))


@pytest.mark.parametrize('metadata', [None, '{}', '{"path":""}'])
def test_missing_metadata_path_uses_file_path(sources, metadata):
    db, assets, _ = sources
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET metadata_json=? WHERE asset_id=?', (metadata, assets[0]))
    text = generate(db, assets)['context_text']
    assert f'- asset {assets[0]} 文件名："fallback/questions.md"' in text


@pytest.mark.parametrize(('metadata', 'message'), [
    ('null', 'metadata_json must be an object'),
    ('[]', 'metadata_json must be an object'),
    ('broken', 'invalid metadata_json'),
])
def test_invalid_metadata_rejected_without_bundle(sources, metadata, message):
    db, assets, _ = sources
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute('UPDATE assets SET metadata_json=? WHERE asset_id=?', (metadata, assets[0]))
    before = db.read_bytes()
    with pytest.raises(ValueError, match=message + ' for asset ' + assets[0]):
        generate(db, assets)
    with closing(sqlite3.connect(db)) as conn:
        assert conn.execute('SELECT COUNT(*) FROM continuation_bundles').fetchone()[0] == 0
        assert conn.execute('SELECT metadata_json FROM assets WHERE asset_id=?',
                            (assets[0],)).fetchone()[0] == metadata
    assert db.read_bytes() == before


def test_ac4_selfcheck_with_objects(sources):
    db, _, _ = sources
    data = b'external selfcheck object'
    digest = hashlib.sha256(data).hexdigest()
    relative = Path('objects') / digest[:2] / digest
    target = db.parent / relative
    target.parent.mkdir(parents=True)
    target.write_bytes(data)
    Repo(db).add_asset(digest, 'application/octet-stream', file_path=relative.as_posix())
    before = db.read_bytes(), target.read_bytes()
    command = [sys.executable, '-m', 'mvp.contract.selfcheck', '--db', str(db)]
    result = subprocess.run(command, cwd=Path(__file__).resolve().parents[2],
                            capture_output=True, encoding='utf-8', timeout=30)
    print('AC-4 COMMAND ' + json.dumps(command))
    print(result.stdout)
    assert result.returncode == 0, result.stderr
    assert '19 PASS / 0 FAIL' in result.stdout
    assert (db.read_bytes(), target.read_bytes()) == before
