"""Closed project contracts shared by the repository and transport projection."""
from hashlib import sha256
import json
import re

from mvp import decision_policy as decision
from mvp.exploration_policy import MAX_REVISION

PROJECT_VERSION = 'knot.project/0.1'
PROJECT_MIME = 'application/vnd.knot.project+json'
MAX_PROJECTS = 100
MAX_MANIFESTS = 1024
MAX_MATERIALS = 128
MAX_DOCUMENTS = 20
MAX_DOCUMENT_BYTES = 64 * 1024
MAX_IMPORT_TEXT_BYTES = 256 * 1024
MAX_READ_BYTES = 8 * 1024 * 1024
MAX_MANIFEST_BYTES = 64 * 1024
MAX_RESPONSE_BYTES = 1024 * 1024
# Main-list curation: 20 visible rows, seven-day activity window, three states.
MAX_LISTED = 20
LIST_STATES = frozenset({'active', 'dormant', 'empty'})
INSTANT = re.compile('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{3})?Z')
ERRORS = frozenset({'INVALID_ARGUMENTS', 'ACCESS_DENIED', 'REVISION_CONFLICT',
                    'IDEMPOTENCY_CONFLICT', 'NOT_FOUND', 'CONTENT_MISMATCH',
                    'SENSITIVE_CONTENT', 'RESPONSE_LIMIT', 'READ_UNAVAILABLE',
                    'IMPORT_UNAVAILABLE'})


class ProjectError(ValueError):
    def __init__(self, code):
        self.code = code if code in ERRORS else 'READ_UNAVAILABLE'
        super().__init__(self.code)


def _convert(exc):
    return 'RESPONSE_LIMIT' if exc.code == 'READ_LIMIT_REACHED' else exc.code


def revision(value, minimum=1):
    if (type(value) is not str or not re.fullmatch('0|[1-9][0-9]{0,18}', value)
            or not minimum <= int(value) <= MAX_REVISION):
        raise ProjectError('INVALID_ARGUMENTS')
    return int(value)


def _ref(value):
    decision.closed(value, {'asset_id', 'content_hash'})
    decision.uuid(value['asset_id'])
    decision.content_hash(value['content_hash'])


def _refs(values):
    if type(values) is not list or len(values) > MAX_MATERIALS:
        raise ProjectError('INVALID_ARGUMENTS')
    seen = set()
    for value in values:
        _ref(value)
        if value['asset_id'] in seen:
            raise ProjectError('INVALID_ARGUMENTS')
        seen.add(value['asset_id'])


def _token(token):
    if type(token) is not str or not token:
        raise ProjectError('INVALID_ARGUMENTS')


def validate_capture_source(value, token, *, allow_archived=False):
    """Accept only complete Codex user-message sources, preserving every field."""
    error = None
    try:
        decision.validate_source(value, token)
        if value['kind'] != 'user_message' or value['locator']['channel'] != 'codex':
            raise ProjectError('INVALID_ARGUMENTS')
        if not allow_archived and value['archived_on'] is not None:
            raise ProjectError('INVALID_ARGUMENTS')
        for field in ('thread_id', 'message_id'):
            decision.text(value['locator'][field], 2048, nonempty=True)
    except decision.DecisionError as exc:
        error = _convert(exc)
    if error:
        raise ProjectError(error)
    return value


def validate_import(body, token):
    """Copy the caller's closed request without normalizing its text or ordering."""
    error, result = None, None
    try:
        _token(token)
        result = decision.decode_json(decision.canonical(body))
        fields = {'project_id', 'title', 'expected_revision', 'request_id', 'documents', 'archive_ref'}
        decision.closed(result, fields | ({'sources'} if type(result) is dict and 'sources' in result else set()))
        decision.uuid(result['project_id'])
        decision.uuid(result['request_id'])
        decision.text(result['title'], 256, nonempty=True)
        revision(result['expected_revision'], 0)
        documents = result['documents']
        if type(documents) is not list or len(documents) > MAX_DOCUMENTS:
            raise ProjectError('INVALID_ARGUMENTS')
        size = 0
        for document in documents:
            decision.closed(document, {'title', 'text'})
            decision.text(document['title'], 256, nonempty=True)
            decision.text(document['text'], MAX_DOCUMENT_BYTES)
            size += len(document['text'].encode('utf-8'))
        sources = result.get('sources', [])
        if type(sources) is not list or len(documents) + len(sources) > MAX_DOCUMENTS:
            raise ProjectError('INVALID_ARGUMENTS')
        identities = {}
        for source in sources:
            validate_capture_source(source, token)
            size += len(source['text'].encode('utf-8'))
            key = (source['locator']['thread_id'], source['locator']['message_id'])
            raw = decision.canonical(source)
            if key in identities and identities[key] != raw:
                raise ProjectError('CONTENT_MISMATCH')
            identities[key] = raw
        if size > MAX_IMPORT_TEXT_BYTES:
            raise ProjectError('INVALID_ARGUMENTS')
        if result['archive_ref'] is not None:
            _ref(result['archive_ref'])
        if result['expected_revision'] == '0' and not documents and not sources and result['archive_ref'] is None:
            raise ProjectError('INVALID_ARGUMENTS')
        decision.sensitive(result, token)
    except decision.DecisionError as exc:
        error = _convert(exc)
    if error:
        raise ProjectError(error)
    return result


def validate_manifest(value, token):
    """Validate embedded, canonical project state, including server-owned identity."""
    error, result = None, None
    try:
        _token(token)
        result = decision.decode_json(decision.canonical(value))
        decision.closed(result, {'version', 'project_id', 'title', 'revision', 'owner',
                                 'previous_hash', 'request_id', 'request_hash',
                                 'materials', 'archive_ref'})
        if result['version'] != PROJECT_VERSION:
            raise ProjectError('INVALID_ARGUMENTS')
        decision.uuid(result['project_id'])
        decision.uuid(result['request_id'])
        decision.content_hash(result['request_hash'])
        decision.text(result['title'], 256, nonempty=True)
        decision.text(result['owner'], 256, nonempty=True)
        if any(c in result['owner'] for c in '\t\r\n'):
            raise ProjectError('INVALID_ARGUMENTS')
        number = revision(result['revision'])
        if number == 1:
            if result['previous_hash'] is not None:
                raise ProjectError('INVALID_ARGUMENTS')
        else:
            decision.content_hash(result['previous_hash'])
        _refs(result['materials'])
        if result['archive_ref'] is not None:
            _ref(result['archive_ref'])
        if not result['materials'] and result['archive_ref'] is None:
            raise ProjectError('INVALID_ARGUMENTS')
        if len(decision.canonical(result)) > MAX_MANIFEST_BYTES:
            raise ProjectError('RESPONSE_LIMIT')
        decision.sensitive(result, token)
    except decision.DecisionError as exc:
        error = _convert(exc)
    if error:
        raise ProjectError(error)
    return result


def request_hash(actor, body):
    return sha256(decision.canonical({'actor': actor, 'body': body})).hexdigest()


def _stamp(value):
    if type(value) is not int or not 0 <= value <= MAX_REVISION:
        raise ProjectError('INVALID_ARGUMENTS')


def _instant(value):
    """A list row's activity instant: absent, or the contract's UTC text form."""
    if value is not None and (type(value) is not str or not INSTANT.fullmatch(value)):
        raise ProjectError('INVALID_ARGUMENTS')


def _identity(value):
    decision.uuid(value['project_id'])
    revision(value['revision'])
    decision.content_hash(value['manifest_hash'])


def _snapshot(value):
    decision.closed(value, {'revision', 'manifest_hash', 'saved_at'})
    revision(value['revision'])
    decision.content_hash(value['manifest_hash'])
    _stamp(value['saved_at'])


def _material(value):
    decision.closed(value, {'asset_id', 'content_hash', 'title'})
    _ref({key: value[key] for key in ('asset_id', 'content_hash')})
    decision.text(value['title'], 256, nonempty=True)


def project_response(kind, value, token, **bindings):
    """Validate and bind a value, charging the actual ASCII OkEnvelope.

    A receipt binds to the original request's expected_revision, including on
    replay after the current head advances. List decision_count excludes
    document_plan background; scenes retain the complete DecisionHistory.
    """
    error, result = None, None
    try:
        _token(token)
        envelope = {'contract_version': 1, 'ok': True, 'value': value}
        raw = json.dumps(envelope, ensure_ascii=True, allow_nan=False).encode('utf-8')
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ProjectError('RESPONSE_LIMIT')
        result = decision.decode_json(decision.canonical(value))
        if kind == 'list':
            decision.closed(bindings, set())
            decision.closed(result, {'items', 'hidden_count'})
            if (type(result['items']) is not list or len(result['items']) > MAX_PROJECTS
                    or type(result['hidden_count']) is not int
                    or not 0 <= result['hidden_count'] <= MAX_PROJECTS):
                raise ProjectError('INVALID_ARGUMENTS')
            seen = set()
            for item in result['items']:
                decision.closed(item, {'project_id', 'title', 'revision', 'manifest_hash',
                                      'saved_at', 'material_count', 'decision_count',
                                      'last_activity_at', 'state'})
                _identity(item)
                decision.text(item['title'], 256, nonempty=True)
                _stamp(item['saved_at'])
                _instant(item['last_activity_at'])
                if item['state'] not in LIST_STATES:
                    raise ProjectError('INVALID_ARGUMENTS')
                for field, limit in (('material_count', MAX_MATERIALS), ('decision_count', decision.MAX_ITEMS)):
                    if type(item[field]) is not int or not 0 <= item[field] <= limit:
                        raise ProjectError('INVALID_ARGUMENTS')
                if item['project_id'] in seen:
                    raise ProjectError('INVALID_ARGUMENTS')
                seen.add(item['project_id'])
        elif kind in ('scene', 'material', 'receipt'):
            allowed = {'project_id'} | ({'revision'} if kind == 'scene' else
                       {'revision', 'asset_id', 'expected_hash'} if kind == 'material' else {'expected_revision'})
            if not {'project_id'} <= bindings.keys() <= allowed:
                raise ProjectError('INVALID_ARGUMENTS')
            decision.uuid(bindings['project_id'])
            fields = {'project_id', 'revision', 'manifest_hash'} if kind == 'receipt' else (
                {'project_id', 'title', 'revision', 'manifest_hash', 'saved_at', 'snapshots',
                 'materials', 'decisions', 'has_unavailable'} if kind == 'scene' else
                {'project_id', 'revision', 'asset_id', 'content_hash', 'title', 'text'})
            if kind == 'scene' and type(result) is dict and 'observations' in result:
                fields |= {'observations'}
            decision.closed(result, fields)
            decision.uuid(result['project_id'])
            revision(result['revision'])
            if result['project_id'] != bindings['project_id']:
                raise ProjectError('CONTENT_MISMATCH')
            if kind == 'receipt':
                decision.content_hash(result['manifest_hash'])
                if 'expected_revision' in bindings:
                    expected = revision(bindings['expected_revision'], 0)
                    if int(result['revision']) != expected + 1:
                        raise ProjectError('CONTENT_MISMATCH')
            else:
                selected = bindings.get('revision')
                if kind == 'material' or selected is not None:
                    revision(selected)
                    if result['revision'] != selected:
                        raise ProjectError('CONTENT_MISMATCH')
                decision.text(result['title'], 256, nonempty=True)
                if kind == 'material':
                    decision.closed(bindings, allowed)
                    decision.uuid(bindings['asset_id'])
                    decision.content_hash(bindings['expected_hash'])
                    decision.uuid(result['asset_id'])
                    decision.content_hash(result['content_hash'])
                    if (result['asset_id'] != bindings['asset_id']
                            or result['content_hash'] != bindings['expected_hash']):
                        raise ProjectError('CONTENT_MISMATCH')
                    decision.text(result['text'], MAX_DOCUMENT_BYTES)
                else:
                    _identity(result)
                    _stamp(result['saved_at'])
                    if type(result['has_unavailable']) is not bool:
                        raise ProjectError('INVALID_ARGUMENTS')
                    if type(result['snapshots']) is not list or not 1 <= len(result['snapshots']) <= MAX_MANIFESTS:
                        raise ProjectError('INVALID_ARGUMENTS')
                    numbers = []
                    for snapshot in result['snapshots']:
                        _snapshot(snapshot)
                        numbers.append(int(snapshot['revision']))
                    if numbers != sorted(set(numbers)) or not any(
                            s == {k: result[k] for k in ('revision', 'manifest_hash', 'saved_at')}
                            for s in result['snapshots']):
                        raise ProjectError('CONTENT_MISMATCH')
                    if type(result['materials']) is not list or len(result['materials']) > MAX_MATERIALS:
                        raise ProjectError('INVALID_ARGUMENTS')
                    sources = {}
                    for material in result['materials']:
                        _material(material)
                        if material['asset_id'] in sources:
                            raise ProjectError('INVALID_ARGUMENTS')
                        sources[material['asset_id']] = material
                    if 'observations' in result:
                        observations = result['observations']
                        if type(observations) is not list or not 1 <= len(observations) <= MAX_MATERIALS:
                            raise ProjectError('INVALID_ARGUMENTS')
                        seen_assets, seen_messages = set(), set()
                        for observation in observations:
                            decision.closed(observation, {'asset_id', 'content_hash', 'title', 'text',
                                'message_time_ms', 'thread_id', 'message_id'})
                            material = {k: observation[k] for k in ('asset_id', 'content_hash', 'title')}
                            _material(material)
                            if sources.get(observation['asset_id']) != material:
                                raise ProjectError('CONTENT_MISMATCH')
                            # Apply the same text, timestamp and locator policy independently
                            # at the broker boundary, without trusting a supplied source kind.
                            text = observation['text']
                            decision.text(text, MAX_DOCUMENT_BYTES)
                            validate_capture_source(dict(version=decision.SOURCE_VERSION,
                                kind='user_message', title=observation['title'], text=text,
                                text_sha256=sha256(text.encode('utf-8')).hexdigest(),
                                message_time_ms=observation['message_time_ms'], document_on=None,
                                archived_on=None, locator=dict(channel='codex',
                                    thread_id=observation['thread_id'], message_id=observation['message_id'],
                                    section=None)), token)
                            key = (observation['thread_id'], observation['message_id'])
                            if observation['asset_id'] in seen_assets or key in seen_messages:
                                raise ProjectError('CONTENT_MISMATCH')
                            seen_assets.add(observation['asset_id'])
                            seen_messages.add(key)
                    view = result['decisions']
                    if view is not None:
                        if type(view) is not dict:
                            raise ProjectError('INVALID_ARGUMENTS')
                        view = decision.project_decision_history(
                            {'contract_version': 1, 'ok': True, 'value': view},
                            view.get('archive_id'), view.get('archive_hash'), token)
                        if view['has_unavailable'] and not result['has_unavailable']:
                            raise ProjectError('CONTENT_MISMATCH')
                        for item in view['items']:
                            for ref in item['evidence']:
                                source = sources.get(ref['asset_id'])
                                if (source is None or source['content_hash'] != ref['content_hash']
                                        or source['title'] != ref['title']):
                                    raise ProjectError('CONTENT_MISMATCH')
        else:
            raise ProjectError('INVALID_ARGUMENTS')
        decision.sensitive(result, token)
    except decision.DecisionError as exc:
        error = _convert(exc)
    except (TypeError, ValueError, UnicodeError, RecursionError) as exc:
        if isinstance(exc, ProjectError):
            error = exc.code
        else:
            error = 'INVALID_ARGUMENTS'
    if error:
        raise ProjectError(error)
    return result
