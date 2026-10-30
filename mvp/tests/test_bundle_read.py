"""Run A: read boundaries, export provenance, and actionable startup failures."""

from contextlib import closing
from datetime import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import subprocess
import sys
import threading
import zipfile

import pytest
from jsonschema import ValidationError

from mvp.backend import http_server as http
from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import Repo, request, seed, validate
from mvp.tests.test_bundle import generate, material, poll
from mvp.tests.test_contract_schema import definition_validator


def test_selfcheck_missing_source_and_export_directory(tmp_path):
    source = tmp_path / 'missing-parent' / 'probe.db'
    home = tmp_path / 'isolated-home'
    home.mkdir()
    env = dict(os.environ, USERPROFILE=str(home), HOME=str(home))
    result = subprocess.run([sys.executable, '-m', 'mvp.contract.selfcheck', '--db', str(source)],
                            capture_output=True, text=True, timeout=20, env=env)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'PASS GET /bundles/{bundle_id}' in result.stdout
    assert '19 PASS / 0 FAIL' in result.stdout
    assert not source.parent.exists()
    assert not (home / '.knot' / 'exports').exists()


def test_selfcheck_existing_source_with_external_objects(tmp_path):
    source = tmp_path / 'source.db'
    assert init_database(source)['status'] == 'created'
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w') as zipped:
        zipped.writestr('source.md', 'T17-01 external selfcheck regression source')
    data = archive.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    relative = Path('objects') / digest[:2] / digest
    obj = source.parent / relative
    obj.parent.mkdir(parents=True)
    obj.write_bytes(data)
    repo = Repo(source)
    asset = repo.add_asset(digest, 'application/zip', file_path=relative.as_posix(),
                           source_uri='file://source.zip')
    repo.add_event('import', subject=asset, event_time=0)
    before = source.read_bytes(), obj.read_bytes()
    result = subprocess.run([sys.executable, '-m', 'mvp.contract.selfcheck', '--db', str(source)],
                            cwd=Path(__file__).resolve().parents[2],
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    assert '19 PASS / 0 FAIL' in result.stdout
    assert (source.read_bytes(), obj.read_bytes()) == before


@pytest.fixture
def bundle_server(material, tmp_path, monkeypatch):
    monkeypatch.setenv('KNOT_TOKEN', 'bundle-read-test')
    db, assets, _ = material
    bundle = generate(db, assets[:2])
    server = http.Server(db, port=0)
    server.jobs.exports = tmp_path / 'exports'
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    try:
        yield server, f'http://127.0.0.1:{server.server_port}', bundle
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_roots_content_and_readonly(bundle_server):
    server, base, bundle = bundle_server
    before = server.db.read_bytes(), server.journal_path.read_bytes() if server.journal_path.exists() else None
    roots = request(base, '/bundles/' + bundle['bundle_id'])
    content = request(base, '/bundles/' + bundle['bundle_id'] + '?view=content', token='bundle-read-test')
    route = next(r for r in http.ROUTES if r['response'] == 'Bundle')
    for status, body in (roots, content):
        assert status == 200
        validate(body, route)
        assert body['value']['authorized_assets'] == bundle['authorized_assets']
        assert body['value']['open_questions'] == [q['claim_id'] for q in bundle['open_questions']]
        assert body['value']['export_path'] is None and body['value']['exported'] is False
    assert roots[1]['view'] == 'roots' and roots[1]['value']['context_text'] is None
    assert content[1]['view'] == 'content' and content[1]['value']['context_text'] == bundle['context_text']
    assert request(base, '/bundles/' + bundle['bundle_id'] + '?view=roots') == roots
    assert not server.jobs.exports.exists()
    assert (server.db.read_bytes(), server.journal_path.read_bytes() if server.journal_path.exists() else None) == before
    print('RAW roots', json.dumps(roots))
    print('RAW content', json.dumps(content))


@pytest.mark.parametrize('suffix,token,status,code', [
    ('?view=content', None, 403, 'FORBIDDEN_VIEW'),
    ('?view=content', 'wrong', 403, 'FORBIDDEN_VIEW'),
    ('?view=invalid', None, 400, 'BAD_REQUEST'),
    ('?view=roots&view=content', None, 400, 'BAD_REQUEST'),
])
def test_bundle_read_refusals(bundle_server, suffix, token, status, code):
    _, base, bundle = bundle_server
    response = request(base, '/bundles/' + bundle['bundle_id'] + suffix, token=token)
    assert response[0] == status and response[1]['error']['code'] == code
    validate(response[1])


def test_unknown_and_contract(bundle_server, monkeypatch):
    _, base, bundle = bundle_server
    assert request(base, '/bundles/unknown')[0] == 404
    assert request(base, '/bundles/unknown')[1]['error']['code'] == 'NOT_FOUND'
    contract = request(base, '/contract')
    assert contract[0] == 200 and contract[1]['value']['exports_root'] == '~/.knot/exports'
    definition_validator('ContractInfo').validate(contract[1]['value'])
    missing = dict(contract[1]['value'])
    missing.pop('exports_root')
    with pytest.raises(ValidationError):
        definition_validator('ContractInfo').validate(missing)
    monkeypatch.delenv('KNOT_TOKEN')
    assert request(base, '/bundles/' + bundle['bundle_id'] + '?view=content')[0] == 200
    print('RAW contract', json.dumps(contract))


def test_export_header_body_and_relative_path(bundle_server, tmp_path):
    server, base, bundle = bundle_server
    bid = bundle['bundle_id']
    # Persist the exact previous-format payload before exporting the headed file.
    baseline = tmp_path / 'before-header.md'
    baseline.write_bytes(bundle['context_text'].encode('utf-8'))
    accepted = request(base, '/commands', dict(command='bundle.export', args=dict(bundle_id=bid)), token='bundle-read-test')
    assert accepted[0] == 202
    done = poll(base, accepted[1]['value']['job_id'])[1]['value']
    assert done['status'] == 'done'
    assert done['result']['path'] == bid + '.md'
    exported = server.jobs.exports / done['result']['path']
    head, body = exported.read_bytes().split(b'\n', 1)
    digest = hashlib.sha256(str(server.db).encode()).hexdigest()[:8]
    match = re.fullmatch(r'<!-- knot-bundle bundle_id=' + bid + r' db=' + digest + r' generated=(\S+) actor=local-user -->', head.decode())
    assert match and datetime.fromisoformat(match[1]).tzinfo is not None
    assert body == baseline.read_bytes()
    readback = request(base, '/bundles/' + bid)[1]['value']
    assert readback['exported'] is True and readback['export_path'] == done['result']['path']
    assert readback['context_text'] is None
    assert request(base, '/bundles/' + bid + '?view=content', token='bundle-read-test')[1]['value']['context_text'].encode() == body
    failed = request(base, '/commands', dict(command='bundle.export', args=dict(bundle_id='../outside')), token='bundle-read-test')
    assert failed[0] == 400 and failed[1]['error']['code'] == 'BAD_REQUEST'
    print('RAW export header', head.decode())
    print('BODY_COMPARE', json.dumps(dict(equal=True, sha256=hashlib.sha256(body).hexdigest(), bytes=len(body))))


@pytest.mark.parametrize('reason', ['db_unreadable', 'unsupported_schema', 'port_in_use', 'internal'])
def test_startup_reasons(tmp_path, reason):
    db = tmp_path / 'candidate.db'
    if reason != 'db_unreadable':
        assert init_database(db)['status'] == 'created'
    if reason == 'unsupported_schema':
        # Make an older database, then launch against its SQLite backup copy.
        with closing(sqlite3.connect(db)) as conn:
            conn.execute("DELETE FROM schema_version WHERE version='1.4'")
            conn.commit()
            old = tmp_path / 'old-copy.db'
            with closing(sqlite3.connect(old)) as target:
                conn.backup(target)
        db = old
    if reason in ('pending_requires_review', 'internal'):
        state = tmp_path / '.knot'
        state.mkdir()
        (state / 'http.seq').write_text(json.dumps(dict(seq=0, frames=[], keys={}, pending=dict(body={}, actor='local-user'))) if reason != 'internal' else 'broken journal', encoding='utf-8')
        before = (state / 'http.seq').read_bytes()
    with closing(socket.socket()) as occupied:
        occupied.bind(('127.0.0.1', 0))
        occupied.listen()
        port = occupied.getsockname()[1] if reason == 'port_in_use' else 0
        result = subprocess.run([sys.executable, '-m', 'mvp.backend.http_server', '--db', str(db), '--port', str(port)], capture_output=True, text=True, timeout=8)
    assert result.returncode == 1 and not result.stderr
    error = json.loads(result.stdout)
    validate(error)
    assert error['error']['detail']['reason'] == reason
    assert error['error']['message'] != error['error']['code']
    assert str(tmp_path) not in result.stdout
    assert not (tmp_path / '.knot/http.lock').exists()
    if reason in ('pending_requires_review', 'internal'):
        assert (tmp_path / '.knot/http.seq').read_bytes() == before
    if reason == 'db_unreadable':
        assert not db.exists()
    print('RAW startup', reason, result.stdout.strip())
