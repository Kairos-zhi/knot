# 05B1: bounded embedded text slices

`read_asset_text_slice` reads a specified embedded plain or Markdown UTF-8 asset after an explicit reader grant in the same read snapshot. Actor and token are supplied by a trusted caller; this core does not authenticate their association. The full blob (at most 1,000,000 bytes) is checked against the required lowercase SHA-256, UTF-8/control policy and finite credential markers before any slice is returned. This finite policy is not general sensitive-content classification. External paths are neither read nor returned.

Offsets and lengths are UTF-8 bytes. A starting offset must be a character boundary; an end is shortened to a boundary. Each call rechecks grant and complete content. Revocation affects later snapshots; previously returned text cannot be erased from the host. The expected hash and offset are not authorization or a historical-version service.

The one-second budget is cooperative, including checks around processing and after close, SQLite progress callbacks and a 100 ms lock timeout. It cannot interrupt every OS I/O, a single Python regex, or initial schema checks before the callback is installed. Failures return fixed codes without content; no partial slice is returned. SQLite read-only operation does not promise that all auxiliary journal files are untouched. The caller is responsible for selecting a trusted database.

This is core only: no HTTP/MCP endpoint, deployment, real-model test or product acceptance is implied.

## Core API

`read_asset_text_slice(db_path, asset_id, expected_hash, offset, limit, actor, token)`

- `db_path`: path to the caller-selected existing SQLite database; no creation or migration.
- `asset_id`: canonical lowercase UUID string. `expected_hash`: lowercase 64-hex SHA-256 string for the entire original byte sequence.
- `offset`: nonnegative integer byte offset, excluding booleans. `limit`: integer from 4 through 8192 bytes, excluding booleans.
- `actor` and `token`: nonempty strings supplied by the trusted caller. The core checks the actor's explicit reader grant; it does not authenticate token-to-actor identity. The token also participates in the finite full-text exclusion check. There is no single-user grant bypass.

The closed success object contains exactly eight fields: `asset_id` (string), `content_hash` (string), `media_type` (string), `total_bytes` (integer), `offset` (integer), `next_offset` (integer), `text` (string), and `has_more` (boolean). `total_bytes` is at most 1,000,000. The starting offset must be at a UTF-8 character boundary and no greater than `total_bytes`; the endpoint is reduced as needed to preserve a complete character. `next_offset` is that integer endpoint, including at EOF. At `offset == total_bytes`, text is empty, `next_offset == total_bytes` and `has_more` is false.

Failures raise `TextSliceError` with exactly one of these fixed codes: `INVALID_ARGUMENT`, `ASSET_UNAVAILABLE`, `READER_TABLE_MISSING`, `UNSUPPORTED_CONTENT`, `CONTENT_TOO_LARGE`, `CONTENT_MISMATCH`, `SENSITIVE_CONTENT`, `READ_LIMIT_REACHED`, or `READ_UNAVAILABLE`. Missing and unauthorized assets share `ASSET_UNAVAILABLE`. Errors carry no partial result, source text, token, SQL or database path; translated exceptions are raised after leaving the original exception handler so their cause and context do not retain the original error. Successful results are returned only after the read-only connection closes successfully and the final cooperative budget check passes.

The full-text marker check uses the same finite rules as the existing short-text policy. Its assignment-marker prefix replaces two adjacent optional whitespace runs with a single run followed by an optional quote-and-whitespace group, preserving the short-policy boolean match while avoiding repeated splitting of an unquoted whitespace run. Short synthetic cases are compared against the existing policy; this is not a claim of complete credential detection or a hard execution-time bound.
