"""Start the packaged Knot MCP entry point."""

from argparse import ArgumentTypeError
from importlib.metadata import PackageNotFoundError, version
import os
from pathlib import Path
import sys


def main():
    if len(sys.argv) != 2:
        raise SystemExit("KNOT_ORIGIN_INVALID: specify a loopback HTTP origin with an explicit port")
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        if version("mcp") != "2.1.1":
            raise ImportError
        from mvp.codex_mcp import loopback_origin, serve
        import anyio
    except (ImportError, PackageNotFoundError):
        raise SystemExit("KNOT_DEPENDENCY_REQUIRED: use a Python environment with mcp==2.1.1") from None

    try:
        origin = loopback_origin(sys.argv[1])
    except ArgumentTypeError:
        raise SystemExit("KNOT_ORIGIN_INVALID: specify a loopback HTTP origin with an explicit port") from None
    token = os.environ.get("KNOT_TOKEN")
    if not token or not token.strip():
        raise SystemExit("KNOT_TOKEN_REQUIRED: supply KNOT_TOKEN through the process environment")
    anyio.run(serve, origin, token)


if __name__ == "__main__":
    main()
