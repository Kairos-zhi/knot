"""Support projection, carry-forward semantics and independent minimality checks."""

from contextlib import closing
import json
from pathlib import Path
from random import Random
import sqlite3

import pytest

from mvp.backend.frontier17 import boolean_closure, brute_reference
from mvp.backend.frontier17_db import load_state
from mvp.backend.support_view import compute_support


SCHEMA = Path(__file__).parents[1] / "backend/schema_v1.sql"
VERSION = 17


def initialize(conn):
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))


@pytest.fixture
def db():
    with closing(sqlite3.connect(":memory:")) as conn:
        initialize(conn)
        yield conn


def populate(conn, rules, mapping, states):
    conn.executemany(
        "INSERT INTO horn_rules(head,body,rule_version) VALUES (?,?,?)",
        [(head, json.dumps(body), VERSION) for head, body in rules],
    )
    conn.executemany(
        """INSERT INTO history_events
           (event_id,event_type,event_time,recorded_at,payload_json)
           VALUES (?,'test',0,0,'{"secret":"must-not-affect-support"}')""",
        [(event,) for event in mapping],
    )
    conn.executemany(
        "INSERT INTO event_atom_map VALUES (?,?,'user',0)", list(mapping.items()),
    )
    conn.executemany(
        """INSERT INTO eligible_snapshots
           (snapshot_id,snapshot_time,event_id,is_eligible) VALUES (?,?,?,?)""",
        [(str(i), time, event, state) for i, (time, event, state) in enumerate(states)],
    )


def check_roots(conn, time, result):
    atoms, mapping, eligible, rules = load_state(conn, time, rule_version=VERSION)
    oracle = brute_reference(atoms, mapping, eligible, rules)
    for atom, value in result["atoms"].items():
        roots = {frozenset(root) for root in value["minimal_roots"]}
        assert roots == set(oracle[atom])
        assert value["boolean"] is bool(value["minimal_roots"])
        for root in roots:
            # Sufficient on its own, including the empty root for Horn facts.
            assert atom in boolean_closure({mapping[e] for e in root}, rules)
            for event in root:
                # Every single-element deletion invalidates this proof.
                assert atom not in boolean_closure(
                    {mapping[e] for e in root - {event}}, rules,
                )


def test_handcrafted_roots_shape_order_stability_and_minimality(db):
    mapping = {"ev-b": "x", "ev-a": "x", "ev-z": "y", "ev-y": "z"}
    populate(db, [("p", ["x"]), ("p", ["y", "z"]), ("q", ["p"])],
             mapping, [(10, e, 1) for e in mapping])
    first = compute_support(db, 15, rule_version=VERSION)
    second = compute_support(db, 15, rule_version=VERSION)
    assert set(first) == {"snapshot_time", "rule_version", "atoms", "eligible_count"}
    assert type(first["snapshot_time"]) is type(first["rule_version"]) is int
    assert first["eligible_count"] == 4 and type(first["eligible_count"]) is int
    assert list(first["atoms"]) == ["p", "q", "x", "y", "z"]
    for value in first["atoms"].values():
        assert set(value) == {"boolean", "minimal_roots"}
        assert type(value["boolean"]) is bool
        assert type(value["minimal_roots"]) is list
    assert first["atoms"]["p"]["minimal_roots"] == [
        ["ev-a"], ["ev-b"], ["ev-y", "ev-z"],
    ]
    assert json.loads(json.dumps(first)) == first
    first_bytes = json.dumps(first, sort_keys=False).encode()
    second_bytes = json.dumps(second, sort_keys=False).encode()
    assert first_bytes == second_bytes
    check_roots(db, 15, first)
    print("AC-6 PASS: two JSON byte strings equal")
    print("AC-7 PASS: brute equality; every root sufficient; removing any event fails")


def test_support_tracks_silence_revocation_and_explicit_restore(db):
    populate(db, [("p", ["x"])], {"ex": "x"},
             [(10, "ex", 1), (20, "ex", 0), (40, "ex", 1)])
    for time, supported in ((9, False), (10, True), (15, True), (20, False),
                            (30, False), (35, False), (40, True), (50, True)):
        result = compute_support(db, time, rule_version=VERSION)
        assert result["atoms"]["p"] == {
            "boolean": supported, "minimal_roots": [["ex"]] if supported else [],
        }


def test_random_200_cases_against_brute_and_minimality():
    rnd = Random(170028)
    for _ in range(200):
        atoms = [f"a{i}" for i in range(rnd.randint(1, 5))]
        mapping = {f"e{i}": rnd.choice(atoms) for i in range(rnd.randint(0, 4))}
        # Identity rules expose the entire vocabulary without adding facts.
        rules = [(a, [a]) for a in atoms] + [
            (rnd.choice(atoms), rnd.sample(atoms, rnd.randint(0, len(atoms))))
            for _ in range(rnd.randint(0, 8))
        ]
        states = [(time, event, rnd.randrange(2)) for event in mapping
                  for time in rnd.sample([0, 10, 20, 30], rnd.randint(0, 4))]
        with closing(sqlite3.connect(":memory:")) as conn:
            initialize(conn)
            populate(conn, rules, mapping, states)
            time = rnd.choice([-1, 0, 5, 10, 15, 20, 25, 30, 40])
            result = compute_support(conn, time, rule_version=VERSION)
            latest = {}
            for ordinal, (when, event, state) in enumerate(states):
                previous = latest.get(event, (-2, -1, 0))[:2]
                if when <= time and (when, ordinal) > previous:
                    latest[event] = (when, ordinal, state)
            expected_eligible = {e for e, (_, _, state) in latest.items() if state == 1}
            assert load_state(conn, time, rule_version=VERSION)[2] == expected_eligible
            check_roots(conn, time, result)
    print("AC-8 PASS: 200/200 random small models; brute equality + minimality")


def test_empty_rules_and_unfounded_atoms(db):
    assert compute_support(db, 10, rule_version=VERSION) == {
        "snapshot_time": 10, "rule_version": VERSION, "atoms": {}, "eligible_count": 0,
    }
    populate(db, [("p", ["x"]), ("x", ["p"])], {}, [])
    result = compute_support(db, 10, rule_version=VERSION)
    assert all(v == {"boolean": False, "minimal_roots": []}
               for v in result["atoms"].values())


def test_empty_facts_and_transitive_empty_support(db):
    # Facts and all conclusions reachable from them have the empty support set.
    populate(db, [("p", []), ("q", ["p"]), ("unfounded", ["x"])], {}, [])
    result = compute_support(db, 0, rule_version=VERSION)
    for atom in ("p", "q"):
        assert result["atoms"][atom] == {"boolean": True, "minimal_roots": [[]]}
    assert result["atoms"]["unfounded"] == {"boolean": False, "minimal_roots": []}
    check_roots(db, 0, result)
    defaults = compute_support(db, 0)
    for atom in ("question", "evidence", "counterexample", "decision",
                 "open_question", "support_relation"):
        assert defaults["atoms"][atom] == {"boolean": True, "minimal_roots": [[]]}
    assert defaults["atoms"]["conditional_theorem"]["boolean"] is False


def test_empty_root_dominates_nonempty_roots(db):
    populate(db, [("p", []), ("p", ["x"])], {"e1": "x"}, [(10, "e1", 1)])
    result = compute_support(db, 10, rule_version=VERSION)
    assert result["atoms"]["p"] == {"boolean": True, "minimal_roots": [[]]}
    assert result["atoms"]["x"]["minimal_roots"] == [["e1"]]
    check_roots(db, 10, result)
    print("AC-10b PASS: p <- [] and p <- x; M(p)=[[]], M(x)=[[e1]]")


def test_active_rule_version_and_private_text_not_used(db):
    populate(db, [("p", ["x"])], {"e": "x"}, [(10, "e", 1)])
    db.execute(
        "INSERT INTO horn_rules(head,body,rule_version,active) "
        "VALUES ('hidden','[]',17,0)"
    )
    db.execute(
        "INSERT INTO horn_rules(head,body,rule_version) VALUES ('other','[]',18)"
    )
    before_changes = db.total_changes
    denied = []

    def readonly(action, arg1, arg2, database, trigger):
        allowed = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION}
        if action not in allowed:
            denied.append(action)
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_READ and arg1 in {"assets", "history_events"}:
            denied.append((arg1, arg2))
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    db.set_authorizer(readonly)
    try:
        result = compute_support(db, 15, rule_version=VERSION)
        assert set(result["atoms"]) == {"p", "x"}
        assert "must-not-affect-support" not in json.dumps(result)
    finally:
        db.set_authorizer(None)
    assert denied == [] and db.total_changes == before_changes


@pytest.mark.parametrize("case,message", [
    ("missing", "no event_atom_map"),
    ("outside", "outside the rule vocabulary"),
    ("multi", "one atom per event"),
])
def test_invalid_mapping_paths(db, case, message):
    populate(db, [("p", ["x"])], {"e": "x"}, [(10, "e", 1)])
    if case == "missing":
        db.execute("DELETE FROM event_atom_map WHERE event_id='e'")
    elif case == "outside":
        db.execute("UPDATE event_atom_map SET atom='outside' WHERE event_id='e'")
    else:
        db.execute("INSERT INTO event_atom_map VALUES ('e','p','user',0)")
    with pytest.raises(ValueError, match=message):
        compute_support(db, 15, rule_version=VERSION)


@pytest.mark.parametrize("time,version", [(True, VERSION), (1.5, VERSION), (10, True)])
def test_native_integer_metadata(db, time, version):
    with pytest.raises(TypeError, match="must be an int"):
        compute_support(db, time, rule_version=version)
