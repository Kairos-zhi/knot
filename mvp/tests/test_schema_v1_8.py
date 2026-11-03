import json
import sqlite3

import pytest

from mvp.backend import migrate_schema_v1_7 as old, migrate_schema_v1_8 as new
from mvp.backend.exploration_repo import ExplorationRepo, ExplorationError
from mvp.tests.test_exploration_core import predecessor, db, db_rows, asset, uid


def test_migration_preserves_rows_and_old_guard(db):
    ref = asset(db, b"source")
    repo = ExplorationRepo(db)
    repo.save("A", uid(), expected_revision=0, request_key=uid(), references=[ref])
    before = db_rows(db, "SELECT * FROM exploration_revisions")
    ddl = db_rows(db, "SELECT name,sql FROM sqlite_master WHERE tbl_name='exploration_revisions' ORDER BY name")
    db_rows(db, "DELETE FROM asset_readers")
    assert new.migrate_schema(db)["created"]
    assert not new.migrate_schema(db)["created"]
    assert db_rows(db, "SELECT * FROM exploration_revisions") == before
    assert db_rows(db, "SELECT name,sql FROM sqlite_master WHERE tbl_name='exploration_revisions' ORDER BY name") == ddl
    with sqlite3.connect(db) as conn, pytest.raises(ValueError):
        old.require_exploration_schema(conn)


@pytest.mark.parametrize("raw", ['{"references":[],"references":[],"stop_note":null}',
                                  '{"references":[],"stop_note":NaN}',
                                  '{"references":[],"stop_note":null,"extra":1}',
                                  '{"snapshot_version":true,"references":[],"stop_note":null,"relations":[]}'])
def test_malformed_history_blocks_migration(db, raw):
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO exploration_revisions VALUES (?,?,?,?,?,?,?,?)",
                     (uid(), 1, "A", uid(), 1, uid(), "digest", raw))
    with pytest.raises(ExplorationError, match="INVALID_SNAPSHOT"):
        new.migrate_schema(db)
    assert not db_rows(db, "SELECT version FROM schema_version WHERE version='1.8'")


def test_migration_failure_and_drift_leave_no_marker(db):
    db_rows(db, "CREATE TRIGGER deny_version BEFORE INSERT ON schema_version WHEN NEW.version='1.8' BEGIN SELECT RAISE(ABORT,'injected'); END")
    with pytest.raises(sqlite3.IntegrityError):
        new.migrate_schema(db)
    assert not db_rows(db, "SELECT version FROM schema_version WHERE version='1.8'")
    db_rows(db, "DROP TRIGGER deny_version")
    db_rows(db, "DROP TRIGGER exploration_revisions_delete")
    with pytest.raises(ValueError):
        new.migrate_schema(db)
    assert not db_rows(db, "SELECT version FROM schema_version WHERE version='1.8'")
