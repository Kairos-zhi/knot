import json
from pathlib import Path
import subprocess
import sys


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


def test_runtime_isolated_lifecycle(tmp_path):
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

    status = run_runtime("status", "--root", str(root))
    assert status.returncode == 0
    assert payload(status)["status"] == "running"

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
