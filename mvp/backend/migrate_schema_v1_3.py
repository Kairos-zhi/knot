"""Add the v1.3 unique snapshot-instant index without resolving data conflicts."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time


class SnapshotConflictError(ValueError):
    """Report every conflicting group; leave resolution to the caller."""

    def __init__(self, groups):
        self.conflicts = tuple(groups)
        details = "; ".join(
            f"(snapshot_time={instant}, event_id={event!r}, n={count})"
            for instant, event, count in self.conflicts
        )
        super().__init__(
            "Cannot migrate to schema v1.3: duplicate snapshot groups: "
            + details + ". No schema or data changes were committed."
        )


def _statements():
    schema = Path(__file__).with_name("schema_v1.sql").read_text(encoding="utf-8")
    section = schema.split("-- BEGIN UNIQUE v1.3\n", 1)[1].split(
        "-- END UNIQUE v1.3", 1
    )[0]
    statement = ""
    for line in section.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            yield statement
            statement = ""
    if statement.strip():
        raise ValueError("incomplete v1.3 unique-index schema section")


def migrate_schema(db_path):
    """Refuse all duplicates before any DDL; commit index and version together."""
    statements = list(_statements())
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True)) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            versions = {r[0] for r in conn.execute("SELECT version FROM schema_version")}
            if not versions <= {"1.0", "1.1", "1.2", "1.3"}:
                raise ValueError("unsupported schema version; expected v1.2 or v1.3")
            if "1.3" in versions:
                return {"schema_version": "1.3", "duplicates": 0, "created": False}
            if "1.2" not in versions:
                raise ValueError("schema v1.2 required; migrate older versions first")
            duplicates = conn.execute(
                """SELECT snapshot_time, event_id, COUNT(*) AS n
                   FROM eligible_snapshots GROUP BY 1,2 HAVING COUNT(*) > 1
                   ORDER BY snapshot_time, event_id"""
            ).fetchall()
            if duplicates:
                raise SnapshotConflictError(duplicates)
            for statement in statements:
                conn.execute(statement)
            # IF NOT EXISTS must not silently accept an incompatible named index.
            indexes = {r[1]: r for r in conn.execute("PRAGMA index_list(eligible_snapshots)")}
            index = indexes.get("uq_eligible_snapshot_event")
            keys = [(r[2], r[4]) for r in conn.execute(
                "PRAGMA index_xinfo(uq_eligible_snapshot_event)"
            ) if r[5]]
            if (index is None or index[2] != 1 or index[4] != 0
                    or keys != [("snapshot_time", "BINARY"), ("event_id", "BINARY")]):
                raise ValueError("uq_eligible_snapshot_event has an incompatible definition")
            conn.execute(
                """INSERT OR IGNORE INTO schema_version
                   (version, applied_at, description) VALUES ('1.3', ?, ?)""",
                (int(time.time() * 1000), "One row per event per snapshot instant"),
            )
        return {"schema_version": "1.3", "duplicates": 0, "created": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_path", help="explicit existing candidate database")
    args = parser.parse_args()
    try:
        result = migrate_schema(args.db_path)
    except (ValueError, sqlite3.Error) as exc:
        parser.exit(1, str(exc) + "\n")
    print(json.dumps(result))
