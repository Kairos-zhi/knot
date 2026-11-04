"""Reader-scoped, integrity-checked slices of embedded UTF-8 assets."""
import hashlib
import re
import sqlite3
from time import monotonic

from mvp.text_policy import ASSET_ID_PATTERN, TEXT_MIMES
from .timeline_query import read_snapshot

_MARKER = re.compile(
    r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----"
    r"|\b(?:KNOT_TOKENS?|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|PASSWORD|CLIENT_SECRET|API_KEY)"
    r"""\s*(?:["']\s*)?[:=]\s*["']?\S"""
    r"|\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S", re.IGNORECASE)


class TextSliceError(ValueError):
    """A fixed, non-content error code."""


def _sensitive(content, token):
    return bool((token and token in content) or _MARKER.search(content))


def _check_time(deadline):
    if monotonic() >= deadline:
        raise TextSliceError('READ_LIMIT_REACHED')


def _slice(conn, asset_id, expected_hash, offset, limit, actor, token, deadline):
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='asset_readers'").fetchone() is None:
        raise TextSliceError('READER_TABLE_MISSING')
    if conn.execute('SELECT 1 FROM asset_readers WHERE asset_id=? AND actor=?', (asset_id, actor)).fetchone() is None:
        raise TextSliceError('ASSET_UNAVAILABLE')
    row = conn.execute('SELECT content_hash, media_type, typeof(content_blob), length(content_blob) FROM assets WHERE asset_id=?', (asset_id,)).fetchone()
    if row is None:
        raise TextSliceError('ASSET_UNAVAILABLE')
    digest, mime, kind, length = row
    if kind != 'blob' or mime not in TEXT_MIMES:
        raise TextSliceError('UNSUPPORTED_CONTENT')
    if length > 1_000_000:
        raise TextSliceError('CONTENT_TOO_LARGE')
    if type(digest) is not str or not re.fullmatch('[0-9a-f]{64}', digest) or digest != expected_hash:
        raise TextSliceError('CONTENT_MISMATCH')
    _check_time(deadline)
    blob = conn.execute('SELECT content_blob FROM assets WHERE asset_id=?', (asset_id,)).fetchone()[0]
    if hashlib.sha256(blob).hexdigest() != digest:
        raise TextSliceError('CONTENT_MISMATCH')
    try:
        content = blob.decode('utf-8')
    except UnicodeDecodeError:
        content = None
    if content is None or any(b == 127 or (b < 32 and b not in (9, 10, 13)) for b in blob):
        raise TextSliceError('UNSUPPORTED_CONTENT')
    _check_time(deadline)
    if _sensitive(content, token):
        raise TextSliceError('SENSITIVE_CONTENT')
    _check_time(deadline)
    if offset > length or (offset < length and blob[offset] & 0xc0 == 0x80):
        raise TextSliceError('INVALID_ARGUMENT')
    end = min(length, offset + limit)
    while end < length and blob[end] & 0xc0 == 0x80:
        end -= 1
    return {'asset_id': asset_id, 'content_hash': digest, 'media_type': mime,
            'total_bytes': length, 'offset': offset, 'next_offset': end,
            'text': blob[offset:end].decode('utf-8'), 'has_more': end < length}


def read_asset_text_slice(db_path, asset_id, expected_hash, offset, limit, actor, token):
    """Return one verified slice; actor and token are trusted upstream inputs."""
    if (type(asset_id) is not str or not re.fullmatch(ASSET_ID_PATTERN, asset_id)
            or type(expected_hash) is not str or not re.fullmatch('[0-9a-f]{64}', expected_hash)
            or type(offset) is not int or offset < 0 or type(limit) is not int or not 4 <= limit <= 8192
            or type(actor) is not str or not actor or type(token) is not str or not token):
        raise TextSliceError('INVALID_ARGUMENT')
    deadline = monotonic() + 1.0
    error = None
    result = None
    try:
        with read_snapshot(db_path, timeout=0.1) as conn:
            _check_time(deadline)
            interrupted = False
            def progress():
                nonlocal interrupted
                interrupted = monotonic() >= deadline
                return int(interrupted)
            conn.set_progress_handler(progress, 1000)
            try:
                result = _slice(conn, asset_id, expected_hash, offset, limit, actor, token, deadline)
            finally:
                conn.set_progress_handler(None, 0)
        _check_time(deadline)
    except TextSliceError as exc:
        error = str(exc)
    except sqlite3.Error as exc:
        error = 'READ_LIMIT_REACHED' if (getattr(exc, 'sqlite_errorcode', 0) & 0xff) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED, sqlite3.SQLITE_INTERRUPT) else 'READ_UNAVAILABLE'
    except Exception:
        error = 'READ_UNAVAILABLE'
    if error is not None:
        raise TextSliceError(error)
    return result
