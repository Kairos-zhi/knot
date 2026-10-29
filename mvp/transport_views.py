"""Shape-only projections shared by HTTP and offline CLI; no truth calculations."""

import json
from pathlib import Path, PureWindowsPath


def metadata(row):
    path = row.get("file_path", row.get("path"))
    if not isinstance(path, str) or not path or Path(path).is_absolute() or PureWindowsPath(path).drive or ".." in path.replace("\\", "/").split("/"):
        path = None
    return {k: row[k] for k in ("asset_id", "content_hash", "media_type")} | {"path": path}


def event_rows(rows):
    return [{k: r[k] for k in ("event_id", "event_type", "event_time", "recorded_at")} for r in rows]


def claim_item(row, support, *, boolean=False):
    fields = ("claim_id", "claim_type", "atom", "source_label", "user_response", "proposed_at", "reviewed_at")
    item = {k: row[k] for k in fields if k in row}
    item["unverified"] = bool(row["unverified"])
    item["candidate_level"] = {k: support[k] for k in ("status", "boolean", "minimal_roots")}
    item["atom_level"] = ({"boolean": support["atom_view"]["boolean"]} if boolean else support["atom_view"])
    if not boolean:
        for k in ("support_sources", "source_members"):
            item[k] = json.loads(row[k]) if row.get(k) else []
    return item


def trace_view(result):
    fields = ("claim_id", "source_label", "atom", "status", "path", "assets", "depth", "candidate_sources")
    return {k: result[k] for k in fields} | {"assets": [metadata(a) for a in result["assets"]]}


def command_result(command, result):
    return dict(command=command, status=result["status"], job_id=None,
                event_id=None if result["status"].startswith("already_") else result["event_id"])
