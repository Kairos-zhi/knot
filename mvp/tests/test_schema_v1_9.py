import sqlite3
import pytest

from mvp.backend import migrate_schema_v1_8 as v18, migrate_schema_v1_9 as v19
from mvp.backend.exploration_repo import ExplorationRepo, ExplorationError
from mvp.backend.migrate_schema_v1_6 import SchemaDriftError
from mvp.tests.test_exploration_core import predecessor, db, db_rows, asset, uid


def test_migration_and_old_barrier(db):
    repo = ExplorationRepo(db)
    ident = uid()
    ref = asset(db, b"source")
    repo.save("A", ident, expected_revision=0, request_key=uid(), references=[ref])
    with pytest.raises(SchemaDriftError):
        v19.migrate_schema(db)
    v18.migrate_schema(db)
    before = db_rows(db, "SELECT * FROM exploration_revisions")
    db_rows(db, "DELETE FROM asset_readers")
    assert v19.migrate_schema(db)["created"]
    assert not v19.migrate_schema(db)["created"]
    assert db_rows(db, "SELECT * FROM exploration_revisions") == before
    with sqlite3.connect(db) as conn, pytest.raises(SchemaDriftError):
        v18.require_exploration_schema(conn)


def test_migration_failures_leave_no_partial_schema(db):
    v18.migrate_schema(db)
    db_rows(db, "CREATE TRIGGER deny19 BEFORE INSERT ON schema_version WHEN NEW.version='1.9' BEGIN SELECT RAISE(ABORT,'injected'); END")
    with pytest.raises(sqlite3.IntegrityError):
        v19.migrate_schema(db)
    assert db_rows(db, "SELECT name FROM sqlite_master WHERE name LIKE 'exploration_origins%'") == []
    assert not db_rows(db, "SELECT * FROM schema_version WHERE version='1.9'")
    db_rows(db, "DROP TRIGGER deny19")
    db_rows(db, "INSERT INTO exploration_revisions VALUES (?,?,?,?,?,?,?,?)", (uid(), 1, 'A', uid(), 1, uid(), 'digest', '{"extra":1}'))
    with pytest.raises(ExplorationError, match='INVALID_SNAPSHOT'):
        v19.migrate_schema(db)
    assert not db_rows(db, "SELECT * FROM schema_version WHERE version='1.9'")
