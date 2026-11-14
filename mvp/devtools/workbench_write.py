"""Durable, explicitly confirmed local delivery of an existing v2 save request.

This private journal is delivery state, not an exploration database. Neither
construction nor state inspection sends a request. Credentials stay in memory.
"""

import asyncio
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import threading
from uuid import uuid4

from mvp.exploration_policy import (
    ExplorationError, MAX_SAVE_BYTES, normalize_save_v2, strict_json, validate_uuid,
)
from mvp.plugin_projection import project_exploration_receipt_v2


class WriteError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


_DRAFT_FIELDS = {'exploration_id', 'expected_revision', 'snapshot_version',
                 'references', 'stop_note', 'relations'}
_REF_FIELDS = {'asset_id', 'expected_content_hash', 'disposition', 'reason'}
_REL_FIELDS = {'relation_id', 'from_asset_id', 'to_asset_id', 'label', 'reason'}
_PHASES = {'prepared', 'unknown', 'saved', 'rejected', 'cancelled'}
_REFUSALS = frozenset({
    'INVALID_ARGUMENTS', 'ASSET_UNAVAILABLE', 'SENSITIVE_CONTENT', 'ACCESS_DENIED',
    'NOT_FOUND', 'REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT',
    'SNAPSHOT_VERSION_REQUIRED', 'MIGRATION_REQUIRED', 'SCHEMA_INVALID', 'SERVER_READ_ONLY',
})
_ERRORS = _REFUSALS | {'WRITE_OUTCOME_UNKNOWN', 'STATE_UNAVAILABLE'}
_FIELDS = {'version', 'operation_id', 'digest', 'binding', 'body', 'phase',
           'receipt', 'error', 'auth'}
_LOCKS = {}
_LOCKS_GUARD = threading.Lock()
_MAX_JOURNAL = MAX_SAVE_BYTES * 2


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def _check_path(path):
    """Check every existing ancestor without resolving away reparse points."""
    for part in reversed((path, *path.parents)):
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        if (stat.S_ISLNK(info.st_mode) or
                getattr(info, 'st_file_attributes', 0) & 0x400):
            raise WriteError('STATE_UNSAFE')
        if part != path and not stat.S_ISDIR(info.st_mode):
            raise WriteError('STATE_UNSAFE')


def _windows_handle(path, *, directory=False, create=False):
    """Open the object itself and deny renames while its handle is held."""
    import ctypes
    from ctypes import wintypes

    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    open_file = kernel.CreateFileW
    open_file.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                          ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    open_file.restype = wintypes.HANDLE
    close = kernel.CloseHandle
    close.argtypes = [wintypes.HANDLE]
    close.restype = wintypes.BOOL
    access = 0x80 if directory else 0x80000000 | (0x40000000 if create else 0)
    flags = 0x00200000 | (0x02000000 if directory else 0)  # OPEN_REPARSE_POINT
    handle = open_file(str(path), access, 3, None, 4 if create else 3, flags, None)
    if handle == ctypes.c_void_p(-1).value:
        raise OSError(ctypes.get_last_error(), 'state open failed')
    try:
        class Attributes(ctypes.Structure):
            _fields_ = [('attributes', wintypes.DWORD), ('tag', wintypes.DWORD)]
        info = Attributes()
        get_info = kernel.GetFileInformationByHandleEx
        get_info.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        get_info.restype = wintypes.BOOL
        if not get_info(handle, 9, ctypes.byref(info), ctypes.sizeof(info)):
            raise OSError(ctypes.get_last_error(), 'state inspection failed')
        if info.attributes & 0x400 or bool(info.attributes & 0x10) != directory:
            raise WriteError('STATE_UNSAFE')
        return handle, close
    except BaseException:
        close(handle)
        raise


@contextmanager
def _directory_pins(path):
    handles = []
    try:
        if os.name == 'nt':
            for part in reversed((path, *path.parents)):
                handles.append(_windows_handle(part, directory=True))
        yield
    finally:
        for handle, close in reversed(handles):
            close(handle)


def _open_control(path, create=False):
    _check_path(path)
    if os.name == 'nt':
        import msvcrt
        handle, close = _windows_handle(path, create=create)
        try:
            descriptor = msvcrt.open_osfhandle(handle, os.O_BINARY | (os.O_RDWR if create else os.O_RDONLY))
        except BaseException:
            close(handle)
            raise
    else:
        flags = (os.O_RDWR | os.O_CREAT if create else os.O_RDONLY) | getattr(os, 'O_NOFOLLOW', 0)
        descriptor = os.open(path, flags, 0o600)
    stream = os.fdopen(descriptor, 'r+b' if create else 'rb')
    if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode) or os.fstat(stream.fileno()).st_nlink != 1:
        stream.close()
        raise WriteError('STATE_UNSAFE')
    return stream


async def exploration_call(origin, name, arguments, token):
    # Keep the read-only workbench importable without the optional MCP SDK.
    from mvp.codex_mcp import exploration_call as call
    return await call(origin, name, arguments, token)


class WriteJournal:
    def __init__(self, state_root, origin, token):
        if (type(origin) is not str or not re.fullmatch(r'http://127\.0\.0\.1:[0-9]{1,5}', origin)
                or not 1 <= int(origin.rsplit(':', 1)[1]) <= 65535
                or type(token) is not str or len(token) < 16 or any(c.isspace() for c in token)):
            raise WriteError('WRITE_CONFIG_INVALID')
        try:
            self.root = Path(os.path.abspath(os.fspath(state_root)))
        except (ValueError, TypeError, OSError):
            raise WriteError('STATE_UNSAFE') from None
        self.origin, self._token = origin, token
        self._key = hashlib.sha256(b'knot-workbench-journal-v1\0' + token.encode('utf-8')).digest()
        self._binding = hmac.new(self._key, b'origin\0' + origin.encode('utf-8'), 'sha256').hexdigest()
        self._path = self.root / 'write-journal.json'
        self._guard_path = self.root / 'write-journal.lock'
        with _LOCKS_GUARD:
            self._lock = _LOCKS.setdefault(os.path.normcase(str(self.root)), threading.RLock())
        # Validate existing state immediately, but never send or repair it.
        with self._guard():
            self._load()

    @contextmanager
    def _guard(self):
        with self._lock:
            try:
                _check_path(self.root)
                self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
                _check_path(self.root)
                with _directory_pins(self.root), _open_control(self._guard_path, create=True) as stream:
                    if os.name == 'nt':
                        import msvcrt
                        if stream.seek(0, 2) == 0:
                            stream.write(b'0'); stream.flush(); os.fsync(stream.fileno())
                        stream.seek(0)
                        msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
                    try:
                        _check_path(self._path)
                        yield
                    finally:
                        if os.name == 'nt':
                            stream.seek(0)
                            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                        else:
                            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
            except WriteError:
                raise
            except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
                raise WriteError('STATE_UNAVAILABLE') from None

    def _auth(self, record):
        return hmac.new(self._key, b'record\0' + _canonical({
            k: v for k, v in record.items() if k != 'auth'
        }), 'sha256').hexdigest()

    def _load(self):
        try:
            with _open_control(self._path) as stream:
                raw = stream.read(_MAX_JOURNAL + 1)
        except FileNotFoundError:
            return None
        try:
            if len(raw) > _MAX_JOURNAL:
                raise ValueError()
            record = strict_json(raw)
            if (type(record) is not dict or record.keys() != _FIELDS
                    or type(record['version']) is not int or record['version'] != 1
                    or type(record['binding']) is not str or type(record['auth']) is not str
                    or not hmac.compare_digest(record['binding'], self._binding)
                    or not hmac.compare_digest(record['auth'], self._auth(record))):
                raise ValueError()
            validate_uuid(record['operation_id'])
            body = normalize_save_v2(record['body'], self._token)
            if (body != record['body'] or len(_canonical(body)) > MAX_SAVE_BYTES
                    or record['digest'] != hashlib.sha256(_canonical(body)).hexdigest()
                    or record['phase'] not in _PHASES):
                raise ValueError()
            phase, receipt, error = record['phase'], record['receipt'], record['error']
            if error is not None and (type(error) is not str or error not in _ERRORS):
                raise ValueError()
            if phase == 'saved':
                if error is not None or self._receipt(receipt, body) != receipt or 'error' in receipt:
                    raise ValueError()
            elif receipt is not None:
                raise ValueError()
            if phase in ('prepared', 'cancelled') and error is not None:
                raise ValueError()
            if phase == 'rejected' and error not in _REFUSALS:
                raise ValueError()
            return record
        except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
            raise WriteError('JOURNAL_INVALID') from None

    def _persist(self, record):
        """Publish a complete authenticated record, with no partial-file window."""
        record = record | {'auth': self._auth(record)}
        raw = _canonical(record)
        temporary = self.root / ('.write-' + str(uuid4()) + '.tmp')
        try:
            _check_path(self._path)
            with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                                  getattr(os, 'O_NOFOLLOW', 0), 0o600), 'wb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            _check_path(self._path)
            if os.name == 'nt':
                import ctypes
                from ctypes import wintypes
                move = ctypes.WinDLL('kernel32', use_last_error=True).MoveFileExW
                move.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
                move.restype = wintypes.BOOL
                if not move(str(temporary), str(self._path), 1 | 8):  # REPLACE_EXISTING | WRITE_THROUGH
                    raise OSError(ctypes.get_last_error(), 'journal publish failed')
            else:
                os.replace(temporary, self._path)
                descriptor = os.open(self.root, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
                try:
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
        finally:
            if temporary.exists():
                temporary.unlink()

    @staticmethod
    def _summary(record):
        if record is None:
            return dict(phase='empty', operation_id=None, digest=None,
                        exploration_id=None, expected_revision=None)
        value = {k: record[k] for k in ('phase', 'operation_id', 'digest')}
        value.update(exploration_id=record['body']['exploration_id'],
                     expected_revision=str(record['body']['expected_revision']))
        if record['receipt'] is not None:
            value['receipt'] = record['receipt'] | {'revision': str(record['receipt']['revision'])}
        if record['error'] is not None:
            value['error'] = record['error']
        return value

    def state(self):
        with self._guard():
            return self._summary(self._load())

    def prepare(self, draft):
        with self._guard():
            existing = self._load()
            if existing is not None and existing['phase'] in ('prepared', 'unknown'):
                raise WriteError('OPERATION_PENDING')
            try:
                if (type(draft) is not dict or draft.keys() != _DRAFT_FIELDS
                        or type(draft['expected_revision']) is not str
                        or not re.fullmatch(r'0|[1-9][0-9]{0,18}', draft['expected_revision'])
                        or type(draft['references']) is not list or type(draft['relations']) is not list
                        or any(type(r) is not dict or r.keys() != _REF_FIELDS for r in draft['references'])
                        or any(type(r) is not dict or r.keys() != _REL_FIELDS for r in draft['relations'])):
                    raise WriteError('INVALID_ARGUMENTS')
                body = normalize_save_v2(draft | {'expected_revision': int(draft['expected_revision']),
                                                 'request_key': str(uuid4())}, self._token)
                if len(_canonical(body)) > MAX_SAVE_BYTES:
                    raise WriteError('INVALID_ARGUMENTS')
            except ExplorationError as exc:
                raise WriteError(exc.code) from None
            except (ValueError, TypeError, UnicodeError, RecursionError):
                raise WriteError('INVALID_ARGUMENTS') from None
            record = dict(version=1, operation_id=str(uuid4()), binding=self._binding,
                          digest=hashlib.sha256(_canonical(body)).hexdigest(), body=body,
                          phase='prepared', receipt=None, error=None)
            self._persist(record)
            return self._summary(record)

    def _bound(self, binding):
        if (type(binding) is not dict or binding.keys() != {'operation_id', 'digest'}
                or any(type(binding[k]) is not str for k in binding)):
            raise WriteError('INVALID_ARGUMENTS')
        record = self._load()
        if record is None or any(not hmac.compare_digest(binding[k], record[k]) for k in binding):
            raise WriteError('OPERATION_MISMATCH')
        return record

    def cancel(self, binding):
        with self._guard():
            record = self._bound(binding)
            if record['phase'] != 'prepared':
                raise WriteError('OPERATION_NOT_PREPARED')
            record = record | {'phase': 'cancelled'}
            self._persist(record)
            return self._summary(record)

    def confirm(self, binding):
        return self._send(binding, recovery=False)

    def recover(self, binding):
        return self._send(binding, recovery=True)

    def _receipt(self, result, body):
        return project_exploration_receipt_v2(
            {'contract_version': 1, 'ok': True, 'value': result},
            body['exploration_id'], body['expected_revision'], self._token)

    def _send(self, binding, *, recovery):
        with self._guard():
            record = self._bound(binding)
            expected = 'unknown' if recovery else 'prepared'
            if record['phase'] != expected:
                raise WriteError('OPERATION_NOT_UNKNOWN' if recovery else 'OPERATION_NOT_PREPARED')
            unknown = record | {'phase': 'unknown', 'receipt': None, 'error': 'WRITE_OUTCOME_UNKNOWN'}
            # Failure here must precede even constructing the upstream coroutine.
            self._persist(unknown)
            try:
                result = asyncio.run(exploration_call(
                    self.origin, 'knot_save_exploration_v2', record['body'], self._token))
                refusal = (result['error'] if type(result) is dict and result.keys() == {'error'}
                           and type(result['error']) is str and result['error'] in _REFUSALS else None)
                receipt = self._receipt(result, record['body'])
                if 'error' not in receipt:
                    final = unknown | {'phase': 'saved', 'receipt': receipt, 'error': None}
                elif refusal is not None:
                    final = unknown | {'phase': 'unknown' if recovery else 'rejected', 'error': refusal}
                else:
                    final = unknown
            except Exception:
                final = unknown
            try:
                self._persist(final)
            except (OSError, WriteError):
                # A verified receipt is not success until its journal is durable.
                final = unknown | {'error': 'STATE_UNAVAILABLE'}
                self._persist(final)
            return self._summary(final)
