"""Keep local operator identity out of versioned source and evidence."""

import getpass
from pathlib import Path
import subprocess


def test_repository_has_no_local_identity():
    root = Path(__file__).resolve().parents[2]
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode("utf-8")
    user = getpass.getuser()
    home = str(Path.home())
    private = {user, home, home.replace("\\", "/"), home.replace("\\", "\\\\")}
    for name in tracked.split("\0"):
        path = root / name
        if path.suffix.lower() not in {".py", ".md", ".txt", ".json"}:
            continue
        text = path.read_text(encoding="utf-8")
        assert not any(value and value in text for value in private), f"local identity in {name}"
