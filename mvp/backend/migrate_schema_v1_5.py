"""Explicit, atomic addition of nullable continuation-bundle job provenance."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time


class SchemaDriftError(ValueError):
    """Refuse incompatible existing columns without changing the database."""


def migrate_schema(db_path):
    uri = Path(db_path).expanduser().resolve().as_uri() + '?mode=rw'
    with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        versions = {row[0] for row in conn.execute('SELECT version FROM schema_version')}
        if '1.4' not in versions or not versions <= {f'1.{i}' for i in range(6)}:
            raise ValueError('schema v1.4 required; unsupported schema version')
        columns = {row[1]: row for row in conn.execute('PRAGMA table_info(continuation_bundles)')}
        if not columns:
            raise SchemaDriftError('continuation_bundles missing; no changes made')
        column = columns.get('job_id')
        if column is not None:
            if column[2].upper() != 'TEXT' or column[3:] != (0, None, 0):
                raise SchemaDriftError('job_id must be nullable TEXT without default or key; no changes made')
        elif '1.5' in versions:
            raise SchemaDriftError('version 1.5 without job_id; no changes made')
        else:
            conn.execute('ALTER TABLE continuation_bundles ADD COLUMN job_id TEXT')
        created = '1.5' not in versions
        if created:
            conn.execute('INSERT INTO schema_version (version,applied_at,description) VALUES (?,?,?)',
                         ('1.5', int(time.time() * 1000), 'Continuation bundle producing job provenance'))
        return dict(schema_version='1.5', created=created)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('db_path', help='explicit existing candidate database')
    args = parser.parse_args()
    try:
        result = migrate_schema(args.db_path)
    except (ValueError, sqlite3.Error) as exc:
        parser.exit(1, str(exc) + '\n')
    print(json.dumps(result))
