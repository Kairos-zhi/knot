"""Explicit additive migration for owner-scoped exploration revisions."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time

from .migrate_schema_v1_6 import SchemaDriftError


_TABLE = "exploration_revisions"
_DDL = {
    _TABLE: """CREATE TABLE exploration_revisions (
        exploration_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        actor TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        saved_at INTEGER NOT NULL,
        request_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        CHECK (rowid > 0),
        PRIMARY KEY (exploration_id, revision),
        UNIQUE (actor, request_key)
    )""",
    "exploration_revisions_insert": """CREATE TRIGGER exploration_revisions_insert
    BEFORE INSERT ON exploration_revisions
    WHEN EXISTS (
        SELECT 1 FROM exploration_revisions WHERE rowid = NEW.rowid
    ) OR NEW.revision != COALESCE(
        (SELECT MAX(revision) + 1 FROM exploration_revisions
         WHERE exploration_id = NEW.exploration_id), 1
    ) OR NEW.actor != COALESCE(
        (SELECT actor FROM exploration_revisions
         WHERE exploration_id = NEW.exploration_id ORDER BY revision DESC LIMIT 1), NEW.actor
    ) OR EXISTS (
        SELECT 1 FROM exploration_revisions WHERE event_id = NEW.event_id
    ) OR EXISTS (
        SELECT 1 FROM exploration_revisions
        WHERE actor = NEW.actor AND request_key = NEW.request_key
    )
    BEGIN
        SELECT RAISE(ABORT, 'invalid exploration revision append');
    END""",
    "exploration_revisions_update": """CREATE TRIGGER exploration_revisions_update
    BEFORE UPDATE ON exploration_revisions
    BEGIN
        SELECT RAISE(ABORT, 'exploration revisions are append only');
    END""",
    "exploration_revisions_delete": """CREATE TRIGGER exploration_revisions_delete
    BEFORE DELETE ON exploration_revisions
    BEGIN
        SELECT RAISE(ABORT, 'exploration revisions are append only');
    END""",
}
_PREDECESSOR = {f"1.{i}" for i in range(7)}


def _versions(conn):
    columns = [tuple(row)[1:] for row in conn.execute("PRAGMA table_info(schema_version)")]
    if columns != [("version", "TEXT", 0, None, 1), ("applied_at", "INTEGER", 1, None, 0),
                   ("description", "TEXT", 0, None, 0)]:
        raise SchemaDriftError("exploration schema requires a supported version table")
    return {row[0] for row in conn.execute("SELECT version FROM schema_version")}


def _objects(conn):
    return dict(conn.execute(
        """SELECT name, sql FROM sqlite_master
           WHERE (name = ? OR tbl_name = ?) AND sql IS NOT NULL""",
        (_TABLE, _TABLE),
    ).fetchall())


def _check_predecessor(conn):
    readers = [tuple(row)[1:] for row in conn.execute("PRAGMA table_info(asset_readers)")]
    if readers != [("asset_id", "TEXT", 1, None, 1), ("actor", "TEXT", 1, None, 2)]:
        raise SchemaDriftError("exploration schema requires the existing asset reader grants")
    assets = {row[1]: tuple(row)[2:] for row in conn.execute("PRAGMA table_info(assets)")}
    if (assets.get("asset_id") != ("TEXT", 0, None, 1)
            or assets.get("content_hash") != ("TEXT", 1, None, 0)):
        raise SchemaDriftError("exploration schema requires the existing asset anchors")


def require_exploration_schema(conn):
    if _versions(conn) != _PREDECESSOR | {"1.7"} or _objects(conn) != _DDL:
        raise SchemaDriftError("exploration schema 1.7 missing or drifted; migrate explicitly")
    _check_predecessor(conn)


def migrate_schema(db_path):
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        versions = _versions(conn)
        if versions == _PREDECESSOR | {"1.7"}:
            require_exploration_schema(conn)
            return {"schema_version": "1.7", "created": False}
        if versions != _PREDECESSOR or _objects(conn):
            raise SchemaDriftError("expected unmodified schema 1.6 before exploration migration")
        _check_predecessor(conn)
        for statement in _DDL.values():
            conn.execute(statement)
        conn.execute(
            "INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)",
            ("1.7", int(time.time() * 1000), "Owner-scoped exploration revisions"),
        )
        require_exploration_schema(conn)
        return {"schema_version": "1.7", "created": True}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_path")
    args = parser.parse_args(argv)
    try:
        result = migrate_schema(args.db_path)
    except (ValueError, sqlite3.Error) as exc:
        parser.exit(1, str(exc) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
