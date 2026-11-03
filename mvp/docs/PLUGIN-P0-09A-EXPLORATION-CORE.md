# P0-09A Exploration checkpoint core

Parent `524399f`. GPT-6 coordinates, GPT-6.1 implements and tests, and an independent Checker reviews. 之 holds the product experience and final Gate.

## Scope

Save, update, return and list owner-scoped checkpoints through a shared SQLite core. A future trusted caller resolves actor identity before invoking this core. The core itself exposes no HTTP or MCP operation. It checks explicit reader grants regardless of host configuration.

The caller provides a lowercase canonical UUID for each exploration and request key. The exploration identity is independent of content hashes. A save with expected revision 0 creates revision 1. Later saves replace its current ordered snapshot with an immutable next revision. The snapshot stores up to 32 distinct asset IDs and expected SHA-256 hashes, with `selected` or `excluded` disposition and an optional reason up to 512 UTF-8 bytes. A freeform stop note is optional and limited to 2048 UTF-8 bytes. Notes and reasons accept tab, CR and LF and reject other ASCII controls. The snapshot references existing assets and does not fetch their text. Removing a reference requires an explicit save that omits it. Prior revisions remain available to the owner.

Each revision is also the save event and durable idempotency receipt. It has its own event UUID and a service-generated save time. The single write transaction checks the current owner, prior successful request, expected revision and all supplied references against current asset hashes and explicit reader grants before appending. A repeated request in the same actor's key namespace returns only its original exploration ID, revision and event ID. The same key with different input conflicts. A different actor cannot read or update the object or retrieve its receipt. An absent or foreign object on an update or read is uniformly not found. Actor keys are independent across actors.

Operation errors use `INVALID_ARGUMENTS`, `NOT_FOUND`, `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT` or `ASSET_UNAVAILABLE`. A replay compares normalized snapshots, including reference order. SHA-256 input case and omitted versus explicit null reasons normalize to the same value. Freeform text is private persisted input, with no token authentication or credential scanning at this core boundary.

Loading the latest or a specified historical revision reassesses references in one read snapshot. An unavailable reference retains its saved identity, hash, order and disposition, with a fixed status and no reason. Any unavailable reference also suppresses the stop note and sets the fixed explanation `dependency_unavailable`. That rule covers declared references. It does not infer undeclared dependencies or detect quotations in arbitrary private notes. Listing returns up to 20 owner checkpoint IDs with the latest revision and time, most recent saves first. Selection does not grant reader access, confirm a human decision, send material to a model or remove material from host history.

## Schema and activation

Explicit v1.6 → v1.7 additive migration in disposable SQLite. Check the version history, required asset and reader structures, and exact exploration DDL. Drift is rejected, and a migration failure leaves no partial table or version. Runtime checks these structures before operating. Fresh init remains v1.6, followed by explicit migration for this candidate. Legacy HTTP health version reporting and host exposure are separate follow-up work. This card keeps its private revisions out of global timeline and SSE, and does not exercise the existing claim command path or adopt the unmerged #52 claim fix.

## Allowed paths

- `mvp/backend/exploration_repo.py`
- `mvp/backend/migrate_schema_v1_7.py`
- `mvp/tests/test_exploration_core.py`
- `mvp/docs/PLUGIN-P0-09A-EXPLORATION-CORE.md`
