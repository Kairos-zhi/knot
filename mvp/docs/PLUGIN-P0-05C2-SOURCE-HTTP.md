# 05C2: HTTP recorded source references

`GET /asset-sources?asset_id=...&expected_hash=...` requires exactly these two nonempty query values once. UUID and SHA-256 must be canonical lowercase. Unknown/repeated keys, malformed percent escapes and invalid UTF-8 are rejected before authentication; percent-encoded values that decode to canonical inputs are accepted. No caller-supplied actor or token parameter is allowed.

For otherwise valid requests, configured Bearer identity is mandatory. The service resolves token to actor; missing/invalid token or single-user mode returns 403. Each request calls the frozen source core exactly once with service-resolved identity and active token. An explicit reader grant, stored hash anchor and source fields are checked in one snapshot. Missing asset/grant and missing reader table share 403. Revocation affects the next snapshot; an in-progress snapshot may complete.

Success is a plain version-1 envelope containing exactly seven core fields: asset_id, content_hash, source_status, relative_path, reason, provenance_verified, import_evidence_checked. A recorded_file_reference has a logical relative label and null reason. An unknown source has null relative_path and one of missing_source, unsupported_source, invalid_source, inconsistent_source, sensitive_source, source_limit; it remains HTTP 200. Both verification flags are always false.

The label is untrusted display data relative to an unavailable import root, not an actionable local path. Stored hash equality binds only the database anchor. No body, original file, network resource or import event is read. No source authenticity, chat identity, complete provenance or import evidence is verified. Duplicate-content imports may retain only the first label; file mtime and origin=v0.4 are not chat provenance.

| Core failure | HTTP / public code | detail.reason |
|---|---|---|
| INVALID_ARGUMENT | 400 BAD_REQUEST | absent |
| ASSET_UNAVAILABLE, READER_TABLE_MISSING | 403 FORBIDDEN_VIEW | absent |
| CONTENT_MISMATCH | 400 BAD_REQUEST | content_mismatch |
| SENSITIVE_CONTENT | 400 BAD_REQUEST | sensitive_content |
| SOURCE_LIMIT_REACHED | 500 INTERNAL | absent |
| READ_LIMIT_REACHED | 503 SERVER_BUSY | source_limit |
| READ_UNAVAILABLE, unknown codes/exceptions | 500 INTERNAL | absent |

Query errors are fixed BAD_REQUEST. Serialization failures and envelope overflow are fixed INTERNAL. No exception text or partial success is returned. The core's cooperative one-second deadline/100ms SQLite busy timeout are not a hard execution guarantee. Its successful per-field unknown/source_limit differs from failed output limit SOURCE_LIMIT_REACHED and read-budget SERVER_BUSY/source_limit.

Before any response headers, the complete ensure-ASCII success bytes are serialized once, checked against the raw and JSON-escaped active token and capped at 32768 bytes; exactly these bytes are sent with matching Content-Length. A token collision returns BAD_REQUEST/sensitive_content. Core result cap remains 16384 bytes; existing text-slice HTTP cap remains 65536. A short token may match envelope keys conservatively; arbitrary short-token coincidences with fixed error text cannot be universally suppressed. Finite marker rules do not classify all sensitive data.

This is an HTTP-only candidate. No MCP, reader-management endpoint, automatic source opening, installation, real model use, deployment, original-source authentication or human product acceptance is implied. Any returned label has entered the caller; future deselection cannot erase host history. Independent HTTP review and limited Gate precede 05C3 MCP.