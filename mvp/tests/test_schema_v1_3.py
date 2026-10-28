"""v1.3 snapshot uniqueness, conflict refusal and transaction preservation."""

from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

from mvp.backend.migrate_schema_v1_3 import (
    SchemaDriftError, SnapshotConflictError, migrate_schema,
)
from mvp.backend.frontier17_db import eligible_at


ROOT = Path(__file__).parents[2]
SCHEMA = ROOT / "mvp/backend/schema_v1.sql"


@pytest.fixture
def old_db(tmp_path):
    path = tmp_path / "v1_2.db"
    # The appended v1.3 section follows the complete historical v1.2 schema.
    old_sql = SCHEMA.read_text(encoding="utf-8").split("-- BEGIN UNIQUE v1.3", 1)[0]
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.executescript(old_sql)
        conn.executemany(
            """INSERT INTO history_events(event_id,event_type,event_time,recorded_at)
               VALUES (?,'test',0,0)""", [("ex",), ("ey",)],
        )
        conn.executemany(
            """INSERT INTO eligible_snapshots
               (snapshot_id,snapshot_time,event_id,is_eligible) VALUES (?,?,?,?)""",
            [("one", 10, "ex", 1), ("two", 20, "ex", 0), ("three", 20, "ey", 1)],
        )
    return path


def database_snapshot(conn):
    definitions = conn.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY name"
    ).fetchall()
    data = {}
    for table, sql in conn.execute(
        "SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name"
    ):
        # Old v1.0 virtual content reads are broken; physical shadow rows still
        # capture every stored index value without invoking that legacy path.
        if sql.startswith("CREATE VIRTUAL TABLE"):
            continue
        query = ("SELECT rowid,* FROM eligible_snapshots ORDER BY rowid"
                 if table == "eligible_snapshots" else f'SELECT * FROM "{table}"')
        data[table] = conn.execute(query).fetchall()
    return definitions, data


def test_fresh_v1_3_index_and_write_rejection(tmp_path):
    with closing(sqlite3.connect(tmp_path / "fresh.db")) as conn, conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        assert conn.execute("SELECT version FROM schema_version ORDER BY version").fetchall() == [
            ("1.0",), ("1.1",), ("1.2",), ("1.3",),
        ]
        assert conn.execute(
            "SELECT name FROM sqlite_master WHERE name='uq_eligible_snapshot_event'"
        ).fetchone()
        conn.executemany(
            """INSERT INTO history_events(event_id,event_type,event_time,recorded_at)
               VALUES (?,'test',0,0)""", [("ex",), ("ey",)],
        )
        conn.execute(
            """INSERT INTO eligible_snapshots
               (snapshot_id,snapshot_time,event_id,is_eligible) VALUES ('a',10,'ex',1)"""
        )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """INSERT INTO eligible_snapshots
                   (snapshot_id,snapshot_time,event_id,is_eligible) VALUES ('b',10,'ex',0)"""
            )
        conn.execute(
            """INSERT INTO eligible_snapshots
               (snapshot_id,snapshot_time,event_id,is_eligible) VALUES ('c',10,'ey',1)"""
        )
        assert conn.execute("SELECT COUNT(*) FROM eligible_snapshots").fetchone()[0] == 2


def test_migration_preserves_all_rows_and_is_idempotent(old_db):
    with closing(sqlite3.connect(old_db)) as conn:
        before = database_snapshot(conn)[1]
    assert migrate_schema(old_db) == {
        "schema_version": "1.3", "duplicates": 0, "created": True,
    }
    with closing(sqlite3.connect(old_db)) as conn:
        after = database_snapshot(conn)[1]
        for table in before.keys() - {"schema_version"}:
            assert after[table] == before[table]
        assert after["schema_version"][:-1] == before["schema_version"]
        assert len(after["schema_version"]) == len(before["schema_version"]) + 1
        snapshot = database_snapshot(conn)
        assert conn.execute("PRAGMA synchronous").fetchone() == (2,)
        assert conn.execute("PRAGMA journal_mode").fetchone() == ("wal",)
    assert migrate_schema(old_db) == {
        "schema_version": "1.3", "duplicates": 0, "created": False,
    }
    with closing(sqlite3.connect(old_db)) as conn:
        assert database_snapshot(conn) == snapshot


def test_all_duplicate_groups_reported_and_database_unchanged(old_db):
    with closing(sqlite3.connect(old_db)) as conn, conn:
        conn.executemany(
            """INSERT INTO eligible_snapshots
               (snapshot_id,snapshot_time,event_id,is_eligible) VALUES (?,?,?,?)""",
            [("dup-x", 10, "ex", 0), ("dup-y1", 20, "ey", 0),
             ("dup-y2", 20, "ey", 1)],
        )
    with closing(sqlite3.connect(old_db)) as conn:
        before = database_snapshot(conn)
    with pytest.raises(SnapshotConflictError) as error:
        migrate_schema(old_db)
    assert error.value.conflicts == ((10, "ex", 2), (20, "ey", 3))
    assert "snapshot_time=10, event_id='ex', n=2" in str(error.value)
    assert "snapshot_time=20, event_id='ey', n=3" in str(error.value)
    with closing(sqlite3.connect(old_db)) as conn:
        assert database_snapshot(conn) == before
        assert conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE name='uq_eligible_snapshot_event'"
        ).fetchone()[0] == 0
        assert conn.execute("SELECT version FROM schema_version WHERE version='1.3'").fetchone() is None


def test_missing_and_unknown_versions_rejected(tmp_path, old_db):
    missing = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        migrate_schema(missing)
    assert not missing.exists()
    with closing(sqlite3.connect(old_db)) as conn, conn:
        conn.execute("INSERT INTO schema_version VALUES ('unknown',0,'future')")
    with pytest.raises(ValueError, match="unsupported"):
        migrate_schema(old_db)


@pytest.mark.parametrize("version", ["1.0", "1.1"])
def test_pre_v1_2_database_rejected(tmp_path, version):
    from mvp.backend.migrate_fts_v1_1 import migrate_fts

    path = tmp_path / "older.db"
    legacy = ROOT / "mvp/tests/fixtures/schema_v1_0.sql"
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(legacy.read_text(encoding="utf-8"))
    if version == "1.1":
        migrate_fts(path)
    with closing(sqlite3.connect(path)) as conn:
        before = database_snapshot(conn)
    with pytest.raises(ValueError, match="v1.2 required"):
        migrate_schema(path)
    with closing(sqlite3.connect(path)) as conn:
        assert database_snapshot(conn) == before


def test_failure_after_index_creation_rolls_back(old_db, monkeypatch):
    from mvp.backend import migrate_schema_v1_3 as migration

    statements = list(migration._statements())
    monkeypatch.setattr(migration, "_statements", lambda: iter(statements + ["invalid SQL"]))
    with closing(sqlite3.connect(old_db)) as conn:
        before = database_snapshot(conn)
    with pytest.raises(sqlite3.OperationalError):
        migrate_schema(old_db)
    with closing(sqlite3.connect(old_db)) as conn:
        assert database_snapshot(conn) == before


@pytest.mark.parametrize("definition", [
    "CREATE INDEX uq_eligible_snapshot_event ON eligible_snapshots(snapshot_time)",
    "CREATE UNIQUE INDEX uq_eligible_snapshot_event "
    "ON eligible_snapshots(snapshot_time,event_id COLLATE NOCASE)",
])
def test_wrong_named_index_is_not_silently_accepted(old_db, definition):
    with closing(sqlite3.connect(old_db)) as conn, conn:
        conn.execute(definition)
    with closing(sqlite3.connect(old_db)) as conn:
        before = database_snapshot(conn)
    with pytest.raises(ValueError, match="incompatible"):
        migrate_schema(old_db)
    with closing(sqlite3.connect(old_db)) as conn:
        assert database_snapshot(conn) == before


def test_legacy_v1_2_same_instant_still_uses_last_rowid(old_db):
    with closing(sqlite3.connect(old_db)) as conn, conn:
        assert eligible_at(conn, 10) == {"ex"}
        conn.execute(
            """INSERT INTO eligible_snapshots
               (snapshot_id,snapshot_time,event_id,is_eligible) VALUES ('later',10,'ex',0)"""
        )
        assert conn.execute(
            "SELECT COUNT(*) FROM eligible_snapshots WHERE snapshot_time=10 AND event_id='ex'"
        ).fetchone() == (2,)
        assert eligible_at(conn, 10) == set()


def test_cli_success_repeat_and_unknown_version_error(old_db):
    args = [sys.executable, "-m", "mvp.backend.migrate_schema_v1_3", str(old_db)]
    for created in ("true", "false"):
        result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
        assert result.returncode == 0 and f'"created": {created}' in result.stdout
    # Unknown versions are reported clearly on stderr, not masked as a no-op.
    with closing(sqlite3.connect(old_db)) as conn, conn:
        conn.execute("INSERT INTO schema_version VALUES ('99.0',0,'future')")
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 1 and "unsupported" in result.stderr


def test_cli_conflict_lists_groups_without_sqlite_traceback(old_db):
    with closing(sqlite3.connect(old_db)) as conn, conn:
        conn.execute(
            """INSERT INTO eligible_snapshots
               (snapshot_id,snapshot_time,event_id,is_eligible) VALUES ('dup',10,'ex',0)"""
        )
    args = [sys.executable, "-m", "mvp.backend.migrate_schema_v1_3", str(old_db)]
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 1 and result.stdout == ""
    assert "snapshot_time=10, event_id='ex', n=2" in result.stderr
    assert "Traceback" not in result.stderr and "IntegrityError" not in result.stderr


@pytest.mark.parametrize("definition, detail", [
    (None, "is missing"),
    ("CREATE INDEX uq_eligible_snapshot_event "
     "ON eligible_snapshots(snapshot_time,event_id)", "must be unique"),
    ("CREATE UNIQUE INDEX uq_eligible_snapshot_event "
     "ON eligible_snapshots(event_id,snapshot_time)", "incompatible key columns"),
    ("CREATE UNIQUE INDEX uq_eligible_snapshot_event "
     "ON eligible_snapshots(snapshot_time,event_id) WHERE is_eligible=1", "must not be partial"),
    ("CREATE UNIQUE INDEX uq_eligible_snapshot_event "
     "ON eligible_snapshots(snapshot_time,event_id COLLATE NOCASE)", "collations"),
    ("CREATE UNIQUE INDEX uq_eligible_snapshot_event "
     "ON eligible_snapshots(snapshot_time,event_id,reason)", "incompatible key columns"),
    ("CREATE UNIQUE INDEX uq_eligible_snapshot_event "
     "ON eligible_snapshots(snapshot_time,lower(event_id))", "incompatible key columns"),
], ids=["missing", "nonunique", "reversed", "partial", "collation", "extra-key", "expression"])
def test_v1_3_drift_refused_without_changes(old_db, tmp_path, definition, detail):
    migrate_schema(old_db)
    with closing(sqlite3.connect(old_db)) as conn, conn:
        conn.execute("DROP INDEX uq_eligible_snapshot_event")
        if definition:
            conn.execute(definition)
        before = database_snapshot(conn)
    with pytest.raises(SchemaDriftError, match=r"\[KNOT-E031\]") as error:
        migrate_schema(old_db)
    assert isinstance(error.value, ValueError)
    assert detail in str(error.value)
    assert "uq_eligible_snapshot_event" in str(error.value)
    assert "no changes made" in str(error.value)
    with closing(sqlite3.connect(old_db)) as conn:
        assert database_snapshot(conn) == before
    # Direct script entry also works from an unrelated caller directory.
    result = subprocess.run(
        [sys.executable, str(ROOT / "mvp/backend/migrate_schema_v1_3.py"), str(old_db)],
        cwd=tmp_path, capture_output=True, text=True,
    )
    assert result.returncode == 1 and result.stdout == ""
    assert result.stderr.strip() == str(error.value)
    assert "Traceback" not in result.stderr
    with closing(sqlite3.connect(old_db)) as conn:
        assert database_snapshot(conn) == before
        if definition is None:
            assert conn.execute(
                "SELECT name FROM sqlite_master WHERE name='uq_eligible_snapshot_event'"
            ).fetchone() is None


def test_v1_3_missing_snapshot_table_refused_without_changes(old_db):
    migrate_schema(old_db)
    with closing(sqlite3.connect(old_db)) as conn, conn:
        conn.execute("DROP TABLE eligible_snapshots")
        before = database_snapshot(conn)
    with pytest.raises(SchemaDriftError, match="table eligible_snapshots is missing"):
        migrate_schema(old_db)
    with closing(sqlite3.connect(old_db)) as conn:
        assert database_snapshot(conn) == before
