"""Manage one explicitly isolated Knot plugin development runtime.

This helper owns only a runtime root supplied by the operator.  It creates a
new database when asked, starts the loopback transport against that database,
checks the managed process through ``/health``, and stops only the process
whose lock identity matches the manager record.  It never discovers or adopts
an existing Knot service.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


_RUNTIME_VERSION = 1
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
    return root, db, runtime, runtime / "service.json", runtime / "service.stdout.log", runtime / "service.stderr.log"


def _read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
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
            kernel32.CloseHandle(handle)
        return bool(handle) or kernel32.GetLastError() == 5
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
    return hashlib.sha256(str(db).encode("utf-8")).hexdigest()[:16]


def _health(port):
    request = Request(f"http://127.0.0.1:{port}/health", method="GET")
    try:
        with urlopen(request, timeout=1.5) as response:
            if response.status != 200:
                return None
            value = json.loads(response.read(64 * 1024).decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, UnicodeError):
        return None
    if (not isinstance(value, dict) or value.get("contract_version") != 1
            or value.get("ok") is not True or not isinstance(value.get("value"), dict)):
        return None
    return value["value"]


def _managed_record(root, db, service_file):
    record = _read_json(service_file)
    if not isinstance(record, dict) or record.get("runtime_version") != _RUNTIME_VERSION:
        return None
    if record.get("db_path_sha256") != _db_hash(db):
        raise RuntimeFault("RUNTIME_OWNERSHIP_MISMATCH")
    return record


def _clean_stale(service_file, record):
    if record is not None and not _pid_alive(record.get("pid")):
        try:
            service_file.unlink()
        except FileNotFoundError:
            pass


def _init(root, db):
    root.mkdir(parents=True, exist_ok=True)
    db.parent.mkdir(parents=True, exist_ok=True)
    from mvp.backend.init_db import init_database
    return init_database(str(db))


def _start(root, db, runtime, service_file, stdout_file, stderr_file, requested_port):
    if not db.is_file():
        raise RuntimeFault("RUNTIME_DB_REQUIRED")
    existing = _managed_record(root, db, service_file)
    _clean_stale(service_file, existing)
    if existing is not None and _pid_alive(existing.get("pid")):
        health = _health(existing.get("port"))
        if health is not None:
            return {"status": "already_running", "service": existing, "health": health}
        raise RuntimeFault("RUNTIME_SERVICE_UNHEALTHY")

    runtime.mkdir(parents=True, exist_ok=True)
    stdout = stdout_file.open("ab")
    stderr = stderr_file.open("ab")
    env = os.environ.copy()
    # A development runtime must not inherit credentials for another service.
    env.pop("KNOT_TOKEN", None)
    env.pop("KNOT_TOKENS", None)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    command = [sys.executable, "-B", "-m", "mvp.backend.http_server",
               "--db", str(db), "--port", str(requested_port)]
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    try:
        process = subprocess.Popen(command, cwd=str(_REPO), env=env,
                                   stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                   # Do not let a Python supervisor retain the
                                   # caller's stdout/stderr pipes.  Otherwise
                                   # the CLI appears not to return even after
                                   # this manager has emitted its JSON result.
                                   close_fds=True, creationflags=creationflags)
    finally:
        stdout.close()
        stderr.close()

    port_file = db.parent / ".knot" / "http.port"
    deadline = time.monotonic() + 10
    port = None
    health = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeFault("RUNTIME_START_FAILED", exit_code=process.returncode)
        try:
            port = int(port_file.read_text(encoding="ascii").strip())
        except (OSError, ValueError):
            time.sleep(0.05)
            continue
        health = _health(port)
        if health is not None:
            break
        time.sleep(0.05)
    if health is None or port is None:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        raise RuntimeFault("RUNTIME_START_TIMEOUT")

    lock = _read_json(db.parent / ".knot" / "http.lock")
    if (not isinstance(lock, dict) or type(lock.get("pid")) is not int
            or lock.get("db") != _db_hash(db) or not _pid_alive(lock["pid"])):
        raise RuntimeFault("RUNTIME_OWNERSHIP_UNVERIFIED")
    service = {
        "runtime_version": _RUNTIME_VERSION,
        "pid": lock["pid"],
        "port": port,
        "db_path": db.relative_to(root).as_posix(),
        "db_path_sha256": _db_hash(db),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "python": str(Path(sys.executable).resolve()),
    }
    _write_json(service_file, service)
    return {"status": "started", "service": service, "health": health}


def _status(root, db, service_file):
    record = _managed_record(root, db, service_file)
    if record is None:
        return {"status": "stopped", "managed": False}
    alive = _pid_alive(record.get("pid"))
    health = _health(record.get("port")) if alive else None
    return {"status": "running" if alive and health is not None else "stale",
            "managed": True, "service": record, "health": health}


def _stop(root, db, service_file):
    record = _managed_record(root, db, service_file)
    if record is None:
        return {"status": "stopped", "managed": False}
    pid = record.get("pid")
    if _pid_alive(pid):
        try:
            if os.name == "nt":
                # The Windows Python launcher used by the development
                # environment may supervise a second interpreter.  The PID
                # and database hash were checked above; terminate only that
                # registered process tree.
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                               check=False, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL)
            else:
                os.kill(pid, signal.SIGTERM)
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
        if args.command == "init":
            result = _init(root, db)
        elif args.command == "start":
            result = _start(root, db, runtime, service_file, stdout_file, stderr_file, args.port)
        elif args.command == "status":
            result = _status(root, db, service_file)
        elif args.command == "stop":
            result = _stop(root, db, service_file)
        else:
            result = _check(root, db, runtime)
        print(json.dumps(result, ensure_ascii=True, sort_keys=True))
        return 0
    except RuntimeFault as exc:
        print(json.dumps({"status": "error", "code": exc.code, "detail": exc.detail},
                         ensure_ascii=True, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
