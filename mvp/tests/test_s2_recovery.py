"""S2 fault windows use real processes and an actual shell kill -9."""

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time

import pytest

from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import request, seed
from mvp.tests.test_http_contract import Live

ROOT = Path(__file__).resolve().parents[2]
WORKER = r'''
import json, sys, threading
from pathlib import Path
from mvp.backend import http_server as http
from mvp.backend.bundle_jobs import BundleJobs
db, mode, marker = sys.argv[1:]
def hold():
    Path(marker).write_text('held', encoding='ascii')
    threading.Event().wait()
if mode == 'pending':
    original = http.Server.persist
    def persist(self, journal):
        original(self, journal)
        if journal.get('pending'):
            hold()
    http.Server.persist = persist
else:
    original = BundleJobs._execute
    def execute(self, *args):
        if mode == 'before':
            hold()
        result = original(self, *args)
        hold()  # SQLite committed, journal still running.
        return result
    BundleJobs._execute = execute
s = http.Server(db, port=0)
print(json.dumps({'port': s.server_port}), flush=True)
s.serve_forever()
'''


def wait_for(predicate):
    until = time.monotonic() + 10
    while time.monotonic() < until:
        if predicate():
            return
        time.sleep(.02)
    raise AssertionError('fault window not reached')


def crash(db, mode, body, folder):
    bash = shutil.which('bash')
    assert bash, 'real bash kill -9 required for S2 evidence'
    worker, launcher, killer = (folder / n for n in ('worker.py', 'launch.sh', 'kill.sh'))
    worker.write_text(WORKER, encoding='utf-8')
    marker = folder / 'held'
    launcher.write_text('"$1" -u "$2" "$3" "$4" "$5" &\np=$!\necho "shell_pid=$p"\nwait "$p"\ns=$?\necho "wait_status=$s"\nexit "$s"\n', encoding='ascii')
    killer.write_text('echo "kill -9 $1"\nkill -9 "$1"\ns=$?\necho "kill_exit=$s"\nexit "$s"\n', encoding='ascii')
    env = os.environ | {'PYTHONPATH': str(ROOT)}
    proc = subprocess.Popen([bash, str(launcher), sys.executable, str(worker), str(db), mode, str(marker)],
                            cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    pid_line = proc.stdout.readline().strip()
    try:
        ready = proc.stdout.readline().strip()
        assert ready, proc.stderr.read() if proc.poll() is not None else 'missing startup'
        base = 'http://127.0.0.1:' + str(json.loads(ready)['port'])
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor() as pool:
            future = pool.submit(request, base, '/commands', body)
            wait_for(marker.exists)
            journal = json.loads((db.parent / '.knot/http.seq').read_text())
            print('BEFORE_KILL ' + json.dumps(journal), flush=True)
            killed = subprocess.run([bash, str(killer), pid_line.split('=')[1]], capture_output=True, text=True, timeout=10)
            print(killed.stdout, end='')
            print(killed.stderr, end='')
            assert killed.returncode == 0
            out, err = proc.communicate(timeout=10)
            print(out, end='')
            print(err, end='')
            assert proc.returncode == 137
            try:
                response = future.result()
                print('COMMAND ' + json.dumps(response))
            except Exception as exc:
                assert mode == 'pending'
                print('COMMAND_DISCONNECTED ' + type(exc).__name__)
        return journal
    finally:
        if proc.poll() is None:
            subprocess.run([bash, str(killer), pid_line.split('=')[1]], capture_output=True, timeout=10)
            proc.communicate(timeout=10)


def database(folder):
    folder.mkdir(parents=True, exist_ok=True)
    db = folder / 'candidate.db'
    assert init_database(db)['status'] == 'created'
    return db, seed(db)


def test_ac1_pending_real_kill(tmp_path, monkeypatch):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    db, (asset, claim) = database(tmp_path)
    crash(db, 'pending', dict(command='claim.confirm', args=dict(claim_id=claim)), tmp_path)
    before_db = db.read_bytes()
    before_journal = (tmp_path / '.knot/http.seq').read_bytes()
    live = Live(db)
    try:
        health = live.get('/health')
        print('AC-1 HEALTH ' + json.dumps(health))
        assert health[0] == 200
        assert health[1]['value']['status'] == 'degraded' and health[1]['value']['read_only'] is True
        assert health[1]['value']['pending']['command'] == 'claim.confirm'
        assert live.get('/snapshot')[0] == 200
        assert live.get('/assets/' + asset)[0] == 200
        for name in ('claim.confirm', 'claim.revoke', 'claim.restore', 'bundle.create', 'bundle.export'):
            response = request(live.base, '/commands', dict(command=name, args={}))
            print('AC-1 WRITE ' + json.dumps(response))
            assert response[0] == 409 and response[1]['error']['code'] == 'SERVER_BUSY'
            assert response[1]['error']['detail']['reason'] == 'incomplete_command_requires_review'
        assert db.read_bytes() == before_db
        assert (tmp_path / '.knot/http.seq').read_bytes() == before_journal
    finally:
        live.stop()


@pytest.mark.parametrize('mode', ['after', 'before'])
@pytest.mark.parametrize('iteration', range(3))
def test_ac2_running_real_kill(tmp_path, monkeypatch, mode, iteration):
    monkeypatch.delenv('KNOT_TOKEN', raising=False)
    db, (asset, _) = database(tmp_path)
    body = dict(command='bundle.create', args=dict(asset_ids=[asset]), idempotency_key='crash')
    journal = crash(db, mode, body, tmp_path)
    jid, = journal['jobs']
    assert journal['jobs'][jid]['status'] == 'running'
    live = Live(db)
    try:
        response = live.get('/jobs/' + jid)
        print(f'AC-2 {mode} #{iteration + 1} JOB ' + json.dumps(response))
        assert response[0] == 200
        assert response[1]['value']['status'] == 'failed'
        assert response[1]['value']['error']['message'] == 'interrupted_job_requires_review'
        with closing(sqlite3.connect(db)) as conn:
            rows = conn.execute('SELECT bundle_id,job_id FROM continuation_bundles').fetchall()
        print('AC-2 BUNDLES ' + json.dumps(rows))
        assert len(rows) == (1 if mode == 'after' else 0)
        assert all(row[1] == jid for row in rows)
        assert request(live.base, '/commands', body)[1]['value']['job_id'] == jid
    finally:
        live.stop()
    before = (tmp_path / '.knot/http.seq').read_bytes()
    live = Live(db)
    try:
        assert live.get('/jobs/' + jid) == response
        assert (tmp_path / '.knot/http.seq').read_bytes() == before
    finally:
        live.stop()
