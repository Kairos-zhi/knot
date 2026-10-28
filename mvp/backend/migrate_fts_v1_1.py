"""Recreate the derived FTS index atomically, without changing business rows.

Run with an explicit existing database: python -m mvp.backend.migrate_fts_v1_1 DB
"""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time


def _fts_statements():
    """Reuse the marked schema section without executescript's implicit commit."""
    schema = Path(__file__).with_name("schema_v1.sql").read_text(encoding="utf-8")
    section = schema.split("-- BEGIN FTS v1.1\n", 1)[1].split("-- END FTS v1.1", 1)[0]
    statement = ""
    for line in section.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            yield statement
            statement = ""
    if statement.strip():
        raise ValueError("incomplete FTS schema section")


def migrate_fts(db_path: str) -> dict:
    """Rebuild only derived FTS rows, preserving FULL/WAL and version history.

    Run while importers are stopped. BEGIN IMMEDIATE serializes with writers;
    errors roll back DDL, backfill and the version record together. Re-running
    recreates the same index from assets and retains the first v1.1 timestamp.
    """
    statements = list(_fts_statements())
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            versions = {
                r[0] for r in conn.execute("SELECT version FROM schema_version")
            }
            if "1.0" not in versions or not versions <= {"1.0", "1.1"}:
                raise ValueError("expected schema v1.0 or v1.1")
            conn.execute("DROP TRIGGER IF EXISTS assets_fts_insert")
            conn.execute("DROP TRIGGER IF EXISTS assets_fts_delete")
            conn.execute("DROP TABLE IF EXISTS assets_fts")
            for statement in statements:
                conn.execute(statement)
            conn.execute(
                """INSERT INTO assets_fts(rowid, asset_id, content)
                   SELECT rowid, asset_id, CAST(content_blob AS TEXT)
                   FROM assets WHERE content_blob IS NOT NULL"""
            )
            conn.execute(
                """INSERT OR IGNORE INTO schema_version
                   (version, applied_at, description) VALUES ('1.1', ?, ?)""",
                (int(time.time() * 1000),
                 "Self-contained FTS index; explicit unindexed assets"),
            )
            indexed = conn.execute("SELECT COUNT(*) FROM assets_fts").fetchone()[0]
        return {"schema_version": "1.1", "indexed_assets": indexed}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_path", help="existing SQLite database (no default)")
    args = parser.parse_args()
    print(json.dumps(migrate_fts(args.db_path)))
