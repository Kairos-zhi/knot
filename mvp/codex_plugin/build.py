"""Build a local Knot plugin candidate into a new directory."""

import argparse
import json
from pathlib import Path
import re
from shutil import copyfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", required=True, type=Path)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not args.python.is_absolute() or not args.python.is_file():
        parser.error("KNOT_PYTHON_REQUIRED: specify an existing absolute Python executable")
    match = re.fullmatch(r"http://(?:127\.0\.0\.1|\[::1\]):([0-9]{1,5})", args.origin)
    if match is None or not 1 <= int(match[1]) <= 65535:
        parser.error("KNOT_ORIGIN_INVALID: specify a loopback HTTP origin with an explicit port")

    source = Path(__file__).resolve().parent
    sources = {
        ".codex-plugin/plugin.json": source / "plugin.json",
        "README.md": source / "README.md",
        "launch.py": source / "launch.py",
        "requirements.txt": source.parent / "requirements-plugin.txt",
        "mvp/codex_mcp.py": source.parent / "codex_mcp.py",
        "mvp/plugin_projection.py": source.parent / "plugin_projection.py",
    }
    try:
        args.output.mkdir()
    except OSError:
        parser.error("KNOT_OUTPUT_UNAVAILABLE: specify a new directory with an existing parent")
    try:
        (args.output / "mvp").mkdir()
        (args.output / ".codex-plugin").mkdir()
        for name, path in sources.items():
            copyfile(path, args.output / name)
        config = {
            "mcpServers": {
                "knot": {
                    "type": "stdio",
                    "command": str(args.python),
                    "args": ["-I", "-B", "launch.py", args.origin],
                    "cwd": ".",
                    "env_vars": ["KNOT_TOKEN"],
                }
            }
        }
        (args.output / ".mcp.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    except OSError:
        parser.error("KNOT_BUILD_FAILED: discard the incomplete output directory")


if __name__ == "__main__":
    main()
