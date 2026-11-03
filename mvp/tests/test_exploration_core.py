"""Checkpoint writes, authorization projections and explicit migration in disposable SQLite."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from hashlib import sha256
import json
import sqlite3
import subprocess
import sys
from threading import Barrier, Event
from uuid import uuid4

import pytest

from mvp.backend import exploration_repo, migrate_schema_v1_7
from mvp.backend.exploration_repo import ExplorationError, ExplorationRepo
from mvp.backend.migrate_schema_v1_5 import migrate_schema as migrate5
from mvp.backend.migrate_schema_v1_6 import SchemaDriftError, migrate_schema as migrate6
from mvp.tests.schema_helpers import create_v14


def uid():
    return str(uuid4())


def db_rows(db, sql, params=()):
    with closing(sqlite3.connect(db)) as conn, conn:
        return conn.execute(sql, params).fetchall()


@pytest.fixture
def predecessor(tmp_path):
    db = tmp_path / "exploration.db"
    assert create_v14(db)["status"] == "created"
    migrate5(db)
    migrate6(db)
    return db


@pytest.fixture
def db(predecessor):
    assert migrate_schema_v1_7.migrate_schema(predecessor) == {"schema_version": "1.7", "created": True}
    return predecessor


def asset(db, body, actor="A", disposition="selected", reason=None):
    digest, asset_id = sha256(body).hexdigest(), uid()
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute(
            """INSERT INTO assets (asset_id, content_hash, media_type, content_blob, created_at, imported_at)
               VALUES (?, ?, 'text/plain', ?, 0, 0)""",
            (asset_id, digest, body),
        )
        if actor:
            conn.execute("INSERT INTO asset_readers VALUES (?, ?)", (asset_id, actor))
    return {"asset_id": asset_id, "expected_content_hash": digest,
            "disposition": disposition, "reason": reason}


def failure(code, action, *args, **kwargs):
    with pytest.raises(ExplorationError) as caught:
        action(*args, **kwargs)
    assert caught.value.code == code


def test_explicit_additive_migration_and_drift(predecessor):
    existing = asset(predecessor, b"existing content")
    before = db_rows(predecessor, "SELECT * FROM assets")
    with pytest.raises(SchemaDriftError):
        ExplorationRepo(predecessor)
    assert db_rows(predecessor, "SELECT version FROM schema_version WHERE version = '1.7'") == []
    assert migrate_schema_v1_7.migrate_schema(predecessor)["created"] is True
    version = db_rows(predecessor, "SELECT * FROM schema_version")
    assert migrate_schema_v1_7.migrate_schema(predecessor)["created"] is False
    assert db_rows(predecessor, "SELECT * FROM schema_version") == version
    assert db_rows(predecessor, "SELECT * FROM assets") == before
    assert db_rows(predecessor, "SELECT * FROM asset_readers") == [(existing["asset_id"], "A")]
    repo = ExplorationRepo(predecessor)
    db_rows(predecessor, "DROP TRIGGER exploration_revisions_delete")
    for action in (lambda: ExplorationRepo(predecessor), lambda: repo.list_current("A"),
                   lambda: migrate_schema_v1_7.migrate_schema(predecessor)):
        with pytest.raises(SchemaDriftError):
            action()
    assert db_rows(predecessor, "SELECT * FROM schema_version") == version


def test_migration_rolls_back_ddl_and_version_on_late_failure(predecessor, monkeypatch):
    def fail(conn):
        assert conn.execute("SELECT version FROM schema_version WHERE version='1.7'").fetchone()
        assert conn.execute("SELECT count(*) FROM exploration_revisions").fetchone() == (0,)
        raise SchemaDriftError("synthetic post-DDL failure")

    monkeypatch.setattr(migrate_schema_v1_7, "require_exploration_schema", fail)
    with pytest.raises(SchemaDriftError, match="synthetic post-DDL failure"):
        migrate_schema_v1_7.migrate_schema(predecessor)
    assert db_rows(predecessor, "SELECT name FROM sqlite_master WHERE name LIKE 'exploration_%'") == []
    assert db_rows(predecessor, "SELECT version FROM schema_version WHERE version='1.7'") == []


@pytest.mark.parametrize("kind", ["unversioned_table", "unversioned_view", "forged_version", "missing_reader"])
def test_migration_rejects_partial_predecessor(predecessor, kind):
    statements = {
        "unversioned_table": "CREATE TABLE exploration_revisions (unexpected TEXT)",
        "unversioned_view": "CREATE VIEW exploration_revisions AS SELECT 1 AS unexpected",
        "forged_version": "INSERT INTO schema_version VALUES ('1.7', 0, 'forged')",
        "missing_reader": "DROP TABLE asset_readers",
    }
    db_rows(predecessor, statements[kind])
    before = db_rows(predecessor, "SELECT name, sql FROM sqlite_master ORDER BY name")
    with pytest.raises(SchemaDriftError):
        migrate_schema_v1_7.migrate_schema(predecessor)
    assert db_rows(predecessor, "SELECT name, sql FROM sqlite_master ORDER BY name") == before


def test_ordered_revisions_and_opaque_idempotency_after_restart(db):
    a = asset(db, b"asset-body-a", reason="use evidence")
    b = asset(db, b"asset-body-b", disposition="excluded", reason="set aside")
    repo = ExplorationRepo(db)
    ident, key = uid(), uid()
    args = dict(expected_revision=0, request_key=key, references=[b, a], stop_note="next question")
    first = repo.save("A", ident, **args)
    assert set(first) == {"exploration_id", "revision", "event_id"}
    assert first["exploration_id"] == ident and first["revision"] == 1
    second = repo.save("A", ident, expected_revision=1, request_key=uid(),
                       references=[a, b], stop_note="new stopping point")
    assert second["revision"] == 2 and second["event_id"] != first["event_id"]
    # A new process and a lost earlier receipt still identify the original save.
    worker = (
        "import json, sys; from mvp.backend.exploration_repo import ExplorationRepo; "
        "repo = ExplorationRepo(sys.argv[1]); "
        "print(json.dumps([repo.save('A', sys.argv[2], **json.loads(sys.argv[3])), "
        "repo.load('A', sys.argv[2])]))"
    )
    process = subprocess.run(
        [sys.executable, "-B", "-c", worker, str(db), ident, json.dumps(args)],
        capture_output=True, text=True, timeout=10, check=True,
    )
    assert json.loads(process.stdout) == [first, repo.load("A", ident)]
    reopened = ExplorationRepo(db)
    assert reopened.save("A", ident, **args) == first
    normalized = [b, a | {"expected_content_hash": a["expected_content_hash"].upper()}]
    assert reopened.save("A", ident, **(args | {"references": normalized})) == first
    failure("IDEMPOTENCY_CONFLICT", reopened.save, "A", ident, **(args | {"references": [a, b]}))
    failure("REVISION_CONFLICT", reopened.save, "A", ident, **(args | {"request_key": uid()}))
    history = reopened.load("A", ident, revision=1)
    assert history["event_id"] == first["event_id"]
    assert history["references"] == [ref | {"status": "available"} for ref in [b, a]]
    assert history["stop_note"] == "next question"
    current = reopened.load("A", ident)
    assert current["stop_note"] == "new stopping point"
    assert current["references"] == [ref | {"status": "available"} for ref in [a, b]]
    duplicate_content_id = uid()
    other = reopened.save("A", duplicate_content_id, **(args | {"request_key": uid()}))
    assert other["exploration_id"] != ident and other["event_id"] != first["event_id"]
    assert reopened.list_current("A") == [
        {"exploration_id": duplicate_content_id, "revision": 1,
         "saved_at": reopened.load("A", duplicate_content_id)["saved_at"]},
        {"exploration_id": ident, "revision": 2, "saved_at": current["saved_at"]},
    ]
    assert reopened.list_current("A", limit=1)[0]["exploration_id"] == duplicate_content_id
    assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(3,)]
    assert db_rows(db, "SELECT count(*) FROM history_events") == [(0,)]
    assert all("asset-body-" not in row[0] for row in db_rows(db, "SELECT snapshot_json FROM exploration_revisions"))


def test_owner_reader_revocation_and_redaction(db, monkeypatch):
    monkeypatch.delenv("KNOT_TOKEN", raising=False)
    monkeypatch.delenv("KNOT_TOKENS", raising=False)
    allowed = asset(db, b"readable", reason="available reason")
    denied = asset(db, b"other reader", actor="B")
    repo = ExplorationRepo(db)
    ident, key = uid(), uid()
    args = dict(expected_revision=0, request_key=key, references=[allowed], stop_note="private note")
    first = repo.save("A", ident, **args)
    failure("NOT_FOUND", repo.load, "B", ident)
    failure("NOT_FOUND", repo.load, "B", ident, revision=1)
    failure("NOT_FOUND", repo.save, "B", ident, **args)
    failure("NOT_FOUND", repo.save, "B", ident, **(args | {"expected_revision": 1}))
    assert repo.list_current("B") == []
    owned_by_b = uid()
    b_receipt = repo.save("B", owned_by_b, **(args | {"references": [denied]}))
    assert b_receipt != first
    failure("NOT_FOUND", repo.save, "B", ident, **(args | {"expected_revision": 1}))
    failure("NOT_FOUND", repo.save, "B", uid(), **(args | {"expected_revision": 1}))
    failure("ASSET_UNAVAILABLE", repo.save, "A", ident, **(
        args | {"request_key": uid(), "expected_revision": 1, "references": [allowed, denied]}
    ))
    db_rows(db, "DELETE FROM asset_readers WHERE asset_id = ?", (allowed["asset_id"],))
    assert repo.save("A", ident, **args) == first
    hidden = repo.load("A", ident)
    assert hidden["stop_note"] is None and hidden["stop_note_reason"] == "dependency_unavailable"
    assert hidden["references"] == [
        {key: value for key, value in allowed.items() if key != "reason"} | {"status": "forbidden"}
    ]
    update_key = uid()
    failure("ASSET_UNAVAILABLE", repo.save, "A", ident, **(
        args | {"request_key": update_key, "expected_revision": 1}
    ))
    revision_two = repo.save("A", ident, expected_revision=1, request_key=update_key,
                             references=[], stop_note="removed unavailable dependency")
    assert repo.load("A", ident)["stop_note"] == "removed unavailable dependency"
    assert repo.load("A", ident, revision=1) == hidden
    assert revision_two["revision"] == 2
    assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(3,)]


def test_reference_hash_and_missing_recomputed_without_implicit_replacement(db):
    a = asset(db, b"body-a", reason="reason A")
    b = asset(db, b"body-b", reason="reason B")
    ident = uid()
    repo = ExplorationRepo(db)
    args = dict(expected_revision=0, request_key=uid(), references=[a, b], stop_note="dependencies")
    wrong = a | {"expected_content_hash": "f" * 64}
    failure("ASSET_UNAVAILABLE", repo.save, "A", ident, **(args | {"references": [wrong, b]}))
    failure("ASSET_UNAVAILABLE", repo.save, "A", ident, **(
        args | {"references": [a | {"asset_id": uid()}, b]}
    ))
    assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(0,)]
    repo.save("A", ident, **args)
    # Simulate historical asset drift in this disposable DB only.
    db_rows(db, "UPDATE assets SET content_hash=? WHERE asset_id=?", ("f" * 64, a["asset_id"]))
    db_rows(db, "DELETE FROM assets WHERE asset_id=?", (b["asset_id"],))
    view = repo.load("A", ident)
    assert [entry["status"] for entry in view["references"]] == ["hash_mismatch", "missing"]
    assert [entry["expected_content_hash"] for entry in view["references"]] == [
        a["expected_content_hash"], b["expected_content_hash"],
    ]
    assert all("reason" not in entry for entry in view["references"])
    assert view["stop_note"] is None


def test_revision_conflict_and_post_insert_failure_leave_no_partial_state(db, monkeypatch):
    repo = ExplorationRepo(db)
    ident = uid()
    repo.save("A", ident, expected_revision=0, request_key=uid(), references=[])
    snapshot = db_rows(db, "SELECT * FROM exploration_revisions")
    args = dict(expected_revision=1, request_key=uid(), references=[], stop_note="atomic retry")

    def abort(*args):
        raise RuntimeError("synthetic failure after insert")

    with monkeypatch.context() as patch:
        patch.setattr(exploration_repo, "_receipt", abort)
        with pytest.raises(RuntimeError, match="synthetic failure"):
            repo.save("A", ident, **args)
    assert db_rows(db, "SELECT * FROM exploration_revisions") == snapshot
    assert repo.save("A", ident, **args)["revision"] == 2

    barrier = Barrier(2)

    def compete(note):
        barrier.wait(timeout=5)
        try:
            return repo.save("A", ident, expected_revision=2, request_key=uid(),
                             references=[], stop_note=note)["revision"]
        except ExplorationError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert set(pool.map(compete, ("left", "right"))) == {3, "REVISION_CONFLICT"}
    assert len(db_rows(db, "SELECT DISTINCT event_id FROM exploration_revisions")) == 3


def test_append_only_guards_include_insert_replace_and_actor_reassignment(db):
    repo = ExplorationRepo(db)
    ident = uid()
    repo.save("A", ident, expected_revision=0, request_key=uid(), references=[])
    for sql in (
        "UPDATE exploration_revisions SET actor='B'",
        "DELETE FROM exploration_revisions",
        "INSERT OR REPLACE INTO exploration_revisions SELECT * FROM exploration_revisions",
        """INSERT OR REPLACE INTO exploration_revisions
           (rowid, exploration_id, revision, actor, event_id, saved_at, request_key,
            request_digest, snapshot_json)
           SELECT rowid, exploration_id, revision+1, actor, 'other-event', saved_at, 'other-key',
                  request_digest, snapshot_json FROM exploration_revisions""",
        """INSERT INTO exploration_revisions
           (rowid, exploration_id, revision, actor, event_id, saved_at, request_key,
            request_digest, snapshot_json)
           SELECT -1, exploration_id, revision+1, actor, 'other-event', saved_at, 'other-key',
                  request_digest, snapshot_json FROM exploration_revisions""",
        """INSERT OR REPLACE INTO exploration_revisions SELECT exploration_id, revision+1, actor,
           event_id, saved_at, 'other-key', request_digest, snapshot_json FROM exploration_revisions""",
        """INSERT OR REPLACE INTO exploration_revisions SELECT exploration_id, revision+1, actor,
           'other-event', saved_at, request_key, request_digest, snapshot_json FROM exploration_revisions""",
        """INSERT INTO exploration_revisions SELECT exploration_id, revision+1, 'B',
           'other-event', saved_at, 'other-key', request_digest, snapshot_json FROM exploration_revisions""",
    ):
        with pytest.raises(sqlite3.IntegrityError):
            db_rows(db, sql)
    assert repo.list_current("B") == []
    assert repo.load("A", ident)["revision"] == 1
    repo.save("A", ident, expected_revision=1, request_key=uid(), references=[])
    assert db_rows(db, "SELECT rowid, revision FROM exploration_revisions ORDER BY rowid") == [
        (1, 1), (2, 2),
    ]


def test_reader_revocation_committed_before_waiting_save(db, monkeypatch):
    ref = asset(db, b"revoked while save waits")
    repo = ExplorationRepo(db)
    started = Event()
    connect = sqlite3.connect

    def traced_connect(*args, **kwargs):
        conn = connect(*args, **kwargs)

        def trace(sql):
            if sql == "BEGIN IMMEDIATE":
                started.set()

        conn.set_trace_callback(trace)
        return conn

    with closing(connect(db)) as writer, ThreadPoolExecutor(max_workers=1) as pool:
        writer.execute("BEGIN IMMEDIATE")
        writer.execute("DELETE FROM asset_readers WHERE asset_id=?", (ref["asset_id"],))
        monkeypatch.setattr(exploration_repo.sqlite3, "connect", traced_connect)
        attempt = pool.submit(repo.save, "A", uid(), expected_revision=0,
                              request_key=uid(), references=[ref])
        try:
            assert started.wait(timeout=3)
        finally:
            writer.commit()
        failure("ASSET_UNAVAILABLE", attempt.result, timeout=5)
    assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(0,)]


def test_input_bounds_and_missing_reader_fail_without_mutation(db):
    repo = ExplorationRepo(db)
    a = asset(db, b"asset")
    ident = uid()
    args = dict(expected_revision=0, request_key=uid(), references=[a])
    for override in (
        {"request_key": "bad"}, {"expected_revision": True}, {"expected_revision": -1},
        {"expected_revision": 2**63}, {"references": [a, a]}, {"references": [a] * 33},
        {"references": [a | {"content": "invalid"}]}, {"references": [a | {"disposition": "read"}]},
        {"references": [a | {"reason": "\u4e2d" * 171}]}, {"stop_note": "\u4e2d" * 683},
        {"stop_note": "\ud800"}, {"stop_note": "bad\x7f"},
    ):
        failure("INVALID_ARGUMENTS", repo.save, "A", ident, **(args | override))
    failure("INVALID_ARGUMENTS", repo.save, "", ident, **args)
    failure("INVALID_ARGUMENTS", repo.list_current, "A", limit=True)
    assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(0,)]
    db_rows(db, "DROP TABLE asset_readers")
    with pytest.raises(SchemaDriftError):
        repo.save("A", ident, **args)
    assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(0,)]
