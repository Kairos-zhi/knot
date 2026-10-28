"""Measure the Day 2 latency targets on disposable on-disk databases.

Run from the repository root: python -m mvp.tests.benchmark_backend
This reports measured thresholds without treating timing as a stable unit test.
"""

from contextlib import closing, nullcontext
import json
from pathlib import Path
import platform
import sqlite3
import statistics
from tempfile import TemporaryDirectory
from time import perf_counter

from mvp.backend.asset_repo import AssetRepo


def summary(samples, threshold):
    ordered = sorted(samples)
    return {
        "median_ms": round(statistics.median(samples), 3),
        "p95_ms": round(ordered[int(len(samples) * 0.95) - 1], 3),
        "max_ms": round(max(samples), 3),
        "threshold_ms": threshold,
        "samples_at_or_above_threshold": sum(v >= threshold for v in samples),
    }


def benchmark(scoped):
    with TemporaryDirectory(prefix="knot-w1d2-") as tmp:
        path = Path(tmp) / "benchmark.db"
        schema = Path(__file__).parents[1] / "backend" / "schema_v1.sql"
        with closing(sqlite3.connect(path)) as conn:
            conn.executescript(schema.read_text(encoding="utf-8"))
        repo = AssetRepo(path)
        inserts = []
        start_total = perf_counter()
        with repo.session() if scoped else nullcontext(repo):
            for i in range(1000):
                start = perf_counter()
                repo.add_asset(str(i), "text/plain", b"knot evidence")
                inserts.append((perf_counter() - start) * 1000)
        total_ms = (perf_counter() - start_total) * 1000
        searches = []
        for _ in range(100):
            start = perf_counter()
            rows = repo.search_assets("evidence")
            searches.append((perf_counter() - start) * 1000)
            assert len(rows) == 50
        return {
            "mode": "scoped" if scoped else "one_shot",
            "assets": repo.count_assets(),
            "insert_1000": summary(inserts, 10),
            "insert_policy_pass": (
                sorted(inserts)[949] < 10 and max(inserts) < 20
            ),
            "insert_total_including_open_close_ms": round(total_ms, 3),
            "search_100": summary(searches, 100),
        }


if __name__ == "__main__":
    print(json.dumps({
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
        "runs": [benchmark(False), benchmark(True)],
    }, indent=2))
