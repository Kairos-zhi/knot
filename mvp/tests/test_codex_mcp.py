import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from threading import Thread
import time

from mcp import Client, StdioServerParameters
import pytest


HASH = "a" * 64
ASSET = "d18876aa-54b6-4601-b9cd-e73fa2104c28"
PRIVATE = "SYNTH-PRIVATE"


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
            assert len(listing.tools) == 1
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
