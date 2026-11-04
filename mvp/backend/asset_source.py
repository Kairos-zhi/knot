"""Reader-scoped projection of an unverified recorded file reference."""
import json
import re
import sqlite3
import unicodedata
from time import monotonic
from urllib.parse import quote

from mvp.text_policy import ASSET_ID_PATTERN, has_credential_marker
from .timeline_query import read_snapshot


class SourceError(ValueError):
    """A fixed, non-content error code."""


def _check(deadline):
    if monotonic() >= deadline:
        raise SourceError('READ_LIMIT_REACHED')


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate')
        result[key] = value
    return result


def _path_ok(path):
    try:
        if not path or len(path.encode('utf-8')) > 1024:
            return False
        if any(c in path for c in '\\:%@?#'):
            return False
        if any(unicodedata.category(c).startswith('C') for c in path):
            return False
        return all(segment and segment not in ('.', '..') and
                   segment == segment.strip() and len(segment.encode('utf-8')) <= 255
                   for segment in path.split('/'))
    except UnicodeError:
        return False


def _result(asset_id, digest, status='unknown', path=None, reason=None):
    return dict(asset_id=asset_id, content_hash=digest, source_status=status,
                relative_path=path, reason=reason, provenance_verified=False,
                import_evidence_checked=False)


def _source(conn, asset_id, expected_hash, actor, token, deadline):
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='asset_readers'").fetchone() is None:
        raise SourceError('READER_TABLE_MISSING')
    if conn.execute('SELECT 1 FROM asset_readers WHERE asset_id=? AND actor=?', (asset_id, actor)).fetchone() is None:
        raise SourceError('ASSET_UNAVAILABLE')
    row = conn.execute('SELECT content_hash, typeof(source_uri), length(CAST(source_uri AS BLOB)), '
                       'typeof(metadata_json), length(CAST(metadata_json AS BLOB)) '
                       'FROM assets WHERE asset_id=?', (asset_id,)).fetchone()
    if row is None:
        raise SourceError('ASSET_UNAVAILABLE')
    digest, uri_type, uri_len, meta_type, meta_len = row
    if type(digest) is not str or not re.fullmatch('[0-9a-f]{64}', digest) or digest != expected_hash:
        raise SourceError('CONTENT_MISMATCH')
    _check(deadline)
    if uri_type == 'null' or (uri_type == 'text' and uri_len == 0):
        return _result(asset_id, digest, reason='missing_source')
    if (uri_len is not None and uri_len > 4096) or (meta_len is not None and meta_len > 8192):
        return _result(asset_id, digest, reason='source_limit')
    if uri_type != 'text' or meta_type not in ('text', 'null'):
        return _result(asset_id, digest, reason='invalid_source')
    uri, meta = conn.execute('SELECT source_uri, metadata_json FROM assets WHERE asset_id=?', (asset_id,)).fetchone()
    if has_credential_marker(uri, token) or (meta is not None and has_credential_marker(meta, token)):
        return _result(asset_id, digest, reason='sensitive_source')
    if not uri.startswith('file://'):
        return _result(asset_id, digest, reason='unsupported_source')
    try:
        obj = json.loads(meta, object_pairs_hook=_object,
                         parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))
        if type(obj) is not dict or set(obj) != {'origin', 'path'} or obj['origin'] != 'v0.4' or type(obj['path']) is not str:
            raise ValueError('shape')
        path = obj['path']
        if not _path_ok(path):
            raise ValueError('path')
    except (ValueError, TypeError, RecursionError, UnicodeError):
        return _result(asset_id, digest, reason='invalid_source')
    if has_credential_marker(path, token):
        return _result(asset_id, digest, reason='sensitive_source')
    if uri != 'file://' + quote(path, safe='/'):
        return _result(asset_id, digest, reason='inconsistent_source')
    return _result(asset_id, digest, 'recorded_file_reference', path)


def read_asset_source(db_path, asset_id, expected_hash, actor, token):
    """Project a recorded label; actor and token are trusted upstream inputs."""
    if (type(asset_id) is not str or not re.fullmatch(ASSET_ID_PATTERN, asset_id)
            or type(expected_hash) is not str or not re.fullmatch('[0-9a-f]{64}', expected_hash)
            or type(actor) is not str or not actor.strip() or '\r' in actor or '\n' in actor
            or type(token) is not str or not token.strip()):
        raise SourceError('INVALID_ARGUMENT') from None
    deadline = monotonic() + 1.0
    error = None
    result = None
    try:
        with read_snapshot(db_path, timeout=0.1) as conn:
            _check(deadline)
            conn.set_progress_handler(lambda: int(monotonic() >= deadline), 1000)
            try:
                result = _source(conn, asset_id, expected_hash, actor, token, deadline)
            finally:
                conn.set_progress_handler(None, 0)
        _check(deadline)
        encoded = json.dumps(result, ensure_ascii=True).encode('utf-8')
        if len(encoded) > 16384:
            raise SourceError('SOURCE_LIMIT_REACHED')
        escaped_token = json.dumps(token, ensure_ascii=True)[1:-1].encode('ascii')
        if token.encode('utf-8') in encoded or escaped_token in encoded:
            raise SourceError('SENSITIVE_CONTENT')
    except SourceError as exc:
        error = str(exc) if str(exc) in {'INVALID_ARGUMENT', 'ASSET_UNAVAILABLE', 'READER_TABLE_MISSING', 'CONTENT_MISMATCH', 'SENSITIVE_CONTENT', 'SOURCE_LIMIT_REACHED', 'READ_LIMIT_REACHED', 'READ_UNAVAILABLE'} else 'READ_UNAVAILABLE'
    except sqlite3.Error as exc:
        error = ('READ_LIMIT_REACHED' if (getattr(exc, 'sqlite_errorcode', 0) & 0xff)
                 in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED, sqlite3.SQLITE_INTERRUPT) else 'READ_UNAVAILABLE')
    except Exception:
        error = 'READ_UNAVAILABLE'
    if error is not None:
        raise SourceError(error) from None
    return result
