"""Executable structural examples for the locked v1.4-draft contract.

jsonschema is a test dependency only. These examples validate definitions,
not HTTP routing or runtime authorization behavior.
"""

from copy import deepcopy
import json
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError
import pytest


SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "contract/v1/schema.json").read_bytes()
)
ENDPOINTS = json.loads(
    (Path(__file__).resolve().parents[1] / "contract/v1/endpoints.json").read_bytes()
)

SUPPORT = {"boolean": True, "minimal_roots": [["event-1"]]}
CLAIM = {
    "claim_id": "claim-1", "claim_type": "assertion", "atom": "ready",
    "unverified": False, "source_label": "T-01", "source_members": ["note.md"],
    "support_sources": ["asset-1"], "user_response": "confirm",
    "proposed_at": 1000, "reviewed_at": 2000,
    "candidate_level": {"status": "confirmed", "confirmed_at": 2000},
    "atom_level": SUPPORT,
}
PATH_ITEM = {
    "event_id": "event-1", "event_type": "user_confirm", "subject": "claim-1",
    "event_time": 1000, "recorded_at": 2000, "depth": 1,
    "evidence_refs": ["asset-1"],
}
ASSET = {
    "asset_id": "asset-1", "content_hash": "a" * 64,
    "media_type": "text/markdown", "source_uri": None,
    "path": "objects/aa/" + "a" * 64, "size": 5,
}
ERROR = {"code": "BAD_AS_OF", "message": "future time", "detail": {"as_of": 3000}}

VALID = {
    "OkEnvelopeViewed": {
        "contract_version": 1, "ok": True, "view": "meta", "value": ASSET,
    },
    "OkEnvelopeTimed": {
        "contract_version": 1, "ok": True, "as_of": 2000,
        "view": "boolean", "value": {"boolean": True},
    },
    "ContractInfo": {
        "contract_version": 1,
        "schema_sha256": "4a8175d8272788d1206fcace13b4d9c7c2b6cbd07b953afb5d5fbd579babd59d",
    },
    "OkEnvelope": {
        "contract_version": 1, "ok": True, "as_of": 2000,
        "view": "roots", "value": SUPPORT,
    },
    "ErrorEnvelope": {"contract_version": 1, "ok": False, "error": ERROR},
    "Error": ERROR,
    "Health": {
        "status": "ok", "contract_version": 1, "schema_version": "1.4",
        "read_only": False, "uptime_s": 1.5, "db_path_sha256": "b" * 64, "seq": 1,
    },
    "AtomSupport": SUPPORT,
    "Snapshot": {
        "as_of": 2000, "rule_version": 1, "view": "roots",
        "atoms": {"ready": SUPPORT}, "counts": {"assets": 1, "events": 1, "claims": 1},
    },
    "Claim": CLAIM,
    "ClaimList": {"as_of": 2000, "items": [CLAIM], "next_cursor": None},
    "TracePathItem": PATH_ITEM,
    "AssetMeta": ASSET,
    "AssetContent": {
        "asset_id": "asset-1", "media_type": "text/markdown",
        "content": "hello", "encoding": "utf-8",
    },
    "Trace": {
        "claim_id": "claim-1", "source_label": "T-01", "atom": "ready",
        "status": "confirmed", "path": [PATH_ITEM], "assets": [ASSET],
        "candidate_sources": ["asset-1"], "depth": 1,
    },
    "CommandRequest": {
        "command": "claim.confirm", "args": {"claim_id": "claim-1"},
        "idempotency_key": "request-1",
    },
    "CommandResult": {"command": "claim.confirm", "status": "confirmed", "event_id": "event-1", "job_id": None},
    "Job": {
        "job_id": "job-1", "command": "bundle.create", "status": "done",
        "created_at": 1000, "updated_at": 2000,
        "result": {"bundle_id": "bundle-1"}, "error": None,
    },
    "ChangeEvent": {"seq": 1, "type": "support.changed", "ts": 2000, "payload": {}},
}

# One targeted violation per definition. Keep enum/type/boundary failures visible
# instead of using the same missing-field failure for every definition.
INVALID_OVERRIDES = {
    "OkEnvelopeViewed": ("view", "unknown"),
    "OkEnvelopeTimed": ("as_of", None),
    "ContractInfo": ("schema_sha256", 1),
    "OkEnvelope": ("contract_version", 2),
    "ErrorEnvelope": ("ok", True),
    "Error": ("code", "UNKNOWN_ERROR"),
    "Health": ("status", "healthy"),
    "AtomSupport": ("minimal_roots", ["event-1"]),
    "Snapshot": ("counts", {"assets": 1, "events": 1, "claims": "1"}),
    "Claim": ("candidate_level", {"status": "accepted"}),
    "ClaimList": ("items", [{"claim_id": "claim-1"}]),
    "TracePathItem": ("depth", 0),
    "AssetMeta": ("size", "5"),
    "AssetContent": ("encoding", "gzip"),
    "Trace": ("depth", -1),
    "CommandRequest": ("command", "asset.overwrite"),
    "CommandResult": ("event_id", 1),
    "Job": ("status", "completed"),
    "ChangeEvent": ("seq", 0),
}


def definition_validator(name):
    # Retain the root definitions so local nested refs resolve without network.
    return Draft202012Validator({
        "$schema": SCHEMA["$schema"], "$defs": SCHEMA["$defs"],
        "$ref": f"#/$defs/{name}",
    })


def test_contract_meta_schema():
    Draft202012Validator.check_schema(SCHEMA)


def test_command_result_requires_status():
    specimen = deepcopy(VALID["CommandResult"])
    del specimen["status"]
    with pytest.raises(ValidationError):
        definition_validator("CommandResult").validate(specimen)


def test_every_definition_has_both_examples():
    assert len(SCHEMA["$defs"]) == 19
    assert set(SCHEMA["$defs"]) == set(VALID) == set(INVALID_OVERRIDES)


@pytest.mark.parametrize("name", VALID)
def test_valid_definition_example(name):
    definition_validator(name).validate(VALID[name])
    if name in ("OkEnvelope", "OkEnvelopeTimed", "OkEnvelopeViewed", "ErrorEnvelope"):
        Draft202012Validator(SCHEMA).validate(VALID[name])


@pytest.mark.parametrize("name", INVALID_OVERRIDES)
def test_invalid_definition_example_is_rejected(name):
    specimen = deepcopy(VALID[name])
    field, value = INVALID_OVERRIDES[name]
    specimen[field] = value
    with pytest.raises(ValidationError):
        definition_validator(name).validate(specimen)


def test_timed_envelope_requires_as_of():
    specimen = deepcopy(VALID["OkEnvelopeTimed"])
    del specimen["as_of"]
    with pytest.raises(ValidationError):
        definition_validator("OkEnvelopeTimed").validate(specimen)


def test_timed_envelope_requires_view():
    specimen = deepcopy(VALID["OkEnvelopeTimed"])
    del specimen["view"]
    with pytest.raises(ValidationError):
        definition_validator("OkEnvelopeTimed").validate(specimen)


def test_viewed_envelope_requires_view():
    specimen = deepcopy(VALID["OkEnvelopeViewed"])
    del specimen["view"]
    with pytest.raises(ValidationError):
        definition_validator("OkEnvelopeViewed").validate(specimen)


@pytest.mark.parametrize("field", ["candidate_level", "atom_level"])
def test_claim_requires_both_levels(field):
    specimen = deepcopy(CLAIM)
    del specimen[field]
    with pytest.raises(ValidationError):
        definition_validator("Claim").validate(specimen)


def test_binary_asset_requires_path():
    specimen = {
        "asset_id": "asset-1", "media_type": "application/zip",
        "content": None, "encoding": "none", "path": "objects/aa/binary",
    }
    definition_validator("AssetContent").validate(specimen)
    del specimen["path"]
    with pytest.raises(ValidationError):
        definition_validator("AssetContent").validate(specimen)


def test_error_rejects_code_outside_closed_set():
    with pytest.raises(ValidationError):
        definition_validator("Error").validate({"code": "UNLISTED", "message": "error"})


def test_endpoint_response_definitions_exist():
    assert len(ENDPOINTS["routes"]) == 10
    for route in ENDPOINTS["routes"]:
        for name in route["response"].split("|"):
            assert name in SCHEMA["$defs"], (route["path"], name)


def test_endpoint_errors_belong_to_closed_set():
    allowed = set(SCHEMA["$defs"]["Error"]["properties"]["code"]["enum"])
    for route in ENDPOINTS["routes"]:
        assert set(route["errors"]) <= allowed, route["path"]


def test_endpoint_methods_are_get_or_post():
    assert set(ENDPOINTS["method_whitelist"]) == {"GET", "POST"}
    for route in ENDPOINTS["routes"]:
        assert route["method"] in {"GET", "POST"}, route["path"]


def test_endpoint_envelopes_are_plain_timed_or_viewed():
    for route in ENDPOINTS["routes"]:
        assert route["envelope"] in {"plain", "timed", "viewed"}, route["path"]


def test_endpoint_timed_envelopes_match_exact_routes():
    assert {route["path"] for route in ENDPOINTS["routes"]
            if route["envelope"] == "timed"} == {
        "/snapshot", "/claims", "/claims/{claim_id}",
    }


def test_endpoint_viewed_envelopes_match_exact_routes():
    assert {route["path"] for route in ENDPOINTS["routes"]
            if route["envelope"] == "viewed"} == {"/assets/{asset_id}"}
