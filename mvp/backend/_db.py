"""Shared SQLite lifecycle for repositories over an initialized schema v1 DB."""

from contextlib import closing, contextmanager
from pathlib import Path
import sqlite3


def validate_limit(limit: int) -> None:
    """Reject negative limits (SQLite otherwise treats them as unlimited)."""
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 0:
        raise ValueError("limit must be a non-negative integer")


class SQLiteRepo:
    """Use short-lived connections; never initialize or replace a database."""

    def __init__(self, db_path: str):
        self.db_path = Path(db_path).expanduser().resolve()
        self._uri = self.db_path.as_uri() + "?mode=rw"
        self._scoped_connection = None

    @contextmanager
    def session(self):
        """Reuse a connection for imports, retaining per-operation commits.

        Use ``with repo.session(): ...``; the connection always closes on
        exit. Nested sessions on one repo are rejected rather than silently
        changing ownership. Instances are not shared across threads.
        """
        if self._scoped_connection is not None:
            raise RuntimeError("a repository session is already open")
        with self._open() as conn:
            self._scoped_connection = conn
            try:
                yield self
            finally:
                self._scoped_connection = None

    @contextmanager
    def _open(self):
        with closing(sqlite3.connect(self._uri, uri=True)) as conn:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            yield conn

    @contextmanager
    def _transaction(self, conn):
        try:
            yield conn
            conn.commit()
        except sqlite3.IntegrityError:
            # Keep SQLite's exception type/code available to import callers.
            conn.rollback()
            raise
        except BaseException:
            conn.rollback()
            raise

    @contextmanager
    def _connection(self):
        if self._scoped_connection is not None:
            with self._transaction(self._scoped_connection) as conn:
                yield conn
        else:
            with self._open() as conn, self._transaction(conn):
                yield conn

    def _one(self, sql, params=()):
        with self._connection() as conn:
            row = conn.execute(sql, params).fetchone()
            return dict(row) if row is not None else None

    def _all(self, sql, params=()):
        with self._connection() as conn:
            return [dict(row) for row in conn.execute(sql, params).fetchall()]
