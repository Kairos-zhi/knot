"""Add schema v1.2 on an existing v1.1/v1.2 database, without backfill."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time


def _statements():
    schema = Path(__file__).with_name("schema_v1.sql").read_text(encoding="utf-8")
    section = schema.split("-- BEGIN EVENT ATOM v1.2\n", 1)[1].split(
        "-- END EVENT ATOM v1.2", 1
    )[0]
    statement = ""
    for line in section.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            yield statement
            statement = ""
    if statement.strip():
        raise ValueError("incomplete event_atom schema section")


def migrate_schema(db_path):
    """Atomically add only the mapping table/index and first version record."""
    statements = list(_statements())
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            versions = {r[0] for r in conn.execute("SELECT version FROM schema_version")}
            if (not versions <= {"1.0", "1.1", "1.2"}
                    or not versions & {"1.1", "1.2"}):
                raise ValueError("schema v1.1 or v1.2 required; migrate v1.0 first")
            for statement in statements:
                conn.execute(statement)
            conn.execute(
                """INSERT OR IGNORE INTO schema_version
                   (version, applied_at, description) VALUES ('1.2', ?, ?)""",
                (int(time.time() * 1000),
                 "Event to atom mapping, without historical backfill"),
            )
        return {"schema_version": "1.2", "backfilled": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_path", help="explicit existing candidate database")
    args = parser.parse_args()
    print(json.dumps(migrate_schema(args.db_path)))
