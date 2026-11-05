"""Project decoded HTTP asset responses for the thin host adapter."""

import re
import unicodedata
from uuid import UUID

from mvp.exploration_policy import (
    ExplorationError, normalize_snapshot, normalize_snapshot_v2, redact_exploration,
    redact_exploration_v2, validate_revision, validate_uuid, validate_text, _reject_token,
)
from mvp.text_policy import ASSET_ID_PATTERN, SHA256_PATTERN, TEXT_MIMES, text_error, has_credential_marker


_MIME_KIND = {
    "text/plain": "text",
    "text/markdown": "text",
    "text/x-python": "text",
    "application/json": "document",
    "application/pdf": "document",
    "image/png": "image",
    "image/jpeg": "image",
    "image/gif": "image",
    "image/webp": "image",
    "application/zip": "archive",
    "application/octet-stream": "binary",
}


def project_asset_meta(envelope: object) -> dict:
    """Return only canonical asset IDs and finite kinds, or a fixed error."""
    invalid = {"error": "INVALID_INPUT"}
    if type(envelope) is not dict:
        return invalid

    version = envelope.get("contract_version")
    if type(version) is not int or version != 1:
        return invalid

    ok = envelope.get("ok")
    view = envelope.get("view", "meta")
    if type(view) is not str or view != "meta":
        return invalid
    if ok is False:
        error = envelope.get("error")
        if (
            type(error) is dict
            and type(error.get("code")) is str
            and type(error.get("message")) is str
            and "value" not in envelope
        ):
            return {"error": "UPSTREAM_ERROR"}
        return invalid

    value = envelope.get("value")
    if ok is not True or type(value) is not dict or "error" in envelope:
        return invalid

    if "items" in value:
        assets = value["items"]
        if type(assets) is not list or "asset_id" in value:
            return invalid
    elif "view" in envelope:
        assets = [value]
    else:
        return invalid

    items = []
    for asset in assets:
        if type(asset) is not dict:
            return invalid
        asset_id = asset.get("asset_id")
        mime = asset.get("media_type")
        if type(asset_id) is not str or len(asset_id) != 36 or type(mime) is not str:
            return invalid
        try:
            canonical_id = str(UUID(asset_id))
        except ValueError:
            return invalid
        if asset_id.lower() != canonical_id:
            return invalid
        items.append({"asset_id": canonical_id, "kind": _MIME_KIND.get(mime, "unknown")})

    return {"items": items}


def _asset_value(envelope, view, asset_id):
    if (
        type(envelope) is dict
        and type(envelope.get("contract_version")) is int
        and envelope["contract_version"] == 1
        and envelope.get("ok") is True
        and envelope.get("view") == view
        and "error" not in envelope
    ):
        value = envelope.get("value")
        if type(value) is dict and value.get("asset_id") == asset_id:
            return value
    return {}


def project_text_anchor(envelope, asset_id, expected_hash):
    value = _asset_value(envelope, "meta", asset_id)
    digest = value.get("content_hash")
    mime = value.get("media_type")
    if type(digest) is not str or not re.fullmatch(SHA256_PATTERN, digest):
        return {"error": "UPSTREAM_ERROR"}
    if type(mime) is not str or mime not in TEXT_MIMES:
        return {"error": "UNSUPPORTED_CONTENT"}
    if expected_hash is not None and digest.lower() != expected_hash.lower():
        return {"error": "CONTENT_MISMATCH"}
    return {"asset_id": asset_id, "content_hash": digest.lower(), "media_type": mime}


def project_asset_text(envelope, anchor, token):
    value = _asset_value(envelope, "content", anchor["asset_id"])
    if not value or value.get("media_type") != anchor["media_type"]:
        return {"error": "UPSTREAM_ERROR"}
    content = value.get("content")
    if value.get("encoding") != "utf-8":
        return {"error": "UNSUPPORTED_CONTENT"}
    error = text_error(content, anchor["content_hash"], token)
    if error:
        return {"error": error}
    return anchor | {"content": content}


def project_asset_slice(envelope, asset_id, digest, offset, limit, token):
    invalid = {"error": "UPSTREAM_ERROR"}
    if (type(envelope) is not dict or set(envelope) != {'contract_version', 'ok', 'value'}
            or type(envelope['contract_version']) is not int or envelope['contract_version'] != 1
            or envelope['ok'] is not True):
        return invalid
    value = envelope['value']
    fields = {'asset_id', 'content_hash', 'media_type', 'total_bytes', 'offset', 'next_offset', 'text', 'has_more'}
    if type(value) is not dict or set(value) != fields:
        return invalid
    if (value['asset_id'] != asset_id or value['content_hash'] != digest
            or type(value['media_type']) is not str or value['media_type'] not in TEXT_MIMES or type(value['text']) is not str
            or any(type(value[k]) is not int for k in ('total_bytes', 'offset', 'next_offset'))
            or type(value['has_more']) is not bool):
        return invalid
    total, start, end = value['total_bytes'], value['offset'], value['next_offset']
    if not (0 <= start == offset <= end <= total <= 1_000_000):
        return invalid
    try:
        raw = value['text'].encode('utf-8')
    except UnicodeEncodeError:
        return invalid
    n = len(raw)
    if (n != end - start or n > limit or value['has_more'] != (end < total)
            or (total - start <= limit and n != total - start)
            or (total - start > limit and not limit - 3 <= n <= limit)
            or (end < total and n == 0)
            or any(b == 127 or (b < 32 and b not in (9, 10, 13)) for b in raw)):
        return invalid
    if has_credential_marker(value['text'], token):
        return {"error": "SENSITIVE_CONTENT"}
    return value


_SOURCE_REASONS = ("missing_source", "unsupported_source", "invalid_source",
                   "inconsistent_source", "sensitive_source", "source_limit")


def project_asset_source(envelope, asset_id, digest, token):
    invalid = {"error": "UPSTREAM_ERROR"}
    if (type(envelope) is not dict or set(envelope) != {"contract_version", "ok", "value"}
            or type(envelope["contract_version"]) is not int or envelope["contract_version"] != 1
            or envelope["ok"] is not True):
        return invalid
    value = envelope["value"]
    fields = {"asset_id", "content_hash", "source_status", "relative_path", "reason",
              "provenance_verified", "import_evidence_checked"}
    if type(value) is not dict or set(value) != fields:
        return invalid
    if (type(value["asset_id"]) is not str or value["asset_id"] != asset_id
            or not re.fullmatch(ASSET_ID_PATTERN, value["asset_id"])
            or type(value["content_hash"]) is not str or value["content_hash"] != digest
            or not re.fullmatch(r"[0-9a-f]{64}", value["content_hash"])
            or value["provenance_verified"] is not False or value["import_evidence_checked"] is not False):
        return invalid
    status, path, reason = value["source_status"], value["relative_path"], value["reason"]
    if type(status) is not str:
        return invalid
    if status == "unknown":
        return value if path is None and type(reason) is str and reason in _SOURCE_REASONS else invalid
    if status != "recorded_file_reference" or reason is not None or type(path) is not str:
        return invalid
    try:
        if not path or len(path.encode("utf-8")) > 1024:
            return invalid
        if any(character in path for character in "\\:%@?#"):
            return invalid
        if any(unicodedata.category(character).startswith("C") for character in path):
            return invalid
        if any(not segment or segment in (".", "..") or segment != segment.strip()
               or len(segment.encode("utf-8")) > 255 for segment in path.split("/")):
            return invalid
    except UnicodeError:
        return invalid
    if has_credential_marker(path, token):
        return {"error": "SENSITIVE_CONTENT"}
    return value


def project_asset_search(envelope, limit):
    invalid = {"error": "UPSTREAM_ERROR"}
    if (type(envelope) is not dict or envelope.keys() != {"contract_version", "ok", "value"}
            or type(envelope["contract_version"]) is not int or envelope["contract_version"] != 1
            or envelope["ok"] is not True):
        return invalid
    value = envelope["value"]
    if type(value) is not dict or value.keys() != {"items", "has_more"}:
        return invalid
    items, has_more = value["items"], value["has_more"]
    if (type(items) is not list or len(items) > limit or type(has_more) is not bool
            or (has_more and len(items) != limit)):
        return invalid
    ids = set()
    for item in items:
        if type(item) is not dict or item.keys() != {"asset_id", "content_hash", "media_type"}:
            return invalid
        asset_id, digest, mime = item["asset_id"], item["content_hash"], item["media_type"]
        if (type(asset_id) is not str or not re.fullmatch(ASSET_ID_PATTERN, asset_id)
                or asset_id in ids or type(digest) is not str
                or not re.fullmatch(r"[0-9a-f]{64}", digest)
                or type(mime) is not str or mime not in TEXT_MIMES):
            return invalid
        ids.add(asset_id)
    return value


def _exploration_value(envelope, fields):
    if (type(envelope) is not dict or envelope.keys() != {"contract_version", "ok", "value"}
            or type(envelope["contract_version"]) is not int or envelope["contract_version"] != 1
            or envelope["ok"] is not True):
        raise ExplorationError("UPSTREAM_ERROR")
    value = envelope["value"]
    if type(value) is not dict or value.keys() != fields:
        raise ExplorationError("UPSTREAM_ERROR")
    return value


def _validate_checkpoint_fields(value):
    validate_uuid(value["exploration_id"])
    validate_revision(value["revision"], 1)
    if "saved_at" in value and (type(value["saved_at"]) is not int or not 0 <= value["saved_at"] <= 2**63 - 1):
        raise ExplorationError("UPSTREAM_ERROR")


def project_exploration_receipt(envelope, exploration_id, expected_revision):
    try:
        value = _exploration_value(envelope, {"exploration_id", "revision", "event_id"})
        _validate_checkpoint_fields(value)
        validate_uuid(value["event_id"])
        if value["exploration_id"] == exploration_id and value["revision"] == expected_revision + 1:
            return value
    except ExplorationError:
        pass
    return {"error": "WRITE_OUTCOME_UNKNOWN"}


def project_exploration_list(envelope, limit):
    try:
        value = _exploration_value(envelope, {"items"})
        items = value["items"]
        if type(items) is not list or len(items) > limit:
            raise ExplorationError("UPSTREAM_ERROR")
        seen = set()
        for item in items:
            if type(item) is not dict or item.keys() != {"exploration_id", "revision", "saved_at"}:
                raise ExplorationError("UPSTREAM_ERROR")
            _validate_checkpoint_fields(item)
            if item["exploration_id"] in seen:
                raise ExplorationError("UPSTREAM_ERROR")
            seen.add(item["exploration_id"])
        return value
    except ExplorationError:
        return {"error": "UPSTREAM_ERROR"}


def project_exploration_checkpoint(envelope, exploration_id, revision, token):
    try:
        value = _exploration_value(envelope, {
            "exploration_id", "revision", "event_id", "saved_at", "references", "stop_note", "stop_note_reason",
        })
        _validate_checkpoint_fields(value)
        validate_uuid(value["event_id"])
        if value["exploration_id"] != exploration_id or (revision is not None and value["revision"] != revision):
            raise ExplorationError("UPSTREAM_ERROR")
        entries = value["references"]
        if type(entries) is not list or len(entries) > 32:
            raise ExplorationError("UPSTREAM_ERROR")
        refs = []
        unavailable = False
        for entry in entries:
            if type(entry) is not dict:
                raise ExplorationError("UPSTREAM_ERROR")
            status = entry.get("status")
            if status not in ("available", "forbidden", "missing", "hash_mismatch"):
                raise ExplorationError("UPSTREAM_ERROR")
            if status != "available":
                if "reason" in entry:
                    raise ExplorationError("UPSTREAM_ERROR")
                unavailable = True
            refs.append({key: item for key, item in entry.items() if key != "status"})
        normalized = normalize_snapshot(refs, value["stop_note"])
        if any(saved["expected_content_hash"] != projected["expected_content_hash"]
               for saved, projected in zip(refs, normalized["references"])):
            raise ExplorationError("UPSTREAM_ERROR")
        note, reason = value["stop_note"], value["stop_note_reason"]
        if ((unavailable and reason != "dependency_unavailable")
                or (not unavailable and reason not in (None, "sensitive_content"))
                or (reason is not None and note is not None)):
            raise ExplorationError("UPSTREAM_ERROR")
        return redact_exploration(value, token)
    except ExplorationError:
        return {"error": "UPSTREAM_ERROR"}


def project_exploration_receipt_v2(envelope, exploration_id, expected_revision, token):
    result = project_exploration_receipt(envelope, exploration_id, expected_revision)
    if "error" in result:
        return result
    try:
        _reject_token(result.values(), token)
    except ExplorationError:
        return {"error": "WRITE_OUTCOME_UNKNOWN"}
    return result


def project_exploration_checkpoint_v2(envelope, exploration_id, revision, token):
    try:
        fields = {"exploration_id", "revision", "event_id", "saved_at", "references", "stop_note",
                  "stop_note_reason", "snapshot_version", "relations", "origin"}
        value = _exploration_value(envelope, fields)
        _validate_checkpoint_fields(value); validate_uuid(value["event_id"])
        if value["exploration_id"] != exploration_id or (revision is not None and value["revision"] != revision):
            raise ExplorationError("UPSTREAM_ERROR")
        version = value["snapshot_version"]
        if type(version) is not int or version not in (1, 2): raise ExplorationError("UPSTREAM_ERROR")
        refs, statuses = [], {}
        if type(value["references"]) is not list: raise ExplorationError("UPSTREAM_ERROR")
        for ref in value["references"]:
            if type(ref) is not dict or ref.get("status") not in ("available", "forbidden", "missing", "hash_mismatch"):
                raise ExplorationError("UPSTREAM_ERROR")
            if ref["status"] != "available" and "reason" in ref: raise ExplorationError("UPSTREAM_ERROR")
            refs.append({k:v for k,v in ref.items() if k != "status"})
            statuses[ref.get("asset_id")] = ref["status"]
        normalized = normalize_snapshot(refs, value["stop_note"])
        if any(r["expected_content_hash"] != n["expected_content_hash"] for r,n in zip(refs, normalized["references"])):
            raise ExplorationError("UPSTREAM_ERROR")
        unavailable = any(status != "available" for status in statuses.values())
        note, why = value["stop_note"], value["stop_note_reason"]
        if ((unavailable and (note is not None or why != "dependency_unavailable")) or
            (not unavailable and (why not in (None, "sensitive_content") or (why is not None and note is not None)))):
            raise ExplorationError("UPSTREAM_ERROR")
        if type(value["relations"]) is not list: raise ExplorationError("UPSTREAM_ERROR")
        validated_relations = []
        for rel in value["relations"]:
            if type(rel) is not dict: raise ExplorationError("UPSTREAM_ERROR")
            ids = {"relation_id", "from_asset_id", "to_asset_id"}
            is_available = all(statuses.get(rel.get(k)) == "available" for k in ("from_asset_id", "to_asset_id"))
            if set(rel) == ids | {"label", "reason"}:
                if not is_available: raise ExplorationError("UPSTREAM_ERROR")
                checked = rel
            elif set(rel) == ids | {"reason_code"}:
                if rel["reason_code"] != ("sensitive_content" if is_available else "dependency_unavailable"):
                    raise ExplorationError("UPSTREAM_ERROR")
                checked = {k:rel[k] for k in ids} | {"label":"_", "reason":None}
            else: raise ExplorationError("UPSTREAM_ERROR")
            validated_relations.append(checked)
        normalize_snapshot_v2(2, refs, value["stop_note"], validated_relations)
        origin = value["origin"]
        if version == 1 and (value["relations"] or origin is not None): raise ExplorationError("UPSTREAM_ERROR")
        if origin is not None:
            if type(origin) is not dict or set(origin) != {"source_exploration_id", "source_revision", "source_event_id", "source_snapshot_sha256", "target_creation_event_id"}:
                raise ExplorationError("UPSTREAM_ERROR")
            for k in ("source_exploration_id", "source_event_id", "target_creation_event_id"): validate_uuid(origin[k])
            validate_revision(origin["source_revision"], 1)
            if (origin["source_exploration_id"] == exploration_id or origin["source_event_id"] == origin["target_creation_event_id"]
                or origin["source_event_id"] == value["event_id"]
                or (value["event_id"] == origin["target_creation_event_id"]) != (value["revision"] == 1)
                or type(origin["source_snapshot_sha256"]) is not str
                or not re.fullmatch(r"[0-9a-f]{64}", origin["source_snapshot_sha256"])):
                raise ExplorationError("UPSTREAM_ERROR")
        return redact_exploration_v2(value, token)
    except (ExplorationError, KeyError, TypeError, ValueError, RecursionError):
        return {"error": "UPSTREAM_ERROR"}
