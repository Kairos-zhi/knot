# P0-09B Exploration transport

Parent `52b01e8`, with `8ed6de4` and `52b01e8` locally cherry-picked from the two #52 commits. GPT-6 coordinates, GPT-6.1 implements, and an independent Checker reviews. 之 holds the product experience and final Gate.

Expose the existing owner-scoped checkpoint core through `POST /exploration-saves`, `GET /explorations` and `GET /explorations/{exploration_id}` and the three corresponding Codex tools. Configured Bearer identity resolves actor on the server. Saving uses the caller's stable IDs, expected revision and bounded ordered snapshot. Repeating the same successful request returns its opaque receipt. If the result is uncertain, the caller can repeat the exact request with the same key. Private revisions stay in SQLite and out of global journals and notifications.

A process-wide read-only state or shutdown blocks saves and save retries before the core call. HTTP 409 `SERVER_BUSY` with reason `server_read_only` maps to MCP `SERVER_READ_ONLY`. This safety check shares the server lock. SQLite remains the exploration authority for state and receipts.

Save JSON is strict UTF-8 and bounded to 128 KiB. Existing core input limits apply. Freeform notes and reasons are subject to the existing finite credential marker and active-token check at the transport boundary. Readback preserves core dependency suppression and suppresses freeform text matching the transport credential policy. Returned notes and reasons are untrusted data and become visible to the host and model when returned. A save call is a save request and carries no human confirmation. The core only reasons over declared dependencies and does not infer quotations or undeclared dependencies.

Fresh create-only init uses the existing explicit v1.7 migration on the unpublished staging database. Valid legacy databases keep their existing API and accurate health version, and reject exploration routes until explicitly migrated. A stamped v1.7 database with drift fails startup. Verification uses only temporary databases and isolated host configuration.

## Allowed paths

- `mvp/backend/http_server.py`, `mvp/backend/init_db.py`, `mvp/backend/bundle_jobs.py`, `mvp/backend/exploration_repo.py`
- `mvp/exploration_policy.py`, `mvp/codex_mcp.py`, `mvp/plugin_projection.py`
- `mvp/codex_plugin/build.py`, `mvp/codex_plugin/plugin.json`, `mvp/codex_plugin/README.md`
- `mvp/contract/v1/schema.json`, `mvp/contract/v1/endpoints.json`, `mvp/contract/selfcheck.py`
- `mvp/tests/test_exploration_transport.py`, `mvp/tests/test_exploration_core.py`, `mvp/tests/test_init_db.py`, `mvp/tests/test_narrow_three.py`
- `mvp/tests/test_contract_schema.py`, `mvp/tests/test_http_contract.py`, `mvp/tests/test_codex_mcp.py`, `mvp/tests/test_plugin_package.py`, `mvp/tests/test_bundle_read.py`, `mvp/tests/test_bundle_resolvable.py`
- `mvp/tests/test_schema_v1_4.py` (fresh initialization assertions and malformed-column fixture prerequisites)
- `mvp/docs/HTTP.md`, `mvp/docs/SCHEMA.md`, `mvp/docs/PLUGIN-P0-09B-EXPLORATION-TRANSPORT.md`
