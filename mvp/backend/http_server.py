"""Loopback transport for the immutable contract v1; no business-state authority."""

import argparse
import base64
from copy import deepcopy
import ctypes
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path, PureWindowsPath
import sqlite3
import threading
import time
from urllib.parse import parse_qs, unquote, urlsplit

from .asset_repo import AssetRepo
from .bundle_jobs import BundleJobs
from .claim_review import review_claim
from .claim_support import claim_support_many
from .knot_query import read_snapshot
from .support_view import compute_support
from .traceback import trace_claim

CONTRACT = Path(__file__).resolve().parents[1] / "contract" / "v1"
CONTRACT_BYTES = {n: (CONTRACT / (n + ".json")).read_bytes() for n in ("schema", "endpoints")}
SPEC = json.loads(CONTRACT_BYTES["endpoints"])
SCHEMA = json.loads(CONTRACT_BYTES["schema"])
ROUTES = SPEC["routes"]
VERSION = SPEC["contract_version"]
COMMANDS = SCHEMA["$defs"]["CommandRequest"]["properties"]["command"]["enum"]
CODES = SCHEMA["$defs"]["Error"]["properties"]["code"]["enum"]


class Fault(Exception):
    def __init__(self, code, status=400, **detail):
        assert code in CODES
        self.code, self.status, self.detail = code, status, detail


def error(code, **detail):
    assert code in CODES
    return dict(contract_version=VERSION, ok=False,
                error=dict(code=code, message=code, detail=detail))


def relative(value):
    """Only expose object-relative paths; never host filesystem locations."""
    if not isinstance(value, str) or not value:
        return None
    if Path(value).is_absolute() or PureWindowsPath(value).drive or ".." in value.replace("\\", "/").split("/"):
        return None
    return value


def metadata(row):
    return {k: row[k] for k in ("asset_id", "content_hash", "media_type")} | {
        "path": relative(row.get("file_path", row.get("path")))}


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, db, port=None):
        self.db = Path(db).resolve()
        self.state = self.db.parent / ".knot"
        self.state.mkdir(parents=True, exist_ok=True)
        self.lock = self.state / "http.lock"
        try:
            self.lock_fd = self.lock.open("x", encoding="ascii")
        except FileExistsError:
            def lock_pid():
                try:
                    value = json.loads(self.lock.read_text(encoding="ascii"))
                    pid = value.get("pid") if isinstance(value, dict) else None
                    return pid if type(pid) is int and 0 < pid <= 0x7fffffff else None
                except (OSError, ValueError):
                    return None

            pid = lock_pid()
            alive = False
            if pid is not None:
                if os.name == "nt":
                    kernel32 = ctypes.windll.kernel32
                    kernel32.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
                    kernel32.OpenProcess.restype = ctypes.c_void_p
                    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
                    kernel32.CloseHandle.restype = ctypes.c_int
                    handle = kernel32.OpenProcess(0x1000, False, pid)
                    alive = bool(handle)
                    if handle:
                        kernel32.CloseHandle(handle)
                else:
                    try:
                        os.kill(pid, 0)
                        alive = True
                    except ProcessLookupError:
                        pass
                    except PermissionError:
                        alive = True
            if alive:
                raise Fault("SERVER_BUSY", 409, pid=pid, stale_checked=True) from None
            try:
                self.lock.unlink(missing_ok=True)
                self.lock_fd = self.lock.open("x", encoding="ascii")
            except OSError:
                raise Fault("SERVER_BUSY", 409, pid=lock_pid(), stale_checked=True) from None
        try:
            json.dump(dict(pid=os.getpid(), started_at=datetime.now(timezone.utc).isoformat(),
                           db=hashlib.sha256(str(self.db).encode()).hexdigest()[:16]), self.lock_fd)
            self.lock_fd.flush()
            self.started = time.monotonic()
            self.changed = threading.Condition(threading.RLock())
            self.stopping = False
            self.journal_path = self.state / "http.seq"
            self.journal = (json.loads(self.journal_path.read_text(encoding="utf-8"))
                            if self.journal_path.exists() else dict(seq=0, frames=[], keys={}))
            if self.journal.get("pending"):
                raise Fault("INTERNAL", reason="incomplete_command_requires_review")
            with read_snapshot(self.db):
                pass  # Refuse unsupported databases; never initialize or migrate here.
            self.jobs = BundleJobs(self)
            port_file = self.state / "http.port"
            if port is None:
                port = int(os.environ.get("KNOT_PORT", port_file.read_text().strip()
                           if port_file.exists() else "7318"))
            super().__init__(("127.0.0.1", port), Handler)
        except BaseException:
            self.lock_fd.close()
            self.lock.unlink()
            raise

    def server_close(self):
        with self.changed:
            self.stopping = True
            self.changed.notify_all()
        self.jobs.close()
        super().server_close()
        self.lock_fd.close()
        self.lock.unlink(missing_ok=True)

    def persist(self, journal):
        temporary = self.journal_path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as stream:
            json.dump(journal, stream)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(self.journal_path)

    def command(self, body, actor):
        if self.jobs.failed:
            raise Fault('INTERNAL', reason='job_journal_requires_review')
        if not isinstance(body, dict) or set(body) - {"command", "args", "idempotency_key"}:
            raise Fault("BAD_REQUEST")
        name, args, key = body.get("command"), body.get("args"), body.get("idempotency_key")
        if name not in COMMANDS:
            raise Fault("COMMAND_NOT_ALLOWED")
        if not isinstance(args, dict) or ("idempotency_key" in body and not isinstance(key, str)):
            raise Fault("BAD_REQUEST")
        if name.startswith("bundle."):
            return self.jobs.submit(body)
        if set(args) != {"claim_id"} or not isinstance(args["claim_id"], str) or not args["claim_id"]:
            raise Fault("BAD_REQUEST")
        with self.changed:
            if self.jobs.failed:
                raise Fault('INTERNAL', reason='job_journal_requires_review')
            if self.journal.get("pending"):
                raise Fault("INTERNAL", reason="incomplete_command_requires_review")
            if key is not None and key in self.journal["keys"]:
                original = self.journal["keys"][key]
                if original["body"] != body:
                    raise Fault("BAD_REQUEST", reason="idempotency_key_conflict")
                return original["value"]
            # A file journal and SQLite cannot commit atomically. Record intent
            # first; an interrupted/ambiguous commit fails closed, never silently
            # losing a frame or advertising an unpersisted in-memory event.
            pending = deepcopy(self.journal)
            pending["pending"] = dict(body=body, actor=actor)
            self.persist(pending)
            self.journal = pending
            try:
                result = review_claim(AssetRepo(self.db), args["claim_id"],
                                      decision="reject" if name == "claim.revoke" else "accept")
            except ValueError:
                clean = deepcopy(pending)
                clean.pop("pending")
                self.persist(clean)
                self.journal = clean
                raise
            journal = deepcopy(pending)
            journal.pop("pending")
            value = dict(command=name, status=result["status"], job_id=None,
                         event_id=None if result["status"].startswith("already_") else result["event_id"])
            if result["status"] in ("confirmed", "revoked", "restored"):
                journal["seq"] += 1
                journal["frames"].append(dict(seq=journal["seq"],
                    type={"confirmed": "claim.confirmed", "revoked": "claim.revoked",
                          "restored": "claim.restored"}[result["status"]], ts=int(time.time() * 1000),
                    payload=dict(claim_id=args["claim_id"], event_id=result["event_id"], actor=actor)))
            if key is not None:
                journal["keys"][key] = dict(body=body, value=value)
            self.persist(journal)
            self.journal = journal
            self.changed.notify_all()
            return value


class Handler(BaseHTTPRequestHandler):
    def __getattr__(self, name):
        if name.startswith("do_"):
            return self.dispatch
        raise AttributeError(name)

    def log_message(self, *args):
        pass  # URL and request bodies can contain private identifiers.

    def send_error(self, code, message=None, explain=None):
        self.close_connection = True
        self.reply(400, error("BAD_REQUEST"))

    def reply(self, status, body):
        data = json.dumps(body, ensure_ascii=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def dispatch(self):
        try:
            if any((CONTRACT / (n + ".json")).read_bytes() != raw for n, raw in CONTRACT_BYTES.items()):
                raise Fault("CONTRACT_VERSION_UNSUPPORTED", 409)
            parsed = urlsplit(self.path)
            route, path_args = None, {}
            for candidate in ROUTES:
                template, parts = candidate["path"].split("/"), parsed.path.split("/")
                if len(template) == len(parts) and all(a == b or a.startswith("{") for a, b in zip(template, parts)):
                    route = candidate
                    path_args = {a[1:-1]: unquote(b) for a, b in zip(template, parts) if a.startswith("{")}
                    break
            if self.command not in SPEC["method_whitelist"] or (route and route["method"] != self.command):
                raise Fault("METHOD_NOT_ALLOWED", 405)
            if route is None:
                raise Fault("NOT_FOUND", 404)
            query = parse_qs(parsed.query, keep_blank_values=True)
            params = {p["name"]: p for p in route["params"] if p.get("in") != "path"}
            if set(query) - set(params) or any(len(v) != 1 for v in query.values()):
                raise Fault("BAD_REQUEST")
            now, values = int(time.time() * 1000), {}
            for name, param in params.items():
                value = query[name][0] if name in query else param.get("default")
                if name not in query and value == "now":
                    value = now
                if value is not None:
                    if param["type"] == "integer":
                        if isinstance(value, str) and not (value.isascii() and value.isdecimal()):
                            raise Fault("BAD_REQUEST")
                        value = int(value)
                    if ("enum" in param and value not in param["enum"] or
                        "min" in param and value < param["min"] or
                        "max" in param and value > param["max"]):
                        raise Fault("BAD_REQUEST")
                    values[name] = value
            if route["as_of"] and not 0 <= values["as_of"] <= now:
                raise Fault("BAD_AS_OF")
            token = os.environ.get("KNOT_TOKEN")
            authenticated = not token or self.headers.get("Authorization") == "Bearer " + token
            if token and not authenticated and (self.command == "POST" or values.get("view") == "content"):
                raise Fault("UNAUTHORIZED" if self.command == "POST" else "FORBIDDEN_VIEW", 401 if self.command == "POST" else 403)
            if route.get("stream"):
                return self.events(values["since"])
            if self.command == "POST":
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 1_000_000 or self.headers.get("Transfer-Encoding"):
                    raise Fault("BAD_REQUEST")
                self.connection.settimeout(2)
                value = self.server.command(json.loads(self.rfile.read(size)), "local-user")
            else:
                value = self.read(route["response"], values | path_args)
            body = dict(contract_version=VERSION, ok=True, value=value)
            if route["envelope"] in ("timed", "viewed"):
                body["view"] = values.get("view", "roots")
            if route["envelope"] == "timed":
                body["as_of"] = values["as_of"]
            self.reply(202 if self.command == 'POST' and value.get('job_id') else 200, body)
        except Fault as exc:
            self.reply(exc.status, error(exc.code, **exc.detail))
        except (ValueError, TypeError, OverflowError) as exc:
            message = str(exc)
            code = ("SCHEMA_VERSION_UNSUPPORTED" if "schema v1.4 required" in message else
                    "NOT_FOUND" if message == "claim does not exist" else
                    "TRACE_CYCLE" if message.startswith("evidence_refs cycle:") else
                    "TRACE_DEPTH_EXCEEDED" if message.startswith("max_depth=") else
                    "TRACE_BROKEN" if message.startswith(("missing evidence event:", "missing import asset")) else
                    "BAD_REQUEST")
            self.reply(404 if code == "NOT_FOUND" else 400, error(code))
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, TimeoutError):
            pass
        except Exception:
            self.reply(500, error("INTERNAL"))

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = dispatch

    def read(self, kind, p):
        if kind == "ContractInfo":
            return dict(contract_version=VERSION, **{n + "_sha256": hashlib.sha256(
                raw).hexdigest() for n, raw in CONTRACT_BYTES.items()})
        if kind == "Health":
            pending = bool(self.server.journal.get("pending")) or self.server.jobs.failed
            return dict(status="degraded" if pending else "ok", contract_version=VERSION,
                        schema_version="1.4", read_only=pending,
                        uptime_s=time.monotonic() - self.server.started, seq=self.server.journal["seq"],
                        db_path_sha256=hashlib.sha256(str(self.server.db).encode()).hexdigest())
        if kind == "Job":
            job = self.server.jobs.get(p['job_id'])
            if job is None:
                raise Fault("NOT_FOUND", 404)
            return job
        with read_snapshot(self.server.db) as conn:
            if kind == "Bundle":
                row = conn.execute("SELECT * FROM continuation_bundles WHERE bundle_id=?",
                                   (p["bundle_id"],)).fetchone()
                if row is None:
                    raise Fault("NOT_FOUND", 404)
                return dict(bundle_id=row["bundle_id"], created_at=row["created_at"],
                            exported=bool(row["exported"]),
                            authorized_assets=json.loads(row["authorized_assets"]),
                            open_questions=[q["claim_id"] if isinstance(q, dict) else q
                                            for q in json.loads(row["open_questions"] or "[]")],
                            context_text=row["context_text"] if p["view"] == "content" else None,
                            export_path=relative(row["bundle_id"] + ".md") if row["exported"] else None)
            if kind == "Snapshot":
                support = compute_support(conn, p["as_of"], rule_version=p["rule_version"])
                atoms = support["atoms"]
                if p["view"] == "boolean":
                    atoms = {a: {"boolean": v["boolean"]} for a, v in atoms.items()}
                return dict(as_of=p["as_of"], rule_version=p["rule_version"], view=p["view"], atoms=atoms,
                            counts={key: conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                                    for key, table in (("assets", "assets"), ("events", "history_events"), ("claims", "claims_candidates"))})
            if kind in ("Claim", "ClaimList"):
                rows = {r["claim_id"]: dict(r) for r in conn.execute("SELECT * FROM claims_candidates")}
                cid = p.get("claim_id")
                if cid is not None and cid not in rows:
                    raise Fault("NOT_FOUND", 404)
                views = claim_support_many(conn, at=p["as_of"], claim_ids=[cid] if cid else None,
                                           status=p.get("status"))["claims"]
                items = []
                allowed = SCHEMA["$defs"]["Claim"]["properties"]
                for v in views:
                    row = rows[v["claim_id"]]
                    if p.get("atom") is not None and row["atom"] != p["atom"]:
                        continue
                    item = {k: row[k] for k in allowed if k in row}
                    for k in ("support_sources", "source_members"):
                        item[k] = json.loads(item[k]) if item.get(k) else []
                    item["unverified"] = bool(item["unverified"])
                    item["candidate_level"] = dict(status=v["status"])
                    item["atom_level"] = v["atom_view"]
                    if p.get("view") == "boolean":
                        item["atom_level"] = {"boolean": v["atom_view"]["boolean"]}
                        item.pop("support_sources", None)
                        item.pop("source_members", None)
                    items.append(item)
                if cid:
                    return items[0]
                offset, limit = int(p.get("cursor", "0")), p["limit"]
                if offset < 0 or limit < 1:
                    raise Fault("BAD_REQUEST")
                return dict(as_of=p["as_of"], items=items[offset:offset + limit],
                            next_cursor=str(offset + limit) if offset + limit < len(items) else None)
            if kind == "Trace":
                if conn.execute("SELECT 1 FROM claims_candidates WHERE claim_id=?", (p["claim_id"],)).fetchone() is None:
                    raise Fault("NOT_FOUND", 404)
                result = trace_claim(conn, p["claim_id"], max_depth=p["max_depth"])
                result = {k: v for k, v in result.items() if k in SCHEMA["$defs"]["Trace"]["properties"]}
                result["assets"] = [metadata(a) for a in result["assets"]]
                return result
            row = conn.execute("SELECT * FROM assets WHERE asset_id=?", (p["asset_id"],)).fetchone()
            if row is None:
                raise Fault("NOT_FOUND", 404)
            row = dict(row)
            if p["view"] == "meta":
                return metadata(row)
            blob = row["content_blob"]
            result = dict(asset_id=row["asset_id"], media_type=row["media_type"])
            if blob is None:
                return result | dict(content=None, encoding="none", path=relative(row["file_path"]))
            try:
                return result | dict(content=blob.decode("utf-8"), encoding="utf-8")
            except UnicodeDecodeError:
                return result | dict(content=base64.b64encode(blob).decode("ascii"), encoding="base64")

    def events(self, since):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.connection.settimeout(2)
        while not self.server.stopping:
            with self.server.changed:
                batch = [f for f in self.server.journal["frames"] if f["seq"] > since]
                if not batch:
                    self.server.changed.wait(0.5)
            for frame in batch:
                self.wfile.write((f'id: {frame["seq"]}\ndata: ' + json.dumps(frame) + '\n\n').encode())
                since = frame["seq"]
            if not batch:
                self.wfile.write(b": heartbeat\n\n")
            self.wfile.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--port", type=int)
    args = parser.parse_args()
    try:
        server = Server(args.db, args.port)
    except Fault as exc:
        print(json.dumps(error(exc.code, **exc.detail)), flush=True)
        return 1
    except ValueError as exc:
        code = "SCHEMA_VERSION_UNSUPPORTED" if "schema v1.4 required" in str(exc) else "BAD_REQUEST"
        print(json.dumps(error(code)), flush=True)
        return 1
    except Exception:
        print(json.dumps(error("INTERNAL")), flush=True)
        return 1
    print(json.dumps(dict(status="listening", port=server.server_port)), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
