"""User-driven candidate confirmation, revocation and explicit restoration."""

import argparse
from contextlib import nullcontext
import json
import sqlite3
import time
from uuid import uuid4

from .asset_repo import AssetRepo


def _vocabulary(conn):
    atoms = set()
    for row in conn.execute("SELECT head,body FROM horn_rules WHERE active=1 AND rule_version=1"):
        body = json.loads(row["body"])
        if not isinstance(body, list) or not all(isinstance(atom, str) for atom in body):
            raise ValueError("rule body must be a JSON array of atom strings")
        atoms.update((row["head"], *body))
    return atoms


def _latest_snapshot(conn, event_id):
    return conn.execute(
        "SELECT * FROM eligible_snapshots WHERE event_id=? "
        "ORDER BY snapshot_time DESC,rowid DESC LIMIT 1", (event_id,),
    ).fetchone()


def _append_snapshot(conn, event_id, now, *, eligible, label):
    snapshot_id = str(uuid4())
    try:
        conn.execute(
            "INSERT INTO eligible_snapshots "
            "(snapshot_id,snapshot_time,event_id,is_eligible,trust_level,reason) "
            "VALUES (?,?,?,?,?,?)",
            (snapshot_id, now, event_id, int(eligible), "trusted" if eligible else "revoked",
             f"claim {label} {'accepted' if eligible else 'rejected'}"),
        )
    except sqlite3.IntegrityError as exc:
        existing = conn.execute(
            "SELECT * FROM eligible_snapshots WHERE snapshot_time=? AND event_id=?",
            (now, event_id),
        ).fetchone()
        latest = _latest_snapshot(conn, event_id)
        if (existing is not None and latest is not None
                and existing["snapshot_id"] == latest["snapshot_id"]
                and existing["is_eligible"] == int(eligible)):
            return existing["snapshot_id"], False
        if existing is not None:
            raise ValueError("conflicting review at the same snapshot_time; use a later now") from exc
        raise
    return snapshot_id, True


def _review(conn, claim_id, decision, now):
    if conn.execute("SELECT 1 FROM schema_version WHERE version='1.4'").fetchone() is None:
        raise ValueError("schema v1.4 required; migrate explicitly")
    claim = conn.execute("SELECT * FROM claims_candidates WHERE claim_id=?", (claim_id,)).fetchone()
    if claim is None:
        raise ValueError("claim does not exist")
    atom = claim["atom"]
    if atom not in _vocabulary(conn):
        raise ValueError("claim atom is outside the active rule vocabulary (version 1)")
    result = dict(claim_id=claim_id, decision=decision, status=None,
                  event_id=None, snapshot_id=None, atom=atom)
    events = conn.execute(
        "SELECT event_id,event_time FROM history_events "
        "WHERE event_type='user_confirm' AND subject=?", (claim_id,),
    ).fetchall()
    if len(events) > 1:
        raise ValueError("claim has multiple confirmation events; refusing to choose or repair")
    eligible = decision == "accept"
    if events:
        event_id = events[0]["event_id"]
        mapping = conn.execute(
            "SELECT atom FROM event_atom_map WHERE event_id=?", (event_id,),
        ).fetchall()
        if len(mapping) != 1 or mapping[0]["atom"] != atom:
            raise ValueError("confirmation event must map to exactly the claim atom")
        latest = _latest_snapshot(conn, event_id)
        if latest is None or latest["is_eligible"] not in (0, 1):
            raise ValueError("confirmation event has no valid trust snapshot")
        if now < max(latest["snapshot_time"], events[0]["event_time"]):
            raise ValueError("review time precedes existing confirmation history")
        result.update(event_id=event_id, snapshot_id=latest["snapshot_id"])
        if latest["is_eligible"] == int(eligible):
            result["status"] = "already_accepted" if eligible else "already_rejected"
            return result  # No UPDATE, even reviewed_at stays unchanged.
        status = "restored" if eligible else "revoked"
    elif not eligible:
        if claim["user_response"] == "reject":
            result["status"] = "already_rejected"
            return result
        conn.execute(
            "UPDATE claims_candidates SET unverified=1,user_response='reject',reviewed_at=? "
            "WHERE claim_id=?", (now, claim_id),
        )
        result["status"] = "revoked"
        return result
    else:
        # Preserve the candidate's original reference JSON, including NULL.
        if claim["support_sources"] is not None:
            references = json.loads(claim["support_sources"])
            if not isinstance(references, list) or not all(isinstance(ref, str) for ref in references):
                raise ValueError("support_sources must be a JSON array of event IDs or NULL")
        event_id = str(uuid4())
        payload = json.dumps(dict(claim_type=claim["claim_type"], source_label=claim["source_label"],
                                  atom=atom, decision="accept"), ensure_ascii=True)
        conn.execute(
            "INSERT INTO history_events "
            "(event_id,event_type,subject,source,event_time,recorded_at,evidence_refs,payload_json) "
            "VALUES (?,'user_confirm',?,'user_review',?,?,?,?)",
            (event_id, claim_id, now, now, claim["support_sources"], payload),
        )
        conn.execute(
            "INSERT INTO event_atom_map (event_id,atom,origin,created_at) "
            "VALUES (?,?,'user_confirm',?)", (event_id, atom, now),
        )
        result["event_id"] = event_id
        status = "confirmed"
    snapshot_id, created = _append_snapshot(
        conn, event_id, now, eligible=eligible, label=claim["source_label"],
    )
    result.update(snapshot_id=snapshot_id)
    if not created:
        result["status"] = "already_accepted" if eligible else "already_rejected"
        return result
    conn.execute(
        "UPDATE claims_candidates SET unverified=?,user_response=?,reviewed_at=? WHERE claim_id=?",
        (0 if eligible else 1, decision, now, claim_id),
    )
    result["status"] = status
    return result


def review_claim(repo, claim_id: str, *, decision: str, now: int | None = None) -> dict:
    """Own one immediate transaction on this repository's single connection."""
    if not isinstance(claim_id, str) or not claim_id:
        raise ValueError("claim_id must be a non-empty string")
    if decision not in ("accept", "reject"):
        raise ValueError("decision must be accept or reject")
    if now is not None and (type(now) is not int or not 0 <= now <= 2**63 - 1):
        raise ValueError("now must be a non-negative SQLite integer timestamp")
    with (repo.session() if repo._scoped_connection is None else nullcontext(repo)):
        if repo._in_transaction_scope:
            raise ValueError("review_claim owns its transaction; active transactions cannot nest")
        with repo.transaction(), repo._connection() as conn:
            # Resolve default time after acquiring the write lock, not while queued.
            instant = int(time.time() * 1000) if now is None else now
            return _review(conn, claim_id, decision, instant)


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        print(json.dumps({"error": message}, ensure_ascii=True))
        self.exit(1)


def main():
    parser = _Parser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--claim", required=True)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--accept", action="store_true")
    choice.add_argument("--reject", action="store_true")
    args = parser.parse_args()
    try:
        result = review_claim(AssetRepo(args.db), args.claim,
                              decision="accept" if args.accept else "reject")
    except (OSError, ValueError, sqlite3.Error) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=True))
        return 1
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
