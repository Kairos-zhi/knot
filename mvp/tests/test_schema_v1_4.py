"""TD02 provenance migration: preservation, drift refusal and atomicity."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

import pytest

from mvp.backend import init_db, migrate_schema_v1_4 as migration
from mvp.backend.migrate_schema_v1_3 import SchemaDriftError as PrerequisiteDrift

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "mvp/backend/schema_v1.sql"


def old_database(path):
    # Keep fixtures usable with CI's shallow checkout, without calling the migrator.
    sql = SCHEMA.read_text(encoding="utf-8")
    sql, count = re.subn(
        r"    reviewed_at     INTEGER,\n    source_label[^\n]*\n    source_members[^\n]*",
        "    reviewed_at     INTEGER", sql,
    )
    assert count == 1
    sql, count = re.subn(
        r"INSERT OR IGNORE INTO schema_version \(version, applied_at, description\)\n"
        r"VALUES \('1\.4', [^\n]*\);", "", sql,
    )
    assert count == 1
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(sql)
    return path


@pytest.fixture
def old_db(tmp_path):
    return old_database(tmp_path / "old #%.db")


def read(path, sql):
    with closing(sqlite3.connect(path)) as conn:
        return conn.execute(sql).fetchall()


def change(path, sql):
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.executescript(sql)


def snapshot(path):
    # Every connection is closed before hashing; refusal must preserve file bytes.
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_fresh_migrated_equivalence_preservation_and_rerun(old_db, tmp_path):
    change(old_db, """
        INSERT INTO claims_candidates VALUES
          ('c1','relation','conditional_theorem','["e1"]','rule_based',0.8,1,NULL,10,NULL),
          ('c2','decision','decision','[]','user_input',NULL,0,'accept',20,30),
          ('c3','question','open_question',NULL,'llm_propose',0.2,1,NULL,40,NULL);
    """)
    before = read(old_db, "SELECT * FROM claims_candidates ORDER BY claim_id")
    old_info = read(old_db, "PRAGMA table_info(claims_candidates)")
    assert migration.migrate_schema(old_db) == {"schema_version": "1.4", "created": True}
    after = read(old_db, "SELECT * FROM claims_candidates ORDER BY claim_id")
    assert [r[:-2] for r in after] == before
    assert [r[-2:] for r in after] == [(None, None)] * 3
    fresh = tmp_path / "fresh.db"
    assert init_db.init_database(str(fresh))["status"] == "created"
    fresh_info = read(fresh, "PRAGMA table_info(claims_candidates)")
    migrated_info = read(old_db, "PRAGMA table_info(claims_candidates)")
    assert fresh_info == migrated_info
    assert fresh_info[-2:] == [
        (10, "source_label", "TEXT", 0, None, 0),
        (11, "source_members", "TEXT", 0, None, 0),
    ]
    for pragma in ("index_list(claims_candidates)",):
        assert read(fresh, "PRAGMA " + pragma) == read(old_db, "PRAGMA " + pragma)
    assert read(fresh, "SELECT version FROM schema_version ORDER BY version") == [
        (f"1.{i}",) for i in range(5)
    ]
    assert read(fresh, "SELECT count(*) FROM assets") == [(0,)]
    assert read(fresh, "SELECT count(*) FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%'") == [(14,)]
    timestamp = read(old_db, "SELECT applied_at FROM schema_version WHERE version='1.4'")
    digest = snapshot(old_db)
    rerun = migration.migrate_schema(old_db)
    assert rerun == {"schema_version": "1.4", "created": False}
    assert read(old_db, "SELECT applied_at FROM schema_version WHERE version='1.4'") == timestamp
    assert read(old_db, "PRAGMA table_info(claims_candidates)") == migrated_info
    assert snapshot(old_db) == digest
    print(json.dumps(dict(before_pragma=old_info, after_pragma=migrated_info,
                          before_rows=before, after_rows=after, fresh_pragma=fresh_info,
                          indexes=read(fresh, "PRAGMA index_list(claims_candidates)"),
                          rerun=rerun, applied_at_before=timestamp,
                          applied_at_after=timestamp)))


@pytest.mark.parametrize("case", ["both_missing", "members_missing", "unversioned",
                                  "one_unversioned", "prerequisite", "table_missing",
                                  "marked_table_missing", "wrong_type", "not_nullable"])
def test_refusals_preserve_bytes(old_db, case):
    if case in ("both_missing", "members_missing", "marked_table_missing",
                "wrong_type", "not_nullable"):
        change(old_db, "INSERT INTO schema_version VALUES ('1.4',1,'test');")
    if case in ("members_missing", "unversioned", "one_unversioned"):
        change(old_db, "ALTER TABLE claims_candidates ADD COLUMN source_label TEXT;")
    if case == "unversioned":
        change(old_db, "ALTER TABLE claims_candidates ADD COLUMN source_members TEXT;")
    if case == "prerequisite":
        change(old_db, "DROP INDEX uq_eligible_snapshot_event;")
    if case in ("table_missing", "marked_table_missing"):
        change(old_db, "DROP TABLE claims_candidates;")
    if case in ("wrong_type", "not_nullable"):
        definition = "INTEGER" if case == "wrong_type" else "TEXT NOT NULL"
        change(old_db, f"ALTER TABLE claims_candidates ADD COLUMN source_label {definition};"
               "ALTER TABLE claims_candidates ADD COLUMN source_members TEXT;")
    before = snapshot(old_db)
    expected = (PrerequisiteDrift if case == "prerequisite" else
                ValueError if case == "table_missing" else migration.SchemaDriftError)
    with pytest.raises(expected) as exc:
        migration.migrate_schema(old_db)
    assert snapshot(old_db) == before
    print(f"{case}: {exc.value}")


def test_v1_2_prerequisite_upgrade(old_db):
    change(old_db, "DELETE FROM schema_version WHERE version='1.3';"
           "DROP INDEX uq_eligible_snapshot_event;")
    assert migration.migrate_schema(old_db)["created"] is True
    assert read(old_db, "SELECT version FROM schema_version ORDER BY version") == [
        (f"1.{i}",) for i in range(5)
    ]


def test_ddl_and_version_rollback(old_db, monkeypatch):
    before = snapshot(old_db)
    original = migration._validate

    def fail_after_ddl(conn):
        original(conn)
        raise ValueError("injected after both ALTERs")

    monkeypatch.setattr(migration, "_validate", fail_after_ddl)
    with pytest.raises(ValueError, match="injected"):
        migration.migrate_schema(old_db)
    assert snapshot(old_db) == before
    assert [r[1] for r in read(old_db, "PRAGMA table_info(claims_candidates)")][-1] == "reviewed_at"
    assert read(old_db, "SELECT version FROM schema_version WHERE version='1.4'") == []


def test_unknown_and_missing_database(old_db, tmp_path):
    change(old_db, "INSERT INTO schema_version VALUES ('future',0,'test');")
    before = snapshot(old_db)
    with pytest.raises(ValueError, match="unsupported"):
        migration.migrate_schema(old_db)
    assert snapshot(old_db) == before
    missing = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        migration.migrate_schema(missing)
    assert not missing.exists()


def test_version_insert_failure_rolls_back_both_columns(old_db):
    change(old_db, """CREATE TRIGGER reject_v14 BEFORE INSERT ON schema_version
           WHEN new.version='1.4' BEGIN SELECT RAISE(ABORT,'injected version failure'); END;""")
    before = snapshot(old_db)
    with pytest.raises(sqlite3.IntegrityError, match="injected version failure"):
        migration.migrate_schema(old_db)
    assert snapshot(old_db) == before
    assert [r[1] for r in read(old_db, "PRAGMA table_info(claims_candidates)")][-1] == "reviewed_at"
    assert read(old_db, "SELECT version FROM schema_version WHERE version='1.4'") == []


def test_cli_outside_repository(old_db, tmp_path):
    script = ROOT / "mvp/backend/migrate_schema_v1_4.py"
    for created in (True, False):
        result = subprocess.run([sys.executable, str(script), str(old_db)], cwd=tmp_path,
                                capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        assert len(result.stdout.splitlines()) == 1
        assert json.loads(result.stdout) == {"schema_version": "1.4", "created": created}
    change(old_db, "ALTER TABLE claims_candidates DROP COLUMN source_members;")
    result = subprocess.run([sys.executable, str(script), str(old_db)], cwd=tmp_path,
                            capture_output=True, text=True)
    assert result.returncode == 1
    assert result.stdout == ""
    assert "[KNOT-E032]" in result.stderr


@pytest.mark.parametrize("definition", ["source_label TEXT", "source_members TEXT",
                                        "source_label INTEGER", "source_label TEXT NOT NULL"])
def test_init_validator_rejects_missing_or_incompatible_columns(tmp_path, definition):
    path = old_database(tmp_path / "bad.db")
    change(path, f"ALTER TABLE claims_candidates ADD COLUMN {definition};"
           "INSERT INTO schema_version VALUES ('1.4',0,'test');")
    with closing(sqlite3.connect(path)) as conn:
        with pytest.raises(ValueError, match="nullable TEXT"):
            init_db._validate(conn)
