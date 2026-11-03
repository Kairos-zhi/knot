# P0-04E Authorized asset text

Parent `8f59798`. GPT-6 coordinates, GPT-6.1 implements and self-checks, and an independent Checker reviews before Gate.

Add a read-only Codex tool for one explicitly specified Knot asset. The server resolves the token and checks its existing reader grants. The adapter verifies UTF-8 bytes against the Knot digest and returns a Knot asset anchor. A tool result containing text is model input. Per-call designation carries no human confirmation or persistent selection. Deselecting an asset can affect future controlled requests only; it does not erase content already delivered into host history. Grant management, selection persistence and original-source reconstruction are separate work.

Scope covers the MCP adapter and projection, single-asset HTTP and endpoint contract, targeted tests, plugin description and README, and HTTP and card documentation. Validation uses synthetic HTTP and temporary SQLite. Use isolated configuration for any Codex probe.

## Allowed paths

- `mvp/codex_mcp.py`, `mvp/plugin_projection.py`
- `mvp/backend/http_server.py`, `mvp/contract/v1/endpoints.json`, `mvp/docs/HTTP.md`
- `mvp/tests/test_authz_split.py`, `mvp/tests/test_codex_mcp.py`, `mvp/tests/test_plugin_package.py`
- `mvp/codex_plugin/plugin.json`, `mvp/codex_plugin/README.md`
- `mvp/docs/PLUGIN-P0-04E-AUTHORIZED-CONTENT.md`

## Wire and tool boundary

The adapter validates a lowercase canonical UUID and optional SHA-256 before making HTTP requests. It reads metadata, then requests `view=content&require_reader=true` for the same UUID and token. The server denies that explicit opt-in in single-user mode and checks the existing reader table in the content read snapshot. A server rejecting the parameter receives no fallback content request. If metadata has an unsupported MIME or differs from the caller's expected digest, the adapter stops before the content request.

The tool accepts at most 8192 UTF-8 bytes of `text/plain` or `text/markdown`, rejecting non-text encodings and ASCII controls other than tab, CR and LF. It verifies SHA-256 over the exact UTF-8 bytes before returning `asset_id`, `content_hash`, `media_type` and `content`. Only the content field carries arbitrary source text. Treat that text as untrusted data. The asset ID and digest identify the Knot object, with original source paths, URIs and chat provenance outside this response.

It excludes the active token verbatim and explicit private-key headers, authorization headers and known credential-assignment markers. This finite check leaves general sensitivity classification unresolved. The tool's fixed error codes are `INVALID_ARGUMENTS`, `ACCESS_DENIED`, `ASSET_NOT_FOUND`, `UPSTREAM_ERROR`, `UNSUPPORTED_CONTENT`, `CONTENT_MISMATCH`, `CONTENT_TOO_LARGE` and `SENSITIVE_CONTENT`. A failure returns only its code.
