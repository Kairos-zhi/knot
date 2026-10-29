"""Candidate truth, atom cross-checks and a concurrent consistent-read gate."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

from mvp.backend import claim_support as support
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.claim_review import review_claim
from mvp.backend.event_store import EventStore
from mvp.backend.init_db import init_database

ROOT = Path(__file__).resolve().parents[2]
TABLES = ("claims_candidates", "history_events", "eligible_snapshots", "event_atom_map", "horn_rules")


class Repo(AssetRepo, EventStore):
    pass


@pytest.fixture
def repo(tmp_path):
    path = tmp_path / "support #%.db"
    assert init_database(str(path))["status"] == "created"
    repo = Repo(path)
    # Synthetic corpus reproduces the supplied 47/28/22/13 distribution.
    labels = ([f"D-{i:02}" for i in range(1, 48)]
              + [f"P17-{i:02}" for i in range(1, 29)]
              + [f"T17-{i:02}" for i in range(1, 23)]
              + [f"Q17-{i:02}" for i in range(1, 14)])
    data = " ".join(reversed(labels)).encode()
    asset = repo.add_asset(hashlib.sha256(data).hexdigest(), "text/markdown", content_blob=data)
    repo.add_event("import", subject=asset, event_time=0)
    assert extract_claims(repo, write=True)["inserted"] == 110
    return repo


def cid(repo, label="T17-01"):
    return repo._one("SELECT claim_id FROM claims_candidates WHERE source_label=?", (label,))["claim_id"]


def view(repo, label="T17-01", at=1000):
    with repo._connection() as conn:
        return support.claim_support(conn, cid(repo, label), at=at)


def contents(conn):
    return {table: [tuple(row) for row in conn.execute(f"SELECT * FROM {table} ORDER BY rowid")]
            for table in TABLES}


def test_unconditional_trap_and_same_atom_isolation(repo):
    decision = view(repo, "D-01")
    assert decision == dict(claim_id=cid(repo, "D-01"), source_label="D-01", atom="decision",
                           at=1000, status="unconfirmed", boolean=False, minimal_roots=[],
                           atom_view=dict(boolean=True, minimal_roots=[[]]))
    event = review_claim(repo, cid(repo), decision="accept", now=1000)["event_id"]
    first, second = view(repo), view(repo, "T17-02")
    assert (first["status"], first["boolean"], first["minimal_roots"]) == ("confirmed", True, [[event]])
    assert first["atom_view"] == dict(boolean=True, minimal_roots=[[event]])
    assert (second["status"], second["boolean"], second["minimal_roots"]) == ("unconfirmed", False, [])
    assert second["atom_view"] == first["atom_view"]
    print(json.dumps(dict(AC1=decision, AC2=first, AC3=second)))


def test_carry_forward_restoration_and_missing_historical_snapshot(repo):
    event = review_claim(repo, cid(repo), decision="accept", now=1000)["event_id"]
    review_claim(repo, cid(repo), decision="reject", now=2000)
    timeline = [view(repo, at=t) for t in (1500, 2000, 2500)]
    assert [(v["status"], v["boolean"], v["minimal_roots"]) for v in timeline] == [
        ("confirmed", True, [[event]]), ("revoked", False, []), ("revoked", False, []),
    ]
    assert review_claim(repo, cid(repo), decision="accept", now=3000)["event_id"] == event
    assert view(repo, at=3000)["minimal_roots"] == [[event]]
    assert [view(repo, at=t) for t in (1500, 2000, 2500)] == timeline
    with pytest.raises(ValueError, match="no trust snapshot"):
        view(repo, at=999)
    print(json.dumps(dict(AC4=timeline, AC5=view(repo, at=3000))))


def test_batch_counts_filters_order_and_byte_stability(repo):
    review_claim(repo, cid(repo), decision="accept", now=1000)
    with repo._connection() as conn:
        result = support.claim_support_many(conn, at=1000)
        assert result["counts"] == dict(confirmed=1, revoked=0, unconfirmed=109)
        assert len(result["claims"]) == 110
        assert [v["source_label"] for v in result["claims"]] == sorted(v["source_label"] for v in result["claims"])
        assert json.dumps(result, sort_keys=False) == json.dumps(support.claim_support_many(conn, at=1000), sort_keys=False)
        filtered = support.claim_support_many(conn, at=1000, status="unconfirmed")
        assert len(filtered["claims"]) == 109 and filtered["counts"]["confirmed"] == 0
        selected = support.claim_support_many(conn, at=1000, claim_ids=[cid(repo), cid(repo, "D-01"), cid(repo)])
        assert [v["source_label"] for v in selected["claims"]] == ["D-01", "T17-01"]
        assert support.claim_support_many(conn, at=1000, claim_ids=[])["claims"] == []
        with pytest.raises(ValueError, match="does not exist"):
            support.claim_support_many(conn, at=1000, claim_ids=[cid(repo), "unknown"])
    print(json.dumps(dict(AC6=result["counts"])))


def test_manual_markers_do_not_confirm_and_reject_without_event_is_unconfirmed(repo):
    with repo._connection() as conn:
        conn.execute("UPDATE claims_candidates SET user_response='accept',unverified=0 WHERE claim_id=?", (cid(repo),))
    actual = view(repo)
    assert actual["status"] == "unconfirmed" and actual["boolean"] is False
    review_claim(repo, cid(repo, "T17-02"), decision="reject", now=1000)
    assert view(repo, "T17-02")["status"] == "unconfirmed"
    print(json.dumps(dict(AC9=actual)))


@pytest.mark.parametrize("defect", ["no_snapshot", "duplicate_event", "invalid_snapshot", "wrong_mapping", "missing_mapping"])
def test_defects_fail_without_changes_and_release_owned_transaction(repo, defect):
    event = review_claim(repo, cid(repo), decision="accept", now=1000)["event_id"]
    with repo._connection() as conn:
        if defect == "no_snapshot":
            conn.execute("DELETE FROM eligible_snapshots WHERE event_id=?", (event,))
        elif defect == "duplicate_event":
            conn.execute("INSERT INTO history_events(event_id,event_type,subject,event_time,recorded_at) "
                         "VALUES ('duplicate','user_confirm',?,1000,1000)", (cid(repo),))
        elif defect == "invalid_snapshot":
            conn.execute("UPDATE eligible_snapshots SET is_eligible=2 WHERE event_id=?", (event,))
        elif defect == "wrong_mapping":
            conn.execute("UPDATE event_atom_map SET atom='decision' WHERE event_id=?", (event,))
        else:
            conn.execute("DELETE FROM event_atom_map WHERE event_id=?", (event,))
    with repo._connection() as conn:
        before, changes = contents(conn), conn.total_changes
        with pytest.raises(ValueError):
            support.claim_support_many(conn, at=1000)
        assert contents(conn) == before and conn.total_changes == changes
        assert not conn.in_transaction


def test_read_only_one_transaction_and_atom_output_is_unmodified(repo, monkeypatch):
    original = support.compute_support
    calls = []

    def tracked(conn, at):
        assert conn.in_transaction
        atoms = original(conn, at)
        calls.append((conn, atoms))
        return atoms

    monkeypatch.setattr(support, "compute_support", tracked)
    with closing(sqlite3.connect(repo.db_path.as_uri() + "?mode=ro", uri=True)) as conn:
        before, changes = contents(conn), conn.total_changes
        trace = []
        conn.set_trace_callback(trace.append)
        result = support.claim_support_many(conn, at=1000)
        assert len(calls) == 1 and calls[0][0] is conn
        for claim in result["claims"]:
            assert claim["atom_view"] == calls[0][1]["atoms"][claim["atom"]]
        assert contents(conn) == before and conn.total_changes == changes
        assert trace.count("BEGIN") == trace.count("ROLLBACK") == 1
        assert not conn.in_transaction and conn.row_factory is None


def test_existing_transaction_participates_without_commit_or_rollback(repo):
    with repo._connection() as conn:
        conn.execute("BEGIN")
        conn.execute("UPDATE claims_candidates SET user_response='accept'")
        before, changes = contents(conn), conn.total_changes
        support.claim_support_many(conn, at=1000)
        with pytest.raises(ValueError, match="does not exist"):
            support.claim_support(conn, "unknown", at=1000)
        assert conn.in_transaction
        assert contents(conn) == before and conn.total_changes == changes
        conn.rollback()
    assert repo._one("SELECT user_response FROM claims_candidates")["user_response"] is None


def test_concurrent_commit_between_reads_does_not_mix_database_views(repo):
    claim_id = cid(repo)

    class Interleaved(sqlite3.Connection):
        fired = False

        def execute(self, sql, parameters=()):
            # The first SELECT pins the WAL snapshot before the second reader
            # stage. Another connection commits while this read remains open.
            if "SELECT event_id,subject FROM history_events" in sql and not self.fired:
                self.fired = True
                review_claim(repo, claim_id, decision="accept", now=1000)
            return super().execute(sql, parameters)

    with closing(sqlite3.connect(repo.db_path, factory=Interleaved)) as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        first = support.claim_support(conn, claim_id, at=1000)
        assert first["status"] == "unconfirmed" and not first["atom_view"]["boolean"]
        second = support.claim_support(conn, claim_id, at=1000)
        assert second["status"] == "confirmed" and second["atom_view"]["boolean"]


@pytest.mark.parametrize("kwargs", [dict(at=True), dict(at=-1), dict(at=2**63), dict(at="1000"),
                                  dict(at=1000, status="other"), dict(at=1000, claim_ids="id"),
                                  dict(at=1000, claim_ids=[""]), dict(at=1000, claim_ids=[None])])
def test_invalid_arguments(repo, kwargs):
    with repo._connection() as conn:
        with pytest.raises(ValueError):
            support.claim_support_many(conn, **kwargs)
        assert not conn.in_transaction and conn.total_changes == 0


def cli(repo, *flags, cwd=ROOT):
    program = "import sys;sys.path.insert(0,sys.argv.pop(1));from mvp.backend.claim_support import main;sys.exit(main())"
    return subprocess.run([sys.executable, "-c", program, str(ROOT), "--db", str(repo.db_path), *flags],
                          cwd=cwd, capture_output=True, text=True)


def test_cli_single_batch_filter_and_external_cwd(repo, tmp_path):
    review_claim(repo, cid(repo), decision="accept", now=1000)
    for flags, count in ((["--claim", cid(repo)], None), ([], 110), (["--only", "unconfirmed"], 109)):
        result = cli(repo, "--at", "1000", *flags, cwd=tmp_path)
        assert result.returncode == 0 and len(result.stdout.splitlines()) == 1
        data = json.loads(result.stdout)
        if count is None:
            assert data["status"] == "confirmed" and "claims" not in data
        else:
            assert len(data["claims"]) == count


@pytest.mark.parametrize("flags", [[], ["--at", "bad"], ["--at", "-1"], ["--at", "1000", "--claim", "unknown"],
                                  ["--at", "1000", "--only", "bad"],
                                  ["--at", "1000", "--claim", "id", "--only", "confirmed"]])
def test_cli_errors_single_json_without_partial_result(repo, flags):
    result = cli(repo, *flags)
    assert result.returncode == 1 and len(result.stdout.splitlines()) == 1
    assert set(json.loads(result.stdout)) == {"error"}


def test_cli_missing_database_does_not_create_file(repo, tmp_path):
    repo.db_path = tmp_path / "absent.db"
    result = cli(repo, "--at", "1000")
    assert result.returncode == 1 and "error" in json.loads(result.stdout)
    assert not repo.db_path.exists()
