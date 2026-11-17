import asyncio
from contextlib import closing
from datetime import datetime, timezone
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import sys
from threading import Thread
import time
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

from mcp import Client, StdioServerParameters
import pytest


HASH = "a" * 64
ASSET = "d18876aa-54b6-4601-b9cd-e73fa2104c28"
PRIVATE = "SYNTH-PRIVATE"

TOOL_NAMES = [
    "knot_lookup_asset", "knot_read_asset", "knot_search_assets",
    "knot_save_exploration", "knot_load_exploration", "knot_list_explorations",
    "knot_save_exploration_v2", "knot_load_exploration_v2", "knot_fork_exploration",
    "knot_read_asset_slice", "knot_read_asset_source",
]
CONTEXT_TOOL = "knot_context_review"
CONTEXT_SENTENCES = (
    "在开始任何与 Knot 项目相关的工作（读材料、整理决定、写回顾）之前先调用本工具。",
    "把返回的待维护项原样呈现给用户，由用户决定是否处理。",
    "本工具只读，不修改数据库、不导入、不写入。",
)


@pytest.fixture
def upstream():
    requests = []
    responses = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append((self.path, self.headers.get("Authorization")))
            status, body, headers, delay = responses.pop(0)
            if delay:
                time.sleep(delay)
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *_):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}", requests, responses
        finally:
            server.shutdown()
            thread.join()


@pytest.mark.parametrize("mode", ["auto", "legacy"])
def test_stdio_lookup_and_boundaries(upstream, capfd, mode):
    origin, requests, responses = upstream
    valid = {"contract_version": 1, "ok": True, "value": {"items": [{
        "asset_id": ASSET, "media_type": "text/plain", "content": PRIVATE,
        "path": PRIVATE, "source_uri": PRIVATE, "content_hash": PRIVATE,
    }]}}
    empty = valid | {"value": {"items": []}}
    responses.extend([
        (200, json.dumps(valid).encode(), {}, 0),
        (200, json.dumps(empty).encode(), {}, 0),
        (403, PRIVATE.encode(), {}, 0),
        (302, PRIVATE.encode(), {"Location": f"{origin}/redirect"}, 0),
        (200, b"x" * 65537, {}, 0),
        (200, PRIVATE.encode(), {}, 0),
        (200, b"", {}, 3),
    ])
    params = StdioServerParameters(
        command=sys.executable,
        args=["-B", "-m", "mvp.codex_mcp", "--origin", origin],
        cwd=Path(__file__).resolve().parents[2],
        env={"KNOT_TOKEN": PRIVATE, "HTTP_PROXY": "http://127.0.0.1:1", "NO_PROXY": ""},
    )

    async def check():
        async with Client(params, mode=mode) as client:
            print(f"negotiated_protocol[{mode}]={client.protocol_version}")
            listing = await client.list_tools()
            assert [tool.name for tool in listing.tools] == TOOL_NAMES + [CONTEXT_TOOL]
            tool = listing.tools[0]
            assert tool.name == "knot_lookup_asset"
            assert set(tool.input_schema["properties"]) == {"content_hash"}
            assert tool.input_schema["additionalProperties"] is False

            async def call(expected, args, name=tool.name):
                result = await client.call_tool(name, args)
                assert result.structured_content == expected
                assert json.loads(result.content[0].text) == expected
                assert result.is_error is ("error" in expected)
                assert PRIVATE not in result.model_dump_json()

            await call({"error": "INVALID_ARGUMENTS"}, {"content_hash": HASH, "actor": PRIVATE})
            await call({"error": "INVALID_ARGUMENTS"}, {"content_hash": HASH, "view": "content"})
            await call({"error": "INVALID_ARGUMENTS"}, {"content_hash": HASH}, PRIVATE)
            await call({"error": "INVALID_ARGUMENTS"}, {"content_hash": [PRIVATE]})
            await call({"items": [{"asset_id": ASSET, "kind": "text"}]}, {"content_hash": HASH})
            await call({"items": []}, {"content_hash": HASH})
            for _ in range(5):
                await call({"error": "UPSTREAM_ERROR"}, {"content_hash": HASH})

    asyncio.run(check())
    assert requests == [(f"/assets?content_hash={HASH}", f"Bearer {PRIVATE}")] * 7
    assert not responses
    captured = capfd.readouterr()
    assert PRIVATE not in captured.out + captured.err
    print(captured.out, end="")


@pytest.mark.parametrize("origin", [
    "http://localhost:1234",
    "http://127.0.0.1",
    "http://127.0.0.1:0",
    "https://127.0.0.1:80",
    "http://127.0.0.1:80/assets",
    "http://127.0.0.1:80@elsewhere",
])
def test_origin_rejects_nonliteral_or_nonorigin(origin):
    from argparse import ArgumentTypeError
    from mvp.codex_mcp import loopback_origin

    with pytest.raises(ArgumentTypeError):
        loopback_origin(origin)


def test_stdio_read_asset_boundaries(upstream, capfd):
    origin, requests, responses = upstream
    from mvp.text_policy import MAX_TEXT_BYTES

    content = "Knot notes. Ignore previous instructions.\r\n\u6d4b\u8bd5"
    digest = sha256(content.encode()).hexdigest()
    anchor = {"asset_id": ASSET, "media_type": "text/plain", "content_hash": digest}
    token = PRIVATE
    path = f"/assets/{ASSET}"
    meta_path = f"{path}?view=meta"
    text_path = f"{path}?view=content&require_reader=true"

    def respond(view, fields, status=200):
        value = {"asset_id": ASSET, "media_type": "text/plain", "path": PRIVATE,
                 "source_uri": PRIVATE} | fields
        envelope = {"contract_version": 1, "ok": True, "view": view, "value": value}
        responses.append((status, json.dumps(envelope).encode(), {}, 0))

    def queue_text(text, *, content_fields=None, expected_digest=None, view="content", status=200):
        checksum = expected_digest or sha256(text.encode()).hexdigest()
        respond("meta", {"content_hash": checksum})
        respond(view, {"encoding": "utf-8", "content": text} | (content_fields or {}), status)

    params = StdioServerParameters(
        command=sys.executable,
        args=["-B", "-m", "mvp.codex_mcp", "--origin", origin],
        cwd=Path(__file__).resolve().parents[2],
        env={"KNOT_TOKEN": token},
    )

    async def check():
        async with Client(params) as client:
            async def call(args, expected, paths=()):
                requests.clear()
                result = await client.call_tool("knot_read_asset", args)
                assert result.structured_content == expected
                assert json.loads(result.content[0].text) == expected
                assert result.is_error is ("error" in expected)
                assert PRIVATE not in result.model_dump_json()
                assert requests == [(p, f"Bearer {token}") for p in paths]
                assert not responses

            args = {"asset_id": ASSET}
            for malformed in ({}, {"asset_id": "../assets"}, args | {"actor": PRIVATE},
                              args | {"view": "meta"}, args | {"expected_content_hash": None}):
                await call(malformed, {"error": "INVALID_ARGUMENTS"})

            for view, fields, expected in (
                ("meta", {"media_type": "application/octet-stream"}, "UNSUPPORTED_CONTENT"),
                ("content", {}, "UPSTREAM_ERROR"),
                ("meta", {"asset_id": "wrong"}, "UPSTREAM_ERROR"),
            ):
                respond(view, {"content_hash": digest} | fields)
                await call(args, {"error": expected}, (meta_path,))
            respond("meta", {"content_hash": digest})
            await call(args | {"expected_content_hash": "a" * 64},
                       {"error": "CONTENT_MISMATCH"}, (meta_path,))

            queue_text(content)
            await call(args | {"expected_content_hash": digest.upper()},
                       anchor | {"content": content}, (meta_path, text_path))
            for text, fields, expected in (
                (PRIVATE, {}, "SENSITIVE_CONTENT"),
                ("-----BEGIN OPENSSH PRIVATE KEY-----", {}, "SENSITIVE_CONTENT"),
                ('"OPENAI_API_KEY": "synthetic"', {}, "SENSITIVE_CONTENT"),
                ('KNOT_TOKENS={"synthetic": "actor"}', {}, "SENSITIVE_CONTENT"),
                ("\u6d4b" * (MAX_TEXT_BYTES // 3 + 1), {}, "CONTENT_TOO_LARGE"),
                (content, {"encoding": "none", "content": None}, "UNSUPPORTED_CONTENT"),
                (content, {"encoding": "base64"}, "UNSUPPORTED_CONTENT"),
                ("text\x00binary", {}, "UNSUPPORTED_CONTENT"),
                ("text\x7fbinary", {}, "UNSUPPORTED_CONTENT"),
                (content, {"content": "\ud800"}, "UNSUPPORTED_CONTENT"),
                (content, {"asset_id": "wrong"}, "UPSTREAM_ERROR"),
                (content, {"media_type": "text/markdown"}, "UPSTREAM_ERROR"),
            ):
                queue_text(text, content_fields=fields)
                await call(args, {"error": expected}, (meta_path, text_path))
            for status, view, expected in (
                (403, "content", "ACCESS_DENIED"),
                (400, "content", "UPSTREAM_ERROR"),
                (200, "meta", "UPSTREAM_ERROR"),
            ):
                queue_text(content, status=status, view=view)
                await call(args, {"error": expected}, (meta_path, text_path))
            queue_text(content, expected_digest="a" * 64)
            await call(args, {"error": "CONTENT_MISMATCH"}, (meta_path, text_path))
            respond("meta", {"content_hash": digest})
            responses.append((200, b'{"value":"\xff"}', {}, 0))
            await call(args, {"error": "UPSTREAM_ERROR"}, (meta_path, text_path))

    asyncio.run(asyncio.wait_for(check(), timeout=15))
    captured = capfd.readouterr()
    assert PRIVATE not in captured.out + captured.err


def test_stdio_keyword_search_boundaries(upstream, capfd):
    origin, requests, responses = upstream
    from mvp.codex_mcp import search_assets

    params = StdioServerParameters(
        command=sys.executable,
        args=["-B", "-m", "mvp.codex_mcp", "--origin", origin],
        cwd=Path(__file__).resolve().parents[2],
        env={"KNOT_TOKEN": PRIVATE},
    )
    args = {"query": '\u7ec4\u7ec7 OR "%_"', "limit": 1}
    anchor = {"asset_id": ASSET, "content_hash": HASH, "media_type": "text/plain"}
    page = {"items": [anchor], "has_more": True}
    envelope = {"contract_version": 1, "ok": True, "value": page}

    async def check():
        assert await search_assets(origin, {"query": "\ud800"}, PRIVATE) == {
            "error": "INVALID_ARGUMENTS"
        }
        assert await search_assets(origin, args, None) == {"error": "ACCESS_DENIED"}
        assert not requests
        async with Client(params) as client:
            async def call(tool_args, expected, response=None):
                if response:
                    status, body = response
                    responses.append((status, json.dumps(body).encode(), {}, 0))
                requests.clear()
                result = await client.call_tool("knot_search_assets", tool_args)
                assert result.structured_content == expected
                assert json.loads(result.content[0].text) == expected
                assert result.is_error is ("error" in expected)
                assert PRIVATE not in result.model_dump_json()
                if response:
                    (request_path, authorization), = requests
                    parsed = urlsplit(request_path)
                    assert parsed.path == "/asset-search"
                    assert parse_qs(parsed.query) == {
                        "q": [tool_args["query"]], "limit": [str(tool_args.get("limit", 10))],
                    }
                    assert authorization == f"Bearer {PRIVATE}"
                else:
                    assert not requests
                assert not responses

            for bad in ({}, {"query": "a\x7f"}, {"query": "a\u0085b"}, {"query": "\u7ec4" * 43},
                        {"query": "a b c d e f g h i"}, args | {"limit": True},
                        args | {"limit": 21}, args | {"actor": PRIVATE}):
                await call(bad, {"error": "INVALID_ARGUMENTS"})
            for secret in (PRIVATE, "KNOT_TOKEN=synthetic", "Authorization: Bearer synthetic"):
                await call({"query": secret}, {"error": "SENSITIVE_CONTENT"})

            await call(args, page, (200, envelope))
            empty = {"items": [], "has_more": False}
            await call({"query": "nothing"}, empty, (200, envelope | {"value": empty}))
            await call(args, {"error": "ACCESS_DENIED"}, (403, {"error": PRIVATE}))
            exhausted = {
                "contract_version": 1, "ok": False,
                "error": {"code": "SERVER_BUSY", "message": "SERVER_BUSY",
                          "detail": {"reason": "search_limit"}},
            }
            await call(args, {"error": "SEARCH_LIMIT_REACHED"}, (503, exhausted))
            await call(args, {"error": "UPSTREAM_ERROR"},
                       (503, exhausted | {"contract_version": True}))
            await call(args, {"error": "UPSTREAM_ERROR"}, (503, exhausted | {"ok": 0}))
            await call(args, {"error": "UPSTREAM_ERROR"}, (503, {"error": PRIVATE}))
            for invalid in (
                envelope | {"view": "content"},
                envelope | {"value": page | {"total": 42}},
                envelope | {"value": page | {"items": [anchor | {"path": PRIVATE}]}},
                envelope | {"value": page | {"items": [anchor | {"content_hash": PRIVATE}]}},
                envelope | {"value": page | {"items": [anchor, anchor]}},
                envelope | {"value": {"items": [], "has_more": True}},
            ):
                await call(args, {"error": "UPSTREAM_ERROR"}, (200, invalid))

    asyncio.run(asyncio.wait_for(check(), timeout=15))
    captured = capfd.readouterr()
    assert PRIVATE not in captured.out + captured.err


# CONTEXT-MAINT-001: read-only maintenance review. Synthetic hosts and databases only.
NOW = 1_800_000_000_000
DAY = 86_400_000


def _iso(stamp):
    return (datetime.fromtimestamp(stamp / 1000, timezone.utc)
            .isoformat(timespec="milliseconds").replace("+00:00", "Z"))


def _epoch_ms(value):
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)


def _project(number):
    return f"00000000-0000-4000-8000-{number:012x}"


def _listing_item(project_id, title, saved_at, material_count, decision_count):
    return {"project_id": project_id, "title": title, "revision": "1",
            "manifest_hash": HASH, "saved_at": saved_at,
            "material_count": material_count, "decision_count": decision_count}


def _envelope(*items, value=None, **changes):
    """One /projects contract envelope shaped exactly as the service returns it."""
    return dict({"contract_version": 1, "ok": True,
                 "value": value if value is not None else {"items": list(items)}}, **changes)


def test_context_review_reports_fixed_reasons_in_priority_order():
    from mvp.plugin_projection import project_context_review

    capture, source, decision, dormant, every = (_project(n) for n in range(1, 6))
    listing = _envelope(
        _listing_item(capture, "Capture project", NOW - 600_000, 2, 1),
        _listing_item(source, "Source project", NOW - 900_000, 0, 0),
        _listing_item(decision, "Decision project", NOW - 1_200_000, 2, 0),
        _listing_item(dormant, "Dormant project", NOW - 40 * DAY, 2, 1),
        _listing_item(every, "Every reason", NOW - 41 * DAY, 0, 0),
    )

    # Capture is not observable: CAPTURE_STALE is not evaluated, and a project
    # without another reason is absent rather than reported as healthy.
    assert project_context_review(listing, NOW) == {
        "checked_at": _iso(NOW),
        "items": [
            {"project_id": source, "title": "Source project", "reasons": ["NO_SOURCE"],
             "suggested_action": "import_material", "project_saved_at": _iso(NOW - 900_000)},
            {"project_id": decision, "title": "Decision project", "reasons": ["NO_DECISION"],
             "suggested_action": "curate_decision", "project_saved_at": _iso(NOW - 1_200_000)},
            {"project_id": dormant, "title": "Dormant project", "reasons": ["DORMANT"],
             "suggested_action": "archive_or_merge", "project_saved_at": _iso(NOW - 40 * DAY)},
            {"project_id": every, "title": "Every reason", "reasons": ["NO_SOURCE", "DORMANT"],
             "suggested_action": "import_material", "project_saved_at": _iso(NOW - 41 * DAY)},
        ],
    }
    assert project_context_review(
        listing, NOW, {"enabled": False, "newest_user_message_ms": {capture: NOW}}
    ) == project_context_review(listing, NOW)

    reviewed = project_context_review(
        listing, NOW, {"enabled": True, "newest_user_message_ms": {capture: NOW, every: NOW - 1}})
    assert [item["project_id"] for item in reviewed["items"]] == [
        capture, source, decision, dormant, every]
    assert [item["reasons"] for item in reviewed["items"]] == [
        ["CAPTURE_STALE"],
        ["NO_SOURCE"],
        ["NO_DECISION"],
        ["DORMANT"],
        ["CAPTURE_STALE", "NO_SOURCE", "DORMANT"],
    ]
    assert [item["suggested_action"] for item in reviewed["items"]] == [
        "review_capture", "import_material", "curate_decision", "archive_or_merge", "review_capture"]
    # A stored stamp at or after the host watermark proves nothing is stale.
    assert project_context_review(
        listing, NOW, {"enabled": True, "newest_user_message_ms": {capture: NOW - 600_000}}
    ) == project_context_review(listing, NOW, {"enabled": True, "newest_user_message_ms": {}})


def test_context_review_dormant_boundary_unknown_time_and_twenty_cap():
    from mvp.plugin_projection import project_context_review

    boundary, over, unknown = _project(1), _project(2), _project(3)
    assert [
        (item["reasons"], item["project_saved_at"])
        for item in project_context_review(_envelope(
            _listing_item(boundary, "Boundary", NOW - 30 * DAY, 1, 0),
            _listing_item(over, "Over", NOW - 30 * DAY - 1, 1, 0),
            _listing_item(unknown, "No stamp", 0, 1, 0),
        ), NOW)["items"]
    ] == [
        (["NO_DECISION"], _iso(NOW - 30 * DAY)),
        (["NO_DECISION", "DORMANT"], _iso(NOW - 30 * DAY - 1)),
        (["NO_DECISION"], None),
    ]

    items = [_listing_item(_project(n), f"Project {n}", NOW - n * 1000, 1, 0)
             for n in range(1, 19)]
    items += [_listing_item(_project(100), "Unknown stamp", 0, 1, 0),
              _listing_item(_project(101), "Unknown stamp too", 0, 1, 0)]
    reviewed = project_context_review(_envelope(*items), NOW)["items"]
    assert len(reviewed) == 20
    assert [item["project_id"] for item in reviewed[:18]] == [_project(n) for n in range(1, 19)]
    assert [item["project_id"] for item in reviewed[18:]] == [_project(100), _project(101)]

    # A 21st item is cut at the cap: the newest entries and one unknown-time entry stay,
    # and no placeholder is invented for either dropped entry.
    items.append(_listing_item(_project(200), "Older", NOW - 10**9, 1, 0))
    reviewed = project_context_review(_envelope(*items), NOW)["items"]
    assert len(reviewed) == 20
    assert [item["project_id"] for item in reviewed[18:]] == [_project(200), _project(100)]
    assert _project(101) not in [item["project_id"] for item in reviewed]


def test_context_review_rejects_malformed_upstream_data():
    from mvp.plugin_projection import project_context_review

    valid = _envelope(_listing_item(_project(1), "Project", NOW - 1000, 1, 0))
    project = valid["value"]["items"][0]
    assert project_context_review(valid, NOW)["items"]
    for envelope in (
        valid | {"hidden_count": 0},
        valid | {"ok": False},
        valid | {"contract_version": True},
        _envelope(value={"items": "no"}),
        _envelope(project | {"title": "bad\x07title"}),
        _envelope(project | {"title": ""}),
        _envelope(project | {"project_id": "not-a-uuid"}),
        _envelope(project | {"revision": "01"}),
        _envelope(project | {"manifest_hash": "g" * 64}),
        _envelope(project | {"material_count": 129}),
        _envelope(project | {"decision_count": 21}),
        _envelope(project | {"saved_at": -1}),
        _envelope(project | {"saved_at": True}),
        _envelope(project | {"extra": True}),
        _envelope(project, project),
        _envelope(*[project] * 101),
    ):
        assert project_context_review(envelope, NOW) == {"error": "UPSTREAM_ERROR"}
    for capture in ({"enabled": True}, {"enabled": "yes", "newest_user_message_ms": {}},
                    {"enabled": True, "newest_user_message_ms": {_project(1): "now"}},
                    {"enabled": True, "newest_user_message_ms": {"nope": 1}}, True):
        assert project_context_review(valid, NOW, capture) == {"error": "UPSTREAM_ERROR"}
    assert project_context_review(valid, True) == {"error": "UPSTREAM_ERROR"}


def test_context_review_tool_is_registered_only_with_projects():
    from mvp.codex_mcp import tool_list

    assert [tool.name for tool in tool_list()] == TOOL_NAMES + [CONTEXT_TOOL]
    assert [tool.name for tool in tool_list(projects=False)] == TOOL_NAMES
    context = tool_list()[-1]
    for sentence in CONTEXT_SENTENCES:
        assert sentence in context.description
    assert context.input_schema == {"type": "object", "additionalProperties": False, "properties": {}}


def test_context_review_reads_project_list_without_writing(tmp_path, monkeypatch):
    from mvp.backend import decision_archive as archive
    from mvp.backend.http_server import Server
    from mvp.backend.init_db import init_database
    from mvp.backend.project_repo import ProjectRepo
    from test_decision_archive import package
    from test_workbench import running

    token, actor = "context-review-synthetic-token", "context-review-actor"
    monkeypatch.delenv("KNOT_TOKEN", raising=False)
    monkeypatch.setenv("KNOT_TOKENS", json.dumps({token: actor}))
    db = tmp_path / "knot-context.sqlite3"
    assert init_database(db)["status"] == "created"
    repo = ProjectRepo(db)
    now = time.time_ns() // 1_000_000

    def imported(title, text=None, archive_ref=None):
        request = dict(project_id=str(uuid4()), title=title, expected_revision="0",
                       request_id=str(uuid4()), archive_ref=archive_ref,
                       documents=[dict(title="note.md", text=text)] if text else [])
        return request, repo.import_project(actor, token, request)

    def stamp(receipt, value):
        with closing(sqlite3.connect(db)) as conn, conn:
            conn.execute("UPDATE assets SET created_at=? WHERE content_hash=?",
                         (value, receipt["manifest_hash"]))

    no_source, source_receipt = imported("No source project", "Orphaned material")
    material = repo.read_project(actor, token, no_source["project_id"])["materials"][0]["asset_id"]
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("DELETE FROM assets WHERE asset_id=?", (material,))
    stamp(source_receipt, now - 60_000)

    no_decision, decision_receipt = imported("No decision project", "Fresh material")
    stamp(decision_receipt, now - 120_000)

    receipt = archive.import_decisions(db, package(), actor, token)
    archive_ref = dict(asset_id=receipt["archive_id"], content_hash=receipt["archive_hash"])

    dormant, dormant_receipt = imported("Dormant project", "Old material", archive_ref=archive_ref)
    stamp(dormant_receipt, now - 40 * DAY)

    healthy, healthy_receipt = imported("Healthy project", archive_ref=archive_ref)
    stamp(healthy_receipt, now - 180_000)

    revoked, revoked_receipt = imported("Revoked project", "Private material")
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("DELETE FROM asset_readers WHERE asset_id IN "
                     "(SELECT asset_id FROM assets WHERE content_hash=?)",
                     (revoked_receipt["manifest_hash"],))
    stamp(revoked_receipt, now - 30_000)
    assert repo.read_project(actor, token, healthy["project_id"])["decisions"]["items"]

    def database_state():
        # Main file identity plus WAL sidecar sizes: any write grows one of them.
        state = {db.name: (db.stat().st_mtime_ns, db.stat().st_size)}
        for sidecar in (db.name + "-wal", db.name + "-shm"):
            path = db.parent / sidecar
            state[sidecar] = path.stat().st_size if path.exists() else None
        return state

    def row_counts():
        with closing(sqlite3.connect(db)) as conn:
            return tuple(conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                         for table in ("assets", "history_events", "asset_readers"))

    with running(Server(db, 0)) as port:
        params = StdioServerParameters(
            command=sys.executable,
            args=["-B", "-m", "mvp.codex_mcp", "--origin", f"http://127.0.0.1:{port}"],
            cwd=Path(__file__).resolve().parents[2], env={"KNOT_TOKEN": token},
        )
        before_rows, before_state = row_counts(), database_state()
        started = time.time_ns() // 1_000_000

        async def check():
            async with Client(params) as client:
                listing = await client.list_tools()
                assert [tool.name for tool in listing.tools] == TOOL_NAMES + [CONTEXT_TOOL]
                assert all(sentence in listing.tools[-1].description
                           for sentence in CONTEXT_SENTENCES)
                result = await client.call_tool(CONTEXT_TOOL, {})
                assert not result.is_error
                payload = result.structured_content
                assert json.loads(result.content[0].text) == payload
                assert payload["items"] == [
                    {"project_id": no_source["project_id"], "title": "No source project",
                     "reasons": ["NO_SOURCE"], "suggested_action": "import_material",
                     "project_saved_at": _iso(now - 60_000)},
                    {"project_id": no_decision["project_id"], "title": "No decision project",
                     "reasons": ["NO_DECISION"], "suggested_action": "curate_decision",
                     "project_saved_at": _iso(now - 120_000)},
                    {"project_id": dormant["project_id"], "title": "Dormant project",
                     "reasons": ["DORMANT"], "suggested_action": "archive_or_merge",
                     "project_saved_at": _iso(now - 40 * DAY)},
                ]
                rejected = await client.call_tool(CONTEXT_TOOL, {"limit": 1})
                assert rejected.structured_content == {"error": "INVALID_ARGUMENTS"}
                assert rejected.is_error
                return payload

        payload = asyncio.run(asyncio.wait_for(check(), timeout=30))
        finished = time.time_ns() // 1_000_000
        after_state, after_rows = database_state(), row_counts()

    # Read-only evidence: the database file keeps its mtime and byte size, no write
    # ever appends to the WAL (the 0-length/-shm sidecars are a connection artifact),
    # and every audited row count is unchanged.
    assert after_state[db.name] == before_state[db.name]
    assert (before_state[db.name + "-wal"] or 0) == (after_state[db.name + "-wal"] or 0) == 0
    assert after_rows == before_rows
    assert set(payload) == {"checked_at", "items"}
    assert started <= _epoch_ms(payload["checked_at"]) <= finished
