"""SELECT-only timeline queries; read_snapshot owns the read transaction."""

from contextlib import closing, contextmanager
from collections.abc import Iterator
from pathlib import Path
import sqlite3

from ._db import validate_limit


@contextmanager
def read_snapshot(db_path) -> Iterator[sqlite3.Connection]:
    """Open an existing v1.4 database read-only, roll back and close on exit.

    BEGIN precedes schema validation, so validation and all caller reads see
    the same SQLite snapshot. No initialization, migration or repair occurs.
    """
    uri = Path(db_path).expanduser().resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("BEGIN")
        try:
            if conn.execute(
                "SELECT 1 FROM schema_version WHERE version='1.4'"
            ).fetchone() is None:
                raise ValueError("schema v1.4 required; migrate explicitly")
            conn.execute("SELECT source_label,source_members FROM claims_candidates LIMIT 0")
            yield conn
        finally:
            conn.rollback()


def _rows(cursor):
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row)) for row in cursor]


def events_range(conn, *, start: int, end: int, limit: int = 200) -> list[dict]:
    """Return [start, end) ordered by event_time then insertion rowid.

    An empty interval returns []; a reversed interval is invalid (AC-1).
    """
    if type(start) is not int or type(end) is not int:
        raise ValueError("start and end must be integers")
    if end < start:
        raise ValueError("end must be greater than or equal to start")
    validate_limit(limit)
    return _rows(conn.execute(
        "SELECT * FROM history_events WHERE event_time>=? AND event_time<? "
        "ORDER BY event_time,rowid LIMIT ?", (start, end, limit),
    ))


def asset_by_hash(conn, content_hash: str) -> dict | None:
    """Return the stored asset row, including opaque blob; never open file_path."""
    if not isinstance(content_hash, str) or not content_hash:
        raise ValueError("content_hash must be a non-empty string")
    rows = _rows(conn.execute("SELECT * FROM assets WHERE content_hash=?", (content_hash,)))
    return rows[0] if rows else None


def claims_by_atom(conn, atom: str, *, limit: int = 500) -> list[dict]:
    """Exact atom match; JSON columns remain stored strings, as in existing repos."""
    if not isinstance(atom, str) or not atom:
        raise ValueError("atom must be a non-empty string")
    validate_limit(limit)
    return _rows(conn.execute(
        "SELECT claim_id,claim_type,atom,source_label,support_sources,"
        "source_members,unverified,user_response FROM claims_candidates "
        "WHERE atom=? ORDER BY source_label,rowid LIMIT ?", (atom, limit),
    ))
