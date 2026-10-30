"""Explicit additive asset-reader migration; historical assets belong to local-user."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time


class SchemaDriftError(ValueError):
    """Reject incompatible or unversioned structures without repairing them."""


def _check(conn):
    columns = list(conn.execute('PRAGMA table_info(asset_readers)'))
    if [(r[1], r[2].upper(), r[3], r[4], r[5]) for r in columns] != [
            ('asset_id', 'TEXT', 1, None, 1), ('actor', 'TEXT', 1, None, 2)]:
        raise SchemaDriftError('asset_readers structure differs; no changes made')


def migrate_schema(db_path):
    uri = Path(db_path).expanduser().resolve().as_uri() + '?mode=rw'
    with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        versions = {r[0] for r in conn.execute('SELECT version FROM schema_version')}
        if '1.5' not in versions or not versions <= {f'1.{i}' for i in range(7)}:
            raise ValueError('schema v1.5 required; unsupported schema version')
        exists = conn.execute("SELECT 1 FROM sqlite_master WHERE name='asset_readers'").fetchone()
        if '1.6' in versions:
            _check(conn)
            return dict(schema_version='1.6', created=False)
        if exists:
            raise SchemaDriftError('unversioned asset_readers; no changes made')
        conn.execute('CREATE TABLE asset_readers (asset_id TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY(asset_id,actor))')
        conn.execute("INSERT INTO asset_readers SELECT asset_id,'local-user' FROM assets")
        _check(conn)
        conn.execute('INSERT INTO schema_version VALUES (?,?,?)',
                     ('1.6', int(time.time() * 1000), 'Asset read grants separate from token identity'))
        return dict(schema_version='1.6', created=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('db_path')
    args = parser.parse_args()
    try:
        result = migrate_schema(args.db_path)
    except (ValueError, sqlite3.Error) as exc:
        parser.exit(1, str(exc) + '\n')
    print(json.dumps(result))
