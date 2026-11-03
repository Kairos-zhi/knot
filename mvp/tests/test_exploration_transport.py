"""Exploration transport against isolated HTTP and official MCP stdio."""

import asyncio
from contextlib import closing
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from queue import Queue
import socket
import sqlite3
import subprocess
import sys
from threading import Thread
from urllib.parse import urlsplit

from mcp import Client, StdioServerParameters
import pytest

from mvp.backend import http_server
from mvp.backend.exploration_repo import ExplorationRepo
from mvp.backend.init_db import init_database
from mvp.backend.migrate_schema_v1_5 import migrate_schema as migrate5
from mvp.backend.migrate_schema_v1_6 import migrate_schema as migrate6
from mvp.contract.selfcheck import request, validate
from mvp.tests.schema_helpers import create_v14
from mvp.tests.test_exploration_core import asset, db_rows, uid
from mvp.tests.test_http_contract import Live


TOKEN = "synthetic-exploration-token-a"
ROTATED = "synthetic-rotated-token-a"
OTHER = "synthetic-exploration-token-b"
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.delenv("KNOT_TOKEN", raising=False)
    monkeypatch.setenv("KNOT_TOKENS", json.dumps({TOKEN: "A", ROTATED: "A", OTHER: "B"}))


def fresh(tmp_path):
    db = tmp_path / "disposable.db"
    assert init_database(db)["status"] == "created"
    return db


def save_args(**fields):
    return {"exploration_id": uid(), "request_key": uid(), "expected_revision": 0,
            "references": [], "stop_note": None} | fields


def raw_post(base, payload, *, declared_length=None):
    parsed = urlsplit(base)
    with closing(HTTPConnection(parsed.hostname, parsed.port, timeout=3)) as conn:
        headers = {
            "Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}",
        }
        if declared_length is not None:
            headers["Content-Length"] = str(declared_length)
        conn.request("POST", "/exploration-saves", payload, headers)
        response = conn.getresponse()
        return response.status, json.load(response)


def test_http_owner_receipts_revisions_and_private_journal(tmp_path, configured):
    db = fresh(tmp_path)
    ref = asset(db, b"synthetic source", reason="why selected")
    foreign = asset(db, b"foreign source", actor="B")
    first = save_args(references=[ref], stop_note="next question")
    path = "/explorations/" + first["exploration_id"]
    live = Live(db)
    try:
        health = live.get("/health")[1]["value"]
        assert health["schema_version"] == "1.9"
        journal = db.parent / ".knot" / "http.seq"
        old_journal = journal.read_bytes() if journal.exists() else None

        def call(path, body=None, token=TOKEN):
            return request(live.base, path, body, token=token)

        for token in (None, "unknown"):
            for url, body in (("/exploration-saves", first), (path, None), ("/explorations", None)):
                assert call(url, body, token=token)[0] == 403

        status, body = call("/exploration-saves", first)
        assert status == 200
        route = next(r for r in http_server.ROUTES if r["response"] == "ExplorationReceipt")
        validate(body, route)
        receipt = body["value"]
        assert set(receipt) == {"exploration_id", "revision", "event_id"}
        assert call("/exploration-saves", first, ROTATED) == (status, body)
        assert call(path, token=OTHER)[0] == 404
        assert call("/exploration-saves", first, OTHER)[0] == 404
        assert call("/explorations", token=OTHER)[1]["value"] == {"items": []}
        assert call("/explorations?limit=0")[0] == 400
        assert call(path + "?revision=0")[0] == 400
        assert call(path + "?actor=B")[0] == 400
        assert call("/exploration-saves", first | {"actor": "B"})[0] == 400
        assert call("/exploration-saves", first | {"stop_note": "different"})[1]["error"]["detail"] == {
            "reason": "idempotency_conflict",
        }
        update = first | {"request_key": uid(), "expected_revision": 1, "stop_note": "next stop"}
        unavailable = call("/exploration-saves", update | {"references": [foreign]})
        assert unavailable[0] == 400
        assert unavailable[1]["error"]["detail"] == {"reason": "asset_unavailable"}
        assert call("/exploration-saves", update)[1]["value"]["revision"] == 2
        stale = call("/exploration-saves", update | {"request_key": uid()})
        assert stale[0] == 409 and stale[1]["error"]["detail"] == {"reason": "revision_conflict"}
        checkpoint = call(path + "?revision=1")[1]["value"]
        assert checkpoint["stop_note"] == "next question" and checkpoint["revision"] == 1
        assert checkpoint["references"][0]["reason"] == "why selected"
        assert "synthetic source" not in json.dumps(checkpoint)
        listed = call("/explorations")[1]["value"]["items"]
        assert listed == [{"exploration_id": first["exploration_id"], "revision": 2,
                           "saved_at": call(path)[1]["value"]["saved_at"]}]
        db_rows(db, "DELETE FROM asset_readers WHERE asset_id=?", (ref["asset_id"],))
        assert call("/exploration-saves", first, ROTATED) == (status, body)
        checkpoint = call(path + "?revision=1")[1]["value"]
        assert checkpoint["references"][0]["status"] == "forbidden"
        assert "reason" not in checkpoint["references"][0]
        assert checkpoint["stop_note"] is None and checkpoint["stop_note_reason"] == "dependency_unavailable"
        assert live.get("/health")[1]["value"]["seq"] == health["seq"]
        assert (journal.read_bytes() if journal.exists() else None) == old_journal
        assert db_rows(db, "SELECT count(*) FROM history_events") == [(0,)]
        assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(2,)]
    finally:
        live.stop()


def test_http_bad_json_sensitive_input_and_old_core_redaction(tmp_path, configured):
    db = fresh(tmp_path)
    ref = asset(db, b"body", reason="PASSWORD=synthetic-secret")
    hidden = save_args(references=[ref], stop_note=TOKEN)
    ExplorationRepo(db).save("A", **hidden)
    live = Live(db)
    try:
        payloads = (
            b'{"stop_note":"bad\xff"}',
            json.dumps(save_args()).encode().replace(b'"stop_note":', b'"stop_note":"duplicate","stop_note":'),
            b'{"expected_revision":NaN}',
            json.dumps(save_args(stop_note="KNOT_TOKEN=synthetic")).encode(),
            json.dumps(save_args(references=[ref])).encode(),
        )
        for payload in payloads:
            status, body = raw_post(live.base, payload)
            assert status == 400 and body["error"]["code"] == "BAD_REQUEST"
            assert "synthetic-secret" not in json.dumps(body)
        assert raw_post(live.base, b"", declared_length=128 * 1024 + 1)[0] == 400
        view = request(live.base, "/explorations/" + hidden["exploration_id"], token=TOKEN)[1]["value"]
        assert view["stop_note"] is None and view["stop_note_reason"] == "sensitive_content"
        assert "reason" not in view["references"][0]
        assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(1,)]
    finally:
        live.stop()


def test_legacy_1_6_remains_readable_and_drifted_1_7_fails_startup(tmp_path, configured):
    db = tmp_path / "legacy.db"
    assert create_v14(db)["status"] == "created"
    migrate5(db)
    migrate6(db)
    live = Live(db)
    try:
        assert live.get("/health")[1]["value"]["schema_version"] == "1.6"
        assert live.get("/assets?content_hash=" + "0" * 64)[0] == 200
        assert request(live.base, "/explorations", token=TOKEN)[1]["error"]["detail"] == {
            "reason": "exploration_migration_required",
        }
        assert request(live.base, "/exploration-saves", save_args(), token=TOKEN)[0] == 409
        assert db_rows(db, "SELECT name FROM sqlite_master WHERE name='exploration_revisions'") == []
    finally:
        live.stop()

    new_dir = tmp_path / "new"
    db = fresh(new_dir)
    db_rows(db, "DROP TRIGGER exploration_revisions_insert")
    before = db.read_bytes()
    with pytest.raises(http_server.Fault) as exc:
        http_server.Server(db, port=0)
    assert exc.value.code == "SCHEMA_VERSION_UNSUPPORTED"
    assert db.read_bytes() == before
    assert not (db.parent / ".knot" / "http.lock").exists()


def test_read_only_process_blocks_writes_and_replay_without_consuming_key(tmp_path, configured):
    db = fresh(tmp_path)
    args = save_args()
    server = http_server.Server(db, port=0)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        with server.changed:
            server.journal["pending"] = {"body": {"command": "claim.confirm"}, "actor": "A", "since": 0}
        assert request(base, "/health")[1]["value"]["read_only"] is True
        assert request(base, "/exploration-saves", args, token=TOKEN) == (
            409, http_server.error("SERVER_BUSY", reason="server_read_only"),
        )
        assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(0,)]
        with server.changed:
            server.journal.pop("pending")
        saved = request(base, "/exploration-saves", args, token=TOKEN)
        assert saved[0] == 200
        with server.changed:
            server.jobs.failed = True
        assert request(base, "/health")[1]["value"]["read_only"] is True
        assert request(base, "/exploration-saves", args, token=TOKEN)[0] == 409
        with server.changed:
            server.jobs.failed = False
        assert request(base, "/exploration-saves", args, token=TOKEN) == saved
        assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(1,)]
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_mcp_lost_http_receipt_replays_same_key_after_server_restart(tmp_path, configured):
    db = fresh(tmp_path)
    args = save_args(stop_note="continue here")
    live = Live(db)
    writes = []

    class DropReceipt(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            status, receipt = request(live.base, self.path, body, token=self.headers["Authorization"][7:])
            writes.append((status, receipt))
            self.close_connection = True
            self.connection.shutdown(socket.SHUT_RDWR)

        def log_message(self, *_):
            pass

    def params(origin, token=TOKEN):
        return StdioServerParameters(
            command=sys.executable, args=["-B", "-m", "mvp.codex_mcp", "--origin", origin],
            cwd=ROOT, env={"KNOT_TOKEN": token},
        )

    async def lost(origin):
        async with Client(params(origin)) as client:
            bad = await client.call_tool("knot_save_exploration", args | {"actor": "B"})
            assert bad.structured_content == {"error": "INVALID_ARGUMENTS"}
            sensitive = await client.call_tool("knot_save_exploration", args | {"stop_note": TOKEN})
            assert sensitive.structured_content == {"error": "SENSITIVE_CONTENT"}
            assert not writes
            result = await client.call_tool("knot_save_exploration", args)
            assert result.structured_content == {"error": "WRITE_OUTCOME_UNKNOWN"}

    async def replay():
        async with Client(params(live.base, ROTATED)) as client:
            result = await client.call_tool("knot_save_exploration", args)
            assert result.structured_content == writes[0][1]["value"]
            loaded = await client.call_tool("knot_load_exploration", {"exploration_id": args["exploration_id"]})
            assert loaded.structured_content["stop_note"] == "continue here"
            listed = await client.call_tool("knot_list_explorations", {})
            assert listed.structured_content["items"][0]["exploration_id"] == args["exploration_id"]

    try:
        with ThreadingHTTPServer(("127.0.0.1", 0), DropReceipt) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                asyncio.run(asyncio.wait_for(lost(f"http://127.0.0.1:{server.server_port}"), timeout=10))
            finally:
                server.shutdown()
                thread.join()
        assert len(writes) == 1 and writes[0][0] == 200
        live.stop()
        live.start()
        asyncio.run(asyncio.wait_for(replay(), timeout=10))
        assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(1,)]
    finally:
        if live.process.poll() is None:
            live.stop()



def test_raw_mcp_rejects_bad_frames_then_recovers_and_exits_at_eof(tmp_path, configured):
    db = fresh(tmp_path)
    live = Live(db)
    env = os.environ | {"KNOT_TOKEN": TOKEN}
    process = subprocess.Popen(
        [sys.executable, "-B", "-m", "mvp.codex_mcp", "--origin", live.base],
        cwd=ROOT, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    output = Queue()

    def read_frames():
        for line in iter(process.stdout.readline, b""):
            output.put(line)

    reader = Thread(target=read_frames, daemon=True)
    reader.start()

    def frame(method, params, ident=None):
        message = {"jsonrpc": "2.0", "method": method, "params": params}
        if ident is not None:
            message["id"] = ident
        return json.dumps(message).encode()

    def save_frame(ident, **fields):
        return frame("tools/call", {"name": "knot_save_exploration", "arguments": save_args(**fields)}, ident)

    def until(ident):
        while True:
            line = output.get(timeout=8)
            assert b"private-frame" not in line
            message = json.loads(line)
            if message.get("id") == ident:
                return message

    try:
        init = frame("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                    "clientInfo": {"name": "probe", "version": "1"}}, 1)
        process.stdin.write(init + b"\n")
        process.stdin.flush()
        assert "result" in until(1)

        duplicate = save_frame(2, stop_note="private-frame").replace(
            b'"stop_note":', b'"stop_note":"duplicate","stop_note":'
        )
        invalid_utf8 = save_frame(3, stop_note="private-frame").replace(
            b"private-frame", b"private-frame\xff"
        )
        overlong = save_frame(4, stop_note="private-frame") + b" " * (256 * 1024)
        valid = save_frame(5, stop_note="valid after malformed frames")
        process.stdin.write(b"\n".join([
            frame("notifications/initialized", {}), duplicate, invalid_utf8, overlong, valid,
        ]) + b"\n")
        process.stdin.flush()
        assert until(5)["result"]["structuredContent"]["revision"] == 1
        process.stdin.close()
        assert process.wait(timeout=8) == 0
        reader.join(timeout=2)
        assert not reader.is_alive()
        assert b"private-frame" not in process.stderr.read()
        assert db_rows(db, "SELECT count(*) FROM exploration_revisions") == [(1,)]
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdin.close()
        process.stdout.close()
        process.stderr.close()
        live.stop()


def test_mcp_rejects_untrustworthy_exploration_responses():
    args = save_args()
    base_value = {"exploration_id": args["exploration_id"], "event_id": uid(), "revision": 1}
    saved = {"contract_version": 1, "ok": True, "value": base_value}
    conflict = {"contract_version": 1, "ok": False, "error": {
        "code": "BAD_REQUEST", "message": "BAD_REQUEST", "detail": {"reason": "revision_conflict"},
    }}
    responses = [
        (200, saved | {"value": base_value | {"revision": True}}),
        (200, saved | {"value": base_value | {"exploration_id": uid()}}),
        (200, saved | {"value": base_value | {"note": TOKEN}}),
        (200, b'{"contract_version":1,"contract_version":1}'),
        (409, conflict | {"contract_version": True}),
        (409, conflict),
        (409, http_server.error("SERVER_BUSY", reason="server_read_only")),
        (200, saved),
        (200, saved | {"value": base_value | {"saved_at": 1, "references": [],
                                              "stop_note": "unexpected revision", "stop_note_reason": None}}),
        (200, saved | {"value": {"items": [base_value | {"saved_at": 1}]}}),
    ]
    requests = []

    class Replies(BaseHTTPRequestHandler):
        def do_GET(self):
            self.answer()

        def do_POST(self):
            self.rfile.read(int(self.headers["Content-Length"]))
            self.answer()

        def answer(self):
            requests.append(self.path)
            status, response = responses.pop(0)
            self.send_response(status)
            self.end_headers()
            self.wfile.write(response if isinstance(response, bytes) else json.dumps(response).encode())

        def log_message(self, *_):
            pass

    async def check(origin):
        params = StdioServerParameters(
            command=sys.executable, args=["-B", "-m", "mvp.codex_mcp", "--origin", origin],
            cwd=ROOT, env={"KNOT_TOKEN": TOKEN},
        )
        async with Client(params) as client:
            for _ in range(5):
                result = await client.call_tool("knot_save_exploration", args)
                assert result.structured_content == {"error": "WRITE_OUTCOME_UNKNOWN"}
                assert TOKEN not in result.model_dump_json()
            result = await client.call_tool("knot_save_exploration", args)
            assert result.structured_content == {"error": "REVISION_CONFLICT"}
            result = await client.call_tool("knot_save_exploration", args)
            assert result.structured_content == {"error": "SERVER_READ_ONLY"}
            result = await client.call_tool("knot_save_exploration", args)
            assert result.structured_content == base_value
            result = await client.call_tool("knot_load_exploration", {
                "exploration_id": args["exploration_id"], "revision": 2,
            })
            assert result.structured_content == {"error": "UPSTREAM_ERROR"}
            result = await client.call_tool("knot_list_explorations", {})
            assert result.structured_content == {"error": "UPSTREAM_ERROR"}

    with ThreadingHTTPServer(("127.0.0.1", 0), Replies) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            asyncio.run(asyncio.wait_for(check(f"http://127.0.0.1:{server.server_port}"), timeout=10))
        finally:
            server.shutdown()
            thread.join()
    assert requests.count("/exploration-saves") == 8
    assert not responses
