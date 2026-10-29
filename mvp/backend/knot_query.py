"""Read-only JSON CLI for timeline events, asset metadata and candidates."""

import argparse
import json
import sqlite3

from .timeline_query import asset_by_hash, claims_by_atom, events_range, read_snapshot


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
    for subcommand in (events, asset, claims):
        subcommand.add_argument("--db", required=True)
    args = parser.parse_args(argv)
    try:
        with read_snapshot(args.db) as conn:
            if args.command == "events":
                result = events_range(conn, start=args.start, end=args.end, limit=args.limit)
            elif args.command == "asset":
                result = asset_by_hash(conn, args.hash)
                if result is not None:
                    # This entry exposes metadata; embedded bodies require a separate API.
                    result.pop("content_blob")
            else:
                result = claims_by_atom(conn, args.atom, limit=args.limit)
        output = json.dumps(result, ensure_ascii=True)
    except (OSError, ValueError, OverflowError, sqlite3.Error) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=True))
        return 1
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
