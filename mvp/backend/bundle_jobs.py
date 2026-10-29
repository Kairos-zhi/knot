"""Durable bundle jobs sharing the transport journal and its serialization lock."""

from contextlib import closing
from copy import deepcopy
import os
from pathlib import Path
import sqlite3
import threading
import time
from uuid import UUID, uuid4

from .continuation_bundle import generate_bundle


class BundleJobs:
    def __init__(self, server):
        self.server = server
        self.exports = Path.home() / '.knot' / 'exports'
        self.threads = []
        self.failed = False
        # Interrupted work is not replayed: SQLite/file/journal have no common
        # commit. Preserve evidence and report uncertainty without duplicate work.
        journal = deepcopy(server.journal)
        jobs = journal.setdefault('jobs', {})
        changed = False
        for job in jobs.values():
            if job['status'] in ('pending', 'running'):
                if job['status'] == 'pending':
                    job['status'] = 'running'
                    server.persist(journal)
                job.update(status='failed', updated_at=int(time.time() * 1000),
                           error=dict(code='INTERNAL', message='interrupted_job_requires_review', detail={}))
                changed = True
        if changed:
            server.persist(journal)
        server.journal = journal

    def submit(self, body):
        server = self.server
        name, args, key = body['command'], body['args'], body.get('idempotency_key')
        if name == 'bundle.create':
            if (set(args) - {'asset_ids', 'include_open_questions'} or
                    not isinstance(args.get('asset_ids'), list) or not args['asset_ids'] or
                    any(not isinstance(a, str) or not a for a in args['asset_ids']) or
                    type(args.get('include_open_questions', True)) is not bool):
                raise ValueError('invalid bundle.create arguments')
        else:
            if set(args) != {'bundle_id'} or not isinstance(args['bundle_id'], str):
                raise ValueError('invalid bundle.export arguments')
            try:
                if str(UUID(args['bundle_id'])) != args['bundle_id']:
                    raise ValueError('noncanonical bundle_id')
            except (ValueError, AttributeError):
                raise ValueError('bundle_id must be a canonical UUID') from None
        with server.changed:
            if self.failed or server.stopping or server.journal.get('pending'):
                raise ValueError('server cannot accept jobs')
            if key is not None and key in server.journal['keys']:
                original = server.journal['keys'][key]
                if original['body'] != body:
                    raise ValueError('idempotency_key_conflict')
                return original['value']
            jid, now = str(uuid4()), int(time.time() * 1000)
            job = dict(job_id=jid, command=name, status='pending', created_at=now,
                       updated_at=now, result=None, error=None)
            value = dict(command=name, status='queued', event_id=None, job_id=jid)
            journal = deepcopy(server.journal)
            journal['jobs'][jid] = job
            if key is not None:
                journal['keys'][key] = dict(body=body, value=value)
            server.persist(journal)
            server.journal = journal
            thread = threading.Thread(target=self._run, args=(jid, name, deepcopy(args)))
            self.threads.append(thread)
            thread.start()
            return value

    def get(self, jid):
        with self.server.changed:
            return deepcopy(self.server.journal['jobs'].get(jid))

    def _transition(self, jid, status, **fields):
        server = self.server
        with server.changed:
            journal = deepcopy(server.journal)
            job = journal['jobs'][jid]
            assert (job['status'], status) in {('pending', 'running'), ('running', 'done'), ('running', 'failed')}
            job.update(status=status, updated_at=int(time.time() * 1000), **fields)
            if status == 'done' and job['command'] == 'bundle.create':
                journal['seq'] += 1
                journal['frames'].append(dict(seq=journal['seq'], type='bundle.created',
                    ts=job['updated_at'], payload=dict(bundle_id=job['result']['bundle_id'])))
            server.persist(journal)
            server.journal = journal
            server.changed.notify_all()

    def _execute(self, name, args):
        uri = self.server.db.as_uri() + '?mode=rw'
        with closing(sqlite3.connect(uri, uri=True)) as conn:
            conn.execute('PRAGMA foreign_keys=ON')
            if name == 'bundle.create':
                return dict(bundle_id=generate_bundle(conn, **args)['bundle_id'])
            bid = args['bundle_id']
            row = conn.execute('SELECT context_text FROM continuation_bundles WHERE bundle_id=?', (bid,)).fetchone()
            if row is None:
                raise LookupError('bundle does not exist')
            self.exports.mkdir(parents=True, exist_ok=True)
            target = self.exports / (bid + '.md')
            temporary = self.exports / (bid + '.' + uuid4().hex + '.tmp')
            try:
                with temporary.open('x', encoding='utf-8', newline='\n') as stream:
                    stream.write(row[0])
                    stream.flush()
                    os.fsync(stream.fileno())
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
            with conn:
                conn.execute('UPDATE continuation_bundles SET exported=1 WHERE bundle_id=?', (bid,))
            return dict(bundle_id=bid, exported=True, path='exports/' + bid + '.md')

    def _run(self, jid, name, args):
        # A journal failure is not a business failure: do not invent a terminal
        # state after uncertain persistence, nor attempt pending -> failed.
        try:
            with self.server.changed:
                if self.failed:
                    return
                self._transition(jid, 'running')
        except OSError:
            self.failed = True
            return
        try:
            result = self._execute(name, args)
        except Exception as exc:
            code = 'NOT_FOUND' if isinstance(exc, LookupError) else 'BAD_REQUEST' if isinstance(exc, ValueError) else 'INTERNAL'
            # Never persist exception text: OS errors may contain absolute paths.
            status, fields = 'failed', dict(error=dict(code=code, message=code, detail={}))
        else:
            status, fields = 'done', dict(result=result)
        try:
            self._transition(jid, status, **fields)
        except OSError:
            self.failed = True

    def close(self):
        for thread in self.threads:
            thread.join()
