"""Report timing separately from Frontier17 correctness assertions.

Run: python -m mvp.tests.benchmark_frontier17
Elapsed time includes pytest startup. Exit status reflects correctness only.
The revised AC-11 has no timing threshold: machines vary by about 2.4x.
"""

import json
from pathlib import Path
import subprocess
import sys
from time import perf_counter


if __name__ == "__main__":
    started = perf_counter()
    result = subprocess.run(
        [sys.executable, "-m", "pytest",
         "mvp/tests/test_frontier17.py::test_frozen_baseline_and_migrated_double_run",
         "-s", "-q", "-p", "no:cacheprovider"],
        cwd=Path(__file__).resolve().parents[2], check=False,
    )
    print(json.dumps({
        "benchmark": "frozen baseline and two migrated runs",
        "seconds_including_pytest_startup": round(perf_counter() - started, 3),
        "correctness_exit_code": result.returncode,
    }), flush=True)
    raise SystemExit(result.returncode)
