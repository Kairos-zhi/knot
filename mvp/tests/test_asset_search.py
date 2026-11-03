"""Reader-scoped literal search against disposable SQLite and loopback HTTP."""

from contextlib import closing
from hashlib import sha256
import json
import sqlite3
from urllib.parse import urlencode
from uuid import uuid4

import pytest

from mvp.backend import asset_search, http_server
from mvp.backend.init_db import init_database
from mvp.backend.timeline_query import read_snapshot
from mvp.contract.selfcheck import request, validate
from mvp.tests.test_http_contract import Live


TOKEN = "synthetic-search-token-a"
OTHER = "synthetic-search-token-b"


@pytest.fixture
def database(tmp_path, monkeypatch):
    monkeypatch.delenv("KNOT_TOKEN", raising=False)
    monkeypatch.setenv("KNOT_TOKENS", json.dumps({TOKEN: "A", "alternate-token-a": "A", OTHER: "B"}))
    path = tmp_path / "search.db"
    assert init_database(path)["status"] == "created"
    return path


def add(conn, content, reader="A", *, mime="text/markdown", digest=None, stamp=100):
    asset_id = str(uuid4())
    checksum = digest or sha256(content or b"").hexdigest()
    conn.execute(
        """INSERT INTO assets (asset_id, content_hash, media_type, content_blob, file_path,
                               source_uri, created_at, imported_at, metadata_json)
           VALUES (?, ?, ?, ?, 'private/path', 'private://uri', 0, ?, '{"word":"metaonly"}')""",
        (asset_id, checksum, mime, content, stamp),
    )
    if reader:
        conn.execute("INSERT INTO asset_readers VALUES (?, ?)", (asset_id, reader))
    return {"asset_id": asset_id, "content_hash": checksum, "media_type": mime}


def get(live, query, limit=10, token=TOKEN):
    return request(live.base, "/asset-search?" + urlencode({"q": query, "limit": limit}), token=token)


def test_keyword_search_visibility_and_text_policy(database):
    word = "\u7ec4\u7ec7"
    whole = "\u7ed3\u7ef3\u7ec4\u7ec7\u4e0a\u4e0b\u6587"
    literal = 'OR "%_" foo* AND [x] \' ; --'
    with closing(sqlite3.connect(database)) as conn, conn:
        older = add(conn, (whole + " Stra\u00dfe 2030").encode(), stamp=10)
        visible = add(conn, (whole + " STRASSE 2031 " + literal).encode())
        hidden = add(conn, (whole + " hidden match").encode(), reader="B", stamp=999)
        add(conn, (whole + " no grant").encode(), reader=None, stamp=1000)
        add(conn, (whole + " JSON").encode(), mime="application/json")
        add(conn, (whole + " invalid UTF8").encode() + b"\xff")
        add(conn, (whole + " bad hash").encode(), digest="b" * 64)
        add(conn, (whole + " very long " + "x" * 8192).encode())
        add(conn, whole + " sqlite text\x00" + "x" * 8192, digest="d" * 64)
        add(conn, (whole + " sensitive PASSWORD=synthetic").encode())
        add(conn, ("exposedtoken " + TOKEN).encode())
        add(conn, (whole + " control \x7f").encode())
        add(conn, None, digest="c" * 64)
    live = Live(database)
    route = next(r for r in http_server.ROUTES if r["path"] == "/asset-search")
    try:
        status, body = get(live, f"strasse {word}", limit=1)
        assert status == 200
        validate(body, route)
        assert body["value"] == {"items": [visible], "has_more": True}
        assert get(live, word)[1]["value"] == {"items": [visible, older], "has_more": False}
        assert get(live, f"{word}\u2003STRASSE")[1]["value"]["items"] == [visible, older]
        assert get(live, word, token="alternate-token-a")[1]["value"]["items"] == [visible, older]
        assert get(live, word, token=OTHER)[1]["value"] == {"items": [hidden], "has_more": False}
        for query in ("OR", '"%_"', "foo*", "AND", "[x]", "' ; --"):
            assert get(live, query)[1]["value"] == {"items": [visible], "has_more": False}
        for query in ("metaonly", "private", "synthetic", "hidden", "invalid", "bad hash", "very long",
                      "exposedtoken", "sqlite text"):
            assert get(live, query)[1]["value"] == {"items": [], "has_more": False}
        for query in ("", "a\tb", "a\x7fb", "a\u0085b", "\u7ec4" * 43, "a b c d e f g h i",
                      TOKEN, "KNOT_TOKENS=synthetic"):
            status, body = get(live, query)
            assert status == 400 and body["error"]["code"] == "BAD_REQUEST"
            assert TOKEN not in json.dumps(body)
        assert request(live.base, "/asset-search?q=%ED%A0%80", token=TOKEN)[0] == 400
        for token in (None, "unknown"):
            assert get(live, word, token=token)[0] == 403
        with closing(sqlite3.connect(database)) as conn, conn:
            conn.execute("DELETE FROM asset_readers WHERE asset_id=?", (visible["asset_id"],))
        assert get(live, word, limit=1)[1]["value"] == {"items": [older], "has_more": False}
        with closing(sqlite3.connect(database)) as conn, conn:
            conn.execute("DROP TABLE asset_readers")
        assert get(live, word)[0] == 403
    finally:
        live.stop()


def test_search_first_page_scan_cap_and_sql_timeout(database, monkeypatch):
    with closing(sqlite3.connect(database)) as conn, conn:
        for index in range(1001):
            add(conn, f"neutral row {index}".encode())
        only_match = add(conn, b"one match")
        for index in range(1001):
            add(conn, f"one hidden match {index}".encode(), reader="B", stamp=999)
    live = Live(database)
    try:
        status, body = get(live, "match", limit=1)
        assert status == 503
        assert body == {
            "contract_version": 1, "ok": False,
            "error": {"code": "SERVER_BUSY", "message": "SERVER_BUSY", "detail": {"reason": "search_limit"}},
        }
        assert only_match["asset_id"] not in json.dumps(body)
        assert get(live, "neutral", limit=1)[1]["value"]["has_more"] is True
    finally:
        live.stop()

    times = iter((0.0, 2.0))
    with read_snapshot(database) as conn:
        with monkeypatch.context() as patch:
            patch.setattr(asset_search, "monotonic", lambda: next(times))
            with pytest.raises(asset_search.SearchLimitReached):
                asset_search.search_readable_text(conn, ("match",), 1, "A", TOKEN, deadline=1.0)
            # If the expired SQLite callback leaked it would raise on this scan.
            assert conn.execute("SELECT count(*) FROM assets WHERE content_blob IS NOT NULL").fetchone()[0] == 2003


def test_search_maps_sqlite_lock_wait_to_fixed_budget_failure(database):
    with closing(sqlite3.connect(database)) as conn:
        assert conn.execute("PRAGMA journal_mode=DELETE").fetchone()[0] == "delete"
        conn.execute("BEGIN EXCLUSIVE")
        with pytest.raises(asset_search.SearchLimitReached):
            asset_search.search_assets(database, ("needle",), 1, "A", TOKEN)
        conn.rollback()
    assert asset_search.search_assets(database, ("needle",), 1, "A", TOKEN) == {
        "items": [], "has_more": False,
    }


def test_search_rejects_single_user_even_with_grant(database, monkeypatch):
    monkeypatch.delenv("KNOT_TOKENS")
    with closing(sqlite3.connect(database)) as conn, conn:
        add(conn, b"needle", reader="local-user")
    live = Live(database)
    try:
        assert get(live, "needle")[0] == 403
    finally:
        live.stop()
