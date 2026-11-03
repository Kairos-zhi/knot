"""Project decoded HTTP asset responses for the thin host adapter."""

import re
from uuid import UUID

from mvp.text_policy import ASSET_ID_PATTERN, SHA256_PATTERN, TEXT_MIMES, text_error


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
