# P0-05C1 recorded source reference

This read-only core projects a reader-authorized asset's recorded relative file label. It checks the stored content hash as an anchor, not the body, import event, source authenticity or original chat identity. Both verification flags are false. Duplicate-content imports can retain only the first recorded label.

Only the exact current importer URI and metadata shape is recognized. The logical path is untrusted display data relative to an unavailable import root; it is not an actionable local path. Conservative path exclusions can suppress legitimate unusual filenames. No external files, URLs, body, event records or storage paths are read. Unknown reasons and fixed errors are defined by the implementation. Reader access is checked in the same read snapshot; a revocation affects the next snapshot.

HTTP, MCP, original source authentication, reader management, real host usage and product acceptance remain future work.

## API and trust boundary

`read_asset_source(db_path, asset_id, expected_hash, actor, token)` accepts a canonical lowercase UUID and a 64-character lowercase hexadecimal expected hash. `actor` and `token` are trusted inputs from the upstream authenticated caller; this core does not authenticate them. It requires an explicit asset reader grant, including when single-user mode is configured. Authorization, the asset anchor and the source fields are read in one SQLite snapshot. Revocation affects the next snapshot; a snapshot already in progress may complete.

The result has exactly seven keys: `asset_id`, `content_hash`, `source_status`, `relative_path`, `reason`, `provenance_verified`, `import_evidence_checked`. The last two are always `false`. The hash comparison binds only the stored database anchor; no content bytes are read or verified. Import events are not queried, so their existence and correctness are not asserted.

## Source statuses

`recorded_file_reference` returns a logical relative label and a null reason only when the source URI and metadata exactly match the current importer representation. `unknown` returns a null path and one of these reasons:

| Reason | Meaning |
|---|---|
| `missing_source` | URI is null or empty; metadata cannot supply a missing URI. |
| `unsupported_source` | Bounded URI does not begin with the supported case-sensitive `file://` prefix. |
| `invalid_source` | Unexpected stored type, malformed or wrong-shape JSON, or invalid logical path. |
| `inconsistent_source` | Safe metadata path does not exactly match the importer's encoded URI. |
| `sensitive_source` | A bounded source field or decoded path matches the finite credential rules or supplied token. |
| `source_limit` | A source field exceeds its byte limit; its contents are not materialized. |

The label is untrusted display data relative to an unavailable import root, not a clickable local path. It cannot establish a chat identity, source authenticity, or complete provenance. Paths are not normalized. Absolute, empty or dot segments, backslashes, colons, percent signs, `@`, query/fragment delimiters, control or Unicode category C characters, and segments with edge whitespace are excluded. These conservative rules can suppress legitimate unusual names.

## Limits and errors

SQLite byte lengths are checked before loading source values: URI at most 4096 bytes, metadata at most 8192 bytes, path at most 1024 UTF-8 bytes and each segment at most 255 UTF-8 bytes. Serialized output is capped at 16384 bytes. Reads use a cooperative one-second deadline, SQLite progress checks and a 0.1-second busy timeout; these are not a hard preemptive execution guarantee.

The public exception holds one of eight fixed codes: `INVALID_ARGUMENT`, `ASSET_UNAVAILABLE`, `READER_TABLE_MISSING`, `CONTENT_MISMATCH`, `SENSITIVE_CONTENT`, `SOURCE_LIMIT_REACHED`, `READ_LIMIT_REACHED`, `READ_UNAVAILABLE`. Missing authorization and missing asset share `ASSET_UNAVAILABLE`; absent reader table fails closed. Malformed SQLite TEXT that cannot be decoded is `READ_UNAVAILABLE`. A JSON or path surrogate is `unknown` / `invalid_source`. Original exception details and chains are suppressed.

Credential protection uses finite marker rules and the supplied token; it is not universal sensitive-data classification. The final serialized success is also checked for the token and its JSON-escaped spelling. A short token may coincide with a fixed output field, producing `SENSITIVE_CONTENT`; fixed error codes can themselves coincide with arbitrary short tokens and cannot promise universal literal suppression.
