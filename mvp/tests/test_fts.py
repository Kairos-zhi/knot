"""FTS repair AC-1..7, migration safety and v1.0 preservation checks."""

from contextlib import closing
import hashlib
from pathlib import Path
import sqlite3

import pytest

from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.migrate_fts_v1_1 import migrate_fts
from mvp.backend.rule_registry import RuleRegistry


ROOT = Path(__file__).parents[1]
OLD_SCHEMA = Path(__file__).with_name("fixtures") / "schema_v1_0.sql"


@pytest.fixture(params=["fresh", "migrated"])
def db_path(tmp_path, request):
    path = tmp_path / "test.db"
    schema = (
        OLD_SCHEMA if request.param == "migrated" else ROOT / "backend/schema_v1.sql"
    )
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
    if request.param == "migrated":
        migrate_fts(path)
    return path


def test_rebuild_scan_search_and_unindexed(db_path):
    repo = AssetRepo(db_path)
    text = repo.add_asset("text", "text/plain", b"needle evidence")
    empty = repo.add_asset("empty", "text/plain", b"")
    external = repo.add_asset("file", "text/plain", file_path="/needle-file")
    assert [r["asset_id"] for r in repo.list_unindexed()] == [external]
    assert repo.search_assets("file") == []
    assert [r["asset_id"] for r in repo.search_assets("needle")] == [text]
    with closing(sqlite3.connect(db_path)) as conn, conn:
        before = conn.execute("SELECT COUNT(*) FROM assets_fts").fetchone()[0]
        conn.execute("INSERT INTO assets_fts(assets_fts) VALUES('rebuild')")
        after = conn.execute("SELECT COUNT(*) FROM assets_fts").fetchone()[0]
        assert before == after == 2  # Non-NULL blob, including zero-byte body.
        rows = conn.execute("SELECT asset_id, content, typeof(content) FROM assets_fts")
        assert {tuple(r) for r in rows} == {
            (text, "needle evidence", "text"), (empty, "", "text"),
        }
        declaration = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name='assets_fts'"
        ).fetchone()[0]
        assert "content=" not in declaration and "content_rowid=" not in declaration
        assert "unicode61 remove_diacritics 2" in declaration
    assert [r["asset_id"] for r in repo.search_assets("needle")] == [text]
    assert len(repo.search_assets()) == 3


def snapshot(conn, table):
    columns = conn.execute(f"PRAGMA table_info({table})").fetchall()
    rows = conn.execute(f"SELECT rowid, * FROM {table} ORDER BY rowid").fetchall()
    return columns, rows


def test_nonempty_migration_twice_preserves_business_data(tmp_path):
    path = tmp_path / "old.db"
    assert hashlib.sha256(OLD_SCHEMA.read_bytes()).hexdigest() == (
        "5cd92492ff80f7ea7730d6f808d2a242212f025c455b9e29ffd63bc0d0253370"
    )
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(OLD_SCHEMA.read_text(encoding="utf-8"))
    repo = AssetRepo(path)
    asset_id = repo.add_asset("old", "text/plain", b"legacykeyword")
    repo.add_asset("file", "text/plain", file_path="/external")
    EventStore(path).add_event("import", target_assets=[asset_id], evidence_refs=[])
    RuleRegistry(path).add_rule("custom", ["evidence"], rule_version=2)
    tables = ("assets", "history_events", "horn_rules", "eligible_snapshots",
              "claims_candidates", "continuation_bundles")
    with closing(sqlite3.connect(path)) as conn:
        before = {t: snapshot(conn, t) for t in tables}
        original_version = conn.execute("SELECT * FROM schema_version").fetchall()
        pragmas = (conn.execute("PRAGMA synchronous").fetchone(),
                   conn.execute("PRAGMA journal_mode").fetchone())
    for _ in range(2):
        assert migrate_fts(path) == {"schema_version": "1.1", "indexed_assets": 1}
        with closing(sqlite3.connect(path)) as conn:
            assert {t: snapshot(conn, t) for t in tables} == before
            assert conn.execute(
                "SELECT * FROM schema_version WHERE version='1.0'"
            ).fetchall() == original_version
            versions = conn.execute(
                "SELECT * FROM schema_version ORDER BY version"
            ).fetchall()
            assert len(versions) == 2
            if _ == 0:
                first_versions = versions
            else:
                assert versions == first_versions
            assert (conn.execute("PRAGMA synchronous").fetchone(),
                    conn.execute("PRAGMA journal_mode").fetchone()) == pragmas
            assert pragmas == ((2,), ("wal",))
            triggers = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger'"
            ).fetchall()
            assert set(triggers) == {("assets_fts_insert",), ("assets_fts_delete",)}
        assert [r["asset_id"] for r in repo.search_assets("legacykeyword")] == [
            asset_id
        ]
    new_id = repo.add_asset("new", "text/plain", b"afterkeyword")
    assert [r["asset_id"] for r in repo.search_assets("afterkeyword")] == [new_id]


def test_fresh_and_migrated_business_columns_identical(db_path):
    with (
        closing(sqlite3.connect(":memory:")) as old,
        closing(sqlite3.connect(db_path)) as new,
    ):
        old.executescript(OLD_SCHEMA.read_text(encoding="utf-8"))
        for table in ("assets", "history_events", "horn_rules"):
            assert old.execute(f"PRAGMA table_info({table})").fetchall() == (
                new.execute(f"PRAGMA table_info({table})").fetchall()
            )


def test_migration_failure_rolls_back_ddl_and_data(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(OLD_SCHEMA.read_text(encoding="utf-8"))
    repo = AssetRepo(path)
    asset_id = repo.add_asset("old", "text/plain", b"rollbackkeyword")
    with closing(sqlite3.connect(path)) as conn:
        before = conn.execute(
            "SELECT type,name,sql FROM sqlite_master ORDER BY name"
        ).fetchall()
    monkeypatch.setattr(
        "mvp.backend.migrate_fts_v1_1._fts_statements",
        lambda: iter(["CREATE TABLE unexpected (id INTEGER)", "invalid SQL"]),
    )
    with pytest.raises(sqlite3.OperationalError):
        migrate_fts(path)
    with closing(sqlite3.connect(path)) as conn:
        assert conn.execute(
            "SELECT type,name,sql FROM sqlite_master ORDER BY name"
        ).fetchall() == before
        assert conn.execute("SELECT version FROM schema_version").fetchall() == [
            ("1.0",)
        ]
    assert repo.search_assets("rollbackkeyword")[0]["asset_id"] == asset_id


def test_migration_does_not_create_database(tmp_path):
    path = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        migrate_fts(path)
    assert not path.exists()


def test_migration_rejects_unknown_schema(db_path):
    with closing(sqlite3.connect(db_path)) as conn, conn:
        conn.execute("INSERT INTO schema_version VALUES ('2.0', 0, 'future')")
        before = conn.execute("SELECT sql FROM sqlite_master ORDER BY name").fetchall()
    with pytest.raises(ValueError, match="schema"):
        migrate_fts(db_path)
    with closing(sqlite3.connect(db_path)) as conn:
        assert conn.execute(
            "SELECT sql FROM sqlite_master ORDER BY name"
        ).fetchall() == before
