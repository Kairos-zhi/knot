"""B1 live transport parity, identity persistence and offline audit evidence."""

from contextlib import contextmanager
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import threading
import time

import pytest

from mvp.backend import http_server as http
from mvp.backend.claim_review import review_claim
from mvp.backend.claim_support import claim_support_many
from mvp.backend.reconcile import reconcile
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.init_db import init_database
from mvp.backend.timeline_query import read_snapshot
from mvp.contract.selfcheck import seed, request, validate

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def material(tmp_path, monkeypatch):
    monkeypatch.delenv("KNOT_TOKEN", raising=False)
    monkeypatch.delenv("KNOT_TOKENS", raising=False)
    db = tmp_path / "parity.db"
    assert init_database(db)["status"] == "created"
    asset, claim = seed(db)
    _, other = seed(db)
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO claims_candidates(claim_id,claim_type,atom,extraction_method,proposed_at,source_label) "
                     "VALUES ('unconditional','decision','decision','test',0,'D-00')")
        digest = conn.execute("SELECT content_hash FROM assets WHERE asset_id=?", (asset,)).fetchone()[0]
    return db, asset, claim, other, digest


@contextmanager
def serving(db):
    server = http.Server(db, port=0)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    try:
        yield server, f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def cli(db, *args, module="knot_query", check=0):
    result = subprocess.run([sys.executable, "-m", "mvp.backend." + module, *args, "--db", str(db)],
                            cwd=ROOT, capture_output=True, text=True, timeout=15)
    assert result.returncode == check, result.stdout + result.stderr
    assert not result.stderr and len(result.stdout.splitlines()) == 1
    return result.stdout.strip()


@pytest.mark.parametrize("suffix,code", [("start=0&end=9999999999999", 200),
                                          ("start=20&end=10", 400), ("start=0&end=20&limit=501", 400)])
def test_timeline_three(material, suffix, code):
    with serving(material[0]) as (_, base):
        status, body = request(base, "/timeline?" + suffix)
        assert status == code
        validate(body, next(r for r in http.ROUTES if r["response"] == "Timeline"))
        if code == 200:
            assert len(body["value"]["items"]) == 2
        else:
            assert body["error"]["code"] == "BAD_REQUEST"


@pytest.mark.parametrize("mode,code,count", [("hit", 200, 1), ("miss", 200, 0), ("invalid", 400, 0)])
def test_asset_hash_three(material, mode, code, count):
    with serving(material[0]) as (_, base):
        digest = material[4] if mode == "hit" else "0" * 64 if mode == "miss" else "bad"
        status, body = request(base, "/assets?content_hash=" + digest)
        assert status == code
        validate(body, next(r for r in http.ROUTES if r["response"] == "AssetList"))
        if code == 200:
            assert len(body["value"]["items"]) == count
            assert body["view"] == "meta"


def test_six_mappings_and_candidate_truth(material):
    db, _, claim, other, digest = material
    review_claim(AssetRepo(db), claim, decision="accept")
    at = int(time.time() * 1000)
    commands = [("events", "--start", "0", "--end", str(at + 1), "--limit", "20"),
                ("asset", "--hash", digest), ("claims", "--atom", "conditional_theorem", "--limit", "20"),
                ("support", "--claim", claim, "--at", str(at)),
                ("support", "--atom", "conditional_theorem", "--at", str(at)),
                ("trace", "--claim", claim, "--max-depth", "5")]
    outputs = []
    with serving(db) as (_, base):
        for command in commands:
            # Port discovery and explicit --server must agree.
            value = cli(db, *command)
            assert value == cli(db, *command, "--server", base)
            outputs.append(value)
        with read_snapshot(db) as conn:
            native = claim_support_many(conn, at=at)["claims"]
        for expected in native:
            actual = request(base, f'/claims/{expected["claim_id"]}?as_of={at}')[1]["value"]
            assert actual["candidate_level"] == {k: expected[k] for k in ("status", "boolean", "minimal_roots")}
            assert actual["atom_level"] == expected["atom_view"]
            print("CANDIDATE " + json.dumps(dict(claim_id=expected["claim_id"], candidate_level=actual["candidate_level"],
                                                   claim_support=expected), sort_keys=True))
        unconditional = next(v for v in native if v["claim_id"] == "unconditional")
        assert unconditional["boolean"] is False and unconditional["atom_view"]["boolean"] is True
        assert "refused" in cli(db, "support", "--claim", claim, "--at", str(at), "--offline", check=1)
        assert "refused" in cli(db, "--claim", other, "--accept", "--offline", module="claim_review", check=1)
    for command, expected in zip(commands, outputs):
        offline = cli(db, *command, "--offline")
        assert offline == expected
        print("PARITY " + json.dumps(dict(command=command[0] + ("-claim" if "--claim" in command else "-atom" if command[0] == "support" else ""),
                                          http=json.loads(expected), offline=json.loads(offline)), sort_keys=True))
    assert cli(db, "asset", "--hash", "0" * 64, "--offline") == "[]"


def test_cli_default_stale_lock_and_review_directions(material):
    db, _, claim, _, _ = material
    assert "先起服务" in json.loads(cli(db, "claims", "--atom", "decision", check=1))["error"]
    state = db.parent / ".knot"
    state.mkdir(exist_ok=True)
    (state / "http.lock").write_text('{"pid": 2147483647}')
    assert json.loads(cli(db, "claims", "--atom", "decision", "--offline"))
    with serving(db):
        assert json.loads(cli(db, "--claim", claim, "--accept", module="claim_review"))["status"] == "confirmed"
        time.sleep(.005)
        assert json.loads(cli(db, "--claim", claim, "--reject", module="claim_review"))["status"] == "revoked"
    time.sleep(.005)
    assert json.loads(cli(db, "--claim", claim, "--accept", "--offline", module="claim_review"))["status"] == "restored"


def wait_job(base, jid):
    for _ in range(500):
        job = request(base, "/jobs/" + jid)[1]["value"]
        if job["status"] in ("done", "failed"):
            assert job["status"] == "done", job
            return job["result"]
        time.sleep(.01)
    pytest.fail("job timeout")


def test_two_token_actor_event_pending_export(material, monkeypatch, tmp_path):
    db, asset, claim, other, _ = material
    monkeypatch.setenv("KNOT_TOKENS", json.dumps({"synthetic-a": "hermes", "synthetic-b": "codex"}))
    with serving(db) as (server, base):
        server.jobs.exports = tmp_path / "exports"
        for token, cid in (("synthetic-a", claim), ("synthetic-b", other)):
            assert request(base, "/commands", dict(command="claim.confirm", args=dict(claim_id=cid)), token=token)[0] == 200
        assert request(base, "/commands", dict(command="claim.confirm", args=dict(claim_id=claim)), token="bad")[0] == 401
        assert request(base, f"/assets/{asset}?view=content", token="bad")[0] == 403
        with sqlite3.connect(db) as conn:
            rows = conn.execute("SELECT subject,payload_json FROM history_events WHERE event_type='user_confirm' ORDER BY rowid").fetchall()
        assert [json.loads(r[1])["actor"] for r in rows] == ["hermes", "codex"]
        print("ACTORS " + json.dumps(rows))
        created = request(base, "/commands", dict(command="bundle.create", args=dict(asset_ids=[asset])), token="synthetic-a")
        bid = wait_job(base, created[1]["value"]["job_id"])["bundle_id"]
        for token, actor in (("synthetic-a", "hermes"), ("synthetic-b", "codex")):
            exported = request(base, "/commands", dict(command="bundle.export", args=dict(bundle_id=bid)), token=token)
            wait_job(base, exported[1]["value"]["job_id"])
            header = (server.jobs.exports / (bid + ".md")).read_text(encoding="utf-8").splitlines()[0]
            assert "actor=" + actor in header
            print("EXPORT " + header)
        original = server.persist
        def fail_final(journal):
            if "pending" not in journal:
                raise OSError("synthetic final journal failure")
            original(journal)
        monkeypatch.setattr(server, "persist", fail_final)
        assert request(base, "/commands", dict(command="claim.revoke", args=dict(claim_id=claim)), token="synthetic-a")[0] == 500
        health = request(base, "/health")[1]
        assert health["value"]["pending"]["actor"] == "hermes"
        assert type(health["value"]["pending"]["since"]) is int
        validate(health, next(r for r in http.ROUTES if r["response"] == "Health"))
        print("PENDING_HEALTH " + json.dumps(health))
        with pytest.raises(ValueError, match="alive"):
            reconcile(db, clear=True, reason="must refuse")


def test_pending_reconcile_audit_and_restart(material, monkeypatch, tmp_path):
    db = material[0]
    with serving(db) as (server, _):
        server.journal["pending"] = dict(body=dict(command="claim.confirm", args=dict(claim_id=material[2])), actor="codex", since=123)
        server.persist(server.journal)
    before = (db.parent / ".knot/http.seq").read_bytes()
    with pytest.raises(http.Fault) as failure:
        http.Server(db, port=0)
    assert failure.value.detail["reason"] == "pending_requires_review"
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path / "home"))
    listed = reconcile(db)
    assert listed["pending"]["actor"] == "codex"
    with pytest.raises(ValueError, match="reason"):
        reconcile(db, clear=True)
    assert (db.parent / ".knot/http.seq").read_bytes() == before
    result = reconcile(db, clear=True, reason="confirmed database checked; discard intent")
    record = (Path.home() / ".knot/reconcile.log").read_text(encoding="utf-8")
    assert json.loads(record)["pending"]["actor"] == "codex"
    assert "operator" in json.loads(record)
    assert result["cleared"] and reconcile(db)["pending"] is None
    print("RECONCILE_LIST " + json.dumps(listed))
    print("RECONCILE_LOG " + record.strip())
    with serving(db) as (_, base):
        assert request(base, "/health")[1]["value"]["pending"] is None
        print("RESTART_AFTER " + json.dumps(request(base, "/health")[1]))


def test_audit_failure_keeps_pending(material, tmp_path, monkeypatch):
    db = material[0]
    with serving(db) as (server, _):
        server.journal["pending"] = dict(body=dict(command="claim.confirm", args={}), actor="codex", since=1)
        server.persist(server.journal)
    fake_home = tmp_path / "blocked-home"
    fake_home.write_text("not a directory")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
    before = (db.parent / ".knot/http.seq").read_bytes()
    with pytest.raises(OSError):
        reconcile(db, clear=True, reason="audit must succeed first")
    assert (db.parent / ".knot/http.seq").read_bytes() == before


def test_duplicate_labels_and_pagination_parity(material):
    db = material[0]
    with sqlite3.connect(db) as conn:
        conn.executemany("INSERT INTO claims_candidates(claim_id,claim_type,atom,extraction_method,proposed_at,source_label) "
                         "VALUES (?,'decision','decision','test',0,'same')",
                         [("z-first",), ("a-second",)] + [(f"bulk-{i:04d}",) for i in range(501)])
    commands = [("claims", "--atom", "decision", "--limit", "2"),
                ("claims", "--atom", "decision"), ("support", "--atom", "decision", "--at", "100")]
    with serving(db):
        values = [cli(db, *cmd) for cmd in commands]
    for cmd, expected in zip(commands, values):
        assert expected == cli(db, *cmd, "--offline")
    assert len(json.loads(values[1])) == 500
    assert len(json.loads(values[2])["claims"]) == 504


def test_no_token_local_user_event(material):
    db = material[0]
    with serving(db) as (_, base):
        assert request(base, "/commands", dict(command="claim.confirm", args=dict(claim_id=material[2])))[0] == 200
    with sqlite3.connect(db) as conn:
        payload = conn.execute("SELECT payload_json FROM history_events WHERE event_type='user_confirm'").fetchone()[0]
    assert json.loads(payload)["actor"] == "local-user"


def test_reconcile_rechecks_owner_under_guard(material, monkeypatch):
    import importlib
    module = importlib.import_module("mvp.backend.reconcile")
    db = material[0]
    state = db.parent / ".knot"
    state.mkdir(exist_ok=True)
    original = module.require_offline
    calls = []
    def racing(path):
        original(path)
        calls.append(True)
        if len(calls) == 1:
            (state / "http.lock").write_text(json.dumps(dict(pid=os.getpid())))
    monkeypatch.setattr(module, "require_offline", racing)
    with pytest.raises(ValueError, match="alive"):
        reconcile(db)
    assert json.loads((state / "http.lock").read_text())["pid"] == os.getpid()
    (state / "http.lock").unlink()
