"""Bounded literal asset search in the caller's read snapshot."""

import re
import sqlite3
from time import monotonic

from mvp.text_policy import (
    ASSET_ID_PATTERN,
    MAX_TEXT_BYTES,
    SHA256_PATTERN,
    TEXT_MIMES,
    text_error,
)
from .timeline_query import read_snapshot


_SCAN_LIMIT = 1000
_SEARCH_SECONDS = 1.0
_BUSY_SECONDS = 0.1


class SearchLimitReached(Exception):
    """The search could not determine the first page within its budget."""


class ReaderTableMissing(Exception):
    """The snapshot lacks explicit asset reader grants."""


def search_assets(db_path, terms, limit, actor, token):
    """Search one read-only snapshot with bounded SQLite lock waits."""
    deadline = monotonic() + _SEARCH_SECONDS
    try:
        with read_snapshot(db_path, timeout=_BUSY_SECONDS) as conn:
            return search_readable_text(conn, terms, limit, actor, token, deadline=deadline)
    except sqlite3.OperationalError as exc:
        if (getattr(exc, "sqlite_errorcode", 0) & 0xff) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
            raise SearchLimitReached from None
        raise


def search_readable_text(conn, terms, limit, actor, token, *, deadline):
    """Use validated terms in a fresh snapshot owned by the caller."""
    if monotonic() >= deadline:
        raise SearchLimitReached
    interrupted = False

    def stop_when_expired():
        nonlocal interrupted
        interrupted = monotonic() >= deadline
        return int(interrupted)

    conn.set_progress_handler(stop_when_expired, 1000)
    try:
        if conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='asset_readers'"
        ).fetchone() is None:
            raise ReaderTableMissing

        rows = conn.execute(
            """SELECT a.asset_id, a.content_hash, a.media_type, a.content_blob
               FROM assets a
               WHERE a.media_type IN (?, ?) AND typeof(a.content_blob) = 'blob'
                 AND length(a.content_blob) <= ?
                 AND EXISTS (SELECT 1 FROM asset_readers r
                             WHERE r.asset_id = a.asset_id AND r.actor = ?)
               ORDER BY a.imported_at DESC, a.rowid DESC
               LIMIT ?""",
            (*sorted(TEXT_MIMES), MAX_TEXT_BYTES, actor, _SCAN_LIMIT + 1),
        )
        items = []
        for index, (asset_id, digest, mime, blob) in enumerate(rows):
            if monotonic() >= deadline or index == _SCAN_LIMIT:
                raise SearchLimitReached
            if (type(asset_id) is not str or not re.fullmatch(ASSET_ID_PATTERN, asset_id)
                    or type(digest) is not str or not re.fullmatch(SHA256_PATTERN, digest)):
                continue
            try:
                content = blob.decode("utf-8")
            except UnicodeDecodeError:
                continue
            digest = digest.lower()
            if text_error(content, digest, token):
                continue
            folded = content.casefold()
            if all(term in folded for term in terms):
                if len(items) == limit:
                    if monotonic() >= deadline:
                        raise SearchLimitReached
                    return {"items": items, "has_more": True}
                items.append({"asset_id": asset_id, "content_hash": digest, "media_type": mime})
        if monotonic() >= deadline:
            raise SearchLimitReached
        return {"items": items, "has_more": False}
    except sqlite3.OperationalError as exc:
        if interrupted and getattr(exc, "sqlite_errorcode", None) == sqlite3.SQLITE_INTERRUPT:
            raise SearchLimitReached from None
        raise
    finally:
        conn.set_progress_handler(None, 0)
