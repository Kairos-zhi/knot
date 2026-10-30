"""Import a manifest-verified baseline into an existing v1.1 candidate DB.

Run: python -m mvp.backend.import_baseline --source DIR --db EXISTING_DB
No defaults, migrations, archive extraction, network or model calls.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
from tempfile import NamedTemporaryFile
from urllib.parse import quote

from .asset_repo import AssetRepo
from .asset_access import identity_mode
from .event_store import EventStore


TEXT_LIMIT = 1_000_000  # 1 MB, measured in raw bytes.
MEDIA_TYPES = {
    ".md": "text/markdown", ".py": "text/x-python",
    ".json": "application/json", ".sha256": "text/plain",
    ".zip": "application/zip",
}


class _ImportRepo(AssetRepo, EventStore):
    """Use both existing services on one connection for per-file atomicity."""


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def snapshot(source):
    """Read source hashes and mtimes without writing into the source tree."""
    source = Path(source).expanduser().resolve(strict=True)
    rows = []
    for path in sorted(source.rglob("*")):
        if path.is_symlink() or not path.resolve().is_relative_to(source):
            raise ValueError("source links are not supported")
        if path.is_file():
            stat = path.stat()
            rows.append({"path": path.relative_to(source).as_posix(),
                         "sha256": digest(path), "bytes": stat.st_size,
                         "mtime_ns": stat.st_mtime_ns})
    return rows


def verify_manifest(source):
    """Verify every manifest member and reject missing/unlisted source files."""
    source = Path(source).expanduser().resolve(strict=True)
    manifest = source / "MANIFEST.sha256"
    if manifest.is_symlink():
        raise ValueError("manifest must not be a symlink")
    manifest_bytes = manifest.read_bytes()
    members = {}
    for line in manifest_bytes.decode("utf-8").splitlines():
        expected, name = line.split(maxsplit=1)
        name = name.lstrip("*")
        path = source / name
        if (name in members or path.is_symlink()
                or not path.resolve().is_relative_to(source)):
            raise ValueError("invalid manifest path")
        if digest(path) != expected.lower():
            raise ValueError(f"manifest hash mismatch: {name}")
        members[name] = expected.lower()
    inventory = snapshot(source)
    expected_hashes = dict(members)
    expected_hashes["MANIFEST.sha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    if {r["path"]: r["sha256"] for r in inventory} != expected_hashes:
        raise ValueError("manifest does not cover the source inventory")
    return inventory


def _store_object(root, content_hash, data):
    path = (root / content_hash[:2] / content_hash).resolve()
    if not path.is_relative_to(root):
        raise ValueError("object path escapes the object directory")
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            stream.close()
            temporary.unlink()
            raise
    try:
        try:
            os.link(temporary, path)  # Publish atomically without replacing a file.
        except FileExistsError:
            if digest(path) != content_hash:
                raise ValueError("existing object has a mismatched hash")
    finally:
        temporary.unlink()
    return "objects/" + content_hash[:2] + "/" + content_hash


def import_baseline(source, db_path, *, actor='local-user'):
    """Verify, snapshot, check schema, then import one atomic pair per file."""
    if not isinstance(actor, str) or not actor or any(c in actor for c in '\r\n'):
        raise ValueError('actor must be a non-empty identity')
    source = Path(source).expanduser().resolve(strict=True)
    before = verify_manifest(source)
    db = Path(db_path).expanduser().resolve()
    objects = (db.parent / "objects").resolve()
    if (db.is_relative_to(source) or objects.is_relative_to(source)
            or source.is_relative_to(objects)):
        raise ValueError("database/objects must be outside the source tree")
    result = {"imported": 0, "skipped": 0, "indexed": 0,
              "unindexed": 0, "failed": []}
    repo = _ImportRepo(db)
    with repo.session():
        grants = repo._one("SELECT 1 FROM schema_version WHERE version='1.6'") is not None
        if not grants and identity_mode() == 'configured':
            raise ValueError('schema v1.6 required for configured imports; migrate explicitly')
        version = repo._one("SELECT version FROM schema_version WHERE version='1.1'")
        if version is None:
            raise ValueError("schema 1.1 required; migrate explicitly before importing")
        for row in before:
            try:
                path = source / row["path"]
                media = MEDIA_TYPES[path.suffix.lower()]
                content = path.read_bytes()
                if (hashlib.sha256(content).hexdigest() != row["sha256"]
                        or path.stat().st_mtime_ns != row["mtime_ns"]):
                    raise ValueError("source changed after manifest verification")
                event_time = row["mtime_ns"] // 1_000_000
                if event_time > int(time.time() * 1000):
                    raise ValueError("source mtime is in the future")
                embedded = path.suffix.lower() != ".zip" and len(content) <= TEXT_LIMIT
                uri = "file://" + quote(row["path"], safe="/")
                with repo.transaction():
                    existing = repo._one(
                        "SELECT asset_id FROM assets WHERE content_hash=?",
                        (row["sha256"],),
                    )
                    if not existing:
                        file_path = None if embedded else _store_object(
                            objects, row["sha256"], content
                        )
                        asset_id = repo.add_asset(
                            row["sha256"], media,
                            content_blob=content if embedded else None,
                            file_path=file_path, source_uri=uri, created_at=event_time,
                            metadata_json=json.dumps({
                                "origin": "v0.4", "path": row["path"],
                            }),
                        )
                        if grants:
                            with repo._connection() as conn:
                                conn.execute('INSERT INTO asset_readers VALUES (?,?)', (asset_id, actor))
                        repo.add_event(
                            "import", subject=asset_id, source=uri,
                            event_time=event_time,
                            target_assets=[asset_id], evidence_refs=[],
                            payload_json=json.dumps({
                                "bytes": len(content), "media_type": media,
                                "origin": "v0.4",
                            }),
                        )
                if existing:
                    result["skipped"] += 1
                else:
                    result["imported"] += 1
                    result["indexed" if embedded else "unindexed"] += 1
            except (OSError, ValueError, KeyError, sqlite3.Error) as exc:
                result["failed"].append({"path": row["path"], "error": str(exc)})
    try:
        if verify_manifest(source) != before:
            raise ValueError("source changed during import")
    except (OSError, ValueError) as exc:
        result["failed"].append({"path": ".", "error": str(exc)})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument('--actor', default='local-user', help='importing actor for asset read grants')
    args = parser.parse_args()
    try:
        summary = import_baseline(args.source, args.db, actor=args.actor)
    except (OSError, ValueError, sqlite3.Error) as exc:
        summary = {"imported": 0, "skipped": 0, "indexed": 0, "unindexed": 0,
                   "failed": [{"path": ".", "error": str(exc)}]}
    print(json.dumps(summary, ensure_ascii=True))
    raise SystemExit(1 if summary["failed"] else 0)
