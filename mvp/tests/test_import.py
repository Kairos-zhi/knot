"""Importer contracts: raw bytes, paired events, idempotency and safe failures."""

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
from urllib.parse import unquote

import pytest

from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.import_baseline import (
    import_baseline, snapshot, verify_manifest, TEXT_LIMIT,
)


def write_manifest(source):
    rows = snapshot(source.resolve())
    (source / "MANIFEST.sha256").write_text(
        "".join(f"{r['sha256']}  {r['path']}\n" for r in rows
                if r["path"] != "MANIFEST.sha256"), encoding="utf-8",
    )


@pytest.fixture
def source(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    for i in range(14):
        path = source / (f"nested/第十七轮_{i}.md" if i < 5 else f"{i}.md")
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(f"# 第十七轮\r\n本文 needle {i}\r\n".encode("utf-8"))
    for i in range(3):
        (source / f"{i}.py").write_bytes(f"# script {i}\r\n".encode())
        # Deliberately not valid ZIP data: an importer must never open archives.
        (source / f"archive{i}.zip").write_bytes(b"PK\xff\x00" + bytes([i]))
    (source / "PACKAGE_METADATA.json").write_bytes(b'{"origin":"v0.4"}')
    write_manifest(source)
    assert len(snapshot(source)) == 22
    return source


@pytest.fixture
def db_path(tmp_path):
    path = tmp_path / "candidate" / "knot.db"
    path.parent.mkdir()
    with closing(sqlite3.connect(path)) as conn:
        schema = Path(__file__).parents[1] / "backend/schema_v1.sql"
        conn.executescript(schema.read_text(encoding="utf-8"))
    return path


def test_import_types_hash_events_fts_and_rerun(source, db_path):
    before = snapshot(source)
    assert import_baseline(source, db_path) == {
        "imported": 22, "skipped": 0, "indexed": 19, "unindexed": 3, "failed": [],
    }
    repo = AssetRepo(db_path)
    store = EventStore(db_path)
    rows = repo.search_assets(limit=100)
    assert len(rows) == len({r["content_hash"] for r in rows}) == 22
    assert store.count_events() == 22
    for row in rows:
        relative = unquote(row["source_uri"][len("file://"):])
        original = source / relative
        raw = original.read_bytes()
        assert row["content_hash"] == hashlib.sha256(raw).hexdigest()
        suffix = original.suffix
        expected = {".md": "text/markdown", ".py": "text/x-python",
                    ".json": "application/json", ".sha256": "text/plain",
                    ".zip": "application/zip"}[suffix]
        assert row["media_type"] == expected
        if suffix == ".zip":
            assert row["content_blob"] is None
            assert row["file_path"] == (
                f"objects/{row['content_hash'][:2]}/{row['content_hash']}"
            )
            assert (db_path.parent / row["file_path"]).read_bytes() == raw
        else:
            assert row["content_blob"] == raw and row["file_path"] is None
        events = store.get_events_by_subject(row["asset_id"])
        assert len(events) == 1 and events[0]["event_type"] == "import"
        event = events[0]
        assert event["source"] == row["source_uri"]
        assert event["event_time"] == original.stat().st_mtime_ns // 1_000_000
        assert json.loads(event["target_assets"]) == [row["asset_id"]]
        assert json.loads(event["evidence_refs"]) == []
        assert json.loads(event["payload_json"]) == {
            "bytes": len(raw), "media_type": expected, "origin": "v0.4",
        }
    assert len(repo.search_assets("第十七轮", media_type="text/markdown")) == 14
    assert len(repo.list_unindexed()) == 3
    with closing(sqlite3.connect(db_path)) as conn:
        assert conn.execute("SELECT COUNT(*) FROM assets_fts").fetchone()[0] == 19
        assert conn.execute("PRAGMA synchronous").fetchone()[0] == 2
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert import_baseline(source, db_path) == {
        "imported": 0, "skipped": 22, "indexed": 0, "unindexed": 0, "failed": [],
    }
    assert repo.count_assets() == store.count_events() == 22
    assert snapshot(source) == before and verify_manifest(source) == before


def test_threshold_raw_bytes_and_json_exception(source, db_path):
    (source / "small.md").write_bytes(b"x" * TEXT_LIMIT)
    (source / "large.md").write_bytes(b"y" * (TEXT_LIMIT + 1))
    write_manifest(source)
    result = import_baseline(source, db_path)
    assert result["failed"] == [] and result["imported"] == 24
    repo = AssetRepo(db_path)
    unindexed = repo.list_unindexed()
    assert len(unindexed) == 4
    assert any(r["source_uri"] == "file://large.md" for r in unindexed)
    small = next(r for r in repo.search_assets(limit=100)
                 if r["source_uri"] == "file://small.md")
    assert len(small["content_blob"]) == TEXT_LIMIT


def test_manifest_failure_precedes_database_access(source, tmp_path):
    (source / "PACKAGE_METADATA.json").write_bytes(b"changed")
    missing = tmp_path / "missing.db"
    with pytest.raises(ValueError, match="manifest hash mismatch"):
        import_baseline(source, missing)
    assert not missing.exists()


def test_event_failure_rolls_back_pair_and_rerun_recovers(source, db_path, monkeypatch):
    original = EventStore.add_event
    triggered = False

    def failing(self, *args, **kwargs):
        nonlocal triggered
        value = original(self, *args, **kwargs)
        if not triggered:
            triggered = True
            raise sqlite3.OperationalError("injected after event write")
        return value

    monkeypatch.setattr(EventStore, "add_event", failing)
    result = import_baseline(source, db_path)
    assert result["imported"] == 21 and len(result["failed"]) == 1
    assert AssetRepo(db_path).count_assets() == EventStore(db_path).count_events() == 21
    monkeypatch.setattr(EventStore, "add_event", original)
    result = import_baseline(source, db_path)
    assert result["imported"] == 1 and result["skipped"] == 21
    assert AssetRepo(db_path).count_assets() == EventStore(db_path).count_events() == 22


def test_source_target_overlap_rejected(source):
    with pytest.raises(ValueError, match="outside"):
        import_baseline(source, source / "candidate.db")
    assert not (source / "candidate.db").exists()


def test_future_mtime_is_failure_not_false_success(source, db_path):
    path = source / "PACKAGE_METADATA.json"
    future = time.time() + 10000
    os.utime(path, (future, future))
    result = import_baseline(source, db_path)
    assert result["imported"] == 21 and len(result["failed"]) == 1
    assert "future" in result["failed"][0]["error"]
    assert AssetRepo(db_path).count_assets() == EventStore(db_path).count_events() == 21


def test_existing_corrupt_object_is_not_replaced(source, db_path):
    raw = (source / "archive0.zip").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    obj = db_path.parent / "objects" / digest[:2] / digest
    obj.parent.mkdir(parents=True)
    obj.write_bytes(b"existing corruption")
    result = import_baseline(source, db_path)
    assert len(result["failed"]) == 1 and result["imported"] == 21
    assert obj.read_bytes() == b"existing corruption"
    assert AssetRepo(db_path).count_assets() == EventStore(db_path).count_events() == 21


def test_cli_failure_emits_json_and_nonzero(source, db_path):
    (source / "unknown.bin").write_bytes(b"unknown")
    write_manifest(source)
    result = subprocess.run(
        [sys.executable, "-m", "mvp.backend.import_baseline",
         "--source", str(source), "--db", str(db_path)],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 1
    summary = json.loads(result.stdout)
    assert summary["imported"] == 22 and len(summary["failed"]) == 1


def test_transaction_requires_session_and_rejects_nesting(db_path):
    repo = AssetRepo(db_path)
    with pytest.raises(RuntimeError, match="session"):
        with repo.transaction():
            pass
    with repo.session(), repo.transaction():
        with pytest.raises(RuntimeError, match="nest"):
            with repo.transaction():
                pass


def test_manifest_snapshot_race_rejected(source, db_path, monkeypatch):
    from mvp.backend import import_baseline as importer

    original = importer.digest
    changed = False

    def racing_digest(path):
        nonlocal changed
        value = original(path)
        if path.name == "PACKAGE_METADATA.json" and not changed:
            changed = True
            path.write_bytes(b"unverified changed bytes")
        return value

    monkeypatch.setattr(importer, "digest", racing_digest)
    with pytest.raises(ValueError, match="manifest"):
        import_baseline(source, db_path)
    assert AssetRepo(db_path).count_assets() == EventStore(db_path).count_events() == 0


def test_v1_0_is_rejected_without_automatic_migration(source, tmp_path):
    path = tmp_path / "old.db"
    schema = Path(__file__).with_name("fixtures") / "schema_v1_0.sql"
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
    with pytest.raises(ValueError, match="schema 1.1"):
        import_baseline(source, path)
    with closing(sqlite3.connect(path)) as conn:
        assert conn.execute("SELECT version FROM schema_version").fetchall() == [
            ("1.0",)
        ]
        assert conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0] == 0
    assert not (path.parent / "objects").exists()
