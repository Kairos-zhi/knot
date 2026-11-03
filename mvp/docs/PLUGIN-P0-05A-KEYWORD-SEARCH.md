# P0-05A Reader-scoped keyword search

Parent `53312e4`. GPT-6 coordinates, GPT-6.1 implements and tests, and an independent Checker reviews the frozen candidate. 之 owns the product experience and final Gate.

Add a shared read-only search over existing Knot assets and reader grants, exposed through `GET /asset-search` and the Codex `knot_search_assets` tool. The current FTS tokenizer treats a continuous Chinese span as a whole token. This route uses literal Unicode casefold substring matching instead, with no normalization such as NFC. It matches all of up to eight whitespace-separated terms in any order. The query limit is 128 UTF-8 bytes. Control characters, including tab, newline and DEL, and invalid UTF-8 are rejected. Remaining Unicode whitespace separates terms. Punctuation is literal. The result limit is 1–20 with a default of 10.

Search considers embedded text/plain and text/markdown up to 8192 bytes that passes the existing text-read integrity, control-character and finite credential checks. SQL restricts candidates to the authenticated actor's reader grants before the bound and orders by imported time descending, then row ID descending. The read uses one SQLite snapshot. A grant change affects subsequent snapshots. An absent reader table, missing or invalid token, and single-user mode deny the request.

Return only asset ID, SHA-256, MIME and `has_more` from the authorized eligible matches. The first page has no cursor, score or global count. Examine at most 1000 authorized candidates, including candidates later excluded by text policy. If the remaining page or `has_more` cannot be determined, return HTTP 503 `SERVER_BUSY` with fixed reason `search_limit`, mapped to MCP `SEARCH_LIMIT_REACHED`. Return no partial page. The one-second budget starts before opening the read snapshot. SQLite lock waits for this route use a 100 ms timeout, the search SQL has a progress deadline, and Python checks time between candidates and before returning. These cooperative checks do not interrupt every OS I/O operation at a hard wall-clock deadline.

The HTTP search passes the authenticated request Bearer token to the finite credential policy. Both request and text checks exclude that token verbatim and the existing explicit credential markers. General sensitivity classification remains open. Long and external material, persistent selection, original-source reconstruction and grant management remain separate. The existing raw FTS repository method, index and schema versions are preserved. Use synthetic assets and isolated temporary SQLite, HTTP and Codex settings for verification.

## Allowed paths

- `mvp/backend/asset_search.py`, `mvp/backend/http_server.py`, `mvp/backend/timeline_query.py`
- `mvp/text_policy.py`, `mvp/search_policy.py`, `mvp/plugin_projection.py`, `mvp/codex_mcp.py`
- `mvp/contract/v1/endpoints.json`, `mvp/contract/v1/schema.json`, `mvp/contract/selfcheck.py`
- `mvp/codex_plugin/build.py`, `mvp/codex_plugin/plugin.json`, `mvp/codex_plugin/README.md`
- `mvp/tests/test_asset_search.py`, `mvp/tests/test_codex_mcp.py`, `mvp/tests/test_plugin_package.py`, `mvp/tests/test_authz_split.py`
- `mvp/tests/test_http_contract.py`, `mvp/tests/test_contract_schema.py`, `mvp/tests/test_bundle_read.py`, `mvp/tests/test_bundle_resolvable.py`
- `mvp/docs/HTTP.md`, `mvp/docs/PLUGIN-P0-05A-KEYWORD-SEARCH.md`
