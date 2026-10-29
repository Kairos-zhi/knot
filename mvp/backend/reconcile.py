"""Explicit offline inspection and audited clearing of interrupted HTTP intent."""

import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path

from mvp.cli_client import require_offline
from .http_lock import owner_guard


def reconcile(db, *, clear=False, reason=None):
    if clear and (not reason or not reason.strip()):
        raise ValueError("--clear requires --reason")
    state = Path(db).expanduser().resolve().parent / ".knot"
    require_offline(db)
    if not state.exists():
        return dict(pending=None, body_summary=None, cleared=False)
    with owner_guard(state):
        require_offline(db)
        return _locked_reconcile(state, clear, reason)


def _locked_reconcile(state, clear, reason):
    lock = state / "http.lock"
    # Same exclusive lock as the server; no startup can race audit/clear.
    lock.unlink(missing_ok=True)  # Only a stale lock may remain after the guard.
    with lock.open("x", encoding="ascii") as owner:
        json.dump(dict(pid=os.getpid()), owner)
        owner.flush()
        try:
            journal_path = state / "http.seq"
            journal = json.loads(journal_path.read_text(encoding="utf-8")) if journal_path.exists() else {}
            pending = journal.get("pending")
            if pending is None:
                return dict(pending=None, body_summary=None, cleared=False)
            body = pending.get("body", {})
            # Commands accept only these fields; do not disclose arbitrary journal text.
            summary = dict(command=body.get("command"),
                           sha256=hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
                           argument_keys=sorted(body.get("args", {})))
            visible = {k: pending.get(k) for k in ("actor", "since")} | {"command": body.get("command")}
            if clear:
                log = Path.home() / ".knot" / "reconcile.log"
                log.parent.mkdir(parents=True, exist_ok=True)
                record = dict(pending=pending, body_summary=summary, reason=reason,
                              time=datetime.now(timezone.utc).isoformat(), operator=getpass.getuser())
                with log.open("a", encoding="utf-8", newline="\n") as stream:
                    stream.write(json.dumps(record, ensure_ascii=True) + "\n")
                    stream.flush()
                    os.fsync(stream.fileno())
                journal.pop("pending")
                temporary = journal_path.with_suffix(".reconcile.tmp")
                try:
                    with temporary.open("x", encoding="utf-8") as stream:
                        json.dump(journal, stream)
                        stream.flush()
                        os.fsync(stream.fileno())
                    temporary.replace(journal_path)
                finally:
                    temporary.unlink(missing_ok=True)
            return dict(pending=visible, body_summary=summary, cleared=clear)
        finally:
            # Windows requires the descriptor closed before unlink.
            owner.close()
            lock.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--list", action="store_true")
    choice.add_argument("--clear", action="store_true")
    parser.add_argument("--reason")
    args = parser.parse_args(argv)
    try:
        result = reconcile(args.db, clear=args.clear, reason=args.reason)
    except (OSError, ValueError) as exc:
        print(json.dumps(dict(error=str(exc)), ensure_ascii=True))
        return 1
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
