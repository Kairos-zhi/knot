"""Read-only, bounded Codex adapter; retained content uses the project service.

No cursor file is an authority. On restart the existing manifest/source hashes
decide what has already been retained. Unknown writes keep their exact request.
"""
from collections import Counter
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import os
from pathlib import Path
import sqlite3
import threading
from tempfile import TemporaryDirectory
from time import time_ns
from uuid import UUID, NAMESPACE_URL, uuid5

from mvp import decision_policy as decision
from mvp import project_policy as policy

MAX_THREADS = 2000
MAX_LOG = 64 * 1024 * 1024
MAX_LINE = 2 * 1024 * 1024
MAX_CYCLE = 128 * 1024 * 1024
MAX_REGISTRY = 64 * 1024 * 1024
ISSUES = frozenset({'REGISTRY_UNAVAILABLE', 'REGISTRY_LIMIT', 'ROLLOUT_UNAVAILABLE',
    'ROLLOUT_LIMIT', 'ROLLOUT_INVALID', 'UNSUPPORTED_MESSAGES', 'INCOMPLETE_MESSAGE',
    'MESSAGE_CONFLICT', 'PROJECT_LIMIT', 'IMPORT_UNAVAILABLE', 'ACCESS_DENIED',
    'AMBIGUOUS_PROJECT'})


class CaptureError(ValueError):
    def __init__(self, code, charged=0):
        self.code = code if code in ISSUES else 'REGISTRY_UNAVAILABLE'
        self.charged = charged
        super().__init__(self.code)


def _path(value):
    if type(value) is not str or not value or len(value) > 4096:
        raise CaptureError('REGISTRY_UNAVAILABLE')
    return Path(value.removeprefix('\\\\?\\')).resolve()


def _inside(path, root):
    return path == root or root in path.parents


def _registry_image(home):
    """Raw rb opens never invoke SQLite recovery or create host sidecars."""
    image, remaining = {}, MAX_REGISTRY
    journal = home / 'state_5.sqlite-journal'
    if journal.exists() and journal.stat().st_size:
        raise CaptureError('REGISTRY_UNAVAILABLE')
    for name in ('state_5.sqlite', 'state_5.sqlite-wal'):
        path = home / name
        if path.resolve().parent != home:
            raise CaptureError('REGISTRY_UNAVAILABLE')
        try:
            with path.open('rb') as stream:
                if os.fstat(stream.fileno()).st_size > remaining:
                    raise CaptureError('REGISTRY_LIMIT')
                raw = stream.read(remaining + 1)
                if len(raw) > remaining:
                    raise CaptureError('REGISTRY_LIMIT')
                remaining -= len(raw)
                image[name] = raw
        except FileNotFoundError:
            if name == 'state_5.sqlite':
                raise CaptureError('REGISTRY_UNAVAILABLE') from None
    if journal.exists() and journal.stat().st_size:
        raise CaptureError('REGISTRY_UNAVAILABLE')
    return image


@contextmanager
def _registry_snapshot(home):
    # Include WAL, never immutable=1 (which can hide uncheckpointed commits).
    # Two bounded full byte comparisons reject an actively changing image.
    # SQLite opens only the ephemeral copy and may create its own sidecars.
    for _ in range(3):
        first, second = _registry_image(home), _registry_image(home)
        if first == second:
            break
    else:
        raise CaptureError('REGISTRY_UNAVAILABLE')
    with TemporaryDirectory(prefix='knot-codex-read-') as folder:
        root = Path(folder)
        for name, raw in second.items():
            (root / name).write_bytes(raw)
        yield root / 'state_5.sqlite'


def discover(home, bindings):
    """Return registry identities and selected recent primary threads, no text."""
    home = Path(home).resolve()
    if type(bindings) is not dict or len(bindings) > 16:
        raise CaptureError('REGISTRY_LIMIT')
    db = (home / 'state_5.sqlite').resolve()
    if db.parent != home:
        raise CaptureError('REGISTRY_UNAVAILABLE')
    conn, snapshot = None, None
    try:
        snapshot = _registry_snapshot(home)
        private_db = snapshot.__enter__()
        conn = sqlite3.connect(private_db.as_uri() + '?mode=ro', uri=True, timeout=0.2)
        conn.execute('PRAGMA query_only=ON')
        conn.execute('BEGIN')
        rows = conn.execute('SELECT id,name FROM projects ORDER BY id LIMIT 101').fetchall()
        roots = conn.execute('SELECT project_id,path FROM project_roots LIMIT 401').fetchall()
        threads = conn.execute('SELECT id,cwd,project_id,rollout_path,source,agent_nickname,'
            'agent_role,updated_at_ms FROM threads WHERE archived=0 '
            'ORDER BY updated_at_ms DESC,id LIMIT ?', (MAX_THREADS + 1,)).fetchall()
        if len(rows) > 100 or len(roots) > 400 or len(threads) > MAX_THREADS:
            raise CaptureError('REGISTRY_LIMIT')
        projects = {}
        for pid, title in rows:
            decision.uuid(pid)
            decision.text(title, 256, nonempty=True)
            projects[pid] = dict(source_id=pid, title=title,
                project_id=str(uuid5(NAMESPACE_URL, 'knot:codex-project:' + pid)),
                roots=[], threads=[], eligible_threads=0)
        for pid, root in roots:
            if pid not in projects:
                raise CaptureError('REGISTRY_UNAVAILABLE')
            projects[pid]['roots'].append(_path(root))
        for tid, binding in bindings.items():
            decision.uuid(tid)
            decision.closed(binding, {'project_id', 'title'})
            decision.uuid(binding['project_id'])
            decision.text(binding['title'], 256, nonempty=True)
            if tid in projects:
                raise CaptureError('AMBIGUOUS_PROJECT')
            projects[tid] = dict(source_id=tid, **binding, roots=[], threads=[], eligible_threads=0)
        issues = Counter()
        for tid, cwd, pid, rollout, source, nickname, role, updated in threads:
            # JSON subagent/guardian sources and unfamiliar host types are not
            # primary conversations, even if they have a cwd under a project.
            if source not in ('vscode', 'cli', 'exec') or nickname or role:
                continue
            decision.uuid(tid)
            if tid in bindings:
                selected = projects[tid]
            elif pid is not None:
                selected = projects.get(pid)
                if selected is None:
                    issues['AMBIGUOUS_PROJECT'] += 1
                    continue
            else:
                location = _path(cwd)
                matches = [(len(str(root)), p['source_id']) for p in projects.values()
                    for root in p['roots'] if _inside(location, root)]
                if not matches:
                    continue
                longest = max(length for length, _ in matches)
                identities = {identity for length, identity in matches if length == longest}
                if len(identities) != 1:
                    issues['AMBIGUOUS_PROJECT'] += 1
                    continue
                selected = projects[identities.pop()]
            selected['eligible_threads'] += 1
            if len(selected['threads']) < 3 or tid in bindings:
                selected['threads'].append(dict(thread_id=tid, path=rollout))
        return sorted(projects.values(), key=lambda p: (p['source_id'] not in bindings, p['source_id'])), issues
    except CaptureError:
        raise
    except Exception:
        raise CaptureError('REGISTRY_UNAVAILABLE') from None
    finally:
        if conn is not None:
            conn.close()
        if snapshot is not None:
            snapshot.__exit__(None, None, None)


def read_rollout(home, thread, remaining, stop=None):
    """Only allowlisted, complete human text; read a fixed prefix of a live log."""
    issues, charged = Counter(), 0
    try:
        path = _path(thread['path'])
        root = (Path(home).resolve() / 'sessions').resolve()
        if root.parent != Path(home).resolve() or path == root or not _inside(path, root) or path.suffix != '.jsonl':
            raise CaptureError('ROLLOUT_UNAVAILABLE')
        with path.open('rb') as stream:
            size = os.fstat(stream.fileno()).st_size
            if size > MAX_LOG or size > remaining:
                raise CaptureError('ROLLOUT_LIMIT')
            charged = size
            left, messages, seen, session_checked = size, [], {}, False
            while left:
                if stop is not None and stop.is_set():
                    return [], charged, issues
                raw = stream.readline(min(MAX_LINE + 1, left))
                left -= len(raw)
                if not raw or len(raw) > MAX_LINE:
                    raise CaptureError('ROLLOUT_LIMIT')
                if not raw.endswith(b'\n'):
                    issues['INCOMPLETE_MESSAGE'] += 1
                    break
                try:
                    value = decision.decode_json(raw)
                except decision.DecisionError:
                    raise CaptureError('ROLLOUT_INVALID') from None
                payload = value.get('payload', {})
                if type(payload) is not dict:
                    raise CaptureError('ROLLOUT_INVALID')
                if value.get('type') == 'session_meta':
                    if payload.get('id', payload.get('session_id')) != thread['thread_id']:
                        raise CaptureError('ROLLOUT_INVALID')
                    session_checked = True
                    continue
                if value.get('type') != 'response_item' or payload.get('type') != 'message' or payload.get('role') != 'user':
                    continue
                meta = payload.get('internal_chat_message_metadata_passthrough', {})
                kinds = meta.get('content_item_kinds', [])
                provenance = meta.get('content_item_metadata', [])
                # Explicitly recognize system-generated user-role envelopes;
                # they are excluded, not treated as personal work.
                if kinds and all(k != 'user.text' for k in kinds):
                    continue
                content = payload.get('content', [])
                if (not session_checked or not kinds or not content
                    or len(kinds) != len(provenance) or len(content) != len(kinds)
                    or any(k != 'user.text' for k in kinds)
                    or any(type(p) is not dict or p.get('provenance', {}).get('type') != 'user' for p in provenance)
                    or any(type(c) is not dict or c.get('type') != 'input_text' or type(c.get('text')) is not str for c in content)):
                    issues['UNSUPPORTED_MESSAGES'] += 1
                    continue
                retained = value.get('metadata', {}).get('retained_source', {})
                if retained.get('complete') is False:
                    issues['INCOMPLETE_MESSAGE'] += 1
                    continue
                mid = payload.get('id')
                if type(mid) is not str or not mid or len(mid) > 256:
                    issues['UNSUPPORTED_MESSAGES'] += 1
                    continue
                try:
                    instant = Decimal(str(meta['create_time']))
                    if not instant.is_finite() or instant < 0:
                        raise ValueError()
                    stamp = int(instant * 1000)
                    decision.message_day(stamp)
                except (KeyError, ValueError, InvalidOperation, decision.DecisionError):
                    issues['UNSUPPORTED_MESSAGES'] += 1
                    continue
                text = ''.join(c['text'] for c in content)
                source = dict(version=decision.SOURCE_VERSION, kind='user_message',
                    title='Codex · ' + decision.message_day(stamp), text=text,
                    text_sha256=sha256(text.encode('utf-8')).hexdigest(),
                    message_time_ms=stamp, document_on=None, archived_on=None,
                    locator=dict(channel='codex', thread_id=thread['thread_id'], message_id=mid, section=None))
                if len(text.encode('utf-8')) > decision.MAX_SOURCE_TEXT_BYTES:
                    raise CaptureError('ROLLOUT_LIMIT')
                signature = decision.canonical(source)
                if mid in seen and seen[mid] != signature:
                    raise CaptureError('MESSAGE_CONFLICT')
                if mid not in seen:
                    seen[mid] = signature
                    messages.append(source)
            if not session_checked:
                raise CaptureError('ROLLOUT_INVALID')
        return messages, size, issues
    except CaptureError as exc:
        exc.charged = max(exc.charged, charged)
        raise
    except Exception:
        raise CaptureError('ROLLOUT_UNAVAILABLE', charged) from None


def project_capture_state(value, token):
    """Closed, content-free browser status; never echo adapter internals."""
    decision.closed(value, {'phase', 'scanned_at', 'last_saved_at', 'discovered',
        'added_sources', 'retained_sources', 'issues', 'limited'})
    if value['phase'] not in ('starting', 'watching', 'paused', 'unavailable') or type(value['limited']) is not bool:
        raise ValueError('INVALID_ARGUMENTS')
    for key in ('scanned_at', 'last_saved_at'):
        if value[key] is not None:
            decision.message_day(value[key])
    def count(n):
        if type(n) is not int or not 0 <= n <= 10000000:
            raise ValueError('INVALID_ARGUMENTS')
    for key in ('added_sources', 'retained_sources'):
        count(value[key])
    if type(value['discovered']) is not list or len(value['discovered']) > 116:
        raise ValueError('INVALID_ARGUMENTS')
    seen = set()
    for p in value['discovered']:
        decision.closed(p, {'source_id', 'title', 'project_id', 'retained', 'eligible_threads'})
        decision.uuid(p['source_id']); decision.uuid(p['project_id'])
        decision.text(p['title'], 256, nonempty=True)
        count(p['eligible_threads'])
        if type(p['retained']) is not bool or p['source_id'] in seen:
            raise ValueError('INVALID_ARGUMENTS')
        seen.add(p['source_id'])
    if type(value['issues']) is not list or len(value['issues']) > len(ISSUES):
        raise ValueError('INVALID_ARGUMENTS')
    seen = set()
    for issue in value['issues']:
        decision.closed(issue, {'code', 'count'})
        if issue['code'] not in ISSUES or issue['code'] in seen:
            raise ValueError('INVALID_ARGUMENTS')
        count(issue['count']); seen.add(issue['code'])
    decision.sensitive(value, token)
    return decision.decode_json(decision.canonical(value))


class CodexCapture:
    """Lifecycle-owned local follower, composed with the existing service API."""
    def __init__(self, home, *, listing, reading, importing, bindings=None, interval=30):
        if type(interval) not in (int, float) or interval < 0.01:
            raise ValueError('INTERVAL_INVALID')
        self.home, self.bindings = Path(home), bindings or {}
        self.listing, self.reading, self.importing = listing, reading, importing
        self.interval = interval
        self.lock = threading.RLock()
        self.stop_event, self.wake = threading.Event(), threading.Event()
        self.paused, self.thread, self.pending = False, None, {}
        self.view = dict(phase='starting', scanned_at=None, last_saved_at=None,
            discovered=[], added_sources=0, retained_sources=0, issues=[], limited=False)

    def state(self):
        with self.lock:
            return decision.decode_json(decision.canonical(self.view))

    def control(self, body):
        if type(body) is not dict or set(body) != {'explicit', 'paused'} or body['explicit'] is not True or type(body['paused']) is not bool:
            raise ValueError('INVALID_ARGUMENTS')
        with self.lock:
            self.paused = body['paused']
            self.view['phase'] = 'paused' if self.paused else 'starting'
            self.wake.set()
            return self.state()

    def start(self):
        if self.thread is not None:
            raise ValueError('ALREADY_STARTED')
        self.thread = threading.Thread(target=self._run, name='knot-codex-capture', daemon=True)
        self.thread.start()

    def close(self):
        self.stop_event.set()
        self.wake.set()
        if self.thread is not None:
            self.thread.join()

    def _run(self):
        while not self.stop_event.is_set():
            self.run_once()
            self.wake.wait(self.interval)
            self.wake.clear()

    def run_once(self):
        # Control waits only for an already started atomic import. No new
        # import starts after a pause has been acknowledged.
        with self.lock:
            if self.paused or self.stop_event.is_set():
                return self.state()
        issues, added, retained, remaining, discovered = Counter(), 0, 0, MAX_CYCLE, []
        try:
            projects, notices = discover(self.home, self.bindings)
            issues.update(notices)
            listed = {p['project_id']: p for p in self.listing()['items']}
            for p in projects:
                if self.stop_event.is_set():
                    break
                pid = p['project_id']
                entry = {k: p[k] for k in ('source_id', 'title', 'project_id', 'eligible_threads')}
                entry['retained'] = pid in listed
                discovered.append(entry)
                if not p['threads']:
                    continue
                if p['eligible_threads'] > len(p['threads']):
                    issues['ROLLOUT_LIMIT'] += 1
                try:
                    messages = []
                    for thread in p['threads']:
                        with self.lock:
                            if self.paused or self.stop_event.is_set():
                                break
                        try:
                            sources, used, notices = read_rollout(self.home, thread, remaining, stop=self.stop_event)
                            remaining -= used
                            messages.extend(sources)
                            issues.update(notices)
                        except CaptureError as exc:
                            remaining -= exc.charged
                            issues[exc.code] += 1
                    scene = self.reading(pid) if pid in listed else None
                    # A retained opaque source is not repaired or bypassed.
                    if scene and scene['has_unavailable']:
                        raise CaptureError('ACCESS_DENIED')
                    if scene:
                        with self.lock:
                            self.view['last_saved_at'] = max(self.view['last_saved_at'] or 0, scene['saved_at'])
                    existing = {r['content_hash'] for r in scene['materials']} if scene else set()
                    fresh = {}
                    for source in messages:
                        digest = sha256(decision.canonical(source)).hexdigest()
                        if digest not in existing:
                            fresh[digest] = source
                    if len(existing) + len(fresh) > policy.MAX_MATERIALS:
                        raise CaptureError('PROJECT_LIMIT')
                    queue = sorted(fresh.values(), key=lambda s: (s['message_time_ms'], s['locator']['thread_id'], s['locator']['message_id']))
                    while queue or pid in self.pending:
                        with self.lock:
                            if self.paused or self.stop_event.is_set():
                                break
                            body = self.pending.get(pid)
                            if body is None:
                                batch, size = [], 0
                                for source in queue:
                                    amount = len(source['text'].encode('utf-8'))
                                    if len(batch) == policy.MAX_DOCUMENTS or size + amount > policy.MAX_IMPORT_TEXT_BYTES:
                                        break
                                    batch.append(source)
                                    size += amount
                                revision = scene['revision'] if scene else '0'
                                request = dict(project_id=pid, title=scene['title'] if scene else p['title'],
                                    expected_revision=revision, documents=[], sources=batch, archive_ref=None)
                                request['request_id'] = str(uuid5(UUID(pid), sha256(decision.canonical(request)).hexdigest()))
                                body = self.pending[pid] = request
                            try:
                                self.importing(body)
                            except policy.ProjectError as exc:
                                if exc.code not in ('READ_UNAVAILABLE', 'IMPORT_UNAVAILABLE'):
                                    self.pending.pop(pid, None)
                                raise
                            self.pending.pop(pid, None)
                            scene = self.reading(pid)
                            added += sum(sha256(decision.canonical(s)).hexdigest() not in existing for s in body['sources'])
                            self.view['last_saved_at'] = max(self.view['last_saved_at'] or 0, scene['saved_at'])
                            entry['retained'] = True
                            existing = {r['content_hash'] for r in scene['materials']}
                            queue = [s for s in queue if sha256(decision.canonical(s)).hexdigest() not in existing]
                    if scene:
                        retained += len(scene.get('observations', []))
                except CaptureError as exc:
                    issues[exc.code] += 1
                except policy.ProjectError as exc:
                    issues[{'CONTENT_MISMATCH':'MESSAGE_CONFLICT', 'RESPONSE_LIMIT':'PROJECT_LIMIT',
                        'ACCESS_DENIED':'ACCESS_DENIED'}.get(exc.code, 'IMPORT_UNAVAILABLE')] += 1
            stamp = time_ns() // 1000000
            phase = 'watching'
        except CaptureError as exc:
            issues[exc.code] += 1
            stamp, phase = None, 'unavailable'
        except Exception:
            issues['IMPORT_UNAVAILABLE'] += 1
            stamp, phase = None, 'unavailable'
        with self.lock:
            self.view.update(phase='paused' if self.paused else phase,
                scanned_at=stamp if stamp is not None else self.view['scanned_at'],
                discovered=discovered, added_sources=added, retained_sources=retained,
                issues=[dict(code=k, count=n) for k, n in sorted(issues.items())], limited=bool(issues))
            return self.state()
