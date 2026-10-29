"""Rule extraction contracts, occurrence suppression and bounded memory-only ZIPs."""

import hashlib
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from uuid import NAMESPACE_URL, uuid5
import zipfile

import pytest

from mvp.backend import claim_extractor as claims
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.init_db import init_database
from mvp.backend.import_baseline import import_baseline, snapshot

ROOT = Path(__file__).resolve().parents[2]


class Repo(AssetRepo, EventStore):
    pass


@pytest.fixture
def repo(tmp_path):
    db = tmp_path / "candidate.db"
    assert init_database(str(db))["status"] == "created"
    return Repo(db)


def archive(entries):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries:
            zf.writestr(name, content)
    return buffer.getvalue()


def add_md(repo, text, *, source="file://source.md", media="text/markdown"):
    raw = text.encode("utf-8") if isinstance(text, str) else text
    asset = repo.add_asset(hashlib.sha256(raw).hexdigest(), media,
                           content_blob=raw, source_uri=source)
    event = repo.add_event("import", subject=asset)
    return asset, event


def add_zip(repo, data, name="archive.zip"):
    digest = hashlib.sha256(data).hexdigest()
    path = repo.db_path.parent / digest
    path.write_bytes(data)
    asset = repo.add_asset(digest, "application/zip", file_path=digest,
                           source_uri="file://" + name)
    event = repo.add_event("import", subject=asset)
    return asset, event


def rows(repo, table="claims_candidates"):
    return repo._all(f'SELECT * FROM "{table}" ORDER BY 1')


def test_all_kinds_atom_mapping_dry_run_and_idempotency(repo):
    add_md(repo, "D-01 P14-01 Q18-01 T17-01 T17-01\n不新增 D-48\n")
    unchanged_tables = {table: rows(repo, table) for table in
                        ("assets", "history_events", "eligible_snapshots", "event_atom_map")}
    before = repo.db_path.read_bytes()
    dry = claims.extract_claims(repo)
    assert dry["counts"] == dict(decision=1, question=1, counterexample=1, relation=1)
    assert dry["inserted"] == 4 and dry["write"] is False
    assert dry["sources"]["md"]["inserted"] == 4
    assert dry["sources"]["zip"]["inserted"] == 0
    assert rows(repo) == []
    assert repo.db_path.read_bytes() == before
    first = claims.extract_claims(repo, write=True)
    assert first["inserted"] == 4 and first["updated"] == first["unchanged"] == 0
    saved = rows(repo)
    for row in saved:
        kind, atom = claims.KINDS[row["source_label"][0]]
        assert (row["claim_type"], row["atom"]) == (kind, atom)
        assert row["claim_id"] == str(uuid5(NAMESPACE_URL, f"knot:claim:{kind}:{row['source_label']}"))
        assert row["extraction_method"] == "rule_based"
        assert row["confidence"] is row["user_response"] is row["reviewed_at"] is None
        assert row["source_members"] is None and row["unverified"] == 1
    second = claims.extract_claims(repo, write=True)
    assert (second["inserted"], second["updated"], second["unchanged"]) == (0, 0, 4)
    assert saved == rows(repo)
    assert unchanged_tables == {table: rows(repo, table) for table in unchanged_tables}


def test_occurrence_suppression_does_not_blacklist_or_expand(repo):
    add_md(repo, "ALL ROUND-16 ALL ROUND-17 xT17-01 9P14-01\n"
           "不新增 D-48；D-02 Q18-01\n继承 v0.3 D-01～D-47，D-03\n"
           "D-01 D-47\nP14～P17 T10～T17 Q18（三个义务） P16：最小反例")
    result = claims.extract_claims(repo, write=True)
    labels = {row["source_label"] for row in rows(repo)}
    assert labels == {"D-01", "D-47", "D-02", "D-03", "Q18-01"}
    stats = result["sources"]["md"]
    assert stats["suppressed_left_boundary"] == 4
    assert stats["suppressed_negation"] == 1
    assert stats["suppressed_range"] == 2
    assert stats["bare_ignored"] == 6


@pytest.mark.parametrize("word", claims.NEGATION_WORDS)
def test_negation_exact_window_and_clause_boundaries(repo, word):
    add_md(repo, f"{word}{'字' * 8}D-01\n{word}{'字' * 9}D-02\n"
           + "\n".join(f"{word}{separator}D-03" for separator in claims.CLAUSE_SEPARATORS))
    result = claims.extract_claims(repo, write=True)
    assert {r["source_label"] for r in rows(repo)} == {"D-02", "D-03"}
    assert result["sources"]["md"]["suppressed_negation"] == 1


@pytest.mark.parametrize("separator", ["～", "~", "—"])
def test_range_only_suppresses_own_endpoints(repo, separator):
    add_md(repo, f"D-01 {separator} D-47 D-05\nD-01\nD-47")
    result = claims.extract_claims(repo, write=True)
    assert {r["source_label"] for r in rows(repo)} == {"D-01", "D-47", "D-05"}
    assert result["sources"]["md"]["suppressed_range"] == 2


def test_nested_zip_content_dedup_and_top_asset_provenance(repo):
    content = b"D-01"
    inner = archive([("z.MD", content), ("other.md", b"D-47")])
    _, event1 = add_zip(repo, archive([("nested.zip", inner), ("a.md", content)]))
    _, event2 = add_zip(repo, archive([("copy.md", content)]), "other.zip")
    result = claims.extract_claims(repo, write=True)
    row = next(r for r in rows(repo) if r["source_label"] == "D-01")
    assert json.loads(row["support_sources"]) == sorted([event1, event2])
    assert json.loads(row["source_members"]) == ["a.md"]
    assert result["sources"]["zip"]["md_members_read"] == 4
    assert result["sources"]["zip"]["unique_md_contents"] == 2
    assert len(rows(repo)) == 2


def test_growth_updates_only_provenance_and_preserves_user_judgment(repo):
    _, old_event = add_md(repo, "T14-01")
    claims.extract_claims(repo, write=True)
    with repo._connection() as conn:
        conn.execute("UPDATE claims_candidates SET unverified=0,user_response='accept',reviewed_at=123")
    before = rows(repo)[0]
    _, new_event = add_md(repo, "T14-01 growth")
    result = claims.extract_claims(repo, write=True)
    after = rows(repo)[0]
    assert (result["inserted"], result["updated"], result["unchanged"]) == (0, 1, 0)
    assert result["sources"]["md"]["updated"] == 1
    assert json.loads(after["support_sources"]) == sorted([old_event, new_event])
    assert {k: v for k, v in before.items() if k not in {"support_sources", "source_members"}} == {
        k: v for k, v in after.items() if k not in {"support_sources", "source_members"}
    }
    assert (after["unverified"], after["user_response"], after["reviewed_at"], after["proposed_at"]) == (
        0, "accept", 123, before["proposed_at"],
    )
    print(json.dumps({"user_before": before, "user_after": after, "updated": result["updated"]}))


def test_new_archive_content_updates_members_without_overwriting_review(repo):
    add_zip(repo, archive([("old.md", b"D-01")]))
    claims.extract_claims(repo, write=True)
    with repo._connection() as conn:
        conn.execute("UPDATE claims_candidates SET unverified=0,user_response='reject',reviewed_at=123")
    before = rows(repo)[0]
    add_zip(repo, archive([("new.md", b"D-01 new evidence")]), "new.zip")
    result = claims.extract_claims(repo, write=True)
    after = rows(repo)[0]
    assert result["updated"] == result["sources"]["zip"]["updated"] == 1
    assert json.loads(after["source_members"]) == ["new.md", "old.md"]
    assert len(json.loads(after["support_sources"])) == 2
    assert {k: v for k, v in before.items() if k not in {"support_sources", "source_members"}} == {
        k: v for k, v in after.items() if k not in {"support_sources", "source_members"}
    }


def test_missing_top_asset_file_fails_operation_without_partial_writes(repo):
    add_md(repo, "D-01")
    repo.add_asset("missing", "application/zip", file_path="missing.zip")
    with pytest.raises(OSError):
        claims.extract_claims(repo, write=True)
    assert rows(repo) == []


def test_undecodable_assets_and_members_skipped_individually(repo):
    add_md(repo, b"D-99\xff")
    add_zip(repo, archive([("bad.md", b"D-98\xff"), ("good.md", b"D-01")]))
    result = claims.extract_claims(repo, write=True)
    assert result["sources"]["md"]["undecodable"] == 1
    assert result["sources"]["zip"]["undecodable"] == 1
    assert [r["source_label"] for r in rows(repo)] == ["D-01"]


def test_non_sources_are_never_scanned(repo):
    add_md(repo, "D-99", media="text/x-python")
    add_md(repo, "D-98", media="application/json")
    add_md(repo, "D-97", media="text/plain")
    file = repo.db_path.parent / "external.md"
    file.write_bytes(b"D-96")
    repo.add_asset("external", "text/markdown", file_path=str(file))
    assert claims.extract_claims(repo, write=True)["inserted"] == 0


def test_actual_importer_root_zip_uri_and_relative_hash_path(repo, tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "root.ZIP").write_bytes(archive([("data.MD", b"D-01")]))
    (source / "MANIFEST.sha256").write_text(
        "".join(f"{row['sha256']}  {row['path']}\n" for row in snapshot(source)), encoding="utf-8",
    )
    assert import_baseline(source, repo.db_path)["imported"] == 2
    assert claims.extract_claims(repo, write=True)["counts"]["decision"] == 1


def test_zip_members_not_opened_as_local_paths_or_executed(repo, tmp_path, monkeypatch):
    add_zip(repo, archive([("../../escape.md", b"D-01"), ("/absolute.md", b"D-02"),
                           ("run.py", b"raise RuntimeError('must not execute')")]))
    before = sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*"))
    original_open = io.open

    def guarded_open(file, mode="r", *args, **kwargs):
        assert not any(flag in mode for flag in ("w", "a", "x", "+")), (file, mode)
        return original_open(file, mode, *args, **kwargs)

    def forbidden(*args, **kwargs):
        pytest.fail("extractor must not extract members to disk")

    monkeypatch.setattr(io, "open", guarded_open)
    monkeypatch.setattr(zipfile.ZipFile, "extract", forbidden)
    monkeypatch.setattr(zipfile.ZipFile, "extractall", forbidden)
    assert claims.extract_claims(repo, write=True)["inserted"] == 2
    assert before == sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*"))


def test_depth_limit_accepts_two_nested_levels_and_skips_third(repo):
    too_deep = archive([("bad.md", b"D-99")])
    level2 = archive([("ok.md", b"D-01"), ("third.zip", too_deep)])
    level1 = archive([("second.zip", level2)])
    add_zip(repo, archive([("first.zip", level1)]))
    result = claims.extract_claims(repo, write=True)
    assert [r["source_label"] for r in rows(repo)] == ["D-01"]
    assert result["sources"]["zip"]["depth_exceeded"] == 1


def test_member_cap_skips_whole_member_and_continues(repo):
    oversized = b"D-99 " + b" " * claims.MAX_MEMBER_BYTES
    add_zip(repo, archive([("oversized.md", oversized), ("good.md", b"D-01")]))
    result = claims.extract_claims(repo, write=True)
    assert [r["source_label"] for r in rows(repo)] == ["D-01"]
    assert result["sources"]["zip"]["oversize_member"] == 1
    print("member_cap", json.dumps(result))


def test_total_cap_skips_remainder_without_partial_text(repo):
    padding = b" " * (3 * 1024 * 1024 - 5)
    add_zip(repo, archive([(f"{i}.md", label + padding) for i, label in
                           enumerate((b"D-01 ", b"D-02 ", b"D-99 "))]))
    result = claims.extract_claims(repo, write=True)
    assert {r["source_label"] for r in rows(repo)} == {"D-01", "D-02"}
    assert result["sources"]["zip"]["oversize_archive"] == 1
    assert result["sources"]["zip"]["md_members_read"] == 2
    print("archive_cap", json.dumps(result))


def test_exact_member_and_total_byte_limits_are_inclusive(repo):
    one = b"D-01 " + b" " * (claims.MAX_MEMBER_BYTES - 5)
    two = b"D-02 " + b" " * (claims.MAX_MEMBER_BYTES - 5)
    add_zip(repo, archive([("one.md", one), ("two.md", two)]))
    result = claims.extract_claims(repo, write=True)
    assert result["inserted"] == 2
    assert result["sources"]["zip"]["oversize_archive"] == 0
    assert result["sources"]["zip"]["oversize_member"] == 0


def test_member_count_cap_reports_skipped_remainder(repo):
    add_zip(repo, archive([(f"{i}.md", b" ") for i in range(claims.MAX_MEMBERS)]
                          + [("excluded.md", b"D-99")]))
    result = claims.extract_claims(repo, write=True)
    assert result["inserted"] == 0
    assert result["sources"]["zip"]["too_many_members"] == 1
    assert result["sources"]["zip"]["md_members_read"] == 200


def test_corrupt_archive_is_reported_and_other_assets_continue(repo):
    add_zip(repo, b"PK invalid")
    add_md(repo, "D-01")
    result = claims.extract_claims(repo, write=True)
    assert result["inserted"] == 1
    assert result["sources"]["zip"]["archive_errors"] == 1


def test_batch_transaction_rolls_back_earlier_inserts(repo):
    add_md(repo, "D-01 D-02")
    with repo._connection() as conn:
        conn.executescript("""CREATE TRIGGER reject_second BEFORE INSERT ON claims_candidates
            WHEN new.source_label='D-02' BEGIN SELECT RAISE(ABORT,'injected'); END;""")
    with pytest.raises(sqlite3.IntegrityError, match="injected"):
        claims.extract_claims(repo, write=True)
    assert rows(repo) == []


def test_existing_session_reused_and_nested_transaction_rejected(repo):
    add_md(repo, "D-01")
    with repo.session():
        assert claims.extract_claims(repo, write=True)["inserted"] == 1
        with repo.transaction():
            with pytest.raises(ValueError, match="owns its transaction"):
                claims.extract_claims(repo, write=True)


def test_uuid_collision_rejected_instead_of_overwriting_user_data(repo):
    add_md(repo, "D-01")
    claim_id = str(uuid5(NAMESPACE_URL, "knot:claim:decision:D-01"))
    with repo._connection() as conn:
        conn.execute("INSERT INTO claims_candidates "
                     "(claim_id,claim_type,atom,extraction_method,proposed_at,source_label) "
                     "VALUES (?,'question','open_question','user_input',0,'Q18-01')", (claim_id,))
    before = rows(repo)
    with pytest.raises(ValueError, match="conflicts"):
        claims.extract_claims(repo, write=True)
    assert rows(repo) == before


@pytest.mark.parametrize("args", [[], ["--unknown"], ["--db", "nonexistent.db"]])
def test_cli_errors_are_single_json_and_exit_one(tmp_path, args):
    result = subprocess.run([sys.executable, "-m", "mvp.backend.claim_extractor", *args],
                            cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 1
    assert len(result.stdout.splitlines()) == 1
    assert "error" in json.loads(result.stdout)
    assert not (ROOT / "nonexistent.db").exists()


def test_cli_dry_run_write_and_outside_cwd(repo, tmp_path):
    add_md(repo, "D-01")
    # Module resolution belongs to the launcher; the DB and object paths don't use cwd.
    program = "import sys;sys.path.insert(0,sys.argv.pop(1));from mvp.backend.claim_extractor import main;sys.exit(main())"
    base = [sys.executable, "-c", program, str(ROOT), "--db", str(repo.db_path)]
    for flags, expected in (([], (1, 0)), (["--write"], (1, 0)), (["--write"], (0, 1))):
        result = subprocess.run(base + flags, cwd=tmp_path, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        assert len(result.stdout.splitlines()) == 1
        summary = json.loads(result.stdout)
        assert (summary["inserted"], summary["unchanged"]) == expected


def test_schema_v14_required_without_implicit_migration(repo):
    with repo._connection() as conn:
        conn.execute("DELETE FROM schema_version WHERE version='1.4'")
    with pytest.raises(ValueError, match="schema v1.4 required"):
        claims.extract_claims(repo, write=True)
    assert repo._one("SELECT 1 FROM schema_version WHERE version='1.4'") is None
