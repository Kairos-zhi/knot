"""Read-only claim-scoped confirmation views with atom-level cross-checks."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3

from .support_view import compute_support


STATUSES = ("confirmed", "revoked", "unconfirmed")


def _claim_id(value):
    if not isinstance(value, str) or not value:
        raise ValueError("claim_id must be a non-empty string")


def _views(conn, at, claim_ids, status):
    # Fix the database view before reading events, snapshots and atom inputs.
    candidates = conn.execute(
        "SELECT claim_id,source_label,atom FROM claims_candidates "
        "ORDER BY source_label,claim_id"
    ).fetchall()
    if claim_ids is not None:
        wanted = set(claim_ids)
        if wanted - {row[0] for row in candidates}:
            raise ValueError("claim does not exist")
        candidates = [row for row in candidates if row[0] in wanted]

    events = {}
    for event_id, subject in conn.execute(
        "SELECT event_id,subject FROM history_events WHERE event_type='user_confirm' "
        "ORDER BY event_id"
    ):
        events.setdefault(subject, []).append(event_id)
    snapshots = dict(conn.execute(
        """SELECT event_id,is_eligible FROM (
               SELECT event_id,is_eligible,ROW_NUMBER() OVER (
                   PARTITION BY event_id ORDER BY snapshot_time DESC,rowid DESC
               ) AS rn FROM eligible_snapshots WHERE snapshot_time<=?
           ) WHERE rn=1""", (at,),
    ))
    mappings = {}
    for event_id, atom in conn.execute("SELECT event_id,atom FROM event_atom_map"):
        mappings.setdefault(event_id, []).append(atom)
    atom_views = compute_support(conn, at)["atoms"]
    claims = []
    for claim_id, label, atom in candidates:
        confirmations = events.get(claim_id, [])
        if len(confirmations) > 1:
            raise ValueError("claim has multiple confirmation events; refusing to choose")
        if atom not in atom_views:
            raise ValueError("claim atom is outside the active rule vocabulary (version 1)")
        state, roots = "unconfirmed", []
        if confirmations:
            event_id = confirmations[0]
            if event_id not in snapshots:
                raise ValueError("confirmation event has no trust snapshot at or before at")
            if snapshots[event_id] not in (0, 1):
                raise ValueError("confirmation event has an invalid trust snapshot")
            if mappings.get(event_id) != [atom]:
                raise ValueError("confirmation event must map to exactly the claim atom")
            if snapshots[event_id] == 1:
                state, roots = "confirmed", [[event_id]]
            else:
                state = "revoked"
        if status is None or state == status:
            claims.append(dict(claim_id=claim_id, source_label=label, atom=atom, at=at,
                               status=state, boolean=state == "confirmed",
                               minimal_roots=roots, atom_view=atom_views[atom]))
    return dict(at=at, counts={s: sum(c["status"] == s for c in claims) for s in STATUSES},
                claims=claims)


def claim_support_many(conn, *, at: int, claim_ids: list[str] | None = None,
                       status: str | None = None) -> dict:
    """Read one consistent view; join an existing transaction without ending it.

    Otherwise own a BEGIN read transaction and release it with ROLLBACK on
    success or failure. Never open another connection or change row_factory.
    Counts describe the returned claims, after both optional filters.
    """
    if type(at) is not int or not 0 <= at <= 2**63 - 1:
        raise ValueError("at must be a non-negative SQLite integer timestamp")
    if status is not None and status not in STATUSES:
        raise ValueError("status must be confirmed, revoked or unconfirmed")
    if claim_ids is not None:
        if not isinstance(claim_ids, list):
            raise ValueError("claim_ids must be a list of claim IDs or None")
        for value in claim_ids:
            _claim_id(value)
    owned = not conn.in_transaction
    if owned:
        conn.execute("BEGIN")
    try:
        return _views(conn, at, claim_ids, status)
    finally:
        if owned:
            conn.rollback()


def claim_support(conn, claim_id: str, *, at: int) -> dict:
    """Return the candidate's own confirmation truth, never inferred from atom."""
    _claim_id(claim_id)
    return claim_support_many(conn, at=at, claim_ids=[claim_id])["claims"][0]


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        print(json.dumps({"error": message}, ensure_ascii=True))
        self.exit(1)


def main():
    parser = _Parser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--at", required=True, type=int)
    parser.add_argument("--claim")
    parser.add_argument("--only", choices=STATUSES)
    args = parser.parse_args()
    if args.claim is not None and args.only is not None:
        parser.error("--only is a batch filter and cannot be combined with --claim")
    try:
        uri = Path(args.db).expanduser().resolve().as_uri() + "?mode=ro"
        with closing(sqlite3.connect(uri, uri=True)) as conn:
            result = (claim_support(conn, args.claim, at=args.at) if args.claim is not None
                      else claim_support_many(conn, at=args.at, status=args.only))
    except (OSError, ValueError, sqlite3.Error) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=True))
        return 1
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
