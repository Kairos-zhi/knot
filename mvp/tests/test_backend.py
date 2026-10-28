"""Contract and failure-path tests against the unchanged schema v1."""

from contextlib import closing
import json
from pathlib import Path
import sqlite3
from uuid import UUID

import pytest

from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.rule_registry import RuleRegistry


@pytest.fixture
def db_path(tmp_path):
    path = tmp_path / "test.db"
    schema = Path(__file__).parents[1] / "backend" / "schema_v1.sql"
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
    return path


def test_asset_repo_add_and_get(db_path):
    repo = AssetRepo(db_path)
    asset_id = repo.add_asset(
        "hash", "text/markdown", b"hello", source_uri="file:///test.md",
        created_at=0, metadata_json='{"title":"hello"}',
    )
    row = AssetRepo(db_path).get_asset(asset_id)
    assert UUID(asset_id).version == 4
    assert row == {
        "asset_id": asset_id, "content_hash": "hash",
        "media_type": "text/markdown", "content_blob": b"hello",
        "file_path": None, "source_uri": "file:///test.md", "created_at": 0,
        "imported_at": row["imported_at"], "metadata_json": '{"title":"hello"}',
    }
    assert row["imported_at"] > 1_000_000_000_000
    assert repo.count_assets() == 1
    assert repo.get_asset("missing") is None


def test_asset_repo_search_fts5(db_path):
    repo = AssetRepo(db_path)
    first = repo.add_asset("a", "text/plain", "Café knot 工作现场".encode())
    second = repo.add_asset("b", "text/markdown", b"knot evidence")
    repo.add_asset("c", "text/plain", b"unrelated")
    assert {r["asset_id"] for r in repo.search_assets("knot")} == {first, second}
    assert [r["asset_id"] for r in repo.search_assets("cafe")] == [first]
    assert [r["asset_id"] for r in repo.search_assets("工作现场")] == [first]
    assert [r["asset_id"] for r in repo.search_assets("knot", "text/plain")] == [first]
    assert repo.search_assets("absent") == []
    assert len(repo.search_assets(limit=1)) == 1
    assert len(repo.search_assets(" ", media_type="text/plain")) == 2
    assert repo.search_assets(limit=0) == []
    with pytest.raises(sqlite3.OperationalError):
        repo.search_assets('"unterminated')
    # Invalid syntax must not turn into a fallback that returns all assets.
    assert repo.count_assets() == 3


def test_asset_constraints_and_append_only(db_path):
    repo = AssetRepo(db_path)
    asset_id = repo.add_asset("unique", "text/plain", b"original")
    original = repo.get_asset(asset_id)
    with pytest.raises(sqlite3.IntegrityError):
        repo.add_asset("unique", "text/plain", b"replacement")
    with pytest.raises(sqlite3.IntegrityError):
        repo.add_asset("missing-content", "text/plain")
    with pytest.raises(sqlite3.IntegrityError):
        repo.add_asset("missing-media", None, b"text")
    assert repo.get_asset(asset_id) == original
    assert repo.count_assets() == 1
    assert [r["asset_id"] for r in repo.search_assets("original")] == [asset_id]
    assert repo.search_assets("replacement") == []
    empty = repo.add_asset("empty", "text/plain", b"")
    external = repo.add_asset("external", "text/plain", file_path="/objects/data")
    assert repo.get_asset(empty)["content_blob"] == b""
    assert repo.get_asset(external)["file_path"] == "/objects/data"
    assert repo.search_assets("data") == []  # Does not open external files.


def test_asset_default_time(db_path):
    repo = AssetRepo(db_path)
    row = repo.get_asset(repo.add_asset("hash", "text/plain", b"content"))
    assert row["created_at"] == row["imported_at"]


def test_event_store_add_and_get(db_path):
    store = EventStore(db_path)
    event_id = store.add_event(
        "import", "asset", "user", event_time=0, target_assets=["a"],
        evidence_refs=["e"], payload_json='{"ok":true}',
    )
    row = EventStore(db_path).get_event(event_id)
    assert UUID(event_id).version == 4
    assert row["event_time"] == 0
    assert row["recorded_at"] > 1_000_000_000_000
    assert json.loads(row["target_assets"]) == ["a"]
    assert json.loads(row["evidence_refs"]) == ["e"]
    assert row["payload_json"] == '{"ok":true}'
    assert row["source"] == "user"
    assert store.get_events_by_type("import") == [row]
    assert store.get_events_by_subject("asset") == [row]
    assert store.count_events() == 1
    assert store.get_event("missing") is None


def test_event_store_time_constraint(db_path, monkeypatch):
    monkeypatch.setattr("mvp.backend.event_store.time.time", lambda: 1000)
    store = EventStore(db_path)
    event_id = store.add_event("now")
    row = store.get_event(event_id)
    assert row["event_time"] == row["recorded_at"] == 1_000_000
    with pytest.raises(ValueError, match="future"):
        store.add_event("future", event_time=1_000_001)
    # Verify the schema CHECK is also active on repository connections.
    with store._connection() as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """INSERT INTO history_events
                   (event_id, event_type, event_time, recorded_at)
                   VALUES ('bad', 'future', 2, 1)"""
            )
    assert store.get_event(event_id) == row
    assert store.count_events() == 1


def test_event_store_empty_list_roundtrip(db_path):
    store = EventStore(db_path)
    event_id = store.add_event("empty", target_assets=[], evidence_refs=[])
    row = EventStore(db_path).get_event(event_id)
    assert row["target_assets"] == row["evidence_refs"] == "[]"
    assert json.loads(row["target_assets"]) == json.loads(row["evidence_refs"]) == []
    unset = store.get_event(store.add_event("unset"))
    assert unset["target_assets"] is None and unset["evidence_refs"] is None


def test_event_queries_limits_and_parameterization(db_path):
    store = EventStore(db_path)
    store.add_event("import", "person", event_time=1)
    newest = store.add_event("import", "person", event_time=2)
    store.add_event("other", "elsewhere", event_time=3)
    assert store.get_events_by_type("import", 1)[0]["event_id"] == newest
    assert store.get_events_by_subject("person", 1)[0]["event_id"] == newest
    assert store.get_events_by_type("import", 0) == []
    assert store.get_events_by_type("' OR 1=1 --") == []
    assert store.get_events_by_subject("' OR 1=1 --") == []
    assert AssetRepo(db_path).search_assets(media_type="' OR 1=1 --") == []


@pytest.mark.parametrize("limit", [-1, True, 1.5, "1", None])
def test_invalid_limits(db_path, limit):
    for search in (
        lambda: AssetRepo(db_path).search_assets(limit=limit),
        lambda: EventStore(db_path).get_events_by_type("import", limit),
        lambda: EventStore(db_path).get_events_by_subject("person", limit),
    ):
        with pytest.raises(ValueError):
            search()


def test_rule_registry_add_and_query(db_path):
    registry = RuleRegistry(db_path)
    assert registry.count_rules() == 7  # Schema seeds count as real rows.
    first = registry.add_rule("custom", ["question"], description="test")
    second = registry.add_rule("custom", [], rule_version=2)
    row = RuleRegistry(db_path).get_rule(first)
    assert row == {
        "rule_id": first, "head": "custom", "body": '["question"]',
        "rule_version": 1, "active": 1, "description": "test",
    }
    assert registry.get_rules_by_head("custom") == [row, registry.get_rule(second)]
    assert row in registry.get_active_rules()
    assert registry.get_active_rules(2) == [registry.get_rule(second)]
    assert json.loads(registry.get_rule(second)["body"]) == []
    assert registry.count_rules() == 9
    assert registry.get_rule(-1) is None
    assert registry.get_rules_by_head("' OR 1=1 --") == []


def test_rule_registry_deactivate(db_path):
    registry = RuleRegistry(db_path)
    rule_id = registry.add_rule("custom", ["evidence"])
    assert registry.deactivate_rule(rule_id) is True
    assert registry.deactivate_rule(rule_id) is False
    assert registry.deactivate_rule(-1) is False
    row = RuleRegistry(db_path).get_rule(rule_id)
    assert row["active"] == 0 and json.loads(row["body"]) == ["evidence"]
    assert row in registry.get_rules_by_head("custom")
    assert row not in registry.get_active_rules()
    assert registry.count_rules() == 8


def test_invalid_arrays_and_integrity_recovery(db_path):
    store = EventStore(db_path)
    registry = RuleRegistry(db_path)
    for value in ("[]", {}, 0):
        with pytest.raises(TypeError):
            store.add_event("bad", target_assets=value)
        with pytest.raises(TypeError):
            store.add_event("bad", evidence_refs=value)
        with pytest.raises(TypeError):
            registry.add_rule("bad", value)
    with pytest.raises(sqlite3.IntegrityError):
        store.add_event(None)
    with pytest.raises(sqlite3.IntegrityError):
        registry.add_rule(None, [])
    assert store.count_events() == 0
    assert registry.count_rules() == 7
    assert store.get_event(store.add_event("good"))["event_type"] == "good"


def test_foreign_keys_enabled(db_path):
    with EventStore(db_path)._connection() as conn:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """INSERT INTO eligible_snapshots
                   (snapshot_id, snapshot_time, event_id, is_eligible)
                   VALUES ('s', 0, 'missing', 1)"""
            )


def test_connection_closed_after_success_and_failure(db_path, monkeypatch):
    connections = []
    real_connect = sqlite3.connect

    def tracking_connect(*args, **kwargs):
        conn = real_connect(*args, **kwargs)
        connections.append(conn)
        return conn

    monkeypatch.setattr("mvp.backend._db.sqlite3.connect", tracking_connect)
    repo = AssetRepo(db_path)
    repo.add_asset("ok", "text/plain", b"content")
    repo.count_assets()
    with pytest.raises(sqlite3.IntegrityError):
        repo.add_asset("ok", "text/plain", b"duplicate")
    with pytest.raises(sqlite3.OperationalError):
        repo.search_assets('"invalid')
    assert len(connections) == 4
    for conn in connections:
        with pytest.raises(sqlite3.ProgrammingError, match="closed"):
            conn.execute("SELECT 1")


def test_missing_database_is_not_created(tmp_path):
    path = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        AssetRepo(path).count_assets()
    assert not path.exists()


def test_scoped_session_commits_each_write_and_closes(db_path):
    repo = AssetRepo(db_path)
    with repo.session() as scoped:
        conn = scoped._scoped_connection
        first = scoped.add_asset("one", "text/plain", b"first")
        assert AssetRepo(db_path).get_asset(first)["content_hash"] == "one"
        with pytest.raises(sqlite3.IntegrityError):
            scoped.add_asset("one", "text/plain", b"duplicate")
        second = scoped.add_asset("two", "text/plain", b"second")
        with pytest.raises(RuntimeError, match="already open"):
            with repo.session():
                pass
        assert scoped.get_asset(second)["content_hash"] == "two"
    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        conn.execute("SELECT 1")
    assert repo.count_assets() == 2


def test_scoped_session_closes_on_exception(db_path):
    repo = AssetRepo(db_path)
    with pytest.raises(RuntimeError, match="caller failure"):
        with repo.session():
            conn = repo._scoped_connection
            repo.add_asset("one", "text/plain", b"first")
            raise RuntimeError("caller failure")
    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        conn.execute("SELECT 1")
    assert repo.count_assets() == 1  # Session is not an all-or-nothing batch.


def test_scoped_transaction_rolls_back_non_integrity_error(db_path):
    repo = AssetRepo(db_path)
    with repo.session():
        with pytest.raises(sqlite3.OperationalError):
            with repo._connection() as conn:
                conn.execute(
                    """INSERT INTO history_events
                       (event_id, event_type, event_time, recorded_at)
                       VALUES ('rollback', 'test', 0, 0)"""
                )
                conn.execute("SELECT * FROM missing_table")
        assert EventStore(db_path).get_event("rollback") is None
        assert repo._scoped_connection.in_transaction is False


def test_scoped_commit_failure_does_not_commit_on_next_read(db_path):
    repo = AssetRepo(db_path)
    with repo.session():
        conn = repo._scoped_connection

        def deny_commit(action, arg1, arg2, database, trigger):
            if action == sqlite3.SQLITE_TRANSACTION and arg1 == "COMMIT":
                return sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK

        conn.set_authorizer(deny_commit)
        try:
            with pytest.raises(sqlite3.DatabaseError, match="authorized"):
                repo.add_asset("failed", "text/plain", b"must not persist")
        finally:
            conn.set_authorizer(None)
        assert conn.in_transaction is False
        assert repo.count_assets() == 0
        assert AssetRepo(db_path).count_assets() == 0
        repo.add_asset("success", "text/plain", b"persist")
    assert repo.count_assets() == 1
