import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest
from jsonschema import Draft202012Validator
from mcp.types import CallToolResult, TextContent
from mcp_types import CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY
from mcp_types import methods as sdk_methods

from mvp import codex_mcp as adapter
from mvp.plugin_projection import project_asset_source
from test_codex_mcp import ASSET, HASH, PRIVATE, upstream


ARGS = {"asset_id": ASSET, "expected_hash": HASH}
VALUE = dict(asset_id=ASSET, content_hash=HASH, source_status="recorded_file_reference",
             relative_path='笔记/汉😀".md', reason=None, provenance_verified=False,
             import_evidence_checked=False)
ENV = dict(contract_version=1, ok=True, value=VALUE)
VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"]


@pytest.mark.parametrize("args", [
    None, [], {}, ARGS | {"token": PRIVATE}, ARGS | {"asset_id": None},
    ARGS | {"asset_id": ASSET + "\n"}, ARGS | {"asset_id": ASSET.upper()},
    ARGS | {"expected_hash": HASH + "\n"}, ARGS | {"expected_hash": True},
])
def test_invalid_arguments_without_http(args, monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("unexpected HTTP")
    monkeypatch.setattr(adapter, "request_envelope", forbidden)
    assert not Draft202012Validator(adapter._SOURCE_TOOL.input_schema).is_valid(args)
    assert asyncio.run(adapter.read_asset_source(None, args, PRIVATE)) == {"error": "INVALID_ARGUMENTS"}


@pytest.mark.parametrize("reason", ["missing_source", "unsupported_source", "invalid_source",
                                   "inconsistent_source", "sensitive_source", "source_limit"])
def test_unknown_preserves_reason(reason):
    value = VALUE | dict(source_status="unknown", relative_path=None, reason=reason)
    assert project_asset_source(ENV | {"value": value}, ASSET, HASH, PRIVATE) == value


@pytest.mark.parametrize("change", [
    {"extra": 1}, {"asset_id": "wrong"}, {"content_hash": "0" * 64},
    {"provenance_verified": 0}, {"import_evidence_checked": True}, {"reason": "missing_source"},
    {"source_status": "unknown"}, {"source_status": []},
    *({"relative_path": path} for path in ("", "/a", "a//b", "../a", "x/ a", "c:\\a", "a%20",
                                           "a?x", "a\u200b", "\ud800", "a" * 256, "/".join(["a" * 255]*5))),
])
def test_projection_rejects_forged_results(change):
    assert project_asset_source(ENV | {"value": VALUE | change}, ASSET, HASH, PRIVATE) == {"error": "UPSTREAM_ERROR"}


@pytest.mark.parametrize("status,code,detail,expected", [
    (400, "BAD_REQUEST", {}, "INVALID_ARGUMENTS"),
    (403, "FORBIDDEN_VIEW", {}, "ACCESS_DENIED"),
    (400, "BAD_REQUEST", {"reason":"content_mismatch"}, "CONTENT_MISMATCH"),
    (400, "BAD_REQUEST", {"reason":"sensitive_content"}, "SENSITIVE_CONTENT"),
    (503, "SERVER_BUSY", {"reason":"source_limit"}, "READ_LIMIT_REACHED"),
    (503, "SERVER_BUSY", {"reason":"text_slice_limit"}, "UPSTREAM_ERROR"),
    (403, "FORBIDDEN_VIEW", {"reason":"forged"}, "UPSTREAM_ERROR"),
    (500, "INTERNAL", {}, "UPSTREAM_ERROR"),
])
def test_http_error_mapping(upstream, status, code, detail, expected):
    origin, requests, responses = upstream
    payload = dict(contract_version=1, ok=False, error=dict(code=code, message=code, detail=detail))
    responses.append((status, json.dumps(payload).encode(), {}, 0))
    assert asyncio.run(adapter.read_asset_source(origin, ARGS, PRIVATE)) == {"error": expected}
    assert requests == [(f"/asset-sources?asset_id={ASSET}&expected_hash={HASH}", "Bearer " + PRIVATE)]


def test_one_get_strict_cap_and_no_follow(upstream, monkeypatch):
    origin, requests, responses = upstream
    raw = json.dumps(ENV).encode()
    responses.extend([(200, raw.ljust(32768), {}, 0), (200, raw.ljust(32769), {}, 0),
                      (200, b'{"ok":true,"ok":true}', {}, 0), (200, b'\xff', {}, 0),
                      (200, b'{"value":NaN}', {}, 0), (302, raw, {"Location":"/private"}, 0),
                      (200, raw, {"Content-Encoding":"gzip"}, 0)])
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    async def run():
        assert await adapter.read_asset_source(origin, ARGS, None) == {"error": "ACCESS_DENIED"}
        assert await adapter.read_asset_source(origin, ARGS, PRIVATE) == VALUE
        for _ in range(6):
            assert await adapter.read_asset_source(origin, ARGS, PRIVATE) == {"error": "UPSTREAM_ERROR"}
    asyncio.run(run())
    assert requests == [(f"/asset-sources?asset_id={ASSET}&expected_hash={HASH}", "Bearer " + PRIVATE)] * 7


def rpc_messages(version, args):
    messages = [
        dict(jsonrpc="2.0", id=1, method="initialize", params=dict(
            protocolVersion=version, capabilities={}, clientInfo=dict(name="test", version="1"))),
        dict(jsonrpc="2.0", method="notifications/initialized"),
        dict(jsonrpc="2.0", id=2, method="tools/list"),
        dict(jsonrpc="2.0", id=3, method="tools/call", params=dict(name="knot_read_asset_source", arguments=args)),
    ]
    if version == VERSIONS[-1]:
        messages = messages[2:]
        for message in messages:
            message.setdefault("params", {})["_meta"] = {
                PROTOCOL_VERSION_META_KEY: version,
                CLIENT_INFO_META_KEY: {"name": "test", "version": "1"},
                CLIENT_CAPABILITIES_META_KEY: {},
            }
    return messages


def stdio(origin, version, args, *, root=None, token=PRIVATE):
    env = os.environ.copy()
    env["KNOT_TOKEN"] = token
    root = root or Path(__file__).resolve().parents[2]
    proc = subprocess.Popen([sys.executable, "-B", "-m", "mvp.codex_mcp", "--origin", origin],
                            cwd=root, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    from concurrent.futures import ThreadPoolExecutor
    rows = {}
    try:
        with ThreadPoolExecutor(max_workers=1) as reader:
            try:
                for message in rpc_messages(version, args):
                    proc.stdin.write(json.dumps(message).encode() + b"\n")
                    proc.stdin.flush()
                    if "id" not in message:
                        continue
                    while True:
                        line = reader.submit(proc.stdout.readline).result(timeout=8)
                        assert line, "SDK process exited before replying"
                        response = json.loads(line)
                        if response.get("id") == message["id"]:
                            rows[message["id"]] = line
                            break
            except BaseException:
                proc.kill()
                raise
    finally:
        proc.stdin.close()
        proc.wait(timeout=10)
    assert proc.returncode == 0, proc.stderr.read()
    return rows


@pytest.mark.parametrize("version", VERSIONS)
def test_actual_sdk_stdio_result(upstream, version, tmp_path):
    origin, requests, responses = upstream
    responses.append((200, json.dumps(ENV).encode(), {}, 0))
    rows = stdio(origin, version, ARGS)
    if version != VERSIONS[-1]:
        assert json.loads(rows[1])["result"]["protocolVersion"] == version
    raw = rows[3]
    (tmp_path / "wire.bin").write_bytes(raw)
    output = json.loads(raw)["result"]
    parsed = CallToolResult.model_validate(output)
    expected = CallToolResult(content=[TextContent(type="text", text=json.dumps(VALUE))],
                              structured_content=VALUE, is_error=False)
    shaped = sdk_methods.serialize_server_result(
        "tools/call", version, expected.model_dump(by_alias=True, mode="json", exclude_none=True))
    if version == VERSIONS[-1]:
        shaped["resultType"] = "complete"
        shaped["_meta"] = output["_meta"]
    encoded = json.dumps(shaped, ensure_ascii=False, separators=(",", ":")).encode()
    assert b'"result":' + encoded in raw
    assert len(encoded) <= 65536 and PRIVATE.encode() not in encoded
    assert parsed.structured_content == VALUE == json.loads(parsed.content[0].text)
    if version == "2026-07-28":
        assert output["resultType"] == "complete"
        assert output["_meta"]["io.modelcontextprotocol/serverInfo"]["name"] == "Knot"
    assert len(requests) == 1


def test_sdk_malformed_input_never_requests(upstream):
    origin, requests, responses = upstream
    rows = stdio(origin, VERSIONS[-1], [])
    assert "error" in json.loads(rows[3]) or json.loads(rows[3])["result"]["isError"]
    assert requests == []


def test_old_tool_descriptors_from_frozen_checkout(upstream, tmp_path):
    origin, requests, responses = upstream
    # Compare actual SDK output from both checkouts, not a list copied into this test.
    if os.environ.get("KNOT_TEST_DESCRIPTOR_BASE") is None:
        pytest.skip("frozen checkout supplied by Maker/Checker verification")
    base = Path(os.environ["KNOT_TEST_DESCRIPTOR_BASE"])
    baseline = json.loads(stdio(origin, VERSIONS[-1], {}, root=base)[2])["result"]["tools"]
    current = json.loads(stdio(origin, VERSIONS[-1], {})[2])["result"]["tools"]
    (tmp_path / "old-ten.json").write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "candidate-eleven.json").write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
    assert len(baseline) == 10 and len(current) == 11
    assert json.dumps(baseline, ensure_ascii=False) == json.dumps(current[:10], ensure_ascii=False)
    assert current[-1]["name"] == "knot_read_asset_source"
    assert requests == []


def test_callback_budget_and_stamp_token(monkeypatch):
    async def read(*args):
        return VALUE
    monkeypatch.setattr(adapter, "read_asset_source", read)
    version = VERSIONS[-1]
    stamp = {"name":"Knot", "version":"1", "title":""}
    server = SimpleNamespace(server_info_stamp=stamp)
    output = asyncio.run(adapter.source_tool_result(None, ARGS, PRIVATE, version, server))
    shaped = sdk_methods.serialize_server_result(
        "tools/call", version, output.model_dump(by_alias=True, mode="json", exclude_none=True))
    shaped["resultType"] = "complete"
    shaped["_meta"] = {"io.modelcontextprotocol/serverInfo":stamp}
    overhead = len(json.dumps(shaped, ensure_ascii=False, separators=(",", ":")).encode())
    stamp["title"] = "x" * (65536 - overhead)
    assert not asyncio.run(adapter.source_tool_result(None, ARGS, PRIVATE, version, server)).is_error
    stamp["title"] += "x"
    assert asyncio.run(adapter.source_tool_result(None, ARGS, PRIVATE, version, server)).structured_content == {"error":"UPSTREAM_ERROR"}
    stamp["title"] = 'secret"\\汉'
    for token in ('Knot', stamp["title"]):
        assert asyncio.run(adapter.source_tool_result(None, ARGS, token, version, server)).structured_content == {"error":"SENSITIVE_CONTENT"}


def test_inner_text_and_finite_marker_token_guard(monkeypatch):
    for path in ("notes/PASSWORD=hidden", "notes/" + PRIVATE):
        assert project_asset_source(ENV | {"value":VALUE | {"relative_path":path}}, ASSET, HASH, PRIVATE) == {"error":"SENSITIVE_CONTENT"}
    async def read(*args):
        return VALUE
    monkeypatch.setattr(adapter, "read_asset_source", read)
    # The inner JSON contains the ASCII escape of 汉.
    output = asyncio.run(adapter.source_tool_result(None, ARGS, "汉", VERSIONS[0], None))
    assert output.structured_content == {"error":"SENSITIVE_CONTENT"}


from test_asset_source_http import service as source_service


def test_actual_backend_reader_rechecked(source_service):
    from contextlib import closing
    import sqlite3
    from test_asset_source_http import TOKEN
    server, db, aid, digest, path = source_service
    origin = f"http://127.0.0.1:{server.server_port}"
    args = {"asset_id":aid, "expected_hash":digest}
    def read(token=TOKEN, arguments=args):
        return asyncio.run(adapter.read_asset_source(origin, arguments, token))
    before = db.read_bytes()
    assert read()["relative_path"] == path
    assert read("other-source-token") == {"error":"ACCESS_DENIED"}
    assert read(arguments=args | {"expected_hash":"0"*64}) == {"error":"CONTENT_MISMATCH"}
    assert db.read_bytes() == before
    with closing(sqlite3.connect(db)) as conn, conn:
        conn.execute("DELETE FROM asset_readers WHERE asset_id=?", (aid,))
    assert read() == {"error":"ACCESS_DENIED"}
