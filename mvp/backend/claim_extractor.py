"""Extract rule-based candidates from embedded Markdown and in-memory archives."""

import argparse
from contextlib import nullcontext
import hashlib
import io
import json
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import unquote, urlsplit
from uuid import NAMESPACE_URL, uuid5
import zipfile
import zlib

from .asset_repo import AssetRepo


MAX_DEPTH = 2  # Top-level asset is depth 0: at most two nested archives.
MAX_MEMBER_BYTES = 4 * 1024 * 1024
MAX_ARCHIVE_BYTES = 8 * 1024 * 1024
MAX_MEMBERS = 200
KINDS = {
    "D": ("decision", "decision"),
    "Q": ("question", "open_question"),
    "P": ("counterexample", "counterexample"),
    "T": ("relation", "conditional_theorem"),
}
NEGATION_WORDS = ("不新增", "不得", "禁止", "不做", "不再", "取消", "放弃")
CLAUSE_SEPARATORS = "。；;｜|\n"
LABEL = re.compile(r"(?<![A-Za-z0-9])(?:[TPQ]\d{1,2}-\d{1,2}|D-\d{1,2})(?!\d)")
LEFT = re.compile(r"(?<=[A-Za-z0-9])(?:[TPQ]\d{1,2}-\d{1,2}|D-\d{1,2})(?!\d)")
BARE = re.compile(r"(?<![A-Za-z0-9])[TPQ]\d{1,2}(?![\d-])")
RANGE = re.compile(r"D-\d+\s*[～~—]\s*D-\d+")
NEGATION = re.compile(
    "(?:" + "|".join(NEGATION_WORDS) + r")[^。；;｜|\n]{0,8}$"
)
STAT_KEYS = (
    "suppressed_left_boundary", "suppressed_negation", "suppressed_range",
    "bare_ignored", "undecodable", "depth_exceeded", "oversize_member",
    "oversize_archive", "too_many_members", "archive_errors",
    "md_members_read", "unique_md_contents",
)


def _scan(text, stats):
    """Suppress individual occurrences; later valid occurrences still count."""
    labels = set()
    for line in text.splitlines():
        spans = [match.span() for match in RANGE.finditer(line)]
        stats["suppressed_left_boundary"] += len(LEFT.findall(line))
        stats["bare_ignored"] += len(BARE.findall(line))
        for match in LABEL.finditer(line):
            if any(a <= match.start() and match.end() <= b for a, b in spans):
                stats["suppressed_range"] += 1
            elif NEGATION.search(line[:match.start()]):
                stats["suppressed_negation"] += 1
            else:
                labels.add(match.group())
    return labels


def _walk_archive(data, stats, *, depth=0, prefix=""):
    """Yield logical member identifiers and bytes; never interpret them as paths."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            total = 0
            members = 0
            for member in archive.infolist():
                if member.is_dir():
                    continue
                members += 1
                if members > MAX_MEMBERS:
                    stats["too_many_members"] += 1
                    break
                suffix = Path(member.filename).suffix.lower()
                if suffix not in {".md", ".zip"}:
                    continue
                if suffix == ".zip" and depth >= MAX_DEPTH:
                    stats["depth_exceeded"] += 1
                    continue
                if member.file_size > MAX_MEMBER_BYTES:
                    stats["oversize_member"] += 1
                    continue
                if total + member.file_size > MAX_ARCHIVE_BYTES:
                    stats["oversize_archive"] += 1
                    break
                # Bound actual reads as well as declared sizes; no extract()/tempfile.
                with archive.open(member) as stream:
                    content = stream.read(MAX_MEMBER_BYTES + 1)
                if len(content) > MAX_MEMBER_BYTES:
                    stats["oversize_member"] += 1
                    continue
                total += len(content)
                if total > MAX_ARCHIVE_BYTES:
                    stats["oversize_archive"] += 1
                    break
                name = prefix + member.filename
                if suffix == ".zip":
                    yield from _walk_archive(content, stats, depth=depth + 1,
                                             prefix=name + "!")
                else:
                    stats["md_members_read"] += 1
                    yield name, content
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError, zlib.error):
        # Broken/encrypted/unsupported archives are reported, not treated as empty.
        stats["archive_errors"] += 1


def _is_zip(asset):
    uri = urlsplit(asset["source_uri"] or "")
    uri_path = unquote(uri.path or uri.netloc)
    return any(Path(path).suffix.lower() == ".zip"
               for path in (uri_path, asset["file_path"] or ""))


def _collect(conn, repo, result):
    candidates = {}
    representatives = {}
    unique = {"md": set(), "zip": set()}
    by_source = {"md": set(), "zip": set()}
    events = {}
    for row in conn.execute(
        "SELECT subject,event_id FROM history_events WHERE event_type='import' "
        "ORDER BY event_id"
    ):
        events.setdefault(row["subject"], set()).add(row["event_id"])

    def consume(content, asset_id, source, member=None):
        stats = result["sources"][source]
        digest = hashlib.sha256(content).hexdigest()
        unique[source].add(digest)
        if member is not None:
            representatives[digest] = min(member, representatives.get(digest, member))
        try:
            text = content.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            stats["undecodable"] += 1
            return
        for label in _scan(text, stats):
            kind, atom = KINDS[label[0]]
            key = (kind, label)
            by_source[source].add(key)
            candidate = candidates.setdefault(key, dict(atom=atom, events=set(), hashes=set()))
            candidate["events"].update(events.get(asset_id, ()))
            if member is not None:
                candidate["hashes"].add(digest)

    for asset in conn.execute("SELECT * FROM assets ORDER BY asset_id"):
        if asset["media_type"] == "text/markdown" and asset["content_blob"] is not None:
            consume(asset["content_blob"], asset["asset_id"], "md")
        elif asset["file_path"] is not None and _is_zip(asset):
            # Only the top-level asset's stored file path is a filesystem path.
            path = Path(asset["file_path"]).expanduser()
            if not path.is_absolute():
                path = repo.db_path.parent / path
            data = path.read_bytes()
            for member, content in _walk_archive(data, result["sources"]["zip"]):
                consume(content, asset["asset_id"], "zip", member)
    for source, keys in by_source.items():
        result["sources"][source]["unique_md_contents"] = len(unique[source])
        result["sources"][source]["counts"] = {
            kind: sum(k[0] == kind for k in keys) for kind, _ in KINDS.values()
        }
    return candidates, representatives, by_source


def _extract(repo, *, write):
    result = dict(counts={kind: 0 for kind, _ in KINDS.values()},
                  inserted=0, updated=0, unchanged=0, write=write,
                  sources={src: dict.fromkeys(STAT_KEYS, 0) for src in ("md", "zip")})
    with repo._connection() as conn:
        if not write:
            conn.execute("BEGIN")  # One consistent read snapshot, without a write lock.
        if conn.execute("SELECT 1 FROM schema_version WHERE version='1.4'").fetchone() is None:
            raise ValueError("schema v1.4 required; migrate explicitly")
        # Check the columns even for an empty source set, before reporting success.
        conn.execute("SELECT source_label,source_members FROM claims_candidates LIMIT 0")
        candidates, representatives, by_source = _collect(conn, repo, result)
        for stats in result["sources"].values():
            stats.update(inserted=0, updated=0, unchanged=0)
        now = int(time.time() * 1000)
        for (kind, label), candidate in sorted(candidates.items()):
            result["counts"][kind] += 1
            claim_id = str(uuid5(NAMESPACE_URL, f"knot:claim:{kind}:{label}"))
            sources = json.dumps(sorted(candidate["events"]), ensure_ascii=True)
            members = (json.dumps(sorted(representatives[h] for h in candidate["hashes"]),
                                  ensure_ascii=True) if candidate["hashes"] else None)
            existing = conn.execute(
                "SELECT * FROM claims_candidates WHERE claim_id=?", (claim_id,),
            ).fetchone()
            if existing is None:
                action = "inserted"
                result["inserted"] += 1
                if write:
                    conn.execute(
                        "INSERT INTO claims_candidates "
                        "(claim_id,claim_type,atom,support_sources,extraction_method,"
                        "proposed_at,source_label,source_members) VALUES (?,?,?,?,?,?,?,?)",
                        (claim_id, kind, candidate["atom"], sources, "rule_based", now, label, members),
                    )
            else:
                if (existing["claim_type"], existing["source_label"], existing["atom"],
                        existing["extraction_method"]) != (kind, label, candidate["atom"], "rule_based"):
                    raise ValueError("deterministic claim ID conflicts with an existing candidate")
                if (existing["support_sources"], existing["source_members"]) == (sources, members):
                    action = "unchanged"
                    result["unchanged"] += 1
                else:
                    action = "updated"
                    result["updated"] += 1
                    if write:
                        conn.execute(
                            "UPDATE claims_candidates SET support_sources=?,source_members=? "
                            "WHERE claim_id=?", (sources, members, claim_id),
                        )
            for source, keys in by_source.items():
                if (kind, label) in keys:
                    result["sources"][source][action] += 1
    return result


def extract_claims(repo, *, write=False):
    """Return counts and planned changes; write only within this repo's transaction."""
    if not isinstance(write, bool):
        raise ValueError("write must be a boolean")
    with (repo.session() if repo._scoped_connection is None else nullcontext(repo)):
        if repo._in_transaction_scope:
            raise ValueError("extract_claims owns its transaction; pass a repo without an active transaction")
        with (repo.transaction() if write else nullcontext(repo)):
            return _extract(repo, write=write)


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        print(json.dumps({"error": message}, ensure_ascii=True))
        self.exit(1)


def main():
    parser = _Parser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    try:
        result = extract_claims(AssetRepo(args.db), write=args.write)
    except (OSError, ValueError, sqlite3.Error) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=True))
        return 1
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
