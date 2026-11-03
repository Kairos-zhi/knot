"""Project decoded HTTP asset metadata for a future thin host adapter."""

from uuid import UUID


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
