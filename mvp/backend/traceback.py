"""Strict, SELECT-only event provenance for a candidate in one read snapshot."""

from collections import deque
import json
import time

from .claim_support import claim_support


def _strings(raw, field):
    if raw is None:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f'{field} must be a JSON array of non-empty strings') from exc
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        raise ValueError(f'{field} must be a JSON array of non-empty strings')
    return value


def _one(conn, sql, params):
    cursor = conn.execute(sql, params)
    row = cursor.fetchone()
    return None if row is None else dict(zip((column[0] for column in cursor.description), row))


def _events(conn, root, max_depth):
    # Iterative DFS distinguishes a shared descendant from a cycle; postorder
    # also checks the longest route, including routes to already visited nodes.
    nodes, colors, postorder, active = {}, {}, [], []
    stack = [(root, 1, False)]
    while stack:
        event_id, depth, exiting = stack.pop()
        if exiting:
            active.pop()
            colors[event_id] = 2
            postorder.append(event_id)
            continue
        if colors.get(event_id) == 1:
            raise ValueError('evidence_refs cycle: ' + ' -> '.join(active + [event_id]))
        if depth > max_depth:
            raise ValueError(f'max_depth={max_depth} exceeded at event {event_id}')
        if colors.get(event_id) == 2:
            continue
        event = _one(conn,
            'SELECT rowid AS _rowid,event_id,event_type,subject,event_time,recorded_at,evidence_refs '
            'FROM history_events WHERE event_id=?', (event_id,))
        if event is None:
            raise ValueError(f'missing evidence event: {event_id}')
        event['evidence_refs'] = _strings(event['evidence_refs'], f'event {event_id} evidence_refs')
        nodes[event_id] = event
        colors[event_id] = 1
        active.append(event_id)
        stack.append((event_id, depth, True))
        stack.extend((ref, depth + 1, False) for ref in reversed(event['evidence_refs']))
    heights = {}
    for event_id in postorder:
        heights[event_id] = 1 + max((heights[ref] for ref in nodes[event_id]['evidence_refs']), default=0)
    if heights[root] > max_depth:
        raise ValueError(f'max_depth={max_depth} exceeded from event {root} (depth={heights[root]})')

    # A shared event appears once with its shortest distance from the root.
    depths, pending = {root: 1}, deque([root])
    while pending:
        event_id = pending.popleft()
        for ref in nodes[event_id]['evidence_refs']:
            if ref not in depths:
                depths[ref] = depths[event_id] + 1
                pending.append(ref)
    path = []
    for event in sorted(nodes.values(), key=lambda row: (row['event_time'], row['_rowid'])):
        path.append({key: value for key, value in event.items() if key != '_rowid'} | {'depth': depths[event['event_id']]})
    return path, heights[root]


def _assets(conn, path):
    result = {}
    for event in path:
        if event['event_type'] != 'import':
            continue
        asset_id = event['subject']
        if asset_id in result:
            continue
        asset = _one(conn, 'SELECT asset_id,content_hash,media_type,source_uri,metadata_json '
                     'FROM assets WHERE asset_id=?', (asset_id,))
        if asset is None:
            raise ValueError(f'missing import asset {asset_id!r} for event {event["event_id"]}')
        raw = asset.pop('metadata_json')
        try:
            metadata = {} if raw is None else json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise ValueError(f'invalid metadata_json for asset {asset_id}') from exc
        if not isinstance(metadata, dict):
            raise ValueError(f'metadata_json must be an object for asset {asset_id}')
        asset['path'] = metadata.get('path')
        result[asset_id] = asset
    return [result[key] for key in sorted(result)]


def trace_claim(conn, claim_id: str, *, max_depth: int = 5) -> dict:
    """Trace current candidate status; caller owns the complete read transaction.

    No historical-at mode: sample wall-clock milliseconds once and delegate
    status to claim_support. Defective chains raise before any result escapes.
    """
    if not isinstance(claim_id, str) or not claim_id:
        raise ValueError('claim_id must be a non-empty string')
    if type(max_depth) is not int or max_depth < 1:
        raise ValueError('max_depth must be a positive integer')
    if not conn.in_transaction:
        raise ValueError('trace_claim requires a caller-owned read transaction; use read_snapshot')
    status = claim_support(conn, claim_id, at=int(time.time() * 1000))['status']
    claim = _one(conn, 'SELECT source_label,atom,support_sources,source_members '
                 'FROM claims_candidates WHERE claim_id=?', (claim_id,))
    if claim is None:
        raise ValueError(f'claim does not exist: {claim_id}')
    result = dict(claim_id=claim_id, source_label=claim['source_label'], atom=claim['atom'],
                  status=status, path=[], assets=[],
                  candidate_sources=_strings(claim['support_sources'], 'support_sources'),
                  source_members=_strings(claim['source_members'], 'source_members'),
                  depth=0, missing_refs=[])
    if status == 'unconfirmed':
        return result
    roots = conn.execute("SELECT event_id FROM history_events WHERE event_type='user_confirm' AND subject=?",
                         (claim_id,)).fetchall()
    if len(roots) != 1:
        raise ValueError(f'claim {claim_id} requires exactly one confirmation event')
    result['path'], result['depth'] = _events(conn, roots[0][0], max_depth)
    result['assets'] = _assets(conn, result['path'])
    return result
