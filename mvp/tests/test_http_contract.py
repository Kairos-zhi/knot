"""Contract checks against real threaded loopback HTTP and process lifecycles."""

import ast
from contextlib import closing
from http.client import HTTPConnection
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import sqlite3
from pathlib import Path
import subprocess
import sys
import threading
import time
from urllib.request import urlopen

import pytest
from jsonschema import Draft202012Validator

from mvp.backend import http_server as http
from mvp.backend.init_db import init_database
from mvp.contract.selfcheck import request, seed, validate

ROOT = Path(__file__).resolve().parents[2]
WORKER = '''
import sys, json, threading
from mvp.backend.http_server import Server
s = Server(sys.argv[1], port=0)
t = threading.Thread(target=s.serve_forever, daemon=True)
t.start()
print(json.dumps({'port': s.server_port}), flush=True)
sys.stdin.readline()
s.shutdown()
s.server_close()
t.join()
'''


class Live:
    def __init__(self, db):
        self.db = db
        self.start()

    def start(self):
        self.process = subprocess.Popen([sys.executable, "-u", "-c", WORKER, str(self.db)],
            cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.base = "http://127.0.0.1:" + str(json.loads(self.process.stdout.readline())["port"])

    def stop(self):
        _, stderr = self.process.communicate("stop\n", timeout=8)
        assert self.process.returncode == 0
        assert not stderr, stderr

    def get(self, path):
        return request(self.base, path)

    def command(self, name, claim, **extra):
        return request(self.base, "/commands", dict(command=name, args=dict(claim_id=claim), **extra))


@pytest.fixture
def live(tmp_path, monkeypatch):
    monkeypatch.delenv("KNOT_TOKEN", raising=False)
    db = tmp_path / "contract #%.db"
    assert init_database(db)["status"] == "created"
    asset, claim = seed(db)
    server = Live(db)
    server.asset, server.claim = asset, claim
    try:
        yield server
    finally:
        if server.process.poll() is None:
            server.stop()


def test_routes_and_error_code_scan(live):
    spec = json.loads((http.CONTRACT / "endpoints.json").read_text(encoding="utf-8"))
    assert [(r["method"], r["path"]) for r in http.ROUTES] == [(r["method"], r["path"]) for r in spec["routes"]]
    tree = ast.parse(Path(http.__file__).read_text())
    constants = {n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)
                 and n.value.isupper() and "_" in n.value and not n.value.startswith("KNOT_")}
    assert constants <= set(http.CODES)
    print("AC-3 routes", json.dumps([(r["method"], r["path"]) for r in http.ROUTES]))
    print("AC-4 scanned", json.dumps(sorted(constants)))
    with pytest.raises(AssertionError):
        http.error("OUTSIDE_CONTRACT")
    contract = live.get("/contract")
    assert contract[1]["value"]["schema_sha256"] == hashlib.sha256((http.CONTRACT / "schema.json").read_bytes()).hexdigest()
    print("AC-12", json.dumps(contract))
    for route in spec["routes"]:
        if route.get("stream") or route["method"] == "POST":
            continue
        path = route["path"].replace("{claim_id}", live.claim).replace("{asset_id}", live.asset).replace("{job_id}", "unknown")
        status, body = live.get(path)
        assert status == (404 if route["response"] == "Job" else 200)
        validate(body, route)
    assert live.get("/not-a-route")[0] == 404
    assert request(live.base, "/commands", method="GET")[0] == 405


def test_write_whitelist_and_idempotency(live):
    for method in ("PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE", "CONNECT"):
        if method == "HEAD":
            continue  # HTTP HEAD has no JSON response body.
        status, body = request(live.base, "/snapshot", method=method)
        assert status == 405 and body["error"]["code"] == "METHOD_NOT_ALLOWED"
        print("AC-5 method", method, json.dumps([status, body]))
    for name in ("unknown", "bundle.create", "bundle.export"):
        status, body = request(live.base, "/commands", dict(command=name, args={}))
        assert status == 400 and body["error"]["code"] == "COMMAND_NOT_ALLOWED"
        if name.startswith("bundle"):
            assert body["error"]["detail"]["reason"] == "not_implemented_day16"
        print("AC-5 command", name, json.dumps([status, body]))
    events = []
    for index, name in enumerate(("claim.confirm", "claim.revoke", "claim.restore")):
        time.sleep(0.005)
        status, body = live.command(name, live.claim, idempotency_key=str(index))
        assert status == 200 and body["value"]["event_id"]
        events.append(body["value"]["event_id"])
        print("AC-5 success", json.dumps([status, body]))
        assert live.command(name, live.claim, idempotency_key=str(index))[1] == body
    assert len(set(events)) == 1
    live.stop()
    live.start()
    assert live.command("claim.confirm", live.claim, idempotency_key="0")[0] == 200
    assert live.get("/health")[1]["value"]["seq"] == 3


def test_as_of_views_readonly_and_parallel(live):
    digest = lambda: hashlib.sha256(live.db.read_bytes()).hexdigest()
    before = digest()
    start = int(time.time() * 1000)
    status, default = live.get("/snapshot")
    assert status == 200 and start <= default["as_of"] <= int(time.time() * 1000)
    status, past = live.get("/snapshot?as_of=0")
    assert status == 200 and past["as_of"] == past["value"]["as_of"] == 0
    status, future = live.get("/snapshot?as_of=9999999999999")
    assert status == 400 and future["error"]["code"] == "BAD_AS_OF"
    print("AC-6", json.dumps(dict(default=default, past=past, future=future)))
    for view in ("roots", "boolean"):
        body = live.get("/snapshot?view=" + view)[1]
        assert body["view"] == body["value"]["view"] == view
        assert all(("minimal_roots" in a) == (view == "roots") for a in body["value"]["atoms"].values())
        claim = live.get(f"/claims/{live.claim}?view={view}")[1]
        assert claim["view"] == view
        assert ("minimal_roots" in claim["value"]["atom_level"]) == (view == "roots")
        assert "content" not in json.dumps(claim)
        print("AC-7", json.dumps(dict(snapshot=body, claim=claim)))
    for view in ("meta", "content"):
        body = live.get(f"/assets/{live.asset}?view={view}")[1]
        assert body["view"] == view
        assert ("content" in body["value"]) == (view == "content")
        validate(body, next(r for r in http.ROUTES if r["response"] == "AssetMeta|AssetContent"))
        print("AC-7 asset", json.dumps(body))
    for route in http.ROUTES:
        if route["method"] != "GET" or route.get("stream"):
            continue
        live.get(route["path"].replace("{claim_id}", live.claim).replace("{asset_id}", live.asset).replace("{job_id}", "unknown"))
    assert digest() == before
    with urlopen(live.base + "/events?since=0", timeout=3) as stream:
        assert stream.readline().startswith(b": heartbeat")
    assert digest() == before
    print("AC-10", json.dumps(dict(before=before, after=digest(), includes_sse=True)))
    def health(_):
        started = time.monotonic()
        assert live.get("/health")[0] == 200
        return time.monotonic() - started
    with ThreadPoolExecutor(max_workers=10) as pool:
        durations = list(pool.map(health, range(10)))
    assert max(durations) < 2
    assert live.get("/jobs/unknown")[1]["error"]["code"] == "NOT_FOUND"
    print("AC-8", json.dumps(dict(durations=durations, job=live.get("/jobs/unknown"))))


def frames(stream, count):
    result = []
    while len(result) < count:
        line = stream.readline().decode()
        assert line
        if line.startswith("data: "):
            frame = json.loads(line[6:])
            Draft202012Validator({"$defs": http.SCHEMA["$defs"], "$ref": "#/$defs/ChangeEvent"}).validate(frame)
            result.append(frame)
    return result


def test_sse_two_clients_and_process_restart(live):
    with urlopen(live.base + "/events?since=0", timeout=3) as first, urlopen(live.base + "/events?since=0", timeout=3) as second:
        for name in ("claim.confirm", "claim.revoke", "claim.restore"):
            time.sleep(0.005)
            assert live.command(name, live.claim)[0] == 200
        a, b = frames(first, 3), frames(second, 3)
        assert a == b and [f["seq"] for f in a] == [1, 2, 3]
    live.stop()
    live.start()
    with urlopen(live.base + "/events?since=1", timeout=3) as replay:
        c = frames(replay, 2)
    assert c == a[1:]
    with urlopen(live.base + "/events?since=3", timeout=3) as tail:
        time.sleep(0.005)
        assert live.command("claim.revoke", live.claim)[0] == 200
        d = frames(tail, 1)
    assert [f["seq"] for f in d] == [4]
    print("AC-9", json.dumps(dict(first=a, second=b, replay=c, after_restart=d)))


def test_second_process_busy(live):
    result = subprocess.run([sys.executable, "-m", "mvp.backend.http_server", "--db", str(live.db), "--port", "0"],
                            cwd=ROOT, capture_output=True, text=True, timeout=5)
    assert result.returncode == 1
    assert json.loads(result.stdout)["error"]["code"] == "SERVER_BUSY"
    assert live.get("/health")[0] == 200
    print("AC-11", result.stdout.strip())


@pytest.mark.parametrize("query", ["as_of=no", "as_of=now", "as_of=-1", "as_of=1.0", "view=content", "rule_version=no", "extra=1", "view=roots&view=boolean"])
def test_bad_params(live, query):
    assert live.get("/snapshot?" + query)[0] == 400


def test_auth_and_untrusted_actor(live, monkeypatch):
    live.stop()
    monkeypatch.setenv("KNOT_TOKEN", "synthetic-test-token")
    live.start()
    assert live.get(f"/assets/{live.asset}?view=content")[1]["error"]["code"] == "FORBIDDEN_VIEW"
    assert live.command("claim.confirm", live.claim)[1]["error"]["code"] == "UNAUTHORIZED"
    assert request(live.base, f"/assets/{live.asset}?view=content", token="synthetic-test-token")[0] == 200
    status, body = request(live.base, "/commands", dict(command="claim.confirm", args=dict(claim_id=live.claim, source="forged")), token="synthetic-test-token")
    assert status == 400


def test_selfcheck(live):
    before = hashlib.sha256(live.db.read_bytes()).hexdigest()
    result = subprocess.run([sys.executable, "-m", "mvp.contract.selfcheck", "--db", str(live.db)], cwd=ROOT, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "16 PASS / 0 FAIL" in result.stdout
    assert hashlib.sha256(live.db.read_bytes()).hexdigest() == before


def test_command_three_states(live):
    route = next(r for r in http.ROUTES if r["response"] == "CommandResult")
    def command(name, expected, has_event):
        status, body = live.command(name, live.claim)
        validate(body, route)
        assert status == 200 and body["value"]["status"] == expected
        assert bool(body["value"]["event_id"]) == has_event
        assert body["value"]["job_id"] is None
        print("AC-5b", json.dumps([status, body]))
        time.sleep(0.005)
        return body
    command("claim.revoke", "revoked", False)
    with sqlite3.connect(live.db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM history_events WHERE event_type='user_confirm'").fetchone()[0] == 0
        assert conn.execute("SELECT user_response FROM claims_candidates").fetchone()[0] == "reject"
    command("claim.revoke", "already_rejected", False)
    command("claim.confirm", "confirmed", True)
    command("claim.confirm", "already_accepted", False)
    command("claim.revoke", "revoked", True)
    command("claim.revoke", "already_rejected", False)
    command("claim.restore", "restored", True)
    command("claim.restore", "already_accepted", False)
    for name in ("bundle.create", "bundle.export"):
        response = request(live.base, "/commands", dict(command=name, args={}))
        assert response[0] == 400 and response[1]["error"]["detail"]["reason"] == "not_implemented_day16"
        print("AC-5b", json.dumps(response))


def test_historical_support_and_result_based_sse(live):
    assert live.command("claim.restore", live.claim)[1]["value"]["status"] == "confirmed"
    with sqlite3.connect(live.db) as conn:
        at = conn.execute("SELECT MAX(snapshot_time) FROM eligible_snapshots").fetchone()[0]
    time.sleep(0.01)
    assert live.command("claim.revoke", live.claim)[0] == 200
    past = live.get(f"/snapshot?as_of={at}")[1]
    current = live.get("/snapshot")[1]
    assert past["value"]["atoms"]["conditional_theorem"]["boolean"] is True
    assert current["value"]["atoms"]["conditional_theorem"]["boolean"] is False
    historical = live.get(f"/claims/{live.claim}?as_of={at}")[1]
    assert historical["value"]["candidate_level"]["status"] == "confirmed"
    time.sleep(0.005)
    assert live.command("claim.confirm", live.claim)[1]["value"]["status"] == "restored"
    with urlopen(live.base + "/events?since=0", timeout=3) as stream:
        batch = frames(stream, 3)
    assert [f["type"] for f in batch] == ["claim.confirmed", "claim.revoked", "claim.restored"]
    print("AC-6 historical", json.dumps(dict(past=past, current=current, claim=historical)))


@pytest.mark.parametrize("mode,code", [("broken", "TRACE_BROKEN"), ("cycle", "TRACE_CYCLE"), ("depth", "TRACE_DEPTH_EXCEEDED")])
def test_trace_strict_errors(live, mode, code):
    assert live.command("claim.confirm", live.claim)[0] == 200
    with sqlite3.connect(live.db) as conn:
        root = conn.execute("SELECT event_id FROM history_events WHERE event_type='user_confirm'").fetchone()[0]
        if mode == "broken":
            conn.execute("UPDATE history_events SET evidence_refs=? WHERE event_id=?", (json.dumps(["missing"]), root))
        elif mode == "cycle":
            conn.execute("UPDATE history_events SET evidence_refs=? WHERE event_id=?", (json.dumps([root]), root))
    status, body = live.get(f"/trace/{live.claim}" + ("?max_depth=1" if mode == "depth" else ""))
    assert status == 400 and body["error"]["code"] == code
    validate(body)
    print("trace strict", json.dumps([status, body]))


def test_journal_failure_blocks_without_phantom_frames(tmp_path, monkeypatch):
    db = tmp_path / "failure.db"
    assert init_database(db)["status"] == "created"
    _, claim = seed(db)
    server = http.Server(db, port=0)
    persist = server.persist
    def fail_after_review(journal):
        if "pending" not in journal:
            raise OSError("synthetic disk failure")
        persist(journal)
    monkeypatch.setattr(server, "persist", fail_after_review)
    try:
        with pytest.raises(OSError):
            server.command(dict(command="claim.confirm", args=dict(claim_id=claim)), "local-user")
        assert server.journal["seq"] == 0 and server.journal["frames"] == []
        with pytest.raises(http.Fault) as failure:
            server.command(dict(command="claim.revoke", args=dict(claim_id=claim)), "local-user")
        assert failure.value.code == "INTERNAL"
    finally:
        server.server_close()
    with pytest.raises(http.Fault) as failure:
        http.Server(db, port=0)
    assert failure.value.detail["reason"] == "incomplete_command_requires_review"
    assert not (tmp_path / ".knot/http.lock").exists()


def test_null_idempotency_key_rejected(live):
    status, body = live.command("claim.confirm", live.claim, idempotency_key=None)
    assert status == 400 and body["error"]["code"] == "BAD_REQUEST"


def test_http_protocol_and_asset_encodings(live):
    connection = HTTPConnection("127.0.0.1", int(live.base.rsplit(":", 1)[1]), timeout=3)
    try:
        connection.request("HEAD", "/snapshot")
        response = connection.getresponse()
        assert response.status == 405 and response.read() == b""
    finally:
        connection.close()
    from mvp.backend.asset_repo import AssetRepo
    repo = AssetRepo(live.db)
    binary = repo.add_asset(hashlib.sha256(b"\xff").hexdigest(), "application/octet-stream", content_blob=b"\xff")
    external = repo.add_asset(hashlib.sha256(b"outside").hexdigest(), "application/zip", file_path="objects/synthetic.zip")
    for asset, encoding, content in ((binary, "base64", "/w=="), (external, "none", None)):
        status, body = live.get(f"/assets/{asset}?view=content")
        assert status == 200 and body["value"]["encoding"] == encoding and body["value"]["content"] == content
        validate(body, next(r for r in http.ROUTES if r["response"] == "AssetMeta|AssetContent"))


def test_claim_pagination_and_missing_ids(live):
    with closing(sqlite3.connect(live.db)) as conn:
        conn.execute("INSERT INTO claims_candidates (claim_id,claim_type,atom,extraction_method,proposed_at,source_label) "
                     "VALUES ('second','theorem','conditional_theorem','synthetic',0,'T17-99')")
        conn.commit()
    first = live.get("/claims?limit=1")[1]
    second = live.get("/claims?limit=1&cursor=" + first["value"]["next_cursor"])[1]
    assert len(first["value"]["items"]) == len(second["value"]["items"]) == 1
    assert first["value"]["items"][0]["claim_id"] != second["value"]["items"][0]["claim_id"]
    assert second["value"]["next_cursor"] is None
    for path in ("/claims/missing", "/trace/missing", "/assets/missing"):
        assert live.get(path)[0] == 404
    assert live.command("claim.confirm", "missing")[0] == 404


def test_schema_mismatch_startup(live):
    live.stop()
    with sqlite3.connect(live.db) as conn:
        conn.execute("DELETE FROM schema_version WHERE version='1.4'")
    result = subprocess.run([sys.executable, "-m", "mvp.backend.http_server", "--db", str(live.db), "--port", "0"],
                            cwd=ROOT, capture_output=True, text=True, timeout=5)
    assert result.returncode == 1
    assert json.loads(result.stdout)["error"]["code"] == "SCHEMA_VERSION_UNSUPPORTED"


def test_contract_drift_rejected(live, monkeypatch):
    # Corrupt the process-local expected bytes, never mutate the locked contract.
    live.stop()
    server = http.Server(live.db, port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setitem(http.CONTRACT_BYTES, "schema", b"stale")
    try:
        status, body = request(f"http://127.0.0.1:{server.server_port}", "/contract")
        assert status == 409 and body["error"]["code"] == "CONTRACT_VERSION_UNSUPPORTED"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
