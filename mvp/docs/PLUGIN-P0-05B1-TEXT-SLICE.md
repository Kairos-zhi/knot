# 05B1: bounded embedded text slices

`read_asset_text_slice` reads a specified embedded plain or Markdown UTF-8 asset after an explicit reader grant in the same read snapshot. Actor and token are supplied by a trusted caller; this core does not authenticate their association. The full blob (at most 1,000,000 bytes) is checked against the required lowercase SHA-256, UTF-8/control policy and finite credential markers before any slice is returned. This finite policy is not general sensitive-content classification. External paths are neither read nor returned.

Offsets and lengths are UTF-8 bytes. A starting offset must be a character boundary; an end is shortened to a boundary. Each call rechecks grant and complete content. Revocation affects later snapshots; previously returned text cannot be erased from the host. The expected hash and offset are not authorization or a historical-version service.

The one-second budget is cooperative, including checks around processing and after close, SQLite progress callbacks and a 100 ms lock timeout. It cannot interrupt every OS I/O, a single Python regex, or initial schema checks before the callback is installed. Failures return fixed codes without content; no partial slice is returned. SQLite read-only operation does not promise that all auxiliary journal files are untouched. The caller is responsible for selecting a trusted database.

This is core only: no HTTP/MCP endpoint, deployment, real-model test or product acceptance is implied.
