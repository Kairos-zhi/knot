import sqlite3
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import pytest

from mvp.backend import migrate_schema_v1_8, exploration_repo
from mvp.backend.exploration_repo import ExplorationRepo, ExplorationError
from mvp.tests.test_exploration_core import predecessor, db, db_rows, asset, uid, failure


def test_relations_history_compatibility_and_recovery(db):
    a, b = asset(db, b"a"), asset(db, b"b")
    repo, ident, key = ExplorationRepo(db), uid(), uid()
    old = dict(expected_revision=0, request_key=key, references=[a, b], stop_note="note")
    first = repo.save("A", ident, **old)
    rel = dict(relation_id=uid(), from_asset_id=a["asset_id"], to_asset_id=b["asset_id"], label="rel", reason="why")
    args = dict(expected_revision=1, request_key=uid(), snapshot_version=2, references=[a, b], stop_note="note", relations=[rel])
    failure("EXPLORATION_MIGRATION_REQUIRED", repo.save_v2, "A", ident, **args)
    failure("EXPLORATION_MIGRATION_REQUIRED", repo.load_v2, "A", ident)
    migrate_schema_v1_8.migrate_schema(db)
    assert repo.load_v2("A", ident)["snapshot_version"] == 1
    second = repo.save_v2("A", ident, **args)
    assert repo.save_v2("A", ident, **args) == second
    assert repo.save("A", ident, **old) == first
    failure("SNAPSHOT_VERSION_REQUIRED", repo.load, "A", ident)
    assert repo.load("A", ident, revision=1)["revision"] == 1
    failure("SNAPSHOT_VERSION_REQUIRED", repo.save, "A", ident, expected_revision=2, request_key=uid(), references=[a, b])
    failure("IDEMPOTENCY_CONFLICT", repo.save_v2, "A", ident, **(args | {"request_key": key}))
    assert repo.list_current("A")[0]["revision"] == 2
    changed = rel | {"label": "updated", "reason": ""}
    repo.save_v2("A", ident, **(args | {"expected_revision": 2, "request_key": uid(), "relations": [changed]}))
    repo.save_v2("A", ident, **(args | {"expected_revision": 3, "request_key": uid(), "relations": []}))
    failure("INVALID_ARGUMENTS", repo.save_v2, "A", ident, **(args | {"expected_revision": 4, "request_key": uid(), "relations": [changed | {"from_asset_id": b["asset_id"], "to_asset_id": a["asset_id"]}]}))
    repo.save_v2("A", ident, **(args | {"expected_revision": 4, "request_key": uid(), "relations": [changed]}))
    assert repo.load_v2("A", ident, revision=2)["relations"][0]["label"] == "rel"
    failure("INVALID_ARGUMENTS", repo.save_v2, "A", ident, **(args | {"expected_revision": 5, "request_key": uid(), "references": [a]}))
    db_rows(db, "DELETE FROM asset_readers WHERE asset_id=?", (b["asset_id"],))
    projection = repo.load_v2("A", ident)
    assert projection["stop_note"] is None and "label" not in projection["relations"][0]
    assert projection["relations"][0]["reason_code"] == "dependency_unavailable"
    assert repo.save("A", ident, **old) == first
    db_rows(db, "INSERT INTO asset_readers VALUES (?,?)", (b["asset_id"], "A"))
    assert repo.load_v2("A", ident)["relations"][0]["label"] == "updated"
    db_rows(db, "UPDATE assets SET content_hash=? WHERE asset_id=?", ("0" * 64, b["asset_id"]))
    assert "label" not in repo.load_v2("A", ident)["relations"][0]
    db_rows(db, "UPDATE assets SET content_hash=? WHERE asset_id=?", (b["expected_content_hash"], b["asset_id"]))
    failure("NOT_FOUND", repo.load_v2, "B", ident)
    failure("NOT_FOUND", repo.load_v2, "B", uid())


def test_concurrent_cas_and_closed_inputs(db):
    migrate_schema_v1_8.migrate_schema(db)
    repo, ident = ExplorationRepo(db), uid()
    args = dict(expected_revision=0, snapshot_version=2, references=[], stop_note=None, relations=[])
    def write(_):
        try:
            return repo.save_v2("A", ident, request_key=uid(), **args)["revision"]
        except ExplorationError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(write, range(2)), key=str) == [1, "REVISION_CONFLICT"]
    failure("INVALID_ARGUMENTS", repo.save_v2, "A", uid(), request_key=uid(), **(args | {"snapshot_version": True}))
    failure("SNAPSHOT_VERSION_REQUIRED", repo.save, "A", ident, expected_revision=1, request_key=uid(), references=[])


def test_invalid_history_and_failed_append_are_closed(db, monkeypatch):
    migrate_schema_v1_8.migrate_schema(db)
    ident, key = uid(), uid()
    repo = ExplorationRepo(db)
    args = dict(expected_revision=0, request_key=key, snapshot_version=2, references=[], stop_note=None, relations=[])
    def abort(*args):
        raise RuntimeError("injected after insert")
    with monkeypatch.context() as patch:
        patch.setattr(exploration_repo, "_receipt", abort)
        with pytest.raises(RuntimeError, match="injected"):
            repo.save_v2("A", ident, **args)
    assert not db_rows(db, "SELECT * FROM exploration_revisions")
    receipt = repo.save_v2("A", ident, **args)
    assert ExplorationRepo(db).save_v2("A", ident, **args) == receipt
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO exploration_revisions VALUES (?,?,?,?,?,?,?,?)",
                     (uid(), 1, "A", uid(), 1, uid(), "digest", '{"references":[],"stop_note":null,"extra":1}'))
        bad_id = conn.execute("SELECT exploration_id FROM exploration_revisions WHERE request_digest='digest'").fetchone()[0]
    failure("INVALID_SNAPSHOT", repo.load_v2, "A", bad_id)
    failure("INVALID_SNAPSHOT", repo.save, "A", bad_id, expected_revision=1, request_key=uid(), references=[])


def test_process_cas_and_restart_replay(db):
    migrate_schema_v1_8.migrate_schema(db)
    ident, keys = uid(), [uid(), uid()]
    script = '''import json,sys
from mvp.backend.exploration_repo import ExplorationRepo, ExplorationError
r=ExplorationRepo(sys.argv[1])
try:
 print(json.dumps(r.save_v2("A",sys.argv[2],expected_revision=0,request_key=sys.argv[3],snapshot_version=2,references=[],stop_note=None,relations=[])))
except ExplorationError as e: print(json.dumps(e.code))
'''
    def start(key):
        return subprocess.Popen([sys.executable, "-c", script, str(db), ident, key], stdout=subprocess.PIPE, text=True)
    processes = [start(key) for key in keys]
    results = [json.loads(p.communicate(timeout=20)[0]) for p in processes]
    assert all(p.returncode == 0 for p in processes)
    assert sum(isinstance(r, dict) for r in results) == 1
    assert "REVISION_CONFLICT" in results
    winner = next(i for i, value in enumerate(results) if isinstance(value, dict))
    retry = start(keys[winner])
    assert json.loads(retry.communicate(timeout=20)[0]) == results[winner]
    assert retry.returncode == 0
