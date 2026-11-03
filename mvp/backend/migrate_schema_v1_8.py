"""Explicit format barrier for versioned exploration snapshots."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time

from mvp.exploration_policy import decode_snapshot, ExplorationError
from .migrate_schema_v1_6 import SchemaDriftError
from . import migrate_schema_v1_7 as old


def require_exploration_schema(conn):
    versions = old._versions(conn)
    v17 = old._PREDECESSOR | {"1.7"}
    if versions not in (v17, v17 | {"1.8"}) or old._objects(conn) != old._DDL:
        raise SchemaDriftError("exploration schema missing or drifted")
    old._check_predecessor(conn)
    return "1.8" if "1.8" in versions else "1.7"


def migrate_schema(db_path):
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        version = require_exploration_schema(conn)
        for (raw,) in conn.execute("SELECT snapshot_json FROM exploration_revisions"):
            snapshot = decode_snapshot(raw)
            if version == "1.7" and "snapshot_version" in snapshot:
                raise ExplorationError("INVALID_SNAPSHOT")
        if version == "1.8":
            return {"schema_version": "1.8", "created": False}
        conn.execute("INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)",
                     ("1.8", time.time_ns() // 1_000_000, "Versioned exploration snapshots"))
        return {"schema_version": "1.8", "created": True}


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
