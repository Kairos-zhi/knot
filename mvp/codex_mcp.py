"""Read-only Knot asset lookup over MCP stdio."""

import argparse
import json
import os
import re

import anyio
import httpx2
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import CallToolResult, ListToolsResult, TextContent, Tool

from mvp.plugin_projection import project_asset_meta


_TOOL_NAME = "knot_lookup_asset"
_HASH = r"[0-9a-fA-F]{64}"
_MAX_RESPONSE = 64 * 1024
_TIMEOUT = 2
_TOOL = Tool(
    name=_TOOL_NAME,
    description="Look up asset metadata by a known SHA-256 digest.",
    input_schema={
        "type": "object",
        "properties": {
            "content_hash": {"type": "string", "pattern": f"^{_HASH}$", "maxLength": 64},
        },
        "required": ["content_hash"],
        "additionalProperties": False,
    },
)


def loopback_origin(value):
    match = re.fullmatch(r"http://(?:127\.0\.0\.1|\[::1\]):([0-9]{1,5})", value)
    if match is None or not 1 <= int(match[1]) <= 65535:
        raise argparse.ArgumentTypeError("expected an explicit loopback HTTP origin and port")
    return value


async def lookup(origin, digest, token):
    headers = {"Accept-Encoding": "identity"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        with anyio.fail_after(_TIMEOUT):
            async with httpx2.AsyncClient(trust_env=False, follow_redirects=False) as client:
                async with client.stream(
                    "GET", f"{origin}/assets", params={"content_hash": digest}, headers=headers
                ) as response:
                    if response.status_code != 200 or response.headers.get(
                        "content-encoding", "identity"
                    ).lower() != "identity":
                        return {"error": "UPSTREAM_ERROR"}
                    body = bytearray()
                    async for chunk in response.aiter_raw(chunk_size=8192):
                        if len(body) + len(chunk) > _MAX_RESPONSE:
                            return {"error": "UPSTREAM_ERROR"}
                        body.extend(chunk)
        envelope = json.loads(body)
    except (httpx2.HTTPError, TimeoutError, ValueError, RecursionError):
        return {"error": "UPSTREAM_ERROR"}

    if type(envelope) is not dict or type(envelope.get("value")) is not dict:
        return {"error": "UPSTREAM_ERROR"}
    value = envelope["value"]
    if type(value.get("items")) is not list or len(value["items"]) > 1:
        return {"error": "UPSTREAM_ERROR"}
    projected = project_asset_meta(envelope)
    if "error" in projected:
        return {"error": "UPSTREAM_ERROR"}
    return projected


async def serve(origin, token):
    async def list_tools(ctx, params):
        return ListToolsResult(tools=[_TOOL])

    async def call_tool(ctx, params):
        arguments = params.arguments or {}
        digest = arguments.get("content_hash")
        if (
            params.name != _TOOL_NAME
            or arguments.keys() != {"content_hash"}
            or type(digest) is not str
            or not re.fullmatch(_HASH, digest)
        ):
            result = {"error": "INVALID_ARGUMENTS"}
        else:
            result = await lookup(origin, digest, token)
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(result))],
            structured_content=result,
            is_error="error" in result,
        )

    server = Server("Knot", on_list_tools=list_tools, on_call_tool=call_tool)
    async with stdio_server() as (reader, writer):
        await server.run(reader, writer, server.create_initialization_options())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True, type=loopback_origin)
    args = parser.parse_args()
    anyio.run(serve, args.origin, os.environ.get("KNOT_TOKEN"))


if __name__ == "__main__":
    main()
