import json
import os
from pathlib import Path
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor


ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "mvp" / "devtools" / "plugin_runtime.py"


def run_runtime(*args):
    return subprocess.run(
        [sys.executable, "-B", str(RUNTIME), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=20,
    )


def payload(result):
    assert result.stdout
    return json.loads(result.stdout)


def test_runtime_isolated_lifecycle(tmp_path, monkeypatch):
    monkeypatch.setenv('KNOT_RUNTIME_TOKEN','isolated-runtime-test-token-20261114')
    root = tmp_path / "private-runtime"

    checked = run_runtime("check", "--root", str(root))
    assert checked.returncode == 0
    assert payload(checked)["credentials_inherited"] is False

    initialized = run_runtime("init", "--root", str(root))
    assert initialized.returncode == 0
    assert payload(initialized)["status"] == "created"
    db = root / "data" / "knot.sqlite3"
    assert db.is_file()

    started = run_runtime("start", "--root", str(root))
    assert started.returncode == 0
    started_value = payload(started)
    assert started_value["status"] == "started"
    assert started_value["health"]["schema_version"] == "1.9"
    assert started_value["service"]["db_path"] == "data/knot.sqlite3"

    try:
        status = run_runtime("status", "--root", str(root))
        assert status.returncode == 0
        assert payload(status)["status"] == "running"
    finally:
        stopped = run_runtime("stop", "--root", str(root))
    assert stopped.returncode == 0
    assert payload(stopped)["status"] == "stopped"
    assert not (root / "runtime" / "service.json").exists()


def test_runtime_refuses_database_outside_root(tmp_path):
    result = run_runtime("check", "--root", str(tmp_path / "root"),
                         "--db", str(tmp_path / "outside.sqlite3"))
    assert result.returncode == 1
    assert payload(result)["code"] == "RUNTIME_DB_OUTSIDE_ROOT"


def test_runtime_requires_explicit_database_before_start(tmp_path):
    result = run_runtime("start", "--root", str(tmp_path / "root"))
    assert result.returncode == 1
    assert payload(result)["code"] == "RUNTIME_DB_REQUIRED"


def test_init_refusal_nonzero_and_no_token_start(tmp_path,monkeypatch):
    root=tmp_path/'runtime'
    assert run_runtime('init','--root',str(root)).returncode == 0
    assert run_runtime('init','--root',str(root)).returncode == 1
    monkeypatch.delenv('KNOT_RUNTIME_TOKEN',raising=False)
    result=run_runtime('start','--root',str(root))
    assert result.returncode == 1 and payload(result)['code'] == 'RUNTIME_TOKEN_REQUIRED'


def test_existing_database_is_not_adopted(tmp_path):
    from mvp.backend.init_db import init_database
    root=tmp_path/'external'
    db=root/'data'/'knot.sqlite3'
    assert init_database(str(db))['status']=='created'
    result=run_runtime('init','--root',str(root))
    assert result.returncode == 1
    assert not (root/'runtime-root.json').exists()


def test_concurrent_starts_are_serialized(tmp_path,monkeypatch):
    monkeypatch.setenv('KNOT_RUNTIME_TOKEN','isolated-runtime-test-token-20261114')
    root=tmp_path/'concurrent'
    assert run_runtime('init','--root',str(root)).returncode == 0
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _: run_runtime('start','--root',str(root)),range(2)))
        assert all(r.returncode == 0 for r in results)
        assert sorted(payload(r)['status'] for r in results)==['already_running','started']
        assert len({payload(r)['service']['pid'] for r in results})==1
    finally:
        assert run_runtime('stop','--root',str(root)).returncode == 0
