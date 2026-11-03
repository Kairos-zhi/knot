"""Shared exploration input validation for the core and transports."""

import json
import re

from mvp.text_policy import ASSET_ID_PATTERN, SHA256_PATTERN, has_credential_marker


MAX_REVISION = 2**63 - 1
MAX_SAVE_BYTES = 128 * 1024
SAVE_REQUIRED = {"exploration_id", "expected_revision", "request_key", "references"}


class ExplorationError(ValueError):
    """A fixed, recoverable exploration operation error."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def validate_uuid(value):
    if type(value) is not str or not re.fullmatch(ASSET_ID_PATTERN, value):
        raise ExplorationError("INVALID_ARGUMENTS")


def validate_revision(value, minimum):
    if type(value) is not int or not minimum <= value <= MAX_REVISION:
        raise ExplorationError("INVALID_ARGUMENTS")


def validate_text(value, limit):
    if type(value) is not str or len(value) > limit:
        raise ExplorationError("INVALID_ARGUMENTS")
    try:
        raw = value.encode("utf-8")
    except UnicodeEncodeError:
        raise ExplorationError("INVALID_ARGUMENTS") from None
    if len(raw) > limit or any(byte == 127 or (byte < 32 and byte not in (9, 10, 13)) for byte in raw):
        raise ExplorationError("INVALID_ARGUMENTS")


def normalize_snapshot(references, stop_note):
    if type(references) is not list or len(references) > 32:
        raise ExplorationError("INVALID_ARGUMENTS")
    if stop_note is not None:
        validate_text(stop_note, 2048)
    entries, seen = [], set()
    required = {"asset_id", "expected_content_hash", "disposition"}
    for ref in references:
        if type(ref) is not dict or ref.keys() - (required | {"reason"}) or not required <= ref.keys():
            raise ExplorationError("INVALID_ARGUMENTS")
        asset_id, digest, disposition = ref["asset_id"], ref["expected_content_hash"], ref["disposition"]
        validate_uuid(asset_id)
        if (asset_id in seen or type(digest) is not str or not re.fullmatch(SHA256_PATTERN, digest)
                or type(disposition) is not str or disposition not in ("selected", "excluded")):
            raise ExplorationError("INVALID_ARGUMENTS")
        seen.add(asset_id)
        reason = ref.get("reason")
        if reason is not None:
            validate_text(reason, 512)
        entries.append({"asset_id": asset_id, "expected_content_hash": digest.lower(),
                        "disposition": disposition, "reason": reason})
    return {"references": entries, "stop_note": stop_note}


def normalize_snapshot_v2(snapshot_version, references, stop_note, relations):
    if type(snapshot_version) is not int or snapshot_version != 2:
        raise ExplorationError("INVALID_ARGUMENTS")
    snapshot = normalize_snapshot(references, stop_note)
    if type(relations) is not list or len(relations) > 64:
        raise ExplorationError("INVALID_ARGUMENTS")
    selected = {r["asset_id"] for r in snapshot["references"] if r["disposition"] == "selected"}
    entries, seen = [], set()
    required = {"relation_id", "from_asset_id", "to_asset_id", "label"}
    for relation in relations:
        if (type(relation) is not dict or not required <= relation.keys()
                or relation.keys() - (required | {"reason"})):
            raise ExplorationError("INVALID_ARGUMENTS")
        rid, source, target, label = (relation[k] for k in
                                       ("relation_id", "from_asset_id", "to_asset_id", "label"))
        for value in (rid, source, target):
            validate_uuid(value)
        validate_text(label, 128)
        if not label.strip() or rid in seen or source == target or source not in selected or target not in selected:
            raise ExplorationError("INVALID_ARGUMENTS")
        reason = relation.get("reason")
        if reason is not None:
            validate_text(reason, 512)
        seen.add(rid)
        entries.append(dict(relation_id=rid, from_asset_id=source, to_asset_id=target,
                            label=label, reason=reason))
    return {"snapshot_version": 2, **snapshot, "relations": entries}


def decode_snapshot(raw):
    """Decode persisted snapshots strictly; never repair malformed historical rows."""
    try:
        value = strict_json(raw.encode("utf-8"))
        if type(value) is not dict:
            raise ValueError()
        if set(value) == {"references", "stop_note"}:
            normalized = normalize_snapshot(value["references"], value["stop_note"])
        elif set(value) == {"snapshot_version", "references", "stop_note", "relations"}:
            normalized = normalize_snapshot_v2(**value)
        else:
            raise ValueError()
        if normalized != value:
            raise ValueError()
        return normalized
    except (ValueError, TypeError, UnicodeError, AttributeError, KeyError, RecursionError):
        raise ExplorationError("INVALID_SNAPSHOT") from None


def strict_json(raw):
    def object_from_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result

    def invalid_constant(_):
        raise ValueError("invalid JSON constant")

    return json.loads(raw.decode("utf-8"), object_pairs_hook=object_from_pairs,
                      parse_constant=invalid_constant)


def normalize_save(body, token):
    if (type(body) is not dict or not SAVE_REQUIRED <= body.keys()
            or body.keys() - (SAVE_REQUIRED | {"stop_note"})):
        raise ExplorationError("INVALID_ARGUMENTS")
    validate_uuid(body["exploration_id"])
    validate_uuid(body["request_key"])
    validate_revision(body["expected_revision"], 0)
    snapshot = normalize_snapshot(body["references"], body.get("stop_note"))
    text = [snapshot["stop_note"], *(ref["reason"] for ref in snapshot["references"])]
    if any(value is not None and has_credential_marker(value, token) for value in text):
        raise ExplorationError("SENSITIVE_CONTENT")
    return body | snapshot


def redact_exploration(value, token):
    refs = []
    for entry in value["references"]:
        entry = entry.copy()
        reason = entry.get("reason")
        if reason is not None and has_credential_marker(reason, token):
            entry.pop("reason")
        refs.append(entry)
    redacted = value | {"references": refs}
    note = redacted["stop_note"]
    if note is not None and has_credential_marker(note, token):
        redacted.update(stop_note=None, stop_note_reason="sensitive_content")
    return redacted
