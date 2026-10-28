"""Deterministic, SELECT-only support-family projection over the frozen core."""

from .frontier17 import evaluate_scc_full
from .frontier17_db import load_state


def compute_support(conn, snapshot_time, *, rule_version=1) -> dict:
    """Return native JSON-compatible support at T, using carry-forward state.

    The caller owns the connection and its consistent read transaction.
    Only source-event IDs are projected; event/asset bodies are never read.
    Unconditionally reachable atoms have the empty support set, shown as [[]].
    """
    parameters = (("snapshot_time", snapshot_time), ("rule_version", rule_version))
    for name, value in parameters:
        if type(value) is not int:
            raise TypeError(f"{name} must be an int")
    atoms, mapping, eligible, rules = load_state(
        conn, snapshot_time, rule_version=rule_version,
    )
    support = evaluate_scc_full(atoms, mapping, eligible, rules)
    return {
        "snapshot_time": snapshot_time,
        "rule_version": rule_version,
        "atoms": {
            atom: {
                "boolean": bool(support[atom]),
                "minimal_roots": sorted(
                    (sorted(roots) for roots in support[atom]),
                    key=lambda roots: (len(roots), roots),
                ),
            }
            for atom in atoms
        },
        "eligible_count": len(eligible),
    }
