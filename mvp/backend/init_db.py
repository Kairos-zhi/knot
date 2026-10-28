#!/usr/bin/env python3
"""Create a new, validated schema 1.3 database without replacing any target."""

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import sys
from uuid import uuid4


def _validate(conn: sqlite3.Connection) -> None:
    if conn.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise ValueError("database integrity check failed")
    versions = conn.execute("SELECT version FROM schema_version ORDER BY version").fetchall()
    if versions != [("1.0",), ("1.1",), ("1.2",), ("1.3",)]:
        raise ValueError("expected schema versions 1.0 through 1.3")
    tables = conn.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchone()[0]
    if tables != 14:
        raise ValueError("expected 14 tables including FTS tables")
    indexes = conn.execute("PRAGMA index_list(eligible_snapshots)").fetchall()
    if not any(row[1] == "uq_eligible_snapshot_event" and row[2] == 1 for row in indexes):
        raise ValueError("missing unique snapshot index")
    if conn.execute("SELECT count(*) FROM assets").fetchone()[0] != 0:
        raise ValueError("new database must contain no assets")


def _readback(path: Path) -> None:
    # Closed, self-contained files only: immutable avoids creating WAL/SHM on readback.
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)) as conn:
        _validate(conn)


def init_database(db_path: str) -> dict:
    """Return created/refused/failed; never read stdin or replace an existing entry."""
    # Do not resolve the final component: even a dangling symlink is an existing target.
    target = Path(os.path.abspath(os.path.expanduser(db_path)))
    result = dict(db=str(target), status="failed", schema_version="1.3",
                  tables=14, reason=None, error=None)
    temporary = None
    temporary_owned = False
    published_identity = None
    try:
        if os.path.lexists(target):
            result.update(status="refused", reason="target_exists")
            return result
        target.parent.mkdir(parents=True, exist_ok=True)
        schema = Path(__file__).with_name("schema_v1.sql").read_text(encoding="utf-8")
        temporary = target.with_name(target.name + ".tmp-" + uuid4().hex)
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        temporary_owned = True
        os.close(fd)
        with closing(sqlite3.connect(temporary)) as conn:
            conn.executescript(schema)
            conn.commit()
            _validate(conn)
        _readback(temporary)
        identity = temporary.stat()
        try:
            os.link(temporary, target)
        except FileExistsError:
            result.update(status="refused", reason="target_exists")
            return result
        published_identity = identity
        temporary.unlink()
        _readback(target)
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
