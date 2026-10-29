"""Keep local operator identity out of versioned source and evidence."""

import getpass
from pathlib import Path
import subprocess

import pytest


def _assert_no_local_identity(root, user, home):
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode("utf-8")
    private = {
        f"C:\\Users\\{user}", f"/c/Users/{user}",
        f"/Users/{user}", f"/home/{user}",
        home, home.replace("\\", "/"), home.replace("/", "\\"),
        home.replace("\\", "\\\\"),
    }
    for name in tracked.split("\0"):
        path = root / name
        if path.suffix.lower() not in {".py", ".md", ".txt", ".json"}:
            continue
        text = path.read_text(encoding="utf-8")
        assert not any(value and value in text for value in private), f"local identity in {name}"


def test_repository_has_no_local_identity():
    _assert_no_local_identity(
        Path(__file__).resolve().parents[2], getpass.getuser(), str(Path.home())
    )


def test_identity_guard_matches_paths_only(tmp_path):
    subprocess.run(["git", "init", "--quiet", str(tmp_path)], check=True)
    sample = tmp_path / "sample.md"
    sample.write_text("portable runner", encoding="utf-8")
    subprocess.run(["git", "add", "sample.md"], cwd=tmp_path, check=True)
    ci_user = "runner"
    ci_home = f"/home/{ci_user}"
    _assert_no_local_identity(tmp_path, ci_user, ci_home)
    _assert_no_local_identity(Path(__file__).resolve().parents[2], ci_user, ci_home)
    user, home = getpass.getuser(), str(Path.home())
    for value in (
        f"C:\\Users\\{user}", f"/c/Users/{user}",
        f"/Users/{user}", f"/home/{user}",
        home, home.replace("\\", "/"), home.replace("/", "\\"),
    ):
        sample.write_text(value, encoding="utf-8")
        with pytest.raises(AssertionError, match="local identity in sample.md"):
            _assert_no_local_identity(tmp_path, user, home)
    sample.write_text("portable runner", encoding="utf-8")
    (tmp_path / "untracked.md").write_text(home, encoding="utf-8")
    (tmp_path / "ignored.csv").write_text(home, encoding="utf-8")
    subprocess.run(["git", "add", "ignored.csv"], cwd=tmp_path, check=True)
    _assert_no_local_identity(tmp_path, user, home)
