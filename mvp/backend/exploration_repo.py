"""Owner-scoped, revisioned exploration checkpoints in the shared Knot database."""

from contextlib import closing
from hashlib import sha256
import json
from pathlib import Path
import re
import sqlite3
import time
from uuid import uuid4

from mvp.text_policy import ASSET_ID_PATTERN, SHA256_PATTERN

from .migrate_schema_v1_7 import require_exploration_schema
from .timeline_query import read_snapshot


_MAX_REVISION = 2**63 - 1


class ExplorationError(ValueError):
    """A fixed, recoverable exploration operation error."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _validate_uuid(value):
    if type(value) is not str or not re.fullmatch(ASSET_ID_PATTERN, value):
        raise ExplorationError("INVALID_ARGUMENTS")


def _validate_revision(value, minimum):
    if type(value) is not int or not minimum <= value <= _MAX_REVISION:
        raise ExplorationError("INVALID_ARGUMENTS")


def _validate_text(value, limit):
    if type(value) is not str or len(value) > limit:
        raise ExplorationError("INVALID_ARGUMENTS")
    try:
        raw = value.encode("utf-8")
    except UnicodeEncodeError:
        raise ExplorationError("INVALID_ARGUMENTS") from None
    if len(raw) > limit or any(byte == 127 or (byte < 32 and byte not in (9, 10, 13)) for byte in raw):
        raise ExplorationError("INVALID_ARGUMENTS")


def _validate_actor(actor):
    _validate_text(actor, 256)
    if not actor.strip() or any(char in actor for char in "\t\r\n"):
        raise ExplorationError("INVALID_ARGUMENTS")


def _snapshot(references, stop_note):
    if type(references) is not list or len(references) > 32:
        raise ExplorationError("INVALID_ARGUMENTS")
    if stop_note is not None:
        _validate_text(stop_note, 2048)
    entries, seen = [], set()
    required = {"asset_id", "expected_content_hash", "disposition"}
    for ref in references:
        if type(ref) is not dict or ref.keys() - (required | {"reason"}) or not required <= ref.keys():
            raise ExplorationError("INVALID_ARGUMENTS")
        asset_id, digest, disposition = ref["asset_id"], ref["expected_content_hash"], ref["disposition"]
        _validate_uuid(asset_id)
        if (asset_id in seen or type(digest) is not str or not re.fullmatch(SHA256_PATTERN, digest)
                or type(disposition) is not str or disposition not in ("selected", "excluded")):
            raise ExplorationError("INVALID_ARGUMENTS")
        seen.add(asset_id)
        reason = ref.get("reason")
        if reason is not None:
            _validate_text(reason, 512)
        entries.append({"asset_id": asset_id, "expected_content_hash": digest.lower(),
                        "disposition": disposition, "reason": reason})
    return {"references": entries, "stop_note": stop_note}


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
        _validate_actor(actor)
        _validate_uuid(exploration_id)
        _validate_uuid(request_key)
        _validate_revision(expected_revision, 0)
        snapshot = _snapshot(references, stop_note)
        snapshot_json = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        request = json.dumps([exploration_id, expected_revision, snapshot_json], ensure_ascii=False)
        digest = sha256(request.encode("utf-8")).hexdigest()

        with closing(sqlite3.connect(self._uri, uri=True)) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            require_exploration_schema(conn)
            head = conn.execute(
                """SELECT actor, revision FROM exploration_revisions
                   WHERE exploration_id = ? ORDER BY revision DESC LIMIT 1""",
                (exploration_id,),
            ).fetchone()
            if (head is None and expected_revision != 0) or (head is not None and head[0] != actor):
                raise ExplorationError("NOT_FOUND")
            replay = conn.execute(
                """SELECT exploration_id, revision, event_id, request_digest
                   FROM exploration_revisions WHERE actor = ? AND request_key = ?""",
                (actor, request_key),
            ).fetchone()
            if replay is not None:
                if replay[3] != digest:
                    raise ExplorationError("IDEMPOTENCY_CONFLICT")
                return _receipt(*replay[:3])

            current = head[1] if head is not None else 0
            if expected_revision != current or current == _MAX_REVISION:
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
        _validate_actor(actor)
        _validate_uuid(exploration_id)
        if revision is not None:
            _validate_revision(revision, 1)
        with read_snapshot(self._path) as conn:
            require_exploration_schema(conn)
            row = conn.execute(
                """SELECT revision, event_id, saved_at, snapshot_json FROM exploration_revisions
                   WHERE exploration_id = ? AND actor = ? AND (? IS NULL OR revision = ?)
                   ORDER BY revision DESC LIMIT 1""",
                (exploration_id, actor, revision, revision),
            ).fetchone()
            if row is None:
                raise ExplorationError("NOT_FOUND")
            snapshot = json.loads(row["snapshot_json"])
            references = []
            all_available = True
            for ref in snapshot["references"]:
                status = _reference_status(conn, ref, actor)
                visible = ref | {"status": status}
                if status != "available":
                    visible.pop("reason")
                    all_available = False
                references.append(visible)
            return _receipt(exploration_id, row["revision"], row["event_id"]) | {
                "saved_at": row["saved_at"], "references": references,
                "stop_note": snapshot["stop_note"] if all_available else None,
                "stop_note_reason": None if all_available else "dependency_unavailable",
            }

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
