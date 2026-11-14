"""Manage one explicitly isolated Knot plugin development runtime.

This helper owns only a runtime root supplied by the operator.  It creates a
new database when asked, starts the loopback transport against that database,
checks the managed process through ``/health``, and stops only the process
whose lock identity matches the manager record.  It never discovers or adopts
an existing Knot service.
"""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler


_RUNTIME_VERSION = 2
_SCHEMA_VERSION = "1.9"
_REPO = Path(__file__).resolve().parents[2]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))


class RuntimeFault(Exception):
    def __init__(self, code, **detail):
        self.code = code
        self.detail = detail


def _absolute_root(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise RuntimeFault("RUNTIME_ROOT_INVALID")
    return path.resolve()


def _paths(root, db_value=None):
    root = _absolute_root(root)
    db = (root / db_value if db_value and not Path(db_value).is_absolute()
          else Path(db_value) if db_value else root / "data" / "knot.sqlite3")
    db = db.expanduser().resolve()
    try:
        db.relative_to(root)
    except ValueError:
        raise RuntimeFault("RUNTIME_DB_OUTSIDE_ROOT") from None
    runtime = root / "runtime"
    _validate_control_paths(root, db, runtime)
    return root, db, runtime, runtime / "service.json", runtime / "service.stdout.log", runtime / "service.stderr.log"


def _validate_control_paths(root, db, runtime):
    """Refuse symlink/junction control directories and redirected control files."""
    for base in (runtime, db.parent / ".knot", root / "runtime-root.json"):
        try:
            base.resolve().relative_to(root)
        except ValueError:
            raise RuntimeFault("RUNTIME_CONTROL_PATH_UNSAFE") from None
        pending = [base]
        while pending:
            path = pending.pop()
            try:
                info = path.lstat()
            except FileNotFoundError:
                continue
            if (stat.S_ISLNK(info.st_mode)
                    or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
                raise RuntimeFault("RUNTIME_CONTROL_PATH_UNSAFE")
            if stat.S_ISDIR(info.st_mode):
                pending.extend(path.iterdir())


def _read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        return None


def _write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=True, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def _pid_alive(pid):
    if type(pid) is not int or not 0 < pid <= 0x7FFFFFFF:
        return False
    if os.name == "nt":
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel32.OpenProcess.restype = ctypes.c_void_p
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_int
        handle = kernel32.OpenProcess(0x1000, False, pid)
        if handle:
            try:
                code = ctypes.c_ulong()
                kernel32.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
                kernel32.GetExitCodeProcess.restype = ctypes.c_int
                return not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value == 259
            finally:
                kernel32.CloseHandle(handle)
        return kernel32.GetLastError() == 5
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _db_hash(db):
    return hashlib.sha256(str(db).encode("utf-8")).hexdigest()


def _valid_pid(pid):
    return type(pid) is int and 0 < pid <= 0x7FFFFFFF


def _valid_port(port, *, ephemeral=False):
    return type(port) is int and (0 if ephemeral else 1) <= port <= 65535


def _valid_started_at(value):
    if not isinstance(value, str):
        return False
    try:
        return datetime.fromisoformat(value).utcoffset() is not None
    except ValueError:
        return False


@contextmanager
def _windows_handle(pid, access=0x1000):
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.OpenProcess(access, False, pid)
    if not handle:
        raise RuntimeFault("RUNTIME_PROCESS_UNVERIFIED")
    try:
        yield kernel, handle
    finally:
        kernel.CloseHandle(handle)


def _windows_creation(kernel, handle):
    import ctypes
    from ctypes import wintypes
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
    kernel.GetProcessTimes.restype = wintypes.BOOL
    times = [wintypes.FILETIME() for _ in range(4)]
    if not kernel.GetProcessTimes(handle, *(ctypes.byref(value) for value in times)):
        raise RuntimeFault("RUNTIME_PROCESS_UNVERIFIED")
    return "windows:" + str((times[0].dwHighDateTime << 32) | times[0].dwLowDateTime)


def _process_identity(pid):
    """OS creation identity, independent of the editable manager record."""
    if not _valid_pid(pid):
        raise RuntimeFault("RUNTIME_PROCESS_UNVERIFIED")
    if os.name == "nt":
        with _windows_handle(pid) as (kernel, handle):
            return _windows_creation(kernel, handle)
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        return f"linux:{boot}:{fields[19]}"
    except (OSError, IndexError):
        raise RuntimeFault("RUNTIME_PROCESS_UNVERIFIED") from None


def _marker_file(root):
    return root / "runtime-root.json"


def _db_identity(db):
    info = db.stat()
    return {"device": info.st_dev, "inode": info.st_ino}


def _require_marker(root, db):
    marker = _read_json(_marker_file(root))
    expected = {"runtime_version": _RUNTIME_VERSION, "db_path_sha256": _db_hash(db),
                "db_path": db.relative_to(root).as_posix(), "db_identity": _db_identity(db)}
    if marker != expected:
        raise RuntimeFault("RUNTIME_ROOT_UNINITIALIZED")


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _health(port, db):
    if not _valid_port(port):
        return None
    request = Request(f"http://127.0.0.1:{port}/health", method="GET")
    try:
        # Environment proxies and redirects must never select another service.
        with build_opener(ProxyHandler({}), _NoRedirect()).open(request, timeout=1.5) as response:
            if response.status != 200:
                return None
            raw = response.read(64 * 1024 + 1)
            if len(raw) > 64 * 1024 or response.headers.get("Content-Encoding", "identity") != "identity":
                return None
            value = json.loads(raw.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, UnicodeError):
        return None
    if (not isinstance(value, dict) or type(value.get("contract_version")) is not int
            or value["contract_version"] != 1
            or value.get("ok") is not True or not isinstance(value.get("value"), dict)):
        return None
    health = value["value"]
    if (type(health.get("contract_version")) is not int or health["contract_version"] != 1
            or health.get("schema_version") != _SCHEMA_VERSION
            or health.get("db_path_sha256") != _db_hash(db)
            or health.get("status") != "ok" or health.get("read_only") is not False):
        return None
    # Return only the fields verified here; never echo arbitrary upstream data.
    return {key: health[key] for key in ("contract_version", "schema_version",
                                        "db_path_sha256", "status", "read_only")}


def _managed_record(root, db, service_file):
    if not os.path.lexists(service_file):
        return None
    record = _read_json(service_file)
    if (not isinstance(record, dict) or set(record) != {
            "runtime_version", "pid", "port", "db_path", "db_path_sha256",
            "started_at", "process_identity"}
            or type(record.get("runtime_version")) is not int
            or record["runtime_version"] != _RUNTIME_VERSION
            or not _valid_pid(record.get("pid")) or not _valid_port(record.get("port"))
            or not _valid_started_at(record.get("started_at"))
            or not isinstance(record.get("process_identity"), str)
            or not re.fullmatch(r"windows:[0-9]+|linux:[0-9a-f-]{36}:[0-9]+", record["process_identity"])):
        raise RuntimeFault("RUNTIME_RECORD_INVALID")
    if (record["db_path_sha256"] != _db_hash(db)
            or record["db_path"] != db.relative_to(root).as_posix()):
        raise RuntimeFault("RUNTIME_OWNERSHIP_MISMATCH")
    return record


def _current_lock(db):
    lock = _read_json(db.parent / ".knot" / "http.lock")
    if (not isinstance(lock, dict) or set(lock) != {"pid", "db", "started_at"}
            or not _valid_pid(lock.get("pid")) or lock.get("db") != _db_hash(db)[:16]
            or not _valid_started_at(lock.get("started_at"))):
        raise RuntimeFault("RUNTIME_OWNERSHIP_UNVERIFIED")
    return lock


def _verify_current(db, record):
    lock = _current_lock(db)
    if (lock["pid"] != record["pid"] or lock["started_at"] != record["started_at"]
            or _process_identity(record["pid"]) != record["process_identity"]):
        raise RuntimeFault("RUNTIME_OWNERSHIP_MISMATCH")


def _terminate_verified(db, record):
    """On Windows, verify and terminate the same handle to prevent PID reuse."""
    _verify_current(db, record)
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        with _windows_handle(record["pid"], 0x1000 | 0x0001 | 0x00100000) as (kernel, handle):
            if _windows_creation(kernel, handle) != record["process_identity"]:
                raise RuntimeFault("RUNTIME_OWNERSHIP_MISMATCH")
            _verify_current(db, record)
            kernel.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
            kernel.TerminateProcess.restype = wintypes.BOOL
            kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
            kernel.WaitForSingleObject.restype = wintypes.DWORD
            if not kernel.TerminateProcess(handle, 0):
                raise RuntimeFault("RUNTIME_STOP_FAILED")
            if kernel.WaitForSingleObject(handle, 5000) != 0:
                raise RuntimeFault("RUNTIME_STOP_TIMEOUT")
    else:
        # Linux pidfds bind the signal to this process instance as well.
        fd = os.pidfd_open(record["pid"])
        try:
            _verify_current(db, record)
            signal.pidfd_send_signal(fd, signal.SIGTERM)
        finally:
            os.close(fd)


def _clean_stale(service_file, record):
    if record is not None and not _pid_alive(record.get("pid")):
        try:
            service_file.unlink()
        except FileNotFoundError:
            pass


def _init(root, db):
    root.mkdir(parents=True, exist_ok=True)
    if os.path.lexists(_marker_file(root)):
        raise RuntimeFault("RUNTIME_ROOT_ALREADY_INITIALIZED")
    db.parent.mkdir(parents=True, exist_ok=True)
    from mvp.backend.init_db import init_database
    result = init_database(str(db))
    if result["status"] == "created":
        with _marker_file(root).open("x", encoding="utf-8") as stream:
            json.dump({"runtime_version": _RUNTIME_VERSION, "db_path_sha256": _db_hash(db),
                       "db_path": db.relative_to(root).as_posix(), "db_identity": _db_identity(db)}, stream)
    return result


def _start(root, db, runtime, service_file, stdout_file, stderr_file, requested_port):
    if not _valid_port(requested_port, ephemeral=True):
        raise RuntimeFault("RUNTIME_PORT_INVALID")
    if not db.is_file():
        raise RuntimeFault("RUNTIME_DB_REQUIRED")
    _require_marker(root, db)
    token = os.environ.get("KNOT_RUNTIME_TOKEN", "")
    if not 16 <= len(token) <= 4096 or not re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", token):
        raise RuntimeFault("RUNTIME_TOKEN_REQUIRED")
    existing = _managed_record(root, db, service_file)
    _clean_stale(service_file, existing)
    if existing is not None and _pid_alive(existing.get("pid")):
        _verify_current(db, existing)
        health = _health(existing["port"], db)
        if health is not None:
            _verify_current(db, existing)
            return {"status": "already_running", "service": existing, "health": health}
        raise RuntimeFault("RUNTIME_SERVICE_UNHEALTHY")

    # Never adopt an already running transport, even for the same database.
    from mvp.backend.http_lock import owner_guard
    with owner_guard(db.parent / ".knot"):
        if os.path.lexists(db.parent / ".knot" / "http.lock"):
            lock = _current_lock(db)
            if _pid_alive(lock["pid"]):
                raise RuntimeFault("RUNTIME_UNMANAGED_SERVICE")

    runtime.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    # A development runtime must not inherit credentials for another service.
    env.pop("KNOT_TOKEN", None)
    env.pop("KNOT_RUNTIME_TOKEN", None)
    env["KNOT_TOKENS"] = json.dumps({token: "local-user"})
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    # The backend is stdlib-only. Avoid the Windows venv supervisor so the
    # retained Popen handle always owns the actual server, including failures
    # before any trustworthy lock or service record exists.
    executable = Path(getattr(sys, "_base_executable", sys.executable)).resolve()
    if not executable.is_file():
        raise RuntimeFault("RUNTIME_PYTHON_REQUIRED")
    command = [str(executable), "-B", "-m", "mvp.backend.http_server",
               "--db", str(db), "--port", str(requested_port)]
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    with stdout_file.open("ab") as stdout, stderr_file.open("ab") as stderr:
        process = subprocess.Popen(command, cwd=str(_REPO), env=env,
                                   stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                   # Do not let a Python supervisor retain the
                                   # caller's stdout/stderr pipes.  Otherwise
                                   # the CLI appears not to return even after
                                   # this manager has emitted its JSON result.
                                   close_fds=True, creationflags=creationflags)
    service = None
    registered = False
    try:
        launcher_identity = _process_identity(process.pid)
        port_file = db.parent / ".knot" / "http.port"
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeFault("RUNTIME_START_FAILED", exit_code=process.returncode)
            try:
                lock = _current_lock(db)
            except RuntimeFault:
                time.sleep(0.05)
                continue
            # Only this exact spawned process may publish the service record.
            if (_process_identity(process.pid) != launcher_identity
                    or lock["pid"] != process.pid):
                raise RuntimeFault("RUNTIME_OWNERSHIP_UNVERIFIED")
            service = {
                "runtime_version": _RUNTIME_VERSION, "pid": lock["pid"],
                "port": requested_port or 1,
                "db_path": db.relative_to(root).as_posix(), "db_path_sha256": _db_hash(db),
                "started_at": lock["started_at"], "process_identity": _process_identity(lock["pid"]),
            }
            try:
                port = int(port_file.read_text(encoding="ascii").strip())
            except (OSError, ValueError, UnicodeError):
                time.sleep(0.05)
                continue
            if not _valid_port(port) or (requested_port and requested_port != port):
                time.sleep(0.05)
                continue
            service["port"] = port
            health = _health(port, db)
            if health is not None:
                _verify_current(db, service)
                _write_json(service_file, service)
                registered = True
                return {"status": "started", "service": service, "health": health}
            time.sleep(0.05)
        raise RuntimeFault("RUNTIME_START_TIMEOUT")
    finally:
        if not registered:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)


def _status(root, db, service_file):
    record = _managed_record(root, db, service_file)
    if record is None:
        return {"status": "stopped", "managed": False}
    _require_marker(root, db)
    alive = _pid_alive(record.get("pid"))
    if alive:
        _verify_current(db, record)
    health = _health(record["port"], db) if alive else None
    if alive:
        _verify_current(db, record)
    return {"status": "running" if alive and health is not None else "stale",
            "managed": True, "service": record, "health": health}


def _stop(root, db, service_file):
    record = _managed_record(root, db, service_file)
    if record is None:
        return {"status": "stopped", "managed": False}
    _require_marker(root, db)
    pid = record.get("pid")
    if _pid_alive(pid):
        try:
            from mvp.backend.http_lock import owner_guard
            with owner_guard(db.parent / ".knot"):
                _terminate_verified(db, record)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 5
        while _pid_alive(pid) and time.monotonic() < deadline:
            time.sleep(0.05)
    if _pid_alive(pid):
        raise RuntimeFault("RUNTIME_STOP_TIMEOUT")
    try:
        service_file.unlink()
    except FileNotFoundError:
        pass
    return {"status": "stopped", "managed": True, "pid": pid}


def _check(root, db, runtime):
    required = [
        _REPO / "mvp" / "codex_plugin" / "build.py",
        _REPO / "mvp" / "codex_plugin" / "launch.py",
        _REPO / "mvp" / "codex_plugin" / "plugin.json",
    ]
    return {
        "status": "ready",
        "runtime_root": str(root),
        "database": {"path": str(db), "exists": db.is_file()},
        "plugin_files": {str(path.relative_to(_REPO)): path.is_file() for path in required},
        "runtime_directory": str(runtime),
        "credentials_inherited": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "start", "status", "stop", "check"):
        command = sub.add_parser(name)
        command.add_argument("--root", required=True, help="absolute private runtime root")
        command.add_argument("--db", help="database path relative to root or absolute inside root")
        if name == "start":
            command.add_argument("--port", type=int, default=0,
                                 help="loopback port; 0 selects a free port")
    args = parser.parse_args(argv)
    try:
        root, db, runtime, service_file, stdout_file, stderr_file = _paths(args.root, args.db)
        if args.command == "check":
            result = _check(root, db, runtime)
        else:
            from mvp.backend.http_lock import owner_guard
            # Serialize manager operations separately from transport startup.
            with owner_guard(runtime):
                if args.command == "init":
                    result = _init(root, db)
                elif args.command == "start":
                    result = _start(root, db, runtime, service_file, stdout_file, stderr_file, args.port)
                elif args.command == "status":
                    result = _status(root, db, service_file)
                else:
                    result = _stop(root, db, service_file)
        print(json.dumps(result, ensure_ascii=True, sort_keys=True))
        return 1 if result.get("status") in {"refused", "failed"} else 0
    except RuntimeFault as exc:
        print(json.dumps({"status": "error", "code": exc.code, "detail": exc.detail},
                         ensure_ascii=True, sort_keys=True))
        return 1
    except OSError:
        # Paths and exception messages can contain credentials; emit only a code.
        print(json.dumps({"status": "error", "code": "RUNTIME_IO_FAILED", "detail": {}}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
