"""Frozen-model counts, differential checks and SELECT-only DB adaptation."""

import ast
from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
from random import Random
import sqlite3
import sys
from types import FunctionType

import pytest

from mvp.backend import frontier17 as port
from mvp.backend.frontier17_db import (
    evaluate_from_db, incremental_from_db, load_state,
)


REFERENCE = Path(__file__).with_name("fixtures") / "frontier17_reference_20261027.py"
EXPECTED = (16384, 6000, 7, 9182, 18446, 14144)


@pytest.fixture(scope="module")
def reference():
    name = "knot_frontier17_frozen_reference"
    spec = importlib.util.spec_from_file_location(name, REFERENCE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    yield module
    del sys.modules[name]


def run_model(reference, implementation):
    """Run the frozen test bodies against selected core globals, unchanged."""
    namespace = dict(implementation.__dict__)
    exhaustive = FunctionType(reference.test_exhaustive.__code__, namespace)
    random = FunctionType(reference.test_random.__code__, namespace)
    counterexamples = FunctionType(reference.test_counterexamples.__code__, namespace)
    count, ex_recomputes = exhaustive()
    rand, recomputes, candidates = random()
    cex = counterexamples()
    return count, rand, cex, recomputes, candidates, ex_recomputes


def test_byte_pin_purity_and_frozen_function_bodies():
    assert hashlib.sha256(REFERENCE.read_bytes()).hexdigest() == (
        "056528f4e11ce652084ae5694b9eeda23ef44c9bd2d782b352ed49b47e76b1cd"
    )
    code = Path(port.__file__).read_text(encoding="utf-8")
    for prohibited in ("open(", "sqlite3", "requests", "print(", "input("):
        assert prohibited not in code
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            assert all(n.name.split(".")[0] in sys.stdlib_module_names for n in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.module.split(".")[0] in sys.stdlib_module_names
    original = ast.parse(REFERENCE.read_text(encoding="utf-8"))
    before = {n.name: ast.dump(n) for n in original.body
              if isinstance(n, (ast.FunctionDef, ast.ClassDef))}
    after = {n.name: ast.dump(n) for n in tree.body
             if isinstance(n, (ast.FunctionDef, ast.ClassDef))}
    assert after and all(value == before[name] for name, value in after.items())
    assert set(after) == {name for name in before if not name.startswith("test_")
                          and name != "main"}


def test_frozen_baseline_and_migrated_double_run(reference):
    baseline = run_model(reference, reference)
    first = run_model(reference, port)
    second = run_model(reference, port)
    assert baseline == first == second == EXPECTED
    count, rand, cex, recomputes, candidates, ex_recomputes = first
    assert count + rand + cex == 22391
    print(f"Exhaustive transition+release comparisons: {count} PASS")
    print(f"Random multi-atom transition+release comparisons: {rand} PASS")
    print(f"Targeted cross-layer counterexamples: {cex} PASS")
    print(f"Random SCC recomputations: {recomputes} / {candidates} candidate SCC evaluations")
    print(f"Exhaustive SCC recomputations (count, not wall clock): {ex_recomputes}")
    print("ALL ROUND-17 MODEL ASSERTIONS PASSED; frozen baseline + two port runs equal")


def test_differential_256_cases(reference):
    rnd = Random(170027)
    for _ in range(256):
        atoms = tuple(f"a{i}" for i in range(rnd.randint(3, 5)))
        events = tuple(f"e{i}" for i in range(rnd.randint(2, 5)))
        mapping = {e: rnd.choice(atoms) for e in events}
        specs = [(rnd.choice(atoms), tuple(sorted(rnd.sample(
            atoms, rnd.randint(0, min(3, len(atoms))),
        )))) for _ in range(rnd.randint(0, 10))]
        old_es = frozenset(e for e in events if rnd.randrange(2))
        new_es = frozenset(e for e in events if rnd.randrange(2))
        old_policy = {a: (bool(rnd.randrange(2)), bool(rnd.randrange(2))) for a in atoms}
        new_policy = {a: (bool(rnd.randrange(2)), bool(rnd.randrange(2))) for a in atoms}
        refresh = bool(rnd.randrange(2))
        outputs = []
        for implementation in (reference, port):
            rules = tuple(implementation.Rule(head, body) for head, body in specs)
            old = implementation.evaluate_scc_full(atoms, mapping, old_es, rules)
            incremental = implementation.incremental_scc(
                atoms, mapping, old_es, new_es, rules, old,
            )
            old_release = implementation.released(old, old_policy)
            new_release = implementation.released(incremental[0], new_policy)
            outputs.append((
                incremental, new_release,
                implementation.notification_delta(old_release, new_release),
                implementation.authorized_outbox(old_release, new_release, refresh),
            ))
        assert outputs[0] == outputs[1]
    print("Differential cases: 256/256 PASS; incremental/released/delta/outbox")


@pytest.fixture
def db(tmp_path):
    schema = Path(__file__).parents[1] / "backend/schema_v1.sql"
    with closing(sqlite3.connect(tmp_path / "state.db")) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
        # Version 7 isolates these tests from the existing v1 seed rules.
        conn.executemany(
            "INSERT INTO horn_rules(head,body,rule_version,active) VALUES (?,?,?,?)",
            [("p", '["x"]', 7, 1), ("p", '["z"]', 7, 1),
             ("q", '["p"]', 7, 1), ("disabled", "[]", 7, 0),
             ("other_version", "[]", 8, 1)],
        )
        conn.executemany(
            """INSERT INTO history_events(event_id,event_type,event_time,recorded_at)
               VALUES (?,'test',0,0)""", [("ex",), ("ez",)],
        )
        conn.executemany(
            "INSERT INTO event_atom_map VALUES (?,?,'user',0)",
            [("ex", "x"), ("ez", "z")],
        )
        conn.executemany(
            """INSERT INTO eligible_snapshots
               (snapshot_id,snapshot_time,event_id,is_eligible) VALUES (?,?,?,?)""",
            [("o-x", 10, "ex", 1), ("o-z", 10, "ez", 1),
             ("n-x", 20, "ex", 0), ("n-z", 20, "ez", 1)],
        )
        conn.commit()
        yield conn


def test_db_snapshots_active_version_and_select_only(db):
    def readonly(action, arg1, arg2, database, trigger):
        return sqlite3.SQLITE_OK if action in {
            sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION,
        } else sqlite3.SQLITE_DENY

    db.set_authorizer(readonly)
    try:
        atoms, mapping, eligible, rules = load_state(db, 20, rule_version=7)
        assert atoms == ("p", "q", "x", "z")
        assert mapping == {"ex": "x", "ez": "z"} and eligible == {"ez"}
        assert len(rules) == 3
        old = evaluate_from_db(db, 10, rule_version=7)
        new = evaluate_from_db(db, 20, rule_version=7)
        assert incremental_from_db(db, 20, 10, rule_version=7) == new
        assert old["p"] == frozenset({frozenset({"ex"}), frozenset({"ez"})})
        assert new["p"] == frozenset({frozenset({"ez"})})
        assert new["q"] == new["p"]
        assert not {"disabled", "other_version"} & new.keys()
        assert load_state(db, -1, rule_version=8)[0] == ("other_version",)
    finally:
        db.set_authorizer(None)
    print("DB case 1 PASS: snapshots/active/version/read-only; incremental == full")


def test_db_mapping_is_authoritative(db):
    before = evaluate_from_db(db, 20, rule_version=7)
    db.execute("UPDATE event_atom_map SET atom='x' WHERE event_id='ez'")
    after = evaluate_from_db(db, 20, rule_version=7)
    assert before != after and not before["x"] and after["x"]
    assert before["z"] and not after["z"]
    assert incremental_from_db(db, 20, 10, rule_version=7) == after
    with pytest.raises(ValueError, match="authoritative"):
        evaluate_from_db(db, 20, event_atom={"ez": "z"}, rule_version=7)
    print("DB case 2 PASS: table ez:z -> ez:x changes support; caller override rejected")


def test_db_multi_atom_event_explicit_error(db):
    db.execute("INSERT INTO event_atom_map VALUES ('ez','x','user',0)")
    with pytest.raises(ValueError, match="one atom per event") as error:
        evaluate_from_db(db, 20, rule_version=7)
    print(f"DB case 3 PASS: ValueError: {error.value}")


def test_db_missing_mapping_and_unknown_atom_fail_explicitly(db):
    db.execute("DELETE FROM event_atom_map WHERE event_id='ez'")
    with pytest.raises(ValueError, match="no event_atom_map"):
        evaluate_from_db(db, 20, rule_version=7)
    db.execute("INSERT INTO event_atom_map VALUES ('ez','unknown','user',0)")
    with pytest.raises(ValueError, match="outside the rule vocabulary"):
        evaluate_from_db(db, 20, rule_version=7)
