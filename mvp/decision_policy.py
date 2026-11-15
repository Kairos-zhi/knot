"""Closed decision archive contracts, provenance checks and broker projection."""

from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import json
import re

from mvp.exploration_policy import strict_json, validate_text, ExplorationError
from mvp.text_policy import ASSET_ID_PATTERN, has_credential_marker


SOURCE_VERSION = 'knot.decision-source/0.1'
ARCHIVE_VERSION = 'knot.decision-archive/0.1'
IMPORT_VERSION = 'knot.decision-import/0.1'
SOURCE_MIME = 'application/vnd.knot.decision-source+json'
ARCHIVE_MIME = 'application/vnd.knot.decision-archive+json'
MAX_SOURCE_TEXT_BYTES = 64 * 1024
MAX_ARCHIVE_BYTES = 128 * 1024
MAX_SOURCE_BYTES = 1024 * 1024
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_SOURCES = 32
MAX_ITEMS = 20
SOURCE_FIELDS = {'version', 'kind', 'title', 'text', 'text_sha256',
                 'message_time_ms', 'document_on', 'archived_on', 'locator'}
ITEM_FIELDS = {'id', 'kind', 'title', 'before', 'after', 'reason', 'occurred_on',
               'archived_on', 'document_on', 'caution', 'evidence'}
PROJECTED_EVIDENCE_FIELDS = {'asset_id', 'content_hash', 'title', 'quote',
                             'message_time_ms', 'source_url'}
_KINDS = {'direct_user_message', 'archived_user_excerpt', 'document_plan'}


def _shanghai_date(instant):
    # This policy accepts post-epoch timestamps only. IANA Asia/Shanghai has
    # +08 throughout that interval except PRC summer time in 1986..1991:
    # https://github.com/eggert/tz/blob/main/asia (Rule PRC).
    # Keep this small rule local so Windows needs no tzdata installation.
    offset = 8
    year = instant.year
    if 1986 <= year <= 1991:
        start = datetime(year, 5, 4, 2, tzinfo=timezone.utc) if year == 1986 else datetime(year, 4, 11, 2, tzinfo=timezone.utc)
        if year != 1986:
            start += timedelta(days=(6 - start.weekday()) % 7)
        end = datetime(year, 9, 11, 2, tzinfo=timezone.utc)
        end += timedelta(days=(6 - end.weekday()) % 7)
        if start - timedelta(hours=8) <= instant < end - timedelta(hours=9):
            offset = 9
    return (instant + timedelta(hours=offset)).date().isoformat()


class DecisionError(ValueError):
    """Only a finite, content-free error code crosses a service boundary."""

    def __init__(self, code):
        self.code = code
        super().__init__(code)


def closed(value, fields):
    if type(value) is not dict or value.keys() != set(fields):
        raise DecisionError('INVALID_ARGUMENTS')


def canonical(value):
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise DecisionError('INVALID_ARGUMENTS') from None


def decode_json(raw):
    try:
        if type(raw) is not bytes:
            raise ValueError()
        return strict_json(raw)
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise DecisionError('INVALID_ARGUMENTS') from None


def text(value, limit, *, nullable=False, nonempty=False):
    if nullable and value is None:
        return
    try:
        validate_text(value, limit)
    except ExplorationError:
        raise DecisionError('INVALID_ARGUMENTS') from None
    if nonempty and not value.strip():
        raise DecisionError('INVALID_ARGUMENTS')


def uuid(value):
    if type(value) is not str or not re.fullmatch(ASSET_ID_PATTERN, value):
        raise DecisionError('INVALID_ARGUMENTS')


def content_hash(value):
    if type(value) is not str or not re.fullmatch('[0-9a-f]{64}', value):
        raise DecisionError('INVALID_ARGUMENTS')


def sensitive(value, token):
    # Include field names as well as values, including JSON-escaped tokens.
    def scan(node):
        if type(node) is str and has_credential_marker(node, token):
            raise DecisionError('SENSITIVE_CONTENT')
        if type(node) is dict:
            for key, child in node.items():
                scan(key)
                scan(child)
        elif type(node) is list:
            for child in node:
                scan(child)
    try:
        scan(value)
        raw = canonical(value).decode('utf-8')
        if has_credential_marker(raw, token):
            raise DecisionError('SENSITIVE_CONTENT')
    except RecursionError:
        raise DecisionError('INVALID_ARGUMENTS') from None


def day(value):
    if value is None:
        return
    if type(value) is not str or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value, re.ASCII):
        raise DecisionError('INVALID_ARGUMENTS')
    try:
        date.fromisoformat(value)
    except ValueError:
        raise DecisionError('INVALID_ARGUMENTS') from None


def message_day(value):
    if type(value) is not int or value < 0:
        raise DecisionError('INVALID_ARGUMENTS')
    try:
        # Integer arithmetic avoids millisecond rounding at midnight.
        return _shanghai_date(datetime(1970, 1, 1, tzinfo=timezone.utc)
                              + timedelta(milliseconds=value))
    except (ValueError, OverflowError):
        raise DecisionError('INVALID_ARGUMENTS') from None


def validate_source(value, token):
    closed(value, SOURCE_FIELDS)
    if value['version'] != SOURCE_VERSION or value['kind'] not in ('user_message', 'document'):
        raise DecisionError('INVALID_ARGUMENTS')
    text(value['title'], 256, nonempty=True)
    text(value['text'], MAX_SOURCE_TEXT_BYTES)
    content_hash(value['text_sha256'])
    if sha256(value['text'].encode('utf-8')).hexdigest() != value['text_sha256']:
        raise DecisionError('CONTENT_MISMATCH')
    for key in ('document_on', 'archived_on'):
        day(value[key])
    if value['kind'] == 'user_message':
        message_day(value['message_time_ms'])
        if value['document_on'] is not None:
            raise DecisionError('INVALID_ARGUMENTS')
    elif value['message_time_ms'] is not None:
        raise DecisionError('INVALID_ARGUMENTS')
    locator = value['locator']
    closed(locator, {'channel', 'thread_id', 'message_id', 'section'})
    if locator['channel'] not in ('chatgpt', 'codex', 'file'):
        raise DecisionError('INVALID_ARGUMENTS')
    for key in ('thread_id', 'message_id', 'section'):
        field = locator[key]
        text(field, 2048, nullable=True)
        if field is not None and (field.startswith(('/', '\\', '~'))
                                  or re.match(r'^[A-Za-z]:', field)
                                  or re.match(r'^file:', field, re.I)):
            raise DecisionError('INVALID_ARGUMENTS')
    sensitive(value, token)
    return value


def _validate_item(item, mode):
    closed(item, ITEM_FIELDS)
    if type(item['id']) is not str or not re.fullmatch('[a-z][a-z0-9_-]{0,79}', item['id']):
        raise DecisionError('INVALID_ARGUMENTS')
    if type(item['kind']) is not str or item['kind'] not in _KINDS:
        raise DecisionError('INVALID_ARGUMENTS')
    text(item['title'], 256, nonempty=True)
    for key in ('before', 'after', 'reason', 'caution'):
        text(item[key], 2048, nullable=True)
    for key in ('occurred_on', 'archived_on', 'document_on'):
        day(item[key])
    required_date = {'direct_user_message': 'occurred_on',
                     'archived_user_excerpt': 'archived_on',
                     'document_plan': 'document_on'}[item['kind']]
    if item[required_date] is None or any(item[key] is not None for key in
            {'occurred_on', 'archived_on', 'document_on'} - {required_date}):
        raise DecisionError('INVALID_ARGUMENTS')
    evidence = item['evidence']
    if type(evidence) is not list or not 1 <= len(evidence) <= 4:
        raise DecisionError('INVALID_ARGUMENTS')
    for ref in evidence:
        fields = {'source_key', 'quote'} if mode == 'import' else (
            PROJECTED_EVIDENCE_FIELDS if mode == 'projection' else {'asset_id', 'content_hash', 'quote'})
        closed(ref, fields)
        text(ref['quote'], 4096, nonempty=True)
        if mode == 'import':
            text(ref['source_key'], 256, nonempty=True)
        else:
            uuid(ref['asset_id'])
            content_hash(ref['content_hash'])
        if mode == 'projection':
            text(ref['title'], 256, nonempty=True)
            if item['kind'] == 'direct_user_message':
                if message_day(ref['message_time_ms']) != item['occurred_on']:
                    raise DecisionError('INVALID_ARGUMENTS')
            elif ref['message_time_ms'] is not None:
                raise DecisionError('INVALID_ARGUMENTS')
            if ref['source_url'] is not None and (type(ref['source_url']) is not str
                    or not re.fullmatch(r'https://chatgpt\.com/c/' + ASSET_ID_PATTERN, ref['source_url'])):
                raise DecisionError('INVALID_ARGUMENTS')


def validate_items(items, mode):
    if type(items) is not list or len(items) > MAX_ITEMS:
        raise DecisionError('INVALID_ARGUMENTS')
    seen, sources = set(), set()
    for item in items:
        _validate_item(item, mode)
        if item['id'] in seen:
            raise DecisionError('INVALID_ARGUMENTS')
        seen.add(item['id'])
        for ref in item['evidence']:
            sources.add(ref['source_key'] if mode == 'import' else ref['asset_id'])
    if len(sources) > MAX_SOURCES:
        raise DecisionError('INVALID_ARGUMENTS')


def validate_archive(value, token, *, mode='stored'):
    closed(value, {'version', 'title', 'method', 'items'})
    if value['version'] != ARCHIVE_VERSION or value['method'] != 'curated_recap':
        raise DecisionError('INVALID_ARGUMENTS')
    text(value['title'], 256, nonempty=True)
    validate_items(value['items'], mode)
    if len(canonical(value)) > MAX_ARCHIVE_BYTES:
        raise DecisionError('INVALID_ARGUMENTS')
    sensitive(value, token)
    return value


def validate_evidence(item, ref, source):
    """Check every source's exact quote, kind and date against its whole item."""
    if ref['quote'] not in source['text']:
        raise DecisionError('CONTENT_MISMATCH')
    kind = item['kind']
    if kind == 'direct_user_message':
        valid = source['kind'] == 'user_message' and message_day(source['message_time_ms']) == item['occurred_on']
    elif kind == 'archived_user_excerpt':
        valid = source['kind'] == 'document' and source['archived_on'] == item['archived_on']
    else:
        valid = source['kind'] == 'document' and source['document_on'] == item['document_on']
    if not valid:
        raise DecisionError('CONTENT_MISMATCH')


def validate_package(package, token):
    # Copy caller-owned objects once; never mutate the caller's package.
    package = decode_json(canonical(package))
    closed(package, {'version', 'sources', 'archive'})
    if package['version'] != IMPORT_VERSION or type(package['sources']) is not dict:
        raise DecisionError('INVALID_ARGUMENTS')
    archive = validate_archive(package['archive'], token, mode='import')
    used = {ref['source_key'] for item in archive['items'] for ref in item['evidence']}
    if package['sources'].keys() != used:
        raise DecisionError('INVALID_ARGUMENTS')
    budget = 0
    for key, source in package['sources'].items():
        text(key, 256, nonempty=True)
        validate_source(source, token)
        budget += len(canonical(source))
    if budget > MAX_SOURCE_BYTES:
        raise DecisionError('INVALID_ARGUMENTS')
    for item in archive['items']:
        for ref in item['evidence']:
            validate_evidence(item, ref, package['sources'][ref['source_key']])
    sensitive(package, token)
    return package


def source_url(source):
    locator = source['locator']
    thread = locator['thread_id']
    if locator['channel'] == 'chatgpt' and type(thread) is str and re.fullmatch(ASSET_ID_PATTERN, thread):
        return 'https://chatgpt.com/c/' + thread
    return None


def check_response_limit(envelope):
    try:
        raw = json.dumps(envelope, ensure_ascii=True, allow_nan=False).encode('utf-8')
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise DecisionError('INVALID_ARGUMENTS') from None
    if len(raw) > MAX_RESPONSE_BYTES:
        raise DecisionError('RESPONSE_LIMIT')


def project_decision_history(envelope, asset_id, expected_hash, token):
    """Reject unbound/extra/sensitive broker input; return the closed value."""
    if type(token) is not str or not token:
        raise DecisionError('INVALID_ARGUMENTS')
    uuid(asset_id)
    content_hash(expected_hash)
    check_response_limit(envelope)
    closed(envelope, {'contract_version', 'ok', 'value'})
    if type(envelope['contract_version']) is not int or envelope['contract_version'] != 1 or envelope['ok'] is not True:
        raise DecisionError('INVALID_ARGUMENTS')
    value = envelope['value']
    closed(value, {'archive_id', 'archive_hash', 'title', 'method', 'items', 'has_unavailable'})
    if value['archive_id'] != asset_id or value['archive_hash'] != expected_hash:
        raise DecisionError('CONTENT_MISMATCH')
    if value['method'] != 'curated_recap' or type(value['has_unavailable']) is not bool:
        raise DecisionError('INVALID_ARGUMENTS')
    text(value['title'], 256, nonempty=True)
    validate_items(value['items'], 'projection')
    sensitive(envelope, token)
    return decode_json(canonical(value))
