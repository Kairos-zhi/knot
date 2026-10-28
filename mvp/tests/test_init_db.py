"""Create-only initialization: preservation, publication, cleanup and CLI contract."""

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

from mvp.backend import init_db

ROOT = Path(__file__).resolve().parents[2]


def cli(target, *args):
    return subprocess.run(
        [sys.executable, "-m", "mvp.backend.init_db", str(target), *args],
        cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=20,
    )


def readback(target):
    with closing(sqlite3.connect(target.as_uri() + "?mode=ro&immutable=1", uri=True)) as conn:
        assert conn.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
        assert conn.execute("SELECT version FROM schema_version ORDER BY version").fetchall() == [
            ("1.0",), ("1.1",), ("1.2",), ("1.3",),
        ]
        assert conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchone() == (14,)
        assert conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='index' AND name='uq_eligible_snapshot_event'"
        ).fetchone() == (1,)
        assert conn.execute("SELECT count(*) FROM assets").fetchone() == (0,)


@pytest.mark.parametrize("existing", ["bytes", "database", "directory", "symlink", "dangling"])
def test_existing_entry_untouched(tmp_path, existing):
    target = tmp_path / "existing.db"
    if existing == "bytes":
        target.write_bytes(b"existing user data\x00\xff")
    elif existing == "database":
        assert cli(target).returncode == 0
    elif existing == "directory":
        target.mkdir()
    else:
        referent = tmp_path / "referent.db"
        if existing == "symlink":
            referent.write_bytes(b"do not touch")
        try:
            target.symlink_to(referent)
        except OSError as exc:
            pytest.skip(f"symlinks unavailable: {exc}")
    before = sorted(p.name for p in tmp_path.iterdir())
    digest = hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else None
    link = os.readlink(target) if target.is_symlink() else None
    completed = cli(target)
    assert completed.returncode == 1
    assert json.loads(completed.stdout)["status"] == "refused"
    assert json.loads(completed.stdout)["reason"] == "target_exists"
    assert sorted(p.name for p in tmp_path.iterdir()) == before
    if digest is not None:
        assert hashlib.sha256(target.read_bytes()).hexdigest() == digest
    if link is not None:
        assert os.readlink(target) == link


@pytest.mark.parametrize("nested", [False, True])
def test_create_readonly_readback_and_closed_stdin(tmp_path, nested):
    target = tmp_path / "new.db"
    if nested:
        target = tmp_path / "new parent" / "nested" / "新库 #%.db"
    completed = cli(target)
    assert completed.returncode == 0, completed.stderr
    assert len(completed.stdout.splitlines()) == 1
    assert json.loads(completed.stdout) == dict(
        db=str(target), status="created", schema_version="1.3", tables=14, reason=None, error=None,
    )
    assert "created" in completed.stderr
    readback(target)
    assert sorted(p.name for p in target.parent.iterdir()) == [target.name]


@pytest.mark.parametrize("stage", ["schema", "validate", "temporary_readback", "link", "target_readback"])
def test_injected_failure_cleans_all_files(tmp_path, monkeypatch, stage, capsys):
    target = tmp_path / "new.db"
    original_readback = init_db._readback

    def fail(*args, **kwargs):
        raise OSError("injected failure")

    if stage == "schema":
        original_read = Path.read_text

        def broken_schema(path, *args, **kwargs):
            if path.name == "schema_v1.sql":
                return "PRAGMA journal_mode=WAL; CREATE TABLE partial(id); INVALID SQL;"
            return original_read(path, *args, **kwargs)

        monkeypatch.setattr(Path, "read_text", broken_schema)
    elif stage == "validate":
        monkeypatch.setattr(init_db, "_validate", fail)
    elif stage in ("temporary_readback", "target_readback"):
        def injected_readback(path):
            if (path == target) == (stage == "target_readback"):
                fail()
            original_readback(path)
        monkeypatch.setattr(init_db, "_readback", injected_readback)
    else:
        monkeypatch.setattr(init_db.os, "link", fail)
    monkeypatch.setattr(sys, "argv", ["init_db", str(target)])
    assert init_db.main() == 1
    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "failed"
    assert "temporary files cleaned" in result["error"]
    assert list(tmp_path.iterdir()) == []


def test_missing_schema_fails_without_target(tmp_path, monkeypatch):
    def missing(*args, **kwargs):
        raise FileNotFoundError("schema missing")
    monkeypatch.setattr(Path, "read_text", missing)
    result = init_db.init_database(str(tmp_path / "new.db"))
    assert result["status"] == "failed"
    assert list(tmp_path.iterdir()) == []


def test_race_at_publication_preserves_winner(tmp_path, monkeypatch):
    target = tmp_path / "new.db"
    def winner(source, destination):
        destination.write_bytes(b"winner")
        raise FileExistsError("another creator won")
    monkeypatch.setattr(init_db.os, "link", winner)
    assert init_db.init_database(str(target))["status"] == "refused"
    assert target.read_bytes() == b"winner"
    assert list(tmp_path.iterdir()) == [target]


def test_temporary_name_collision_preserves_existing_file(tmp_path, monkeypatch):
    class FixedUUID:
        hex = "collision"
    monkeypatch.setattr(init_db, "uuid4", FixedUUID)
    collision = tmp_path / "new.db.tmp-collision"
    collision.write_bytes(b"belongs to another initializer")
    result = init_db.init_database(str(tmp_path / "new.db"))
    assert result["status"] == "failed"
    assert collision.read_bytes() == b"belongs to another initializer"
    assert list(tmp_path.iterdir()) == [collision]


def test_two_processes_race(tmp_path):
    target = tmp_path / "new.db"
    # Barrier inside os.link guarantees both processes have built their temporary DB.
    program = """
import os, pathlib, sys, time
from mvp.backend import init_db
link = os.link
own, peer = sys.argv[2:4]
def barrier(source, destination):
    pathlib.Path(own).touch()
    deadline = time.monotonic() + 10
    while not pathlib.Path(peer).exists():
        if time.monotonic() > deadline:
            raise TimeoutError('publication barrier')
        time.sleep(0.01)
    return link(source, destination)
init_db.os.link = barrier
sys.argv = ['init_db', sys.argv[1]]
sys.exit(init_db.main())
"""
    a, b = tmp_path / "a.ready", tmp_path / "b.ready"
    processes = [subprocess.Popen(
        [sys.executable, "-c", program, str(target), str(own), str(peer)], cwd=ROOT,
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    ) for own, peer in [(a, b), (b, a)]]
    outputs = [process.communicate(timeout=20) for process in processes]
    assert sorted((p.returncode, json.loads(out[0])["status"])
                  for p, out in zip(processes, outputs)) == [(0, "created"), (1, "refused")]
    readback(target)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["a.ready", "b.ready", "new.db"]


@pytest.mark.parametrize("option", ["--force", "--replace", "-y", "--unknown"])
def test_no_overwrite_or_unknown_options(tmp_path, option):
    completed = cli(tmp_path / "new.db", option)
    assert completed.returncode == 2
    assert completed.stdout == ""
    assert list(tmp_path.iterdir()) == []
