"""Shared limits and literal query normalization for asset search."""

from unicodedata import category


MAX_QUERY_BYTES = 128
MAX_TERMS = 8
DEFAULT_LIMIT = 10
MAX_LIMIT = 20


def query_terms(query):
    """Return casefolded terms or an empty tuple for an invalid query."""
    if type(query) is not str:
        return ()
    try:
        if len(query) > MAX_QUERY_BYTES or len(query.encode("utf-8")) > MAX_QUERY_BYTES:
            return ()
    except UnicodeEncodeError:
        return ()
    if any(category(char) == "Cc" for char in query):
        return ()
    terms = query.casefold().split()
    return tuple(terms) if 1 <= len(terms) <= MAX_TERMS else ()


def valid_limit(limit):
    return type(limit) is int and 1 <= limit <= MAX_LIMIT
