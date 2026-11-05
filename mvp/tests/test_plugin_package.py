import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys

from mcp import Client, StdioServerParameters

from test_codex_mcp import ASSET, HASH, PRIVATE, upstream


BUILDER = Path(__file__).resolve().parents[1] / "codex_plugin" / "build.py"


def build(output, origin, python=sys.executable):
    return subprocess.run(
        [sys.executable, "-IB", str(BUILDER), "--python", str(python), "--origin", origin,
         "--output", str(output)],
        capture_output=True, timeout=10,
    )


def test_moved_plugin_starts_and_searches(tmp_path, upstream, capfd):
    origin, requests, responses = upstream
    response = {"contract_version": 1, "ok": True, "value": {"items": [
        {"asset_id": ASSET, "media_type": "text/plain", "content": PRIVATE},
    ]}}
    responses.append((200, json.dumps(response).encode(), {}, 0))
    page = {"items": [{"asset_id": ASSET, "media_type": "text/plain", "content_hash": HASH}],
            "has_more": False}
    responses.append((200, json.dumps({"contract_version": 1, "ok": True, "value": page}).encode(), {}, 0))
    responses.append((200, b'{"contract_version":1,"ok":true,"value":{"items":[]}}', {}, 0))
    source = dict(asset_id=ASSET, content_hash=HASH, source_status="unknown",
                  relative_path=None, reason="missing_source", provenance_verified=False,
                  import_evidence_checked=False)
    responses.append((200, json.dumps(dict(contract_version=1, ok=True, value=source)).encode(), {}, 0))
    initial = tmp_path / "initial"
    assert build(initial, origin).returncode == 0
    root = initial.rename(tmp_path / "\u79fb\u52a8 Knot")
    assert (root / "requirements.txt").read_bytes() == (
        BUILDER.parents[1] / "requirements-plugin.txt"
    ).read_bytes()
    manifest = json.loads((root / ".codex-plugin/plugin.json").read_text())
    assert manifest["name"] == "knot"
    assert manifest["mcpServers"] == "./.mcp.json"
    raw_config = (root / manifest["mcpServers"]).read_text()
    assert PRIVATE not in raw_config
    server = json.loads(raw_config)["mcpServers"]["knot"]
    assert server["type"] == "stdio"
    assert server["env_vars"] == ["KNOT_TOKEN"]
    assert server["cwd"] == "."
    assert server["args"][2] == "launch.py"
    # The SDK smoke test resolves plugin-relative cwd as the Codex compatibility loader does.
    params = StdioServerParameters(
        command=server["command"],
        args=server["args"],
        cwd=(root / server["cwd"]).resolve(),
        env={key: str(tmp_path) for key in ("HOME", "USERPROFILE", "TEMP", "TMP")} |
            {"KNOT_TOKEN": PRIVATE},
    )

    async def check():
        async with Client(params) as client:
            listing = await client.list_tools()
            assert [tool.name for tool in listing.tools] == [
                "knot_lookup_asset", "knot_read_asset", "knot_search_assets",
                "knot_save_exploration", "knot_load_exploration", "knot_list_explorations",
                "knot_save_exploration_v2", "knot_load_exploration_v2", "knot_fork_exploration", "knot_read_asset_slice", "knot_read_asset_source",
            ]
            result = await client.call_tool("knot_lookup_asset", {"content_hash": HASH})
            assert result.structured_content == {"items": [{"asset_id": ASSET, "kind": "text"}]}
            assert not result.is_error
            found = await client.call_tool("knot_search_assets", {"query": "needle"})
            assert found.structured_content == page
            assert not found.is_error
            checkpoints = await client.call_tool("knot_list_explorations", {})
            assert checkpoints.structured_content == {"items": []}
            source_result = await client.call_tool("knot_read_asset_source", {"asset_id": ASSET, "expected_hash": HASH})
            assert source_result.structured_content == source == json.loads(source_result.content[0].text)

    asyncio.run(asyncio.wait_for(check(), timeout=10))
    assert requests == [
        (f"/assets?content_hash={HASH}", f"Bearer {PRIVATE}"),
        ("/asset-search?q=needle&limit=10", f"Bearer {PRIVATE}"),
        ("/explorations?limit=20", f"Bearer {PRIVATE}"),
        (f"/asset-sources?asset_id={ASSET}&expected_hash={HASH}", f"Bearer {PRIVATE}"),
    ]
    captured = capfd.readouterr()
    assert PRIVATE not in captured.out + captured.err


def test_build_rejects_invalid_configuration_and_existing_output(tmp_path):
    output = tmp_path / "plugin"
    origin = "http://127.0.0.1:1"
    assert b"KNOT_PYTHON_REQUIRED" in build(output, origin, tmp_path / "missing").stderr
    assert b"KNOT_ORIGIN_INVALID" in build(output, f"http://{PRIVATE}@127.0.0.1:1").stderr
    assert not output.exists()
    output.mkdir()
    marker = output / "keep"
    marker.write_bytes(b"original")
    assert b"KNOT_OUTPUT_UNAVAILABLE" in build(output, origin).stderr
    assert list(output.iterdir()) == [marker]
    assert marker.read_bytes() == b"original"


def test_launcher_reports_missing_dependency(tmp_path):
    output = tmp_path / "plugin"
    assert build(output, "http://127.0.0.1:1").returncode == 0
    result = subprocess.run(
        [sys.executable, "-IBS", str(output / "launch.py"), "http://127.0.0.1:1"],
        cwd=tmp_path, capture_output=True, timeout=10,
    )
    assert result.returncode == 1
    assert not result.stdout
    assert result.stderr.strip() == (
        b"KNOT_DEPENDENCY_REQUIRED: use a Python environment with mcp==2.1.1"
    )


def test_launcher_requires_token(tmp_path):
    output = tmp_path / "plugin"
    assert build(output, "http://127.0.0.1:1").returncode == 0
    env = os.environ.copy()
    env.pop("KNOT_TOKEN", None)
    result = subprocess.run(
        [sys.executable, "-IB", str(output / "launch.py"), "http://127.0.0.1:1"],
        cwd=tmp_path, env=env, capture_output=True, timeout=10,
    )
    assert result.returncode == 1
    assert not result.stdout
    assert result.stderr.strip() == (
        b"KNOT_TOKEN_REQUIRED: supply KNOT_TOKEN through the process environment"
    )
