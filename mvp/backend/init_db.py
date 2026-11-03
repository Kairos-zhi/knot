#!/usr/bin/env python3
"""Create a new, validated schema 1.9 database without replacing any target."""

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import sys
from uuid import uuid4

from .migrate_schema_v1_7 import migrate_schema
from .migrate_schema_v1_8 import migrate_schema as migrate_schema_1_8
from .migrate_schema_v1_9 import migrate_schema as migrate_schema_1_9, require_exploration_schema


def _validate(conn: sqlite3.Connection) -> None:
    if conn.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise ValueError("database integrity check failed")
    versions = conn.execute("SELECT version FROM schema_version ORDER BY version").fetchall()
    if versions != [(f"1.{i}",) for i in range(10)]:
        raise ValueError("expected schema versions 1.0 through 1.9")
    if require_exploration_schema(conn) != "1.9":
        raise ValueError("expected exploration schema 1.9")
    columns = {row[1]: row for row in conn.execute("PRAGMA table_info(claims_candidates)")}
    for name in ("source_label", "source_members"):
        column = columns.get(name)
        if column is None or column[2].upper() != "TEXT" or column[3] != 0:
            raise ValueError(f"expected nullable TEXT column claims_candidates.{name}")
    tables = conn.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchone()[0]
    if tables != 17:
        raise ValueError("expected 17 tables including FTS tables")
    job_id = next((row for row in conn.execute("PRAGMA table_info(continuation_bundles)")
                   if row[1] == "job_id"), None)
    if job_id is None or job_id[2].upper() != "TEXT" or job_id[3:] != (0, None, 0):
        raise ValueError("expected nullable TEXT column continuation_bundles.job_id")
    readers = [(r[1], r[2].upper(), r[3], r[4], r[5])
               for r in conn.execute("PRAGMA table_info(asset_readers)")]
    if readers != [("asset_id", "TEXT", 1, None, 1), ("actor", "TEXT", 1, None, 2)]:
        raise ValueError("expected asset_readers composite primary key")
    indexes = conn.execute("PRAGMA index_list(eligible_snapshots)").fetchall()
    if not any(row[1] == "uq_eligible_snapshot_event" and row[2] == 1 for row in indexes):
        raise ValueError("missing unique snapshot index")
    if conn.execute("SELECT count(*) FROM assets").fetchone()[0] != 0:
        raise ValueError("new database must contain no assets")


def _readback(path: Path) -> None:
    # Closed, self-contained files only: immutable avoids creating WAL/SHM on readback.
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)) as conn:
        _validate(conn)


def _checkpoint_staging(path: Path) -> None:
    """Make the private staging database self-contained before immutable reads."""
    with closing(sqlite3.connect(path.as_uri() + "?mode=rw", uri=True)) as conn:
        if conn.execute("PRAGMA journal_mode").fetchone()[0].lower() != "wal":
            raise ValueError("expected WAL staging database")
        busy, log, checkpointed = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if busy or log != 0 or checkpointed != 0:
            raise ValueError("staging checkpoint incomplete")
    if any(os.path.lexists(str(path) + suffix) for suffix in ("-wal", "-shm", "-journal")):
        raise ValueError("staging database has sidecars")


def _has_sidecars(path: Path) -> bool:
    return any(os.path.lexists(str(path) + suffix) for suffix in ("-wal", "-shm", "-journal"))


def init_database(db_path: str) -> dict:
    """Return created/refused/failed; never read stdin or replace an existing entry."""
    # Do not resolve the final component: even a dangling symlink is an existing target.
    target = Path(os.path.abspath(os.path.expanduser(db_path)))
    result = dict(db=str(target), status="failed", schema_version="1.9",
                  tables=17, reason=None, error=None)
    temporary = None
    temporary_owned = False
    published_identity = None
    try:
        if os.path.lexists(target):
            result.update(status="refused", reason="target_exists")
            return result
        if _has_sidecars(target):
            result.update(status="refused", reason="target_sidecar_exists")
            return result
        target.parent.mkdir(parents=True, exist_ok=True)
        schema = Path(__file__).with_name("schema_v1.sql").read_text(encoding="utf-8")
        temporary = target.with_name(target.name + ".tmp-" + uuid4().hex)
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        temporary_owned = True
        os.close(fd)
        with closing(sqlite3.connect(temporary)) as conn:
            conn.executescript(schema)
            # Only this privately created database is extended. Existing targets
            # have already been refused; initialization never migrates them.
            conn.execute("CREATE TABLE asset_readers (asset_id TEXT NOT NULL, "
                         "actor TEXT NOT NULL, PRIMARY KEY(asset_id,actor))")
            conn.executemany(
                "INSERT INTO schema_version (version,applied_at,description) "
                "VALUES (?,strftime('%s','now') * 1000,?)",
                [("1.5", "Continuation bundle producing job provenance"),
                 ("1.6", "Asset read grants separate from token identity")])
            conn.commit()
        migrate_schema(temporary)
        migrate_schema_1_8(temporary)
        migrate_schema_1_9(temporary)
        _checkpoint_staging(temporary)
        _readback(temporary)
        identity = temporary.stat()
        if os.path.lexists(target):
            result.update(status="refused", reason="target_exists")
            return result
        if _has_sidecars(target):
            result.update(status="refused", reason="target_sidecar_exists")
            return result
        try:
            os.link(temporary, target)
        except FileExistsError:
            result.update(status="refused", reason="target_exists")
            return result
        published_identity = identity
        temporary.unlink()
        if _has_sidecars(target):
            raise ValueError("published target has sidecars")
        _readback(target)
        if _has_sidecars(target):
            raise ValueError("published target has sidecars")
        if not os.path.samestat(identity, target.stat()):
            raise ValueError("published database identity changed")
        result["status"] = "created"
    except Exception as exc:
        result.update(status="failed", error=str(exc))
    finally:
        cleanup_errors = []
        if result["status"] == "failed" and published_identity is not None:
            try:
                if os.path.samestat(published_identity, target.lstat()):
                    target.unlink()
            except FileNotFoundError:
                pass
            except OSError as exc:
                cleanup_errors.append(str(exc))
        if temporary_owned:
            for path in (temporary, Path(str(temporary) + "-wal"),
                         Path(str(temporary) + "-shm"), Path(str(temporary) + "-journal")):
                try:
                    path.unlink(missing_ok=True)
                except OSError as exc:
                    cleanup_errors.append(str(exc))
        if cleanup_errors:
            result.update(status="failed", error=(result["error"] or "cleanup failed")
                          + "; cleanup incomplete: " + "; ".join(cleanup_errors))
        elif result["status"] == "failed":
            result["error"] += "; temporary files cleaned"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db", help="new database path")
    args = parser.parse_args()
    result = init_database(args.db)
    print(json.dumps(result, ensure_ascii=True))
    print(f"Database initialization: {result['status']}"
          + (f": {result['error']}" if result["error"] else ""), file=sys.stderr)
    return 0 if result["status"] == "created" else 1


if __name__ == "__main__":
    sys.exit(main())
