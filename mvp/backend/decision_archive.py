"""Atomic decision imports and reader-scoped recall from existing asset storage."""

from hashlib import sha256

from mvp.decision_policy import (
    ARCHIVE_MIME, SOURCE_MIME, MAX_ARCHIVE_BYTES, MAX_SOURCE_BYTES,
    DecisionError, canonical, content_hash, decode_json, project_decision_history,
    sensitive, source_url, text, uuid, validate_archive, validate_evidence,
    validate_package, validate_source,
)
from .asset_access import token_config
from .asset_repo import AssetRepo
from .event_store import EventStore
from .timeline_query import read_snapshot


class _DecisionRepo(AssetRepo, EventStore):
    """Both append-only repositories participate in the very same transaction."""


def _authorize(actor, token):
    text(actor, 256, nonempty=True)
    if any(c in actor for c in '\r\n\t') or type(token) is not str or not token:
        raise DecisionError('ACCESS_DENIED')
    try:
        tokens, configured = token_config()
    except (ValueError, TypeError):
        raise DecisionError('ACCESS_DENIED') from None
    if not configured or tokens.get(token) != actor:
        raise DecisionError('ACCESS_DENIED')


def _require_schema(conn):
    if (conn.execute("SELECT 1 FROM schema_version WHERE version='1.6'").fetchone() is None
            or conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='asset_readers'").fetchone() is None):
        raise DecisionError('READ_UNAVAILABLE')


def _asset(conn, asset_id, digest, actor, mime, limit, *, charge=None):
    """Check grants and bounded metadata before fetching an embedded blob."""
    if conn.execute('SELECT 1 FROM asset_readers WHERE asset_id=? AND actor=?',
                    (asset_id, actor)).fetchone() is None:
        raise DecisionError('ACCESS_DENIED')
    row = conn.execute('SELECT content_hash,media_type,file_path,typeof(content_blob),'
                       'length(content_blob) FROM assets WHERE asset_id=?', (asset_id,)).fetchone()
    if row is None:
        raise DecisionError('ACCESS_DENIED')
    if row[0] != digest:
        raise DecisionError('CONTENT_MISMATCH')
    if row[1] != mime or row[2] is not None or row[3] != 'blob':
        raise DecisionError('INVALID_ARGUMENTS')
    if row[4] > limit:
        raise DecisionError('READ_LIMIT_REACHED')
    if charge is not None:
        charge(row[4])
    raw = conn.execute('SELECT content_blob FROM assets WHERE asset_id=?', (asset_id,)).fetchone()[0]
    if sha256(raw).hexdigest() != digest:
        raise DecisionError('CONTENT_MISMATCH')
    return raw


def _store(repo, value, mime, actor):
    raw = canonical(value)
    digest = sha256(raw).hexdigest()
    existing = repo._one('SELECT asset_id FROM assets WHERE content_hash=?', (digest,))
    if existing is not None:
        asset_id = existing['asset_id']
        # Deduplication never grants access, repairs content or replaces MIME.
        with repo._connection() as conn:
            previous = _asset(conn, asset_id, digest, actor, mime, len(raw))
        if previous != raw:
            raise DecisionError('CONTENT_MISMATCH')
        return asset_id, digest, False
    asset_id = repo.add_asset(digest, mime, content_blob=raw)
    with repo._connection() as conn:
        conn.execute('INSERT INTO asset_readers(asset_id,actor) VALUES (?,?)', (asset_id, actor))
    repo.add_event('import', subject=asset_id, source=value['version'],
                   target_assets=[asset_id], evidence_refs=[],
                   payload_json=canonical({'version': value['version'], 'content_hash': digest}).decode('utf-8'))
    return asset_id, digest, True


def import_decisions(db_path, package, actor, token):
    """Validate first; append sources, grants, archive and import events atomically."""
    error, result = None, None
    try:
        _authorize(actor, token)
        package = validate_package(package, token)
        repo = _DecisionRepo(db_path)
        with repo.session(), repo.transaction():
            with repo._connection() as conn:
                _require_schema(conn)
            sources, created, unique = {}, 0, set()
            for key, source in package['sources'].items():
                aid, digest, added = _store(repo, source, SOURCE_MIME, actor)
                sources[key] = {'asset_id': aid, 'content_hash': digest}
                if added and aid not in unique:
                    created += 1
                    unique.add(aid)
            archive = package['archive'] | {'items': [item | {'evidence': [
                sources[ref['source_key']] | {'quote': ref['quote']} for ref in item['evidence']
            ]} for item in package['archive']['items']]}
            validate_archive(archive, token)
            aid, digest, added = _store(repo, archive, ARCHIVE_MIME, actor)
            result = dict(archive_id=aid, archive_hash=digest,
                          sources_created=created, archive_created=added)
            sensitive(result, token)
    except DecisionError as exc:
        error = exc.code
    except Exception:
        error = 'IMPORT_UNAVAILABLE'
    if error is not None:
        raise DecisionError(error)
    return result


def _read(conn, asset_id, expected_hash, actor, token):
    _require_schema(conn)
    raw = _asset(conn, asset_id, expected_hash, actor, ARCHIVE_MIME, MAX_ARCHIVE_BYTES)
    archive = validate_archive(decode_json(raw), token)
    if canonical(archive) != raw:
        raise DecisionError('CONTENT_MISMATCH')
    cache, budget, items, unavailable = {}, MAX_SOURCE_BYTES, [], False
    def charge(size):
        nonlocal budget
        # Charge before hashing/decoding, including corrupt dependencies.
        budget -= size
    for item in archive['items']:
        evidence, valid = [], True
        for ref in item['evidence']:
            key = (ref['asset_id'], ref['content_hash'])
            if key not in cache:
                try:
                    body = _asset(conn, *key, actor, SOURCE_MIME, budget, charge=charge)
                    source = validate_source(decode_json(body), token)
                    if canonical(source) != body:
                        raise DecisionError('CONTENT_MISMATCH')
                    cache[key] = source
                except DecisionError as exc:
                    if exc.code == 'READ_LIMIT_REACHED':
                        raise
                    cache[key] = None
            source = cache[key]
            if source is None:
                valid = False
                continue
            try:
                validate_evidence(item, ref, source)
            except DecisionError:
                valid = False
                continue
            evidence.append(dict(asset_id=ref['asset_id'], content_hash=ref['content_hash'],
                                 title=source['title'], quote=ref['quote'],
                                 message_time_ms=source['message_time_ms'], source_url=source_url(source)))
        if valid:
            items.append(item | {'evidence': evidence})
        else:
            unavailable = True
    result = dict(archive_id=asset_id, archive_hash=expected_hash, title=archive['title'],
                  method=archive['method'], items=items, has_unavailable=unavailable)
    return project_decision_history({'contract_version': 1, 'ok': True, 'value': result},
                                    asset_id, expected_hash, token)


def read_decision_history(db_path, asset_id, expected_hash, actor, token):
    """Validate all dependencies on one read-only snapshot; never read file paths."""
    error, result = None, None
    try:
        _authorize(actor, token)
        uuid(asset_id)
        content_hash(expected_hash)
        with read_snapshot(db_path, timeout=0.1) as conn:
            result = _read(conn, asset_id, expected_hash, actor, token)
    except DecisionError as exc:
        error = exc.code
    except Exception:
        error = 'READ_UNAVAILABLE'
    if error is not None:
        raise DecisionError(error)
    return result
