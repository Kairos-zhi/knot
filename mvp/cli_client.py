"""Loopback CLI transport and explicit offline exclusion guard."""

from contextlib import contextmanager
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


def add_options(parser):
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--server")
    mode.add_argument("--offline", action="store_true")


def require_offline(db):
    # Lazy import avoids the server/review CLI import cycle.
    from mvp.backend.http_server import pid_alive
    lock = Path(db).expanduser().resolve().parent / ".knot" / "http.lock"
    if lock.exists():
        try:
            value = json.loads(lock.read_text(encoding="ascii"))
        except (ValueError, UnicodeError):
            return
        if isinstance(value, dict) and pid_alive(value.get("pid")):
            raise ValueError("server is alive; --offline refused; stop the service first")


@contextmanager
def offline_session(db):
    from mvp.backend.http_lock import owner_guard
    state = Path(db).expanduser().resolve().parent / ".knot"
    # Missing paths must stay missing, including their parent directories.
    if not Path(db).expanduser().is_file():
        raise ValueError("database does not exist")
    with owner_guard(state):
        require_offline(db)
        yield


class Client:
    def __init__(self, args):
        if args.server:
            self.base = args.server.rstrip("/")
        else:
            port_file = Path(args.db).expanduser().resolve().parent / ".knot" / "http.port"
            if not port_file.exists():
                raise ValueError("先起服务或加 --offline")
            port = int(port_file.read_text(encoding="ascii").strip())
            if not 0 < port <= 65535:
                raise ValueError("invalid service port")
            self.base = f"http://127.0.0.1:{port}"
        url = urlsplit(self.base)
        if url.scheme != "http" or url.hostname not in ("127.0.0.1", "localhost", "::1") or url.username or url.password or url.path or url.query or url.fragment:
            raise ValueError("--server requires a loopback HTTP origin")

    def request(self, path, params=None, body=None):
        if params:
            path += "?" + urlencode({k: v for k, v in params.items() if v is not None})
        headers = {"Content-Type": "application/json"}
        if os.environ.get("KNOT_TOKEN"):
            headers["Authorization"] = "Bearer " + os.environ["KNOT_TOKEN"]
        req = Request(self.base + path, headers=headers,
                      data=None if body is None else json.dumps(body).encode())
        try:
            response = urlopen(req, timeout=10)
        except HTTPError as exc:
            response = exc
        except URLError:
            raise ValueError("service unavailable; 先起服务或加 --offline") from None
        with response:
            result = json.load(response)
        if not result.get("ok"):
            raise ValueError(result["error"]["code"])
        return result["value"]

    def claims(self, **params):
        items, cursor = [], None
        while True:
            value = self.request("/claims", params | {"cursor": cursor})
            items.extend(value["items"])
            params.setdefault("as_of", value["as_of"])
            cursor = value.get("next_cursor")
            if cursor is None:
                return items


def support_item(item, at):
    return {k: item[k] for k in ("claim_id", "source_label", "atom")} | {
        "at": at, **item["candidate_level"], "atom_view": item["atom_level"]}


def query(client, args):
    from urllib.parse import quote
    if args.command == "events":
        return client.request("/timeline", dict(start=args.start, end=args.end, limit=args.limit))["items"]
    if args.command == "asset":
        rows = client.request("/assets", dict(content_hash=args.hash))["items"]
        return rows[0] if rows else []
    if args.command == "claims":
        if args.limit == 0:
            return []
        return client.claims(atom=args.atom, limit=min(args.limit, 200))[:args.limit]
    if args.command == "trace":
        return client.request("/trace/" + quote(args.claim, safe=""), dict(max_depth=args.max_depth))
    if args.claim is not None:
        return support_item(client.request("/claims/" + quote(args.claim, safe=""), dict(as_of=args.at)), args.at)
    items = [support_item(i, args.at) for i in client.claims(atom=args.atom, as_of=args.at, limit=200)]
    return dict(at=args.at, counts={s: sum(i["status"] == s for i in items)
                                  for s in ("confirmed", "revoked", "unconfirmed")}, claims=items)
