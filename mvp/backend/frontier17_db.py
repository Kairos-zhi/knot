"""SELECT-only adapters for a fixed-rule Frontier17 evaluation.

Callers own the connection and its read transaction for a consistent DB view.
event_atom_map is authoritative; the optional keyword is a consistency assertion
for compatibility with the task-card signature, never an override.
"""

import json

from .frontier17 import Rule, evaluate_scc_full, incremental_scc


def _eligible(conn, snapshot_time):
    return frozenset(r[0] for r in conn.execute(
        """SELECT event_id FROM eligible_snapshots
           WHERE snapshot_time=? AND is_eligible=1""", (snapshot_time,),
    ))


def _validate_eligible(eligible, mapping, atoms):
    for event in sorted(eligible):
        if event not in mapping:
            raise ValueError(f"eligible event has no event_atom_map row: {event}")
        if mapping[event] not in atoms:
            raise ValueError(f"eligible event atom is outside the rule vocabulary: {event}")


def load_state(conn, snapshot_time, *, event_atom=None, rule_version=1):
    """Return sorted rule atoms, DB event->atom mapping, eligible IDs and rules.

    A multi-atom event is rejected even if it is not currently eligible. Rules
    are fixed across incremental evaluation; no atom inference or backfill.
    """
    rules = []
    for head, encoded_body in conn.execute(
        """SELECT head, body FROM horn_rules WHERE active=1 AND rule_version=?
           ORDER BY rule_id""", (rule_version,),
    ):
        body = json.loads(encoded_body)
        if not isinstance(body, list) or not all(isinstance(a, str) for a in body):
            raise ValueError("rule body must be a JSON array of atom strings")
        rules.append(Rule(head, tuple(body)))
    rules = tuple(rules)
    atoms = tuple(sorted({a for r in rules for a in (r.head, *r.body)}))
    grouped = {}
    for event, atom in conn.execute(
        "SELECT event_id, atom FROM event_atom_map ORDER BY event_id, atom"
    ):
        grouped.setdefault(event, []).append(atom)
    for event, values in grouped.items():
        if len(values) != 1:
            raise ValueError(
                f"event {event!r} maps to multiple atoms {tuple(values)!r}; "
                "Frontier17 requires one atom per event"
            )
    mapping = {event: values[0] for event, values in grouped.items()}
    if event_atom is not None and event_atom != mapping:
        raise ValueError("event_atom must match the authoritative event_atom_map")
    eligible = _eligible(conn, snapshot_time)
    _validate_eligible(eligible, mapping, atoms)
    return atoms, mapping, eligible, rules


def evaluate_from_db(conn, snapshot_time, *, event_atom=None, rule_version=1):
    """Return the support dictionary; perform no writes or transaction control."""
    return evaluate_scc_full(*load_state(
        conn, snapshot_time, event_atom=event_atom, rule_version=rule_version,
    ))


def incremental_from_db(
    conn, snapshot_time, old_snapshot_time, *, event_atom=None, rule_version=1,
):
    """Recompute the old baseline, then increment eligibility under fixed rules.

    Returns only terminal support, like evaluate_from_db. Core incremental_scc
    still returns (support, recomputed_count) unchanged.
    """
    atoms, mapping, eligible, rules = load_state(
        conn, snapshot_time, event_atom=event_atom, rule_version=rule_version,
    )
    old_eligible = _eligible(conn, old_snapshot_time)
    _validate_eligible(old_eligible, mapping, atoms)
    old = evaluate_scc_full(atoms, mapping, old_eligible, rules)
    support, _ = incremental_scc(atoms, mapping, old_eligible, eligible, rules, old)
    return support
