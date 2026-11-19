"""Extract and review scoped candidates over existing, readable project sources."""

from hashlib import sha256
import json
import re
import time
from uuid import NAMESPACE_URL, uuid5

from mvp import decision_policy as decision
from mvp import project_policy as policy
from .claim_extractor import KINDS, STAT_KEYS, _scan
from .claim_review import PROJECT_CLAIM_LABEL, _review, _vocabulary
from .decision_archive import _DecisionRepo, _authorize
from .project_repo import _Sources, _boundary, _scan as scan_projects, _select
from .timeline_query import read_snapshot


STATUSES = {None: 'pending', 'accept': 'accepted', 'reject': 'rejected'}
MAX_CANDIDATES = 256
MAX_QUOTE_CHARS = 384
PREFIX = re.compile(
    r'^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)?'
    r'(?:\*\*)?(决定|决策|未决问题|待确认|问题|反例|条件定理|支持关系|'
    r'decision|open question|question|counterexample|conditional theorem|support relation)'
    r'(?:\*\*)?\s*[:：](?:\*\*)?\s*(?=\S)', re.IGNORECASE,
)
MARKER_KIND = {
    '决定': 'D', '决策': 'D', 'decision': 'D',
    '未决问题': 'Q', '待确认': 'Q', '问题': 'Q', 'open question': 'Q', 'question': 'Q',
    '反例': 'P', 'counterexample': 'P', '条件定理': 'T', 'conditional theorem': 'T',
    '支持关系': 'T', 'support relation': 'T',
}


def _spans(source):
    offset = 0
    stats = dict.fromkeys(STAT_KEYS, 0)
    for raw in source['text'].splitlines(keepends=True):
        quote = raw.strip()[:MAX_QUOTE_CHARS]
        match = PREFIX.match(quote)
        if match is not None:
            marker = match[1].lower()
            kind, atom = KINDS[MARKER_KIND[marker]]
            types = [(kind, 'support_relation' if marker in ('支持关系', 'support relation') else atom)]
        else:
            types = [KINDS[kind] for kind in sorted({label[0] for label in _scan(quote, stats)})]
        if types:
            start = offset + len(raw) - len(raw.lstrip())
            for kind, atom in types:
                yield start, quote, kind, atom
        offset += len(raw)


def _scope(conn, actor, token, project_id, revision, *, writing=False):
    decision.uuid(project_id)
    policy.revision(revision)
    projects, _ = scan_projects(conn, token)
    history, selected = _select(conn, projects, actor, project_id, revision)
    if writing:
        if history[-1] is not selected:
            raise policy.ProjectError('REVISION_CONFLICT')
        if selected['value']['owner'] != actor:
            raise policy.ProjectError('ACCESS_DENIED')
    can_write = history[-1] is selected and selected['value']['owner'] == actor
    return selected['value']['materials'], can_write


def _material_import(conn, ref):
    events = conn.execute(
        'SELECT event_id,event_time,payload_json FROM history_events '
        'WHERE event_type=? AND subject=? AND source=? ORDER BY event_time,event_id',
        ('import', ref['asset_id'], decision.SOURCE_VERSION))
    for event in events:
        try:
            payload = json.loads(event['payload_json'])
        except (TypeError, ValueError):
            continue
        if (isinstance(payload, dict) and payload.get('content_hash') == ref['content_hash']
                and type(event['event_time']) is int and 0 <= event['event_time'] <= policy.MAX_REVISION):
            return event['event_id'], event['event_time']
    raise policy.ProjectError('CONTENT_MISMATCH')


def _candidates(conn, actor, token, project_id, materials):
    sources = _Sources(conn, actor, token)
    readable, candidates = 0, {}
    for ref in materials:
        try:
            source = sources.get(ref)
            event_id, saved_at = _material_import(conn, ref)
        except policy.ProjectError as exc:
            if exc.code == 'RESPONSE_LIMIT':
                raise
            continue
        readable += 1
        for start, quote, kind, atom in _spans(source):
            key = f"knot:project-claim:v1:{project_id}:{ref['content_hash']}:{start}:{kind}"
            claim_id = str(uuid5(NAMESPACE_URL, key))
            candidates[claim_id] = (dict(
                claim_id=claim_id, claim_type=kind, atom=atom, quote=quote, quote_start=start,
                **ref, event_id=event_id, event_time=saved_at, saved_at=saved_at,
                **{k: source[k] for k in ('title', 'message_time_ms', 'document_on')}),
                json.dumps([event_id]))
            if len(candidates) > MAX_CANDIDATES:
                raise policy.ProjectError('RESPONSE_LIMIT')
    return candidates, readable


def _rows(conn, candidates):
    if not candidates:
        return {}
    placeholders = ','.join('?' for _ in candidates)
    rows = conn.execute(f'SELECT * FROM claims_candidates WHERE claim_id IN ({placeholders})',
                        tuple(candidates))
    result = {}
    for row in rows:
        item, support = candidates[row['claim_id']]
        if (row['source_label'], row['claim_type'], row['atom'], row['support_sources'],
                row['extraction_method']) != (PROJECT_CLAIM_LABEL, item['claim_type'], item['atom'],
                                             support, 'rule_based'):
            raise policy.ProjectError('CONTENT_MISMATCH')
        if row['user_response'] not in STATUSES:
            raise policy.ProjectError('CONTENT_MISMATCH')
        result[row['claim_id']] = row
    return result


def _response(token, value):
    decision.sensitive(value, token)
    # Match the wire representation and leave room for the response envelope.
    if len(json.dumps(value, ensure_ascii=False).encode('utf-8')) + 128 > policy.MAX_RESPONSE_BYTES:
        raise policy.ProjectError('RESPONSE_LIMIT')
    return value


class ProjectClaims:
    def __init__(self, db_path):
        self.repo = _DecisionRepo(db_path)

    @_boundary()
    def list(self, actor, token, project_id, revision, status=None):
        _authorize(actor, token)
        if status is not None and status not in STATUSES.values():
            raise policy.ProjectError('INVALID_ARGUMENTS')
        with read_snapshot(self.repo.db_path) as conn:
            materials, can_write = _scope(conn, actor, token, project_id, revision)
            candidates, readable = _candidates(conn, actor, token, project_id, materials)
            items = []
            for claim_id, row in _rows(conn, candidates).items():
                state = STATUSES[row['user_response']]
                if status is None or status == state:
                    items.append(candidates[claim_id][0] | dict(
                        proposed_at=row['proposed_at'], reviewed_at=row['reviewed_at'], status=state))
            items.sort(key=lambda item: (item['message_time_ms'] if item['message_time_ms'] is not None
                                        else item['saved_at'], item['asset_id'], item['quote_start'], item['claim_id']))
            return _response(token, dict(project_id=project_id, revision=revision,
                                         items=items, can_write=can_write,
                                         has_unavailable=readable != len(materials)))

    @_boundary(writing=True)
    def extract(self, actor, token, body):
        _authorize(actor, token)
        decision.closed(body, {'project_id', 'revision'})
        project_id, revision = body['project_id'], body['revision']
        with self.repo.session(), self.repo.transaction(), self.repo._connection() as conn:
            materials, _ = _scope(conn, actor, token, project_id, revision, writing=True)
            candidates, readable = _candidates(conn, actor, token, project_id, materials)
            existing = _rows(conn, candidates)
            instant = int(time.time() * 1000)
            vocabulary = _vocabulary(conn)
            proposals = [
                (claim_id, item['claim_type'], item['atom'], support, 'rule_based', instant, PROJECT_CLAIM_LABEL)
                for claim_id, (item, support) in candidates.items()
                if claim_id not in existing and item['atom'] in vocabulary
            ]
            conn.executemany(
                'INSERT INTO claims_candidates (claim_id,claim_type,atom,support_sources,'
                'extraction_method,proposed_at,source_label) VALUES (?,?,?,?,?,?,?)', proposals)
            return _response(token, dict(project_id=project_id, revision=revision, inserted=len(proposals),
                                         unchanged=len(existing), readable_materials=readable,
                                         skipped_materials=len(materials) - readable,
                                         has_unavailable=readable != len(materials)))

    @_boundary(writing=True)
    def review(self, actor, token, body):
        _authorize(actor, token)
        decision.closed(body, {'project_id', 'revision', 'claim_id', 'decision'})
        claim_id, verdict = body['claim_id'], body['decision']
        decision.uuid(claim_id)
        if verdict not in ('accept', 'reject'):
            raise policy.ProjectError('INVALID_ARGUMENTS')
        with self.repo.session(), self.repo.transaction(), self.repo._connection() as conn:
            materials, _ = _scope(conn, actor, token, body['project_id'], body['revision'], writing=True)
            candidates, _ = _candidates(conn, actor, token, body['project_id'], materials)
            if claim_id not in candidates or claim_id not in _rows(conn, {claim_id: candidates[claim_id]}):
                raise policy.ProjectError('NOT_FOUND')
            try:
                result = _review(conn, claim_id, verdict, int(time.time() * 1000), project_actor=actor)
            except ValueError:
                raise policy.ProjectError('CONTENT_MISMATCH') from None
            return _response(token, result)
