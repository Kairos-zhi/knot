"""Revisioned project manifests over the existing append-only asset authority."""

from functools import wraps
from hashlib import sha256

from mvp import decision_policy as decision
from mvp import project_policy as policy
from .decision_archive import _DecisionRepo, _asset, _authorize, _require_schema, _store, _store_package
from .timeline_query import read_snapshot


def _boundary(writing=False):
    """Keep exceptions, credentials and source text inside the service boundary."""
    def decorate(method):
        @wraps(method)
        def call(*args, **kwargs):
            error = None
            try:
                return method(*args, **kwargs)
            except policy.ProjectError as exc:
                error = exc.code
            except decision.DecisionError as exc:
                error = policy._convert(exc)
            except Exception:
                error = 'IMPORT_UNAVAILABLE' if writing else 'READ_UNAVAILABLE'
            raise policy.ProjectError(error)
        return call
    return decorate


def _scan(conn, token):
    """Discover heads before filtering grants, so revoked heads never fall back.

    Import events also identify manifests: losing a head asset or changing its
    MIME cannot hide it and make a previous revision appear current. Only
    bounded embedded manifests are inspected; no material body is fetched.
    """
    _require_schema(conn)
    # Start from retained events, not assets: otherwise a deleted last/only
    # manifest disappears from discovery and permits fallback or re-creation.
    # Check on the same snapshot before grants, idempotency or version checks.
    if conn.execute(
            'SELECT 1 FROM history_events e LEFT JOIN assets a ON a.asset_id=e.subject '
            'WHERE e.event_type=? AND e.source=? AND a.asset_id IS NULL LIMIT 1',
            ('import', policy.PROJECT_VERSION)).fetchone() is not None:
        raise policy.ProjectError('CONTENT_MISMATCH')
    rows = conn.execute(
        'SELECT a.asset_id,a.content_hash,a.created_at,a.media_type,a.file_path,'
        'typeof(a.content_blob),length(a.content_blob) FROM assets a '
        'WHERE a.media_type=? OR EXISTS (SELECT 1 FROM history_events e '
        'WHERE e.subject=a.asset_id AND e.event_type=\'import\' AND e.source=?) '
        'ORDER BY a.rowid LIMIT ?',
        (policy.PROJECT_MIME, policy.PROJECT_VERSION, policy.MAX_MANIFESTS + 1)).fetchall()
    if len(rows) > policy.MAX_MANIFESTS:
        raise policy.ProjectError('RESPONSE_LIMIT')
    projects = {}
    for aid, digest, stamp, mime, path, blob_type, size in rows:
        if (mime != policy.PROJECT_MIME or path is not None or blob_type != 'blob'
                or type(stamp) is not int or not 0 <= stamp <= policy.MAX_REVISION):
            raise policy.ProjectError('CONTENT_MISMATCH')
        if size > policy.MAX_MANIFEST_BYTES:
            raise policy.ProjectError('RESPONSE_LIMIT')
        raw = conn.execute('SELECT content_blob FROM assets WHERE asset_id=?', (aid,)).fetchone()[0]
        value = policy.validate_manifest(decision.decode_json(raw), token)
        if sha256(raw).hexdigest() != digest or decision.canonical(value) != raw:
            raise policy.ProjectError('CONTENT_MISMATCH')
        entry = dict(value=value, asset_id=aid, manifest_hash=digest, saved_at=stamp)
        projects.setdefault(value['project_id'], []).append(entry)
    if len(projects) > policy.MAX_PROJECTS:
        raise policy.ProjectError('RESPONSE_LIMIT')
    for history in projects.values():
        history.sort(key=lambda entry: int(entry['value']['revision']))
        previous, requests = None, set()
        for number, entry in enumerate(history, 1):
            value = entry['value']
            if (int(value['revision']) != number or value['request_id'] in requests
                    or (previous is not None and (
                        value['previous_hash'] != previous['manifest_hash']
                        or value['owner'] != previous['value']['owner']))):
                raise policy.ProjectError('CONTENT_MISMATCH')
            requests.add(value['request_id'])
            previous = entry
    return projects, len(rows)


def _grant(conn, entry, actor):
    if conn.execute('SELECT 1 FROM asset_readers WHERE asset_id=? AND actor=?',
                    (entry['asset_id'], actor)).fetchone() is None:
        raise policy.ProjectError('ACCESS_DENIED')


def _select(conn, projects, actor, project_id, revision=None):
    history = projects.get(project_id)
    if history is None:
        raise policy.ProjectError('NOT_FOUND')
    _grant(conn, history[-1], actor)
    selected = history[-1] if revision is None else next(
        (entry for entry in history if entry['value']['revision'] == revision), None)
    if selected is None:
        raise policy.ProjectError('NOT_FOUND')
    _grant(conn, selected, actor)
    return history, selected


class _Sources:
    """One operation's source cache and byte budget, charged before hash/parse."""

    def __init__(self, conn, actor, token):
        self.conn, self.actor, self.token = conn, actor, token
        self.remaining = policy.MAX_READ_BYTES
        self.cache = {}

    def charge(self, size):
        self.remaining -= size

    def get(self, ref):
        key = (ref['asset_id'], ref['content_hash'])
        if key not in self.cache:
            try:
                raw = _asset(self.conn, *key, self.actor, decision.SOURCE_MIME,
                             self.remaining, charge=self.charge)
                source = decision.validate_source(decision.decode_json(raw), self.token)
                if decision.canonical(source) != raw:
                    raise decision.DecisionError('CONTENT_MISMATCH')
                self.cache[key] = (source, None)
            except decision.DecisionError as exc:
                if exc.code in ('READ_LIMIT_REACHED', 'RESPONSE_LIMIT'):
                    raise policy.ProjectError('RESPONSE_LIMIT') from None
                self.cache[key] = (None, exc.code)
        source, error = self.cache[key]
        if error:
            raise policy.ProjectError(error)
        return source


def _archive(sources, ref, materials=None):
    """Validate every dependency and suppress whole decisions on unavailable input."""
    raw = _asset(sources.conn, ref['asset_id'], ref['content_hash'], sources.actor,
                 decision.ARCHIVE_MIME, decision.MAX_ARCHIVE_BYTES)
    archive = decision.validate_archive(decision.decode_json(raw), sources.token)
    if decision.canonical(archive) != raw:
        raise policy.ProjectError('CONTENT_MISMATCH')
    items, refs, unavailable = [], {}, False
    membership = None if materials is None else {
        (r['asset_id'], r['content_hash']) for r in materials}
    for item in archive['items']:
        evidence, valid = [], True
        for source_ref in item['evidence']:
            ref_key = (source_ref['asset_id'], source_ref['content_hash'])
            refs[ref_key] = {k: source_ref[k] for k in ('asset_id', 'content_hash')}
            try:
                if membership is not None and ref_key not in membership:
                    raise policy.ProjectError('CONTENT_MISMATCH')
                source = sources.get(source_ref)
                decision.validate_evidence(item, source_ref, source)
                evidence.append(dict(asset_id=source_ref['asset_id'], content_hash=source_ref['content_hash'],
                                     title=source['title'], quote=source_ref['quote'],
                                     message_time_ms=source['message_time_ms'],
                                     source_url=decision.source_url(source)))
            except (policy.ProjectError, decision.DecisionError) as exc:
                if exc.code in ('RESPONSE_LIMIT', 'READ_LIMIT_REACHED'):
                    raise
                valid = False
        if valid:
            items.append(item | {'evidence': evidence})
        else:
            unavailable = True
    view = dict(archive_id=ref['asset_id'], archive_hash=ref['content_hash'],
                title=archive['title'], method=archive['method'], items=items,
                has_unavailable=unavailable)
    return decision.project_decision_history(
        {'contract_version': 1, 'ok': True, 'value': view},
        ref['asset_id'], ref['content_hash'], sources.token), list(refs.values())


def _snapshot(entry):
    return dict(revision=entry['value']['revision'], manifest_hash=entry['manifest_hash'],
                saved_at=entry['saved_at'])


def _chronology(scene, sources):
    """Project appearance is a cited retained fact, never an inferred birth."""
    observations = scene.get('observations', [])
    candidates = [(s['message_time_ms'], 'first_message',
                   {k: s[k] for k in ('asset_id', 'content_hash')}) for s in observations]
    for ref in scene['materials']:
        source = sources.get(ref)  # _scene already checked permission, hash and budget.
        if source['kind'] != 'document' or not (source['title'] == 'project-registration.json'
                or source['title'].startswith('历史窗口日回顾索引·')):
            continue
        try:
            record = decision.decode_json(source['text'].encode('utf-8'))
            if (type(record) is dict and record.get('version') == 'knot.history-window-days/0.1'
                    and record.get('project_id') == scene['project_id']):
                days = record.get('days')
                if type(days) is not list or len(days) > 366:
                    continue
                stamps = []
                for day in days:
                    if type(day) is not dict or type(day.get('windows')) is not list:
                        raise decision.DecisionError('INVALID_ARGUMENTS')
                    decision.day(day.get('on'))
                    for window in day['windows']:
                        if type(window) is not dict or type(window.get('excerpts')) is not list:
                            raise decision.DecisionError('INVALID_ARGUMENTS')
                        for excerpt in window['excerpts']:
                            if type(excerpt) is not dict or excerpt.get('time_basis') != 'turn_started_at':
                                raise decision.DecisionError('INVALID_ARGUMENTS')
                            stamp = excerpt.get('turn_time_ms')
                            if decision.message_day(stamp) != day['on']:
                                raise decision.DecisionError('CONTENT_MISMATCH')
                            stamps.append(stamp)
                if stamps:
                    candidates.append((min(stamps), 'first_window_record',
                                       {k: ref[k] for k in ('asset_id', 'content_hash')}))
                continue
            if (type(record) is not dict or record.get('version') != 'knot.project-registration/0.1'
                    or record.get('source') != 'codex_project_registry'
                    or record.get('project_id') != scene['project_id']):
                continue
            decision.uuid(record.get('source_id'))
            decision.message_day(record.get('created_at_ms'))
        except decision.DecisionError:
            continue  # Ordinary documents with this title remain ordinary documents.
        candidates.append((record['created_at_ms'], 'registry_created',
                           {k: ref[k] for k in ('asset_id', 'content_hash')}))
    result = dict(observation_times=sorted({s['message_time_ms'] for s in observations}),
                  observation_count=len(observations))
    if candidates:
        stamp, basis, ref = min(candidates, key=lambda candidate: (candidate[0], candidate[1]))
        result.update(appearance_at=stamp, appearance_basis=basis, appearance_source=ref)
    else:
        result.update(appearance_at=min(s['saved_at'] for s in scene['snapshots']),
                      appearance_basis='first_saved')
    return result


def _scene(conn, history, selected, actor, token, sources=None):
    sources = sources or _Sources(conn, actor, token)
    manifest = selected['value']
    materials, observations, unavailable = [], [], False
    for ref in manifest['materials']:
        try:
            source = sources.get(ref)
            materials.append(ref | {'title': source['title']})
            if _codex_user(source):
                # Existing curated sources retain their original metadata;
                # only new capture input forbids filling an archive date.
                policy.validate_capture_source(source, token, allow_archived=True)
                observations.append(ref | {k: source[k] for k in ('title', 'text', 'message_time_ms')}
                    | {k: source['locator'][k] for k in ('thread_id', 'message_id')})
        except policy.ProjectError as exc:
            if exc.code == 'RESPONSE_LIMIT':
                raise
            unavailable = True
    decisions = None
    if manifest['archive_ref'] is not None:
        try:
            decisions, _ = _archive(sources, manifest['archive_ref'], manifest['materials'])
            unavailable |= decisions['has_unavailable']
        except (policy.ProjectError, decision.DecisionError) as exc:
            if exc.code in ('RESPONSE_LIMIT', 'READ_LIMIT_REACHED'):
                raise
            unavailable = True
    snapshots = [
        _snapshot(entry) for entry in history if conn.execute(
            'SELECT 1 FROM asset_readers WHERE asset_id=? AND actor=?',
            (entry['asset_id'], actor)).fetchone() is not None]
    result = dict(project_id=manifest['project_id'], title=manifest['title'],
                  **_snapshot(selected), snapshots=snapshots, materials=materials,
                  decisions=decisions, has_unavailable=unavailable)
    if observations:
        result['observations'] = observations
    return policy.project_response('scene', result, token, project_id=manifest['project_id'],
                                   revision=manifest['revision'])


def _document(document):
    return dict(version=decision.SOURCE_VERSION, kind='document', **document,
                text_sha256=sha256(document['text'].encode('utf-8')).hexdigest(),
                message_time_ms=None, document_on=None, archived_on=None,
                locator=dict(channel='file', thread_id=None, message_id=None, section=None))


def _codex_user(source):
    """Only known anchors identify observations; legacy unknown IDs stay readable."""
    return (source['kind'] == 'user_message' and source['locator']['channel'] == 'codex'
            and all(type(source['locator'][field]) is str and source['locator'][field].strip()
                    for field in ('thread_id', 'message_id')))


def _check_message_identities(sources, existing_refs, candidates):
    """Compare complete canonical sources, not merely their text or locator.

    When appending captured messages every retained material must be readable
    and valid to establish that a conflicting identity has not been hidden.
    Document-only updates keep their existing unavailable-material behavior.
    """
    identities = {}
    for source in [sources.get(ref) for ref in existing_refs] + candidates:
        if not _codex_user(source):
            continue
        locator = source['locator']
        key = (locator['thread_id'], locator['message_id'])
        raw = decision.canonical(source)
        if key in identities and identities[key] != raw:
            raise policy.ProjectError('CONTENT_MISMATCH')
        identities[key] = raw


class ProjectRepo:
    def __init__(self, db_path):
        self.db_path = db_path

    @_boundary(writing=True)
    def import_project(self, actor, token, body):
        _authorize(actor, token)
        body = policy.validate_import(body, token)
        digest = policy.request_hash(actor, body)
        repo = _DecisionRepo(self.db_path)
        with repo.session(), repo.transaction(), repo._connection() as conn:
            projects, count = _scan(conn, token)
            history = projects.get(body['project_id'], [])
            head = history[-1] if history else None
            if head is not None:
                _grant(conn, head, actor)
                if head['value']['owner'] != actor:
                    raise policy.ProjectError('ACCESS_DENIED')
                for entry in history:
                    value = entry['value']
                    if value['request_id'] == body['request_id']:
                        if value['request_hash'] != digest:
                            raise policy.ProjectError('IDEMPOTENCY_CONFLICT')
                        return policy.project_response('receipt',
                            dict(project_id=body['project_id'], revision=value['revision'],
                                 manifest_hash=entry['manifest_hash']), token,
                            project_id=body['project_id'], expected_revision=body['expected_revision'])
            current = int(head['value']['revision']) if head else 0
            if int(body['expected_revision']) != current or current == policy.MAX_REVISION:
                raise policy.ProjectError('REVISION_CONFLICT')
            if count >= policy.MAX_MANIFESTS or (not history and len(projects) >= policy.MAX_PROJECTS):
                raise policy.ProjectError('RESPONSE_LIMIT')
            materials = list(head['value']['materials']) if head else []
            archive_ref = body['archive_ref'] or (head['value']['archive_ref'] if head else None)
            sources = _Sources(conn, actor, token)
            if 'recap' in body:
                _check_message_identities(sources, materials, list(body['recap']['sources'].values()))
                receipt = _store_package(repo, body['recap'], actor, token)
                archive_ref = dict(asset_id=receipt['archive_id'], content_hash=receipt['archive_hash'])
                view, refs = _archive(sources, archive_ref)
                if view['has_unavailable']:
                    raise policy.ProjectError('CONTENT_MISMATCH')
                materials.extend(refs)
            if body['archive_ref'] is not None:
                view, refs = _archive(sources, archive_ref)
                if view['has_unavailable']:
                    raise policy.ProjectError('CONTENT_MISMATCH')
                materials.extend(refs)
            captured = body.get('sources', [])
            if captured:
                _check_message_identities(sources, materials, captured)
            for document in body['documents']:
                source = decision.validate_source(_document(document), token)
                aid, content_digest, _ = _store(repo, source, decision.SOURCE_MIME, actor)
                materials.append(dict(asset_id=aid, content_hash=content_digest))
            for source in captured:
                aid, content_digest, _ = _store(repo, source, decision.SOURCE_MIME, actor)
                materials.append(dict(asset_id=aid, content_hash=content_digest))
            unique = {}
            for ref in materials:
                if ref['asset_id'] in unique and unique[ref['asset_id']] != ref:
                    raise policy.ProjectError('CONTENT_MISMATCH')
                unique[ref['asset_id']] = ref
            manifest = policy.validate_manifest(dict(
                version=policy.PROJECT_VERSION, project_id=body['project_id'], title=body['title'],
                revision=str(current + 1), owner=actor,
                previous_hash=head['manifest_hash'] if head else None,
                request_id=body['request_id'], request_hash=digest,
                materials=list(unique.values()), archive_ref=archive_ref), token)
            aid, manifest_hash, _ = _store(repo, manifest, policy.PROJECT_MIME, actor)
            stamp = conn.execute('SELECT created_at FROM assets WHERE asset_id=?', (aid,)).fetchone()[0]
            selected = dict(value=manifest, asset_id=aid, manifest_hash=manifest_hash, saved_at=stamp)
            # Validate the actual scene before committing any source/grant/event.
            _scene(conn, history + [selected], selected, actor, token, sources)
            return policy.project_response('receipt', dict(project_id=body['project_id'],
                revision=manifest['revision'], manifest_hash=manifest_hash), token,
                project_id=body['project_id'], expected_revision=body['expected_revision'])

    @_boundary()
    def list_projects(self, actor, token):
        _authorize(actor, token)
        with read_snapshot(self.db_path, timeout=0.1) as conn:
            projects, _ = _scan(conn, token)
            sources, items = _Sources(conn, actor, token), []
            for project_id, history in sorted(projects.items()):
                try:
                    _grant(conn, history[-1], actor)
                except policy.ProjectError:
                    continue
                scene = _scene(conn, history, history[-1], actor, token, sources)
                items.append({k: scene[k] for k in ('project_id', 'title', 'revision',
                    'manifest_hash', 'saved_at')} | dict(material_count=len(scene['materials']),
                    decision_count=sum(item['kind'] != 'document_plan'
                        for item in scene['decisions']['items']) if scene['decisions'] else 0,
                    chronology=_chronology(scene, sources),
                    visibility_hash=sha256(decision.canonical(scene)).hexdigest()))
            return policy.project_response('list', {'items': items}, token)

    @_boundary()
    def read_project(self, actor, token, project_id, revision=None):
        _authorize(actor, token)
        decision.uuid(project_id)
        if revision is not None:
            policy.revision(revision)
        with read_snapshot(self.db_path, timeout=0.1) as conn:
            projects, _ = _scan(conn, token)
            history, selected = _select(conn, projects, actor, project_id, revision)
            return _scene(conn, history, selected, actor, token)

    @_boundary()
    def read_material(self, actor, token, project_id, revision, asset_id, expected_hash):
        _authorize(actor, token)
        decision.uuid(project_id)
        policy.revision(revision)
        decision.uuid(asset_id)
        decision.content_hash(expected_hash)
        with read_snapshot(self.db_path, timeout=0.1) as conn:
            projects, _ = _scan(conn, token)
            _, selected = _select(conn, projects, actor, project_id, revision)
            ref = next((ref for ref in selected['value']['materials']
                        if ref['asset_id'] == asset_id), None)
            if ref is None:
                raise policy.ProjectError('NOT_FOUND')
            if ref['content_hash'] != expected_hash:
                raise policy.ProjectError('CONTENT_MISMATCH')
            source = _Sources(conn, actor, token).get(ref)
            return policy.project_response('material', dict(project_id=project_id,
                revision=revision, **ref, title=source['title'], text=source['text'], source=source), token,
                project_id=project_id, revision=revision, asset_id=asset_id,
                expected_hash=expected_hash)
