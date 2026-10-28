"""Append-only history events with millisecond timestamps."""

import json
import time
import uuid

from ._db import SQLiteRepo, validate_limit


def _json_array(value):
    if value is not None and not isinstance(value, list):
        raise TypeError("event references must be lists or None")
    return json.dumps(value) if value is not None else None


class EventStore(SQLiteRepo):
    """Read/write history; JSON columns are returned as raw strings."""

    def add_event(
        self,
        event_type: str,
        subject: str = None,
        source: str = None,
        event_time: int = None,
        target_assets: list = None,
        evidence_refs: list = None,
        payload_json: str = None,
    ) -> str:
        """Append an event; reject future times without changing history."""
        recorded_at = int(time.time() * 1000)
        if event_time is None:
            event_time = recorded_at
        elif event_time > recorded_at:
            raise ValueError("event_time cannot be in the future")
        targets = _json_array(target_assets)
        evidence = _json_array(evidence_refs)
        event_id = str(uuid.uuid4())
        with self._connection() as conn:
            conn.execute(
                """INSERT INTO history_events
                   (event_id, event_type, subject, source, event_time,
                    recorded_at, target_assets, evidence_refs, payload_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event_id, event_type, subject, source, event_time,
                    recorded_at, targets, evidence, payload_json,
                ),
            )
        return event_id

    def get_event(self, event_id: str) -> dict | None:
        """Return all stored columns, or None for a missing event ID."""
        return self._one(
            "SELECT * FROM history_events WHERE event_id = ?", (event_id,)
        )

    def get_events_by_type(self, event_type: str, limit: int = 100) -> list:
        """Return matching events, newest event time first."""
        validate_limit(limit)
        return self._all(
            """SELECT * FROM history_events WHERE event_type = ?
               ORDER BY event_time DESC, rowid DESC LIMIT ?""",
            (event_type, limit),
        )

    def get_events_by_subject(self, subject: str, limit: int = 100) -> list:
        """Return matching events, newest event time first."""
        validate_limit(limit)
        return self._all(
            """SELECT * FROM history_events WHERE subject = ?
               ORDER BY event_time DESC, rowid DESC LIMIT ?""",
            (subject, limit),
        )

    def count_events(self) -> int:
        """Return the total number of events."""
        return self._one("SELECT COUNT(*) AS count FROM history_events")["count"]
