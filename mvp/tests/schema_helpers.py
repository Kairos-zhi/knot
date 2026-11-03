"""Historical database fixtures independent of the current initializer."""

from contextlib import closing
from pathlib import Path
import sqlite3


def create_v14(db):
    with closing(sqlite3.connect(db)) as conn:
        conn.executescript((Path(__file__).resolve().parents[1] / 'backend/schema_v1.sql')
                           .read_text(encoding='utf-8'))
        assert conn.execute('SELECT version FROM schema_version ORDER BY version').fetchall() == [
            (f'1.{i}',) for i in range(5)]
        assert conn.execute("SELECT 1 FROM sqlite_master WHERE name='asset_readers'").fetchone() is None
    return dict(status='created', schema_version='1.4')
