"""Owner-scoped, revisioned exploration checkpoints in the shared Knot database."""

from contextlib import closing
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import time
from uuid import uuid4

from mvp.exploration_policy import (
    MAX_REVISION, ExplorationError, normalize_snapshot, normalize_snapshot_v2, decode_snapshot,
    validate_revision, validate_text, validate_uuid,
)

from .migrate_schema_v1_8 import require_exploration_schema
from .timeline_query import read_snapshot


def _validate_actor(actor):
    validate_text(actor, 256)
    if not actor.strip() or any(char in actor for char in "\t\r\n"):
        raise ExplorationError("INVALID_ARGUMENTS")


def _reference_status(conn, ref, actor):
    row = conn.execute(
        """SELECT a.content_hash, EXISTS (
               SELECT 1 FROM asset_readers r WHERE r.asset_id = a.asset_id AND r.actor = ?
           ) FROM assets a WHERE a.asset_id = ?""",
        (actor, ref["asset_id"]),
    ).fetchone()
    if row is None:
        return "missing"
    if not row[1]:
        return "forbidden"
    if type(row[0]) is not str or row[0].lower() != ref["expected_content_hash"]:
        return "hash_mismatch"
    return "available"


def _receipt(exploration_id, revision, event_id):
    return {"exploration_id": exploration_id, "revision": revision, "event_id": event_id}


class ExplorationRepo:
    """Operations for a caller that has already resolved and authorized its actor."""

    def __init__(self, db_path):
        self._path = Path(db_path).expanduser().resolve()
        self._uri = self._path.as_uri() + "?mode=rw"
        with read_snapshot(self._path) as conn:
            require_exploration_schema(conn)

    def save(self, actor, exploration_id, *, expected_revision, request_key, references, stop_note=None):
        snapshot = normalize_snapshot(references, stop_note)
        return self._save(actor, exploration_id, expected_revision, request_key, snapshot, False)

    def save_v2(self, actor, exploration_id, *, expected_revision, request_key,
                snapshot_version, references, stop_note, relations):
        snapshot = normalize_snapshot_v2(snapshot_version, references, stop_note, relations)
        return self._save(actor, exploration_id, expected_revision, request_key, snapshot, True)

    def _save(self, actor, exploration_id, expected_revision, request_key, snapshot, v2):
        _validate_actor(actor)
        validate_uuid(exploration_id)
        validate_uuid(request_key)
        validate_revision(expected_revision, 0)
        snapshot_json = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        request = json.dumps((["exploration.save_v2"] if v2 else []) +
                             [exploration_id, expected_revision, snapshot_json], ensure_ascii=False)
        digest = sha256(request.encode("utf-8")).hexdigest()

        with closing(sqlite3.connect(self._uri, uri=True)) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            schema = require_exploration_schema(conn)
            head = conn.execute(
                """SELECT actor, revision FROM exploration_revisions
                   WHERE exploration_id = ? ORDER BY revision DESC LIMIT 1""",
                (exploration_id,),
            ).fetchone()
            if (head is None and expected_revision != 0) or (head is not None and head[0] != actor):
                raise ExplorationError("NOT_FOUND")
            if v2 and schema != "1.8":
                raise ExplorationError("EXPLORATION_MIGRATION_REQUIRED")
            replay = conn.execute(
                """SELECT exploration_id, revision, event_id, request_digest
                   FROM exploration_revisions WHERE actor = ? AND request_key = ?""",
                (actor, request_key),
            ).fetchone()
            if replay is not None:
                if replay[3] != digest:
                    raise ExplorationError("IDEMPOTENCY_CONFLICT")
                return _receipt(*replay[:3])

            history = [decode_snapshot(row[0]) for row in conn.execute(
                "SELECT snapshot_json FROM exploration_revisions WHERE exploration_id = ? ORDER BY revision",
                (exploration_id,))]
            if not v2 and any("snapshot_version" in item for item in history):
                raise ExplorationError("SNAPSHOT_VERSION_REQUIRED")
            if schema == "1.7" and any("snapshot_version" in item for item in history):
                raise ExplorationError("INVALID_SNAPSHOT")
            if v2:
                prior = {}
                for item in history:
                    for rel in item.get("relations", []):
                        endpoints = (rel["from_asset_id"], rel["to_asset_id"])
                        if rel["relation_id"] in prior and prior[rel["relation_id"]] != endpoints:
                            raise ExplorationError("INVALID_SNAPSHOT")
                        prior[rel["relation_id"]] = endpoints
                for rel in snapshot["relations"]:
                    endpoints = (rel["from_asset_id"], rel["to_asset_id"])
                    if rel["relation_id"] in prior and prior[rel["relation_id"]] != endpoints:
                        raise ExplorationError("INVALID_ARGUMENTS")
            current = head[1] if head is not None else 0
            if expected_revision != current or current == MAX_REVISION:
                raise ExplorationError("REVISION_CONFLICT")
            if any(_reference_status(conn, ref, actor) != "available" for ref in snapshot["references"]):
                raise ExplorationError("ASSET_UNAVAILABLE")
            revision, event_id = current + 1, str(uuid4())
            conn.execute(
                """INSERT INTO exploration_revisions
                   (exploration_id, revision, actor, event_id, saved_at, request_key,
                    request_digest, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (exploration_id, revision, actor, event_id, time.time_ns() // 1_000_000,
                 request_key, digest, snapshot_json),
            )
            return _receipt(exploration_id, revision, event_id)

    def load(self, actor, exploration_id, *, revision=None):
        return self._load(actor, exploration_id, revision, False)

    def load_v2(self, actor, exploration_id, *, revision=None):
        return self._load(actor, exploration_id, revision, True)

    def _load(self, actor, exploration_id, revision, v2):
        _validate_actor(actor)
        validate_uuid(exploration_id)
        if revision is not None:
            validate_revision(revision, 1)
        with read_snapshot(self._path) as conn:
            schema = require_exploration_schema(conn)
            row = conn.execute(
                """SELECT revision, event_id, saved_at, snapshot_json FROM exploration_revisions
                   WHERE exploration_id = ? AND actor = ? AND (? IS NULL OR revision = ?)
                   ORDER BY revision DESC LIMIT 1""",
                (exploration_id, actor, revision, revision),
            ).fetchone()
            if row is None:
                raise ExplorationError("NOT_FOUND")
            if v2 and schema != "1.8":
                raise ExplorationError("EXPLORATION_MIGRATION_REQUIRED")
            snapshot = decode_snapshot(row["snapshot_json"])
            is_v2 = "snapshot_version" in snapshot
            if is_v2 and schema != "1.8":
                raise ExplorationError("INVALID_SNAPSHOT")
            if is_v2 and not v2:
                raise ExplorationError("SNAPSHOT_VERSION_REQUIRED")
            references = []
            all_available = True
            for ref in snapshot["references"]:
                status = _reference_status(conn, ref, actor)
                visible = ref | {"status": status}
                if status != "available":
                    visible.pop("reason")
                    all_available = False
                references.append(visible)
            result = _receipt(exploration_id, row["revision"], row["event_id"]) | {
                "saved_at": row["saved_at"], "references": references,
                "stop_note": snapshot["stop_note"] if all_available else None,
                "stop_note_reason": None if all_available else "dependency_unavailable",
            }
            if v2:
                statuses = {ref["asset_id"]: ref["status"] for ref in references}
                relations = []
                for rel in snapshot.get("relations", []):
                    if any(statuses[rel[k]] != "available" for k in ("from_asset_id", "to_asset_id")):
                        relations.append({k: rel[k] for k in ("relation_id", "from_asset_id", "to_asset_id")} |
                                         {"reason_code": "dependency_unavailable"})
                    else:
                        relations.append(rel.copy())
                result.update(snapshot_version=2 if is_v2 else 1, relations=relations)
            return result

    def list_current(self, actor, *, limit=20):
        _validate_actor(actor)
        if type(limit) is not int or not 1 <= limit <= 20:
            raise ExplorationError("INVALID_ARGUMENTS")
        with read_snapshot(self._path) as conn:
            require_exploration_schema(conn)
            return [dict(row) for row in conn.execute(
                """SELECT e.exploration_id, e.revision, e.saved_at
                   FROM exploration_revisions e
                   WHERE e.actor = ? AND e.revision = (
                       SELECT MAX(head.revision) FROM exploration_revisions head
                       WHERE head.exploration_id = e.exploration_id
                   )
                   ORDER BY e.rowid DESC LIMIT ?""",
                (actor, limit),
            )]
