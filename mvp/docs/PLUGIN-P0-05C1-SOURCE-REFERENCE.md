# P0-05C1 recorded source reference

This read-only core projects a reader-authorized asset's recorded relative file label. It checks the stored content hash as an anchor, not the body, import event, source authenticity or original chat identity. Both verification flags are false. Duplicate-content imports can retain only the first recorded label.

Only the exact current importer URI and metadata shape is recognized. The logical path is untrusted display data relative to an unavailable import root; it is not an actionable local path. Conservative path exclusions can suppress legitimate unusual filenames. No external files, URLs, body, event records or storage paths are read. Unknown reasons and fixed errors are defined by the implementation. Reader access is checked in the same read snapshot; a revocation affects the next snapshot.

HTTP, MCP, original source authentication, reader management, real host usage and product acceptance remain future work.
