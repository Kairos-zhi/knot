"""Development-only live contract probe (requires requirements-dev.txt)."""

import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
from uuid import uuid4
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from jsonschema import Draft202012Validator

from mvp.backend import http_server as http
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.claim_extractor import extract_claims
from mvp.backend.event_store import EventStore
from mvp.backend.init_db import init_database


class Repo(AssetRepo, EventStore):
    pass


def seed(db):
    """Seed only a disposable test database, never the user's supplied database."""
    repo = Repo(db)
    used = {r["source_label"] for r in repo._all("SELECT source_label FROM claims_candidates")}
    label = next(f"T17-{i:02d}" for i in range(1, 100) if f"T17-{i:02d}" not in used)
    data = (label + " contract selfcheck synthetic source " + uuid4().hex).encode()
    asset = repo.add_asset(hashlib.sha256(data).hexdigest(), "text/markdown", content_blob=data)
    repo.add_event("import", subject=asset, event_time=0)
    extract_claims(repo, write=True)
    claim = repo._one("SELECT claim_id FROM claims_candidates WHERE source_label=?", (label,))["claim_id"]
    return asset, claim


def request(base, path, body=None, method=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(base + path, data=None if body is None else json.dumps(body).encode(),
                  method=method, headers=headers)
    try:
        response = urlopen(req, timeout=3)
    except HTTPError as exc:
        response = exc
    with response:
        return response.status, json.load(response)


def validate(body, route=None):
    def check(value, name):
        Draft202012Validator({"$defs": http.SCHEMA["$defs"], "$ref": "#/$defs/" + name}).validate(value)
    if not body["ok"]:
        check(body, "ErrorEnvelope")
        return
    check(body, {"plain": "OkEnvelope", "timed": "OkEnvelopeTimed", "viewed": "OkEnvelopeViewed"}[route["envelope"]])
    names = route["response"].split("|")
    if len(names) > 1:
        names = ["AssetContent" if body["view"] == "content" else "AssetMeta"]
    check(body["value"], names[0])


def run(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, help="disposable v1.4 DB; missing path is created")
    args = parser.parse_args(argv)
    failures, passes = 0, 0
    with tempfile.TemporaryDirectory(prefix="knot-selfcheck-") as folder:
        db = Path(folder) / "probe.db"
        source = Path(args.db)
        if source.exists():
            # SQLite backup includes committed WAL content; raw file copy does not.
            import sqlite3
            with http.read_snapshot(source) as original, closing(sqlite3.connect(db)) as target:
                original.backup(target)
        else:
            result = init_database(db)
            if result["status"] != "created":
                raise RuntimeError("temporary database initialization failed")
        asset, claim = seed(db)
        server = http.Server(db, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        import os
        token = os.environ.get("KNOT_TOKEN")
        try:
            # Exercise all synchronous writers before replaying their actual frames.
            for command, expected, event in (("claim.revoke", "revoked", False),
                    ("claim.revoke", "already_rejected", False),
                    ("claim.confirm", "confirmed", True),
                    ("claim.confirm", "already_accepted", False),
                    ("claim.revoke", "revoked", True),
                    ("claim.restore", "restored", True)):
                try:
                    status, body = request(base, "/commands", dict(command=command, args=dict(claim_id=claim)), token=token)
                    validate(body, next(r for r in http.ROUTES if r["method"] == "POST"))
                    assert status == 200 and body["value"]["status"] == expected
                    assert bool(body["value"]["event_id"]) == event and body["value"]["job_id"] is None
                    passes += 1
                    print(f"PASS command {command}: {json.dumps(body)}")
                except Exception as exc:
                    failures += 1
                    print(f"FAIL command {command}: {type(exc).__name__}")
            for route in http.ROUTES:
                path = route["path"].replace("{claim_id}", claim).replace("{asset_id}", asset).replace("{job_id}", "unknown")
                try:
                    if route.get("stream"):
                        with urlopen(base + path + "?since=0", timeout=3) as stream:
                            while True:
                                line = stream.readline().decode()
                                if line.startswith("data: "):
                                    frame = json.loads(line[6:])
                                    Draft202012Validator({"$defs": http.SCHEMA["$defs"], "$ref": "#/$defs/ChangeEvent"}).validate(frame)
                                    break
                    else:
                        command = dict(command="bundle.create", args={}) if route["method"] == "POST" else None
                        status, body = request(base, path, command, token=token)
                        validate(body, route)
                        expected = 404 if route["response"] == "Job" else 400 if command else 200
                        assert status == expected
                    print(f"PASS {route['method']} {route['path']}")
                    passes += 1
                except Exception as exc:
                    failures += 1
                    print(f"FAIL {route['method']} {route['path']}: {type(exc).__name__}")
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
    print(f"selfcheck: {passes} PASS / {failures} FAIL; exit={int(bool(failures))}")
    return int(bool(failures))


def main(argv=None):
    try:
        return run(argv)
    except Exception as exc:
        print(f"FAIL setup: {type(exc).__name__}")
        print("selfcheck: setup failed; exit=1")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
