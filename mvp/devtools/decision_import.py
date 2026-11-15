"""Explicit local decision import. No default paths, credentials in arguments or repair."""

import argparse
import json
import os
from pathlib import Path
import sys

from mvp.backend.decision_archive import import_decisions
from mvp.decision_policy import (
    DecisionError, MAX_ARCHIVE_BYTES, MAX_SOURCE_BYTES, decode_json,
)


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's ordinary errors echo argv, which may contain private paths.
        raise DecisionError('INVALID_ARGUMENTS')


def main(argv=None):
    try:
        parser = _Parser(description=__doc__, allow_abbrev=False)
        for field in ('db', 'package', 'actor'):
            parser.add_argument('--' + field, required=True)
        args = parser.parse_args(argv)
        paths = [Path(args.db), Path(args.package)]
        if any(not path.is_absolute() or not path.is_file() for path in paths):
            raise DecisionError('INVALID_ARGUMENTS')
        token = os.environ.get('KNOT_TOKEN')
        if not token:
            raise DecisionError('ACCESS_DENIED')
        # Input whitespace/escapes also receive a finite transport budget.
        limit = 6 * (MAX_SOURCE_BYTES + MAX_ARCHIVE_BYTES)
        with paths[1].open('rb') as stream:
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise DecisionError('INVALID_ARGUMENTS')
        package = decode_json(raw)
        result = import_decisions(paths[0], package, args.actor, token)
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except DecisionError as exc:
        code = exc.code
    except Exception:
        code = 'IMPORT_UNAVAILABLE'
    print(json.dumps({'error': code}, ensure_ascii=True))
    return 1


if __name__ == '__main__':
    sys.exit(main())
