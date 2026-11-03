"""Explicit, additive origin barrier for exploration forks."""
import argparse
from contextlib import closing
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import time

from mvp.exploration_policy import decode_snapshot
from .migrate_schema_v1_6 import SchemaDriftError
from . import migrate_schema_v1_7 as v17


_DDL = {
    "exploration_origins": """CREATE TABLE exploration_origins (
        exploration_id TEXT PRIMARY KEY NOT NULL,
        actor TEXT NOT NULL,
        target_creation_event_id TEXT NOT NULL,
        source_exploration_id TEXT NOT NULL,
        source_revision INTEGER NOT NULL CHECK (source_revision > 0),
        source_event_id TEXT NOT NULL,
        source_snapshot_sha256 TEXT NOT NULL,
        CHECK (rowid > 0),
        CHECK (exploration_id != source_exploration_id)
    )""",
    "exploration_origins_insert": """CREATE TRIGGER exploration_origins_insert
    BEFORE INSERT ON exploration_origins
    WHEN EXISTS (SELECT 1 FROM exploration_origins WHERE rowid = NEW.rowid OR exploration_id = NEW.exploration_id)
      OR NOT EXISTS (SELECT 1 FROM exploration_revisions WHERE exploration_id = NEW.exploration_id
                     AND revision = 1 AND actor = NEW.actor AND event_id = NEW.target_creation_event_id)
      OR NOT EXISTS (SELECT 1 FROM exploration_revisions WHERE exploration_id = NEW.source_exploration_id
                     AND revision = NEW.source_revision AND actor = NEW.actor AND event_id = NEW.source_event_id)
    BEGIN SELECT RAISE(ABORT, 'invalid exploration origin'); END""",
    "exploration_origins_update": """CREATE TRIGGER exploration_origins_update
    BEFORE UPDATE ON exploration_origins
    BEGIN SELECT RAISE(ABORT, 'exploration origins are append only'); END""",
    "exploration_origins_delete": """CREATE TRIGGER exploration_origins_delete
    BEFORE DELETE ON exploration_origins
    BEGIN SELECT RAISE(ABORT, 'exploration origins are append only'); END""",
}


def _objects(conn):
    return dict(conn.execute("SELECT name,sql FROM sqlite_master WHERE (name=? OR tbl_name=?) AND sql IS NOT NULL",
                             ("exploration_origins", "exploration_origins")).fetchall())


def _validate_history(conn, version):
    for (raw,) in conn.execute("SELECT snapshot_json FROM exploration_revisions"):
        snapshot = decode_snapshot(raw)
        if version == "1.7" and "snapshot_version" in snapshot:
            raise SchemaDriftError("v2 snapshot in schema 1.7")
    if version != "1.9":
        return
    for row in conn.execute("""SELECT o.exploration_id,o.actor,o.target_creation_event_id,
            o.source_exploration_id,o.source_revision,o.source_event_id,o.source_snapshot_sha256,
            t.actor,t.event_id,s.actor,s.event_id,s.snapshot_json,t.snapshot_json,
            t.request_digest,t.rowid,s.rowid
        FROM exploration_origins o
        LEFT JOIN exploration_revisions t ON t.exploration_id=o.exploration_id AND t.revision=1
        LEFT JOIN exploration_revisions s ON s.exploration_id=o.source_exploration_id AND s.revision=o.source_revision"""):
        target, actor, creation, source, rev, event, digest, ta, te, sa, se, raw, target_raw, request_digest, target_rowid, source_rowid = row
        if (target == source or ta != actor or te != creation or sa != actor or se != event
                or type(rev) is not int or rev < 1 or type(raw) is not str
                or sha256(raw.encode('utf-8')).hexdigest() != digest
                or source_rowid is None or target_rowid is None or source_rowid >= target_rowid):
            raise SchemaDriftError("invalid exploration origin")
        fork_request = json.dumps(["exploration.fork", source, rev, event, target], ensure_ascii=False)
        if request_digest != sha256(fork_request.encode("utf-8")).hexdigest():
            raise SchemaDriftError("invalid exploration origin request")
        source_snapshot = decode_snapshot(raw)
        if "snapshot_version" in source_snapshot:
            expected = raw
        else:
            expected = json.dumps({"snapshot_version": 2, **source_snapshot, "relations": []},
                                  ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if target_raw != expected:
            raise SchemaDriftError("origin creation snapshot mismatch")


def require_exploration_schema(conn):
    versions = v17._versions(conn)
    base = v17._PREDECESSOR | {"1.7"}
    possible = ((base, "1.7"), (base | {"1.8"}, "1.8"), (base | {"1.8", "1.9"}, "1.9"))
    version = next((name for found, name in possible if versions == found), None)
    if (version is None or v17._objects(conn) != v17._DDL
            or _objects(conn) != (_DDL if version == "1.9" else {})):
        raise SchemaDriftError("exploration schema missing or drifted")
    v17._check_predecessor(conn)
    if version == "1.9":
        _validate_history(conn, version)
    return version


def migrate_schema(db_path):
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        version = require_exploration_schema(conn)
        if version == "1.9":
            return {"schema_version": "1.9", "created": False}
        if version != "1.8":
            raise SchemaDriftError("expected schema 1.8")
        _validate_history(conn, version)
        for statement in _DDL.values():
            conn.execute(statement)
        conn.execute("INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)",
                     ("1.9", time.time_ns() // 1_000_000, "Exploration fork origins"))
        require_exploration_schema(conn)
        return {"schema_version": "1.9", "created": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_path")
    args = parser.parse_args()
    try:
        print(json.dumps(migrate_schema(args.db_path)))
    except (ValueError, sqlite3.Error) as exc:
        parser.exit(1, str(exc) + "\n")


if __name__ == "__main__":
    main()
