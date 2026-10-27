# Closeout Maker freeze

Scope: one explanatory first-line comment in `scripts/desktop-host-archive.mjs`; protocol-equivalence test, dedicated helper and fixed upstream fixture only. No kernel, client, Desktop configuration, original repository, or product asset change.

## Source and isolated assembly

Upstream is `https://github.com/Kairos-zhi/knot.git`, commit `08a2a5340edab920ce942173ba63b2c5bc369eb4`, blob `knot-flowgram-app/scripts/asset-write-server.mjs`. Fixture SHA256 is `91b5e9470f87ee8dcb7deef0a5c19e519bb11749f031143006ef5daad215a246`, exact original Git bytes. Fixture-local `.gitattributes` preserves LF on future Windows checkouts. Tests require no other checkout.

Only a temporary copy receives two exact, unique replacements: `const PORT = 3101;` becomes port 0; `server.listen(PORT, () => {` gains loopback binding and a readiness line containing the actual assigned port. Its asset/lock/seq relative paths remain unchanged and resolve under the temporary directory. The required asset document is an empty test fixture, not copied production content. Each server uses the same isolated test-only bearer token and configured source. No source service is started at its original path, and no 3101/3081/Desktop listener is used. Temporary children, SSE readers, store locks and directories are cleaned up.

## Precise enumeration

The denominator is the original server's 4 switch cases plus 12 `CANVAS_COMMANDS` entries: **16 distinct named protocol commands**. The old server comment saying 14 is stale; this count does not claim every method of the browser OperationService is a protocol command.

| Category | Count | Commands |
| --- | --- | --- |
| Shared direct execution, compared for valid deterministic inputs | 3 | `ping`, `knot.create`, `knot.update` |
| Current direct execution; original only queues for Canvas Bridge | 2 | `rope.connect`, `rope.disconnect` |
| Current explicitly unsupported | 11 | `knot.delete`, `rope.disconnectAll`, `chain.thread`, `chain.get`, `generate.grow`, `generate.fromSelection`, `tool.set`, `tool.get`, `focus.set`, `expand.set`, `pin.toggle` |

Thus current support is **5/16** by protocol names, with only 3 sharing direct endpoint execution semantics. Separately, current workspace/presentation extensions are `worksite.create`, `worksite.activate`, `worksite.update`, `worksite.supply`, `presentation.open`, `presentation.update` (6), plus legacy UI aliases `asset.add`, `scene.create` (2). These 8 are excluded from the original-protocol denominator.

## What equivalence means here

Both real HTTP servers receive deterministic IDs and the same valid blocks, provenance, position and update payloads. Tests compare exact OpResult/status and asset/edge documents plus seq. Ping timestamps and SSE timestamps are validated as timestamps rather than equated. Snapshot projection excludes the new `schemaVersion`/workspace/persistence metadata and source-only document `note`; schema-version presence is asserted as a difference. SSE event JSON is compared after removing only `ts`; added `id:` framing remains a difference assertion. SSE parsing waits for complete frames with bounded timeouts, not one network chunk.

Retained differences: original read endpoints allow anonymous access; current reads require authentication. Original Origin uses a fixed frontend allowlist; current bearer Origin must match the actual loopback authority. Malformed JSON is `BAD_REQUEST` vs `INVALID_JSON`; unknown command is `UNKNOWN_COMMAND` vs `UNSUPPORTED_COMMAND`. Both reject missing update targets with `NOT_FOUND` without advancing seq. Original allows duplicate IDs and ignores `baseSeq`; current returns `DUPLICATE_ID` and `STALE_REVISION`. Original queues all 12 Canvas names; current executes 2 and explicitly rejects the remaining 10, plus `knot.delete`. The original queued-event payload overwrites `type: command.queued` with the command name; it also increments seq once for cmdSeq and once for its event. Both facts are tested without correcting the copied source. Current validates cursors and emits a cold-start reset; original accepts invalid/future cursors and has no reset frame. Cold-restart documents and persisted seq are compared.

These are scoped common-contract tests and explicit differences, not a claim of complete protocol equivalence or full product acceptance. No model or original Canvas Bridge execution is invoked.

## Self-check

- `node --test tests/protocol-equivalence.test.mjs tests/desktop-host-archive.test.mjs`: 5 passed, 0 failed/skipped (`focused-tests.tap`).
- `node --test tests/*.test.mjs`: 38 passed, 0 failed/skipped (`regression.tap`). Build was not rerun and product outputs were not modified.
- Fixed source fixture SHA is guarded on every test run; temporary assembly patches are included in TAP diagnostics.
- Candidate files and unchanged product hashes are frozen in `receipt.json`. Status is Maker-complete, awaiting independent Checker and controller Gate.
