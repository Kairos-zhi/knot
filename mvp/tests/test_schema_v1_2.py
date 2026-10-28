"""Incremental schema v1.2 constraints, preservation and failure safety."""

from contextlib import closing
from pathlib import Path
import sqlite3

import pytest

from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.migrate_fts_v1_1 import migrate_fts
from mvp.backend.migrate_schema_v1_2 import migrate_schema


@pytest.fixture
def old_db(tmp_path):
    path = tmp_path / "candidate.db"
    schema = Path(__file__).with_name("fixtures") / "schema_v1_0.sql"
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
    migrate_fts(path)
    AssetRepo(path).add_asset("hash", "text/plain", b"retained body")
    EventStore(path).add_event("import", event_time=0, evidence_refs=[])
    return path


def snapshot(conn):
    result = {}
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name!='schema_version'"
    )]
    for table in tables:
        result[table] = (conn.execute(f"PRAGMA table_info({table})").fetchall(),
                         conn.execute(f"SELECT * FROM {table}").fetchall())
    return result


def test_migration_twice_preserves_old_tables_and_versions(old_db):
    with closing(sqlite3.connect(old_db)) as conn:
        before = snapshot(conn)
        versions = conn.execute("SELECT * FROM schema_version ORDER BY version").fetchall()
    first = None
    for _ in range(2):
        assert migrate_schema(old_db) == {"schema_version": "1.2", "backfilled": 0}
        with closing(sqlite3.connect(old_db)) as conn:
            after = snapshot(conn)
            assert after.pop("event_atom_map")[1] == []
            assert after == before
            old = conn.execute(
                "SELECT * FROM schema_version WHERE version!='1.2' ORDER BY version"
            ).fetchall()
            assert old == versions
            current = conn.execute("SELECT * FROM schema_version ORDER BY version").fetchall()
            if first is None:
                first = current
            assert current == first
            assert conn.execute("PRAGMA synchronous").fetchone() == (2,)
            assert conn.execute("PRAGMA journal_mode").fetchone() == ("wal",)


def test_fresh_schema_columns_pk_and_foreign_keys(tmp_path):
    schema = Path(__file__).parents[1] / "backend/schema_v1.sql"
    with closing(sqlite3.connect(tmp_path / "fresh.db")) as conn, conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
        assert conn.execute("SELECT version FROM schema_version ORDER BY version").fetchall() == [
            ("1.0",), ("1.1",), ("1.2",), ("1.3",),
        ]
        cols = conn.execute("PRAGMA table_info(event_atom_map)").fetchall()
        assert [(r[1], r[2], r[3], r[5]) for r in cols] == [
            ("event_id", "TEXT", 1, 1), ("atom", "TEXT", 1, 2),
            ("origin", "TEXT", 0, 0), ("created_at", "INTEGER", 1, 0),
        ]
        fk = conn.execute("PRAGMA foreign_key_list(event_atom_map)").fetchone()
        assert fk[2:5] == ("history_events", "event_id", "event_id")
        assert fk[6] == "RESTRICT"
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO event_atom_map VALUES ('absent','p',NULL,0)")
        conn.execute("INSERT INTO history_events VALUES ('e','test',NULL,NULL,0,0,NULL,NULL,NULL)")
        conn.execute("INSERT INTO event_atom_map VALUES ('e','p',NULL,0)")
        conn.execute("INSERT INTO event_atom_map VALUES ('e','q',NULL,0)")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO event_atom_map VALUES ('e','p',NULL,0)")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("DELETE FROM history_events WHERE event_id='e'")


def test_missing_unknown_and_v1_0_rejected(tmp_path, old_db):
    path = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        migrate_schema(path)
    assert not path.exists()
    for version in ("1.0", "9.0"):
        with closing(sqlite3.connect(old_db)) as conn, conn:
            conn.execute("DELETE FROM schema_version")
            conn.execute("INSERT INTO schema_version VALUES (?,0,'test')", (version,))
        with pytest.raises(ValueError, match="schema"):
            migrate_schema(old_db)
        with closing(sqlite3.connect(old_db)) as conn:
            assert conn.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE name='event_atom_map'"
            ).fetchone()[0] == 0


def test_failure_rolls_back_new_table_and_version(old_db, monkeypatch):
    from mvp.backend import migrate_schema_v1_2 as migration

    original = list(migration._statements())
    monkeypatch.setattr(migration, "_statements", lambda: iter(original + ["invalid SQL"]))
    with closing(sqlite3.connect(old_db)) as conn:
        before = snapshot(conn)
        versions = conn.execute("SELECT * FROM schema_version").fetchall()
    with pytest.raises(sqlite3.OperationalError):
        migrate_schema(old_db)
    with closing(sqlite3.connect(old_db)) as conn:
        assert snapshot(conn) == before
        assert conn.execute("SELECT * FROM schema_version").fetchall() == versions
