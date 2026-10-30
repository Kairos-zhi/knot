"""Selected-asset continuation material, using existing confirmation and trace semantics."""

import json
import re
import time
from uuid import uuid4

from .claim_support import claim_support_many
from .traceback import trace_claim


def _rows(conn, sql, params=()):
    cursor = conn.execute(sql, params)
    return [dict(zip((c[0] for c in cursor.description), row)) for row in cursor]


def _source_name(asset):
    try:
        metadata = json.loads(asset['metadata_json'] or '{}')
    except (TypeError, ValueError):
        metadata = None
    return (metadata.get('path') if isinstance(metadata, dict) else None) or asset['file_path']


def generate_bundle(conn, asset_ids: list[str], *, include_open_questions: bool = True,
                    now: int | None = None) -> dict:
    """Persist one scoped bundle atomically; join a caller transaction via savepoint.

    Local v1 visibility permits every asset, but selection is explicit. Candidates
    with any source outside selection are omitted, never silently expanded.
    """
    if (not isinstance(asset_ids, list) or not asset_ids or
            any(not isinstance(a, str) or not a for a in asset_ids)):
        raise ValueError('asset_ids must be a non-empty list of asset IDs')
    if type(include_open_questions) is not bool:
        raise ValueError('include_open_questions must be boolean')
    now = int(time.time() * 1000) if now is None else now
    if type(now) is not int or not 0 <= now <= 2**63 - 1:
        raise ValueError('now must be a non-negative SQLite timestamp')
    owned = not conn.in_transaction
    if owned:
        conn.execute('BEGIN IMMEDIATE')
    conn.execute('SAVEPOINT continuation_bundle')
    try:
        selected = set(asset_ids)
        assets = []
        for aid in sorted(selected):
            rows = _rows(conn, 'SELECT asset_id,content_hash,content_blob,metadata_json,file_path '
                               'FROM assets WHERE asset_id=?', (aid,))
            if not rows:
                raise ValueError('selected asset does not exist')
            assets.extend(rows)
        imports = dict(conn.execute("SELECT event_id,subject FROM history_events WHERE event_type='import'"))
        candidates = []
        for row in _rows(conn, 'SELECT claim_id,claim_type,source_label,atom,support_sources '
                              'FROM claims_candidates ORDER BY source_label,claim_id'):
            refs = json.loads(row['support_sources'] or '[]')
            if not isinstance(refs, list) or any(not isinstance(r, str) for r in refs):
                raise ValueError('invalid candidate support_sources')
            if refs and all(imports.get(ref) in selected for ref in refs):
                candidates.append(row)
        views = claim_support_many(conn, at=now, claim_ids=[c['claim_id'] for c in candidates])['claims']
        views = {v['claim_id']: v for v in views}
        sections = {name: [] for name in ('已确认决策', '条件性定理', '反例', '未决问题')}
        kinds = dict(decision='已确认决策', relation='条件性定理', counterexample='反例', question='未决问题')
        snapshot, questions = {}, []
        for row in candidates:
            view = views[row['claim_id']]
            if view['status'] == 'revoked' or row['claim_type'] not in kinds:
                continue
            if row['claim_type'] == 'question':
                if not include_open_questions:
                    continue
            elif view['status'] != 'confirmed':
                continue  # Candidate extraction alone is never a confirmed fact.
            trace = trace_claim(conn, row['claim_id'])
            if trace['status'] != view['status']:
                raise ValueError('trace status differs from bundle snapshot')
            if any(a['asset_id'] not in selected for a in trace['assets']):
                continue
            label = row['source_label'] or row['claim_id']
            entry = f"- [{label}] {row['atom']}（{view['status']}；claim {row['claim_id']}）"
            excerpts = []
            for asset in assets:
                if asset['asset_id'] not in {imports[r] for r in json.loads(row['support_sources'])}:
                    continue
                blob = asset['content_blob']
                if blob is not None and row['source_label']:
                    try:
                        lines = blob.decode('utf-8').splitlines()
                    except UnicodeDecodeError:
                        continue
                    pattern = r'(?<![A-Za-z0-9])' + re.escape(row['source_label']) + r'(?![A-Za-z0-9])'
                    excerpts.extend(
                        f"{asset['asset_id']}:{number} {json.dumps(line[:40], ensure_ascii=False)}"
                        for number, line in enumerate(lines, 1) if re.search(pattern, line))
            if excerpts:
                entry += '\n来源：\n' + '\n'.join('  > ' + line for line in dict.fromkeys(excerpts))
            else:
                entry += '\n  来源正文未内嵌或无编号对应行；请按来源资产核读。'
            if trace['path']:
                entry += '\n  为什么：' + ' → '.join(e['event_id'] for e in trace['path'])
            else:
                entry += '\n  尚未确认；候选来源事件：' + ', '.join(trace['candidate_sources'])
            sections[kinds[row['claim_type']]].append(entry)
            snapshot[row['claim_id']] = {k: view[k] for k in ('atom', 'status', 'boolean', 'minimal_roots')}
            if row['claim_type'] == 'question':
                questions.append(dict(claim_id=row['claim_id'], source_label=row['source_label'], status=view['status']))
        bundle_id = str(uuid4())
        parts = [f'# 续接包 {bundle_id}', '仅含显式选择的资产；候选标签与确认状态来自库，待用户审查。']
        for heading, entries in sections.items():
            parts.extend(['## ' + heading, '\n'.join(entries) or '（当前选择内无条目）'])
        parts.extend(['## 来源清单', '\n'.join(
            f"- asset {a['asset_id']} 文件名："
            f"{json.dumps(_source_name(a), ensure_ascii=False)} "
            f"sha256: {a['content_hash']}" for a in assets)])
        result = dict(bundle_id=bundle_id, created_at=now, user_scoped=True,
                      authorized_assets=sorted(selected), support_view_snapshot=snapshot,
                      open_questions=questions, context_text='\n\n'.join(parts) + '\n', exported=False)
        fields = ('authorized_assets', 'support_view_snapshot', 'open_questions')
        stored = {k: json.dumps(v, ensure_ascii=False) if k in fields else v for k, v in result.items()}
        conn.execute('INSERT INTO continuation_bundles (' + ','.join(stored) + ') VALUES (' +
                     ','.join('?' for _ in stored) + ')', tuple(stored.values()))
        conn.execute('RELEASE continuation_bundle')
        if owned:
            conn.commit()
        return result
    except BaseException:
        conn.execute('ROLLBACK TO continuation_bundle')
        conn.execute('RELEASE continuation_bundle')
        if owned:
            conn.rollback()
        raise
