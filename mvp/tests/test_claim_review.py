"""Confirmation facts, trust transitions, same-time conflicts and atomicity."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import threading

import pytest

from mvp.backend import claim_review as review
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.init_db import init_database
from mvp.backend.support_view import compute_support

ROOT = Path(__file__).resolve().parents[2]


class Repo(AssetRepo, EventStore):
    pass


@pytest.fixture
def repo(tmp_path):
    path = tmp_path / "candidate #%.db"
    assert init_database(str(path))["status"] == "created"
    repo = Repo(path)
    data = b"T17-01 T17-02 T17-03 T17-04 T17-05"
    asset = repo.add_asset(hashlib.sha256(data).hexdigest(), "text/markdown", content_blob=data)
    repo.add_event("import", subject=asset, event_time=0)
    assert extract_claims(repo, write=True)["inserted"] == 5
    return repo


def claim(repo, label="T17-01"):
    return repo._one("SELECT * FROM claims_candidates WHERE source_label=?", (label,))


def rows(repo, table):
    return repo._all(f'SELECT * FROM "{table}" ORDER BY 1')


def relevant(repo):
    return {table: rows(repo, table) for table in (
        "history_events", "event_atom_map", "eligible_snapshots", "claims_candidates",
    )}


def counts(repo):
    return {table: len(rows(repo, table)) for table in (
        "history_events", "event_atom_map", "eligible_snapshots",
    )}


def support(repo, instant):
    with repo._connection() as conn:
        return compute_support(conn, instant)


def test_confirm_revoke_silence_restore_full_timeline(repo):
    initial = claim(repo)
    before = support(repo, 100)
    assert before["atoms"][initial["atom"]] == dict(boolean=False, minimal_roots=[])
    confirmed = review.review_claim(repo, initial["claim_id"], decision="accept", now=100)
    assert set(confirmed) == {"claim_id", "decision", "status", "event_id", "snapshot_id", "atom"}
    assert confirmed["status"] == "confirmed"
    event = repo._one("SELECT * FROM history_events WHERE event_id=?", (confirmed["event_id"],))
    assert (event["event_type"], event["subject"], event["source"], event["event_time"], event["recorded_at"]) == (
        "user_confirm", initial["claim_id"], "user_review", 100, 100,
    )
    assert event["evidence_refs"] == initial["support_sources"]
    assert json.loads(event["payload_json"]) == dict(
        claim_type="relation", source_label="T17-01", atom="conditional_theorem", decision="accept",
    )
    assert rows(repo, "event_atom_map") == [dict(event_id=event["event_id"], atom=initial["atom"],
                                               origin="user_confirm", created_at=100)]
    trusted = rows(repo, "eligible_snapshots")[0]
    assert trusted == dict(snapshot_id=confirmed["snapshot_id"], snapshot_time=100,
                           event_id=event["event_id"], is_eligible=1, trust_level="trusted",
                           reason="claim T17-01 accepted")
    saved = claim(repo)
    assert (saved["unverified"], saved["user_response"], saved["reviewed_at"]) == (0, "accept", 100)
    after = support(repo, 100)
    assert after["atoms"][initial["atom"]] == dict(boolean=True, minimal_roots=[[event["event_id"]]])
    assert support(repo, 99)["atoms"][initial["atom"]]["boolean"] is False
    event_count = len(rows(repo, "history_events"))
    revoked = review.review_claim(repo, initial["claim_id"], decision="reject", now=200)
    assert revoked["status"] == "revoked" and revoked["event_id"] == event["event_id"]
    assert len(rows(repo, "history_events")) == event_count
    assert len(rows(repo, "event_atom_map")) == 1
    assert len(rows(repo, "eligible_snapshots")) == 2
    rejected_snapshot = repo._one("SELECT * FROM eligible_snapshots WHERE snapshot_id=?",
                                  (revoked["snapshot_id"],))
    assert rejected_snapshot["is_eligible"] == 0 and rejected_snapshot["trust_level"] == "revoked"
    assert (claim(repo)["unverified"], claim(repo)["user_response"]) == (1, "reject")
    rejected = support(repo, 200)
    silent = support(repo, 299)
    assert rejected["atoms"][initial["atom"]] == silent["atoms"][initial["atom"]] == dict(
        boolean=False, minimal_roots=[],
    )
    restored = review.review_claim(repo, initial["claim_id"], decision="accept", now=300)
    assert restored["status"] == "restored" and restored["event_id"] == event["event_id"]
    assert restored["snapshot_id"] not in {trusted["snapshot_id"], revoked["snapshot_id"]}
    assert counts(repo) == dict(history_events=event_count, event_atom_map=1, eligible_snapshots=3)
    assert repo._one("SELECT is_eligible FROM eligible_snapshots WHERE snapshot_id=?",
                     (restored["snapshot_id"],))["is_eligible"] == 1
    assert support(repo, 300)["atoms"][initial["atom"]] == after["atoms"][initial["atom"]]
    assert support(repo, 200)["atoms"][initial["atom"]]["boolean"] is False
    assert claim(repo)["proposed_at"] == initial["proposed_at"]
    print(json.dumps(dict(before=before, confirmed=confirmed, event=event, mapping=rows(repo, "event_atom_map"),
                          trusted=trusted, after=after, revoked=revoked, rejected=rejected,
                          silent=silent, restored=restored, restored_support=support(repo, 300))))


@pytest.mark.parametrize("decision", ["accept", "reject"])
def test_same_decision_repeats_are_byte_preserving(repo, decision):
    row = claim(repo)
    if decision == "reject":
        review.review_claim(repo, row["claim_id"], decision="accept", now=100)
    first = review.review_claim(repo, row["claim_id"], decision=decision, now=200)
    before = counts(repo)
    digest = hashlib.sha256(repo.db_path.read_bytes()).hexdigest()
    second = review.review_claim(repo, row["claim_id"], decision=decision, now=200)
    later = review.review_claim(repo, row["claim_id"], decision=decision, now=300)
    assert second["status"] == later["status"] == (
        "already_accepted" if decision == "accept" else "already_rejected"
    )
    assert second["snapshot_id"] == later["snapshot_id"] == first["snapshot_id"]
    assert counts(repo) == before
    assert claim(repo)["reviewed_at"] == 200
    assert hashlib.sha256(repo.db_path.read_bytes()).hexdigest() == digest
    print(json.dumps(dict(decision=decision, first_counts=before, second_counts=counts(repo), second=second)))


def test_reject_before_confirmation_has_no_fact_and_repeats_zero_write(repo):
    row = claim(repo)
    before_events = rows(repo, "history_events")
    result = review.review_claim(repo, row["claim_id"], decision="reject", now=100)
    assert result == dict(claim_id=row["claim_id"], decision="reject", status="revoked",
                          event_id=None, snapshot_id=None, atom=row["atom"])
    assert rows(repo, "history_events") == before_events
    assert rows(repo, "event_atom_map") == rows(repo, "eligible_snapshots") == []
    digest = hashlib.sha256(repo.db_path.read_bytes()).hexdigest()
    assert review.review_claim(repo, row["claim_id"], decision="reject", now=101)["status"] == "already_rejected"
    assert hashlib.sha256(repo.db_path.read_bytes()).hexdigest() == digest
    assert review.review_claim(repo, row["claim_id"], decision="accept", now=200)["status"] == "confirmed"


def test_subject_association_and_no_import_mapping_or_other_claim_writes(repo):
    candidates = rows(repo, "claims_candidates")
    imports = rows(repo, "history_events")
    assets = rows(repo, "assets")
    for number, original in enumerate(candidates):
        before_other = [r for r in rows(repo, "claims_candidates") if r["claim_id"] != original["claim_id"]]
        result = review.review_claim(repo, original["claim_id"], decision="accept", now=100 + number)
        events = repo._all("SELECT * FROM history_events WHERE event_type='user_confirm' AND subject=?",
                           (original["claim_id"],))
        assert len(events) == 1 and events[0]["event_id"] == result["event_id"]
        assert repo._all("SELECT atom FROM event_atom_map WHERE event_id=?", (result["event_id"],)) == [
            dict(atom=original["atom"]),
        ]
        assert before_other == [r for r in rows(repo, "claims_candidates") if r["claim_id"] != original["claim_id"]]
    assert repo._all("SELECT * FROM history_events WHERE event_type='import' ORDER BY event_id") == imports
    assert rows(repo, "assets") == assets
    assert repo._all("SELECT m.* FROM event_atom_map m JOIN history_events e USING(event_id) "
                     "WHERE e.event_type='import'") == []


@pytest.mark.parametrize("stage", ["map", "snapshot", "claim"])
def test_injected_failure_rolls_back_every_table_and_file_bytes(repo, stage):
    table = {"map": "event_atom_map", "snapshot": "eligible_snapshots", "claim": "claims_candidates"}[stage]
    verb = "UPDATE" if stage == "claim" else "INSERT"
    with repo._connection() as conn:
        conn.executescript(f"CREATE TRIGGER fail_review BEFORE {verb} ON {table} "
                           "BEGIN SELECT RAISE(ABORT,'injected review failure'); END;")
    before = relevant(repo)
    digest = hashlib.sha256(repo.db_path.read_bytes()).hexdigest()
    with pytest.raises(sqlite3.IntegrityError, match="injected review failure"):
        review.review_claim(repo, claim(repo)["claim_id"], decision="accept", now=100)
    assert relevant(repo) == before
    assert hashlib.sha256(repo.db_path.read_bytes()).hexdigest() == digest
    print(json.dumps(dict(stage=stage, before_counts={t: len(v) for t, v in before.items()},
                          after_counts={t: len(v) for t, v in relevant(repo).items()},
                          sha256_before=digest, sha256_after=hashlib.sha256(repo.db_path.read_bytes()).hexdigest())))


def test_failed_revoke_and_restore_do_not_change_existing_history(repo):
    claim_id = claim(repo)["claim_id"]
    review.review_claim(repo, claim_id, decision="accept", now=100)
    with repo._connection() as conn:
        conn.executescript("CREATE TRIGGER fail_snapshot BEFORE INSERT ON eligible_snapshots "
                           "BEGIN SELECT RAISE(ABORT,'injected'); END;")
    before = relevant(repo)
    with pytest.raises(sqlite3.IntegrityError, match="injected"):
        review.review_claim(repo, claim_id, decision="reject", now=200)
    assert relevant(repo) == before
    with repo._connection() as conn:
        conn.execute("DROP TRIGGER fail_snapshot")
    review.review_claim(repo, claim_id, decision="reject", now=200)
    with repo._connection() as conn:
        conn.executescript("CREATE TRIGGER fail_snapshot BEFORE INSERT ON eligible_snapshots "
                           "BEGIN SELECT RAISE(ABORT,'injected'); END;")
    before = relevant(repo)
    with pytest.raises(sqlite3.IntegrityError, match="injected"):
        review.review_claim(repo, claim_id, decision="accept", now=300)
    assert relevant(repo) == before


def test_opposite_decision_same_millisecond_refused_without_rewriting(repo):
    claim_id = claim(repo)["claim_id"]
    review.review_claim(repo, claim_id, decision="accept", now=100)
    digest = hashlib.sha256(repo.db_path.read_bytes()).hexdigest()
    with pytest.raises(ValueError, match="same snapshot_time"):
        review.review_claim(repo, claim_id, decision="reject", now=100)
    assert hashlib.sha256(repo.db_path.read_bytes()).hexdigest() == digest
    review.review_claim(repo, claim_id, decision="reject", now=101)
    with pytest.raises(ValueError, match="same snapshot_time"):
        review.review_claim(repo, claim_id, decision="accept", now=101)
    assert claim(repo)["user_response"] == "reject"


def test_concurrent_same_time_accept_serializes_to_one_fact(repo):
    claim_id = claim(repo)["claim_id"]
    barrier = threading.Barrier(2)

    def accept():
        local = AssetRepo(repo.db_path)
        barrier.wait(timeout=10)
        return review.review_claim(local, claim_id, decision="accept", now=100)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: accept(), range(2)))
    assert {r["status"] for r in results} == {"confirmed", "already_accepted"}
    assert results[0]["event_id"] == results[1]["event_id"]
    assert counts(repo) == dict(history_events=2, event_atom_map=1, eligible_snapshots=1)


def test_snapshot_unique_conflict_returns_existing_id_only_for_achieved_state(repo):
    confirmed = review.review_claim(repo, claim(repo)["claim_id"], decision="accept", now=100)
    before = repo.db_path.read_bytes()
    with repo.session(), repo.transaction(), repo._connection() as conn:
        snapshot_id, created = review._append_snapshot(conn, confirmed["event_id"], 100,
                                                       eligible=True, label="T17-01")
    assert (snapshot_id, created) == (confirmed["snapshot_id"], False)
    assert repo.db_path.read_bytes() == before


@pytest.mark.parametrize("decision", ["", "modify", None, 1])
def test_invalid_decision_is_zero_write(repo, decision):
    before = repo.db_path.read_bytes()
    with pytest.raises(ValueError, match="decision"):
        review.review_claim(repo, claim(repo)["claim_id"], decision=decision, now=100)
    assert repo.db_path.read_bytes() == before


@pytest.mark.parametrize("instant", [True, -1, 1.5, "100", 2**63])
def test_invalid_timestamp_is_zero_write(repo, instant):
    before = repo.db_path.read_bytes()
    with pytest.raises(ValueError, match="now"):
        review.review_claim(repo, claim(repo)["claim_id"], decision="accept", now=instant)
    assert repo.db_path.read_bytes() == before


def test_unknown_claim_invalid_atom_and_backdating_are_zero_write(repo):
    before = repo.db_path.read_bytes()
    with pytest.raises(ValueError, match="does not exist"):
        review.review_claim(repo, "unknown", decision="accept", now=100)
    assert repo.db_path.read_bytes() == before
    claim_id = claim(repo)["claim_id"]
    with repo._connection() as conn:
        conn.execute("UPDATE claims_candidates SET atom='not_in_rules' WHERE claim_id=?", (claim_id,))
    before = repo.db_path.read_bytes()
    for decision in ("accept", "reject"):
        with pytest.raises(ValueError, match="vocabulary"):
            review.review_claim(repo, claim_id, decision=decision, now=100)
    assert repo.db_path.read_bytes() == before
    with repo._connection() as conn:
        conn.execute("UPDATE claims_candidates SET atom='conditional_theorem' WHERE claim_id=?", (claim_id,))
    review.review_claim(repo, claim_id, decision="accept", now=100)
    before = repo.db_path.read_bytes()
    with pytest.raises(ValueError, match="precedes"):
        review.review_claim(repo, claim_id, decision="reject", now=99)
    assert repo.db_path.read_bytes() == before


def test_one_connection_and_one_owner_with_existing_session(repo, monkeypatch):
    original = repo._open
    opened = []

    @contextmanager
    def tracked():
        with original() as conn:
            opened.append(conn)
            yield conn

    claim_id = claim(repo)["claim_id"]
    monkeypatch.setattr(repo, "_open", tracked)
    review.review_claim(repo, claim_id, decision="accept", now=100)
    assert len(opened) == 1
    opened.clear()
    with repo.session():
        review.review_claim(repo, claim_id, decision="reject", now=200)
        assert len(opened) == 1
        with repo.transaction():
            with pytest.raises(ValueError, match="owns its transaction"):
                review.review_claim(repo, claim_id, decision="accept", now=300)


@pytest.mark.parametrize("drift", ["missing_mapping", "extra_mapping", "wrong_mapping", "no_snapshot", "duplicate_event"])
def test_existing_confirmation_drift_is_refused_not_repaired(repo, drift):
    claim_id = claim(repo)["claim_id"]
    event_id = review.review_claim(repo, claim_id, decision="accept", now=100)["event_id"]
    with repo._connection() as conn:
        if drift == "missing_mapping":
            conn.execute("DELETE FROM event_atom_map WHERE event_id=?", (event_id,))
        elif drift == "extra_mapping":
            conn.execute("INSERT INTO event_atom_map VALUES (?,'decision','test',100)", (event_id,))
        elif drift == "wrong_mapping":
            conn.execute("UPDATE event_atom_map SET atom='decision' WHERE event_id=?", (event_id,))
        elif drift == "no_snapshot":
            conn.execute("DELETE FROM eligible_snapshots WHERE event_id=?", (event_id,))
        else:
            conn.execute("INSERT INTO history_events(event_id,event_type,subject,event_time,recorded_at) "
                         "VALUES ('duplicate','user_confirm',?,100,100)", (claim_id,))
    before = repo.db_path.read_bytes()
    with pytest.raises(ValueError):
        review.review_claim(repo, claim_id, decision="reject", now=200)
    assert repo.db_path.read_bytes() == before


@pytest.mark.parametrize("flags", [[], ["--accept", "--reject"], ["--modify"]])
def test_cli_parameter_errors_one_json_exit_one(repo, flags):
    before = repo.db_path.read_bytes()
    result = subprocess.run([sys.executable, "-m", "mvp.backend.claim_review", "--offline", "--db", str(repo.db_path),
                             "--claim", claim(repo)["claim_id"], *flags], cwd=ROOT,
                            capture_output=True, text=True)
    assert result.returncode == 1 and len(result.stdout.splitlines()) == 1
    assert "error" in json.loads(result.stdout)
    assert repo.db_path.read_bytes() == before


def test_cli_success_unknown_claim_and_external_cwd(repo, tmp_path):
    program = "import sys;sys.path.insert(0,sys.argv.pop(1));from mvp.backend.claim_review import main;sys.exit(main())"
    base = [sys.executable, "-c", program, str(ROOT), "--offline", "--db", str(repo.db_path)]
    result = subprocess.run(base + ["--claim", claim(repo)["claim_id"], "--accept"], cwd=tmp_path,
                            capture_output=True, text=True)
    assert result.returncode == 0 and len(result.stdout.splitlines()) == 1
    assert json.loads(result.stdout)["status"] == "confirmed"
    before = repo.db_path.read_bytes()
    unknown = subprocess.run(base + ["--claim", "unknown", "--reject"], cwd=tmp_path,
                             capture_output=True, text=True)
    assert unknown.returncode == 1 and len(unknown.stdout.splitlines()) == 1
    assert "error" in json.loads(unknown.stdout)
    assert repo.db_path.read_bytes() == before
