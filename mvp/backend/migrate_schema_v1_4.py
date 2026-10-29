"""Append nullable claim provenance columns without adopting partial migrations."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time

if __package__:
    from . import migrate_schema_v1_3
else:
    import migrate_schema_v1_3


COLUMNS = ("source_label", "source_members")


class SchemaDriftError(ValueError):
    """Report incompatible provenance structure without repairing it."""

    def __init__(self, detail):
        super().__init__(f"[KNOT-E032] schema drift: {detail}; no changes made")


def _versions(conn):
    versions = {row[0] for row in conn.execute("SELECT version FROM schema_version")}
    if not versions <= {"1.0", "1.1", "1.2", "1.3", "1.4"}:
        raise ValueError("unsupported schema version; expected v1.2, v1.3 or v1.4")
    return versions


def _columns(conn, *, version_present):
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='claims_candidates'"
    ).fetchone() is None:
        if version_present:
            raise SchemaDriftError("table claims_candidates is missing")
        raise ValueError("table claims_candidates required")
    return {row[1]: row for row in conn.execute("PRAGMA table_info(claims_candidates)")}


def _validate(conn):
    columns = _columns(conn, version_present=True)
    for name in COLUMNS:
        column = columns.get(name)
        if column is None:
            raise SchemaDriftError(f"column {name} is missing")
        # SQLite's affinity rules give INT precedence over CHAR/CLOB/TEXT.
        declared = column[2].upper()
        if ("INT" in declared or not any(t in declared for t in ("CHAR", "CLOB", "TEXT"))
                or column[3] != 0):
            raise SchemaDriftError(f"column {name} must have TEXT affinity and be nullable")


def _preflight(conn):
    versions = _versions(conn)
    if "1.4" in versions:
        _validate(conn)
        return True
    columns = _columns(conn, version_present=False)
    for name in COLUMNS:
        if name in columns:
            raise SchemaDriftError(
                f"column {name} exists without version row 1.4; refusing to adopt"
            )
    return False


def migrate_schema(db_path):
    """Check 1.4 first, reuse the 1.3 prerequisite, then append atomically."""
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        if _preflight(conn):
            return {"schema_version": "1.4", "created": False}

    migrate_schema_v1_3.migrate_schema(db_path)

    with closing(sqlite3.connect(uri, uri=True)) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            # Another migrator may have completed while the prerequisite ran.
            if _preflight(conn):
                return {"schema_version": "1.4", "created": False}
            if "1.3" not in _versions(conn):
                raise ValueError("schema v1.3 required")
            for name in COLUMNS:
                conn.execute(f"ALTER TABLE claims_candidates ADD COLUMN {name} TEXT")
            _validate(conn)
            conn.execute(
                "INSERT INTO schema_version (version, applied_at, description) "
                "VALUES ('1.4', ?, 'Claim label and archive-member provenance')",
                (int(time.time() * 1000),),
            )
        return {"schema_version": "1.4", "created": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_path", help="explicit existing candidate database")
    args = parser.parse_args()
    try:
        result = migrate_schema(args.db_path)
    except (ValueError, sqlite3.Error) as exc:
        parser.exit(1, str(exc) + "\n")
    print(json.dumps(result))
