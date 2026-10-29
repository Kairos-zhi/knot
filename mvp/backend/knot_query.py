"""Read-only JSON CLI for events, asset metadata, candidates and support views."""

import argparse
import json
import sqlite3
import time

from .timeline_query import asset_by_hash, claims_by_atom, events_range, read_snapshot
from .claim_support import claim_support, claim_support_many
from .traceback import trace_claim
from mvp.cli_client import Client, add_options, offline_session, query
from mvp.transport_views import event_rows, metadata, claim_item, trace_view


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        print(json.dumps({"error": message}, ensure_ascii=True))
        # Unknown subcommands retain argparse's exit 2; other invalid arguments use 1.
        self.exit(2 if message.startswith("argument command: invalid choice:") else 1)


def main(argv=None):
    parser = _Parser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    events = commands.add_parser("events")
    events.add_argument("--start", type=int, required=True)
    events.add_argument("--end", type=int, required=True)
    events.add_argument("--limit", type=int, default=200)
    asset = commands.add_parser("asset")
    asset.add_argument("--hash", required=True)
    claims = commands.add_parser("claims")
    claims.add_argument("--atom", required=True)
    claims.add_argument("--limit", type=int, default=500)
    support = commands.add_parser("support")
    support.add_argument("--at", type=int, required=True)
    selection = support.add_mutually_exclusive_group()
    selection.add_argument("--atom")
    selection.add_argument("--claim")
    trace = commands.add_parser("trace")
    trace.add_argument("--claim", required=True)
    trace.add_argument("--max-depth", type=int, default=5)
    for subcommand in (events, asset, claims, support, trace):
        subcommand.add_argument("--db", required=True)
        add_options(subcommand)
    args = parser.parse_args(argv)
    try:
        if not args.offline:
            print(json.dumps(query(Client(args), args), ensure_ascii=True))
            return 0
        with offline_session(args.db), read_snapshot(args.db) as conn:
            if args.command == "events":
                result = event_rows(events_range(conn, start=args.start, end=args.end, limit=args.limit))
            elif args.command == "asset":
                result = asset_by_hash(conn, args.hash)
                if result is not None:
                    # This entry exposes metadata; embedded bodies require a separate API.
                    result = metadata(result)
                else:
                    result = []
            elif args.command == "claims":
                if args.limit < 0:
                    raise ValueError("limit must be non-negative")
                rows = claims_by_atom(conn, args.atom, limit=2**63 - 1)
                rows = sorted(rows, key=lambda r: (r["source_label"] is not None, r["source_label"] or "", r["claim_id"]))[:args.limit]
                views = {v["claim_id"]: v for v in claim_support_many(conn, at=time.time_ns() // 1_000_000,
                            claim_ids=[r["claim_id"] for r in rows])["claims"]}
                result = [claim_item(dict(conn.execute("SELECT * FROM claims_candidates WHERE claim_id=?",
                            (r["claim_id"],)).fetchone()), views[r["claim_id"]]) for r in rows]
            elif args.command == "trace":
                result = trace_view(trace_claim(conn, args.claim, max_depth=args.max_depth))
            elif args.claim is not None:
                # claim_support already pairs candidate truth with its native atom_view.
                result = claim_support(conn, args.claim, at=args.at)
            else:
                claim_ids = None
                if args.atom is not None:
                    if not args.atom:
                        raise ValueError("atom must be a non-empty string")
                    claim_ids = [row[0] for row in conn.execute(
                        "SELECT claim_id FROM claims_candidates WHERE atom=?", (args.atom,),
                    )]
                result = claim_support_many(conn, at=args.at, claim_ids=claim_ids)
        output = json.dumps(result, ensure_ascii=True)
    except (OSError, ValueError, OverflowError, sqlite3.Error) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=True))
        return 1
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
