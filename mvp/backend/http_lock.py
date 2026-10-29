"""OS-released exclusion for checking/replacing the HTTP owner file."""

from contextlib import contextmanager
import os
from pathlib import Path


@contextmanager
def owner_guard(state):
    Path(state).mkdir(parents=True, exist_ok=True)
    with (Path(state) / "http.guard").open("a+b") as stream:
        if os.name == "nt":
            import msvcrt
            if stream.seek(0, 2) == 0:
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)
