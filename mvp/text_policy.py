"""Shared eligibility checks for short Knot asset text."""

from hashlib import sha256
import re


SHA256_PATTERN = r"[0-9a-fA-F]{64}"
ASSET_ID_PATTERN = r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}"
MAX_TEXT_BYTES = 8192
TEXT_MIMES = frozenset({"text/plain", "text/markdown"})
_CREDENTIAL_MARKER = re.compile(
    r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----"
    r"|\b(?:KNOT_TOKENS?|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|PASSWORD|CLIENT_SECRET|API_KEY)"
    r"""\s*["']?\s*[:=]\s*["']?\S"""
    r"|\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S",
    re.IGNORECASE,
)


def has_credential_marker(text, token):
    return bool((token and token in text) or _CREDENTIAL_MARKER.search(text))


def text_error(content, digest, token):
    """Return a fixed error for ineligible text, or None for eligible text."""
    if type(content) is not str:
        return "UNSUPPORTED_CONTENT"
    try:
        raw = content.encode("utf-8")
    except UnicodeEncodeError:
        return "UNSUPPORTED_CONTENT"
    if len(raw) > MAX_TEXT_BYTES:
        return "CONTENT_TOO_LARGE"
    if any(byte == 127 or (byte < 32 and byte not in (9, 10, 13)) for byte in raw):
        return "UNSUPPORTED_CONTENT"
    if sha256(raw).hexdigest() != digest:
        return "CONTENT_MISMATCH"
    if has_credential_marker(content, token):
        return "SENSITIVE_CONTENT"
    return None
