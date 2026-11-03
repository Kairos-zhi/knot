from copy import deepcopy

import pytest

from mvp.transport_views import metadata


ASSET_ID = "d18876aa-54b6-4601-b9cd-e73fa2104c28"
SENTINEL = "SYNTH-PRIVATE"


@pytest.fixture
def project():
    from mvp.plugin_projection import project_asset_meta

    return project_asset_meta


def envelope(value, **fields):
    return {"contract_version": 1, "ok": True, "value": value} | fields


def asset(media_type="text/markdown", **fields):
    return {"asset_id": ASSET_ID, "media_type": media_type} | fields


@pytest.mark.parametrize("list_view", [None, "meta"])
def test_real_meta_and_list_projection(project, list_view):
    row = asset(content_hash=SENTINEL, file_path=f"objects/{SENTINEL}")
    item = metadata(row) | {
        "source_uri": f"file://{SENTINEL}",
        "size": 123,
        "content": SENTINEL,
        "encoding": "base64",
        "extra": {"nested": [SENTINEL]},
    }
    fields = {} if list_view is None else {"view": list_view}
    response = envelope(
        {"items": [item], "content_hash": SENTINEL, "extra": SENTINEL},
        as_of=123,
        extra=SENTINEL,
        **fields,
    )
    before = deepcopy(response)
    expected = {"items": [{"asset_id": ASSET_ID, "kind": "text"}]}
    assert project(response) == expected
    assert response == before
    assert project(envelope(item, view="meta")) == expected
    assert project(envelope({"items": []})) == {"items": []}


@pytest.mark.parametrize(
    ("mime", "kind"),
    [
        ("text/plain", "text"),
        ("image/png", "image"),
        ("application/pdf", "document"),
        ("application/zip", "archive"),
        ("application/octet-stream", "binary"),
        (f"image/{SENTINEL}", "unknown"),
    ],
)
def test_mime_table_and_uuid_canonicalization(project, mime, kind):
    value = asset(mime, asset_id=ASSET_ID.upper())
    assert project(envelope(value, view="meta")) == {
        "items": [{"asset_id": ASSET_ID, "kind": kind}]
    }


def test_upstream_error_uses_only_fixed_code(project):
    assert project({
        "contract_version": 1,
        "ok": False,
        "error": {"code": SENTINEL, "message": SENTINEL, "detail": {"secret": SENTINEL}},
    }) == {"error": "UPSTREAM_ERROR"}


@pytest.mark.parametrize(
    "response",
    [
        None,
        [],
        envelope(asset()),
        envelope(asset(), view=None),
        envelope(asset(), view="content"),
        envelope({"items": []}, view="roots"),
        envelope({"items": []}, view=None),
        envelope(asset(), view="meta", contract_version=True),
        envelope(asset(), view="meta", contract_version=1.0),
        envelope(asset(), view="meta", contract_version=2),
        envelope(asset(), view="meta", ok=1),
        envelope({"items": {}}),
        envelope({"items": [], "asset_id": ASSET_ID}, view="meta"),
        envelope({"items": [asset(), asset(asset_id=SENTINEL)]}),
        envelope({"items": [asset(), False]}),
        envelope(asset(asset_id=123), view="meta"),
        envelope(asset(["text/plain"]), view="meta"),
        envelope(asset(asset_id=ASSET_ID.replace("-", "")), view="meta"),
        {"contract_version": 1, "ok": False},
    ],
)
def test_invalid_input_fails_without_partial_result(project, response):
    before = deepcopy(response)
    assert project(response) == {"error": "INVALID_INPUT"}
    assert response == before
