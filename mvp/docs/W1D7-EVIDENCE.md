# Day 7 数字、位置偏离与验证记录

2026-10-28；基线main `1ea1dfa691b5c0d54890a2b0c9f1b1be86724f68`，
分支 `docs/mvp-schema-import`。本页为本轮实跑记录，不是目标或未来承诺。
断言逐项到源码的位置见[完整映射](W1D7-CLAIM-MAP.md)。
测试结果针对本卡两笔组成的完整候选；只检出第一笔文档提交时，还未带入第二笔cwd修复。

## 文档位置的显式偏离

Roadmap原写docs/SCHEMA.md与docs/IMPORT.md；按本卡决定，交付放mvp/docs/下，
与现有API和MVP记录放在一起，避免进入已标记为旧架构资料的根docs/目录。
不修改Roadmap本体。根README新建两个入口；不假定原来已有占位。

## 22 / 19+3 / 22事件：来源包的临时重现

使用交接的完整v0.4来源目录，含MANIFEST.sha256，来源不随本仓分发。
下例baseline代指该来源目录，candidate/knot.db是新建且位于来源树外的候选库；
本轮实跑替换为独立临时路径。在仓库根执行：

```sh
python -m mvp.backend.init_db candidate/knot.db
python -m mvp.backend.import_baseline --source baseline --db candidate/knot.db
python -m mvp.backend.import_baseline --source baseline --db candidate/knot.db
```

本轮在临时目录实际调用以上init_db与import_baseline模块CLI，首/二轮输出：

```json
{"imported":22,"skipped":0,"indexed":19,"unindexed":3,"failed":[]}
{"imported":0,"skipped":22,"indexed":0,"unindexed":0,"failed":[]}
```

初始化使用schema_v1.sql原文；以下SQL逐项实读，结果依次22、22、19、19、3、0：

```sql
SELECT COUNT(*) FROM assets;
SELECT COUNT(*) FROM history_events WHERE event_type='import';
SELECT COUNT(*) FROM assets_fts;
SELECT COUNT(*) FROM assets WHERE content_blob IS NOT NULL;
SELECT COUNT(*) FROM assets WHERE content_blob IS NULL;
SELECT COUNT(*) FROM event_atom_map;
```

普通表名也已实读，排除SQLite内部表及派生FTS表/影子表：

```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'assets_fts%'
ORDER BY name;
```

```text
assets
claims_candidates
continuation_bundles
eligible_snapshots
event_atom_map
history_events
horn_rules
schema_version
```

共8个普通表，即7业务表加版本表。

verify_manifest导入前后返回的全部path/hash/bytes/mtime_ns一致；未运行研究脚本，
未解包zip、未操作真实业务库。原始本机输出保留在ignored证据区。

可复用的计数命令（在已经导完的候选库上）：

```python
from contextlib import closing
from pathlib import Path
import sqlite3

uri = Path("candidate/knot.db").resolve().as_uri() + "?mode=rw"
with closing(sqlite3.connect(uri, uri=True)) as conn:
    for table in ("assets", "history_events", "assets_fts", "event_atom_map"):
        print(table, conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
```

## 22,391与SCC统计：本轮实际输出

```sh
python -m pytest mvp/tests/test_frontier17.py::test_frozen_baseline_and_migrated_double_run -s -q
```

```text
Exhaustive transition+release comparisons: 16384 PASS
Random multi-atom transition+release comparisons: 6000 PASS
Targeted cross-layer counterexamples: 7 PASS
Random SCC recomputations: 9182 / 18446 candidate SCC evaluations
Exhaustive SCC recomputations (count, not wall clock): 14144
ALL ROUND-17 MODEL ASSERTIONS PASSED; frozen baseline + two port runs equal
1 passed in 5.60s
```

16,384＋6,000＋7＝22,391组，不把组数混称为代码中assert语句总数。

## 69项与cwd修复

只在test_import.py的一个subprocess.run调用新增cwd=仓库根，不改断言、参数或用例数。
以下三种入口均在同一Python3.12.14、pytest9.2.0环境实跑，清除继承的
PYTHONPATH/PYTEST_ADDOPTS，避免宿主设置掩盖导入问题：

```sh
# 仓库根
python -m pytest mvp/tests/ -q
pytest
# 仓库外，传仓库内测试目录的绝对路径
python -m pytest <repository>/mvp/tests -q
```

```text
root-module:   69 passed in 16.11s
root-console:  69 passed in 14.76s
outside-module:69 passed in 14.64s
```

不增加或跳过用例。该测试的CLI子进程被固定在仓库根启动，不表示业务CLI已被安装
为系统包。所有耗时只是观测，没有新增墙钟断言。

## FTS rebuild的能力边界实读

本轮临时候选有19条FTS内容行，先正常rebuild仍19；随后只在该临时库删除一条FTS
内容行，再rebuild仍18，assets未变。这证实rebuild不会从assets补缺失内容。
复现实验须在一次性候选副本上做，不要对业务库执行下面删除操作：

```python
from contextlib import closing
from pathlib import Path
import sqlite3

uri = Path("candidate/knot.db").resolve().as_uri() + "?mode=rw"
with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
    conn.execute("INSERT INTO assets_fts(assets_fts) VALUES('rebuild')")
    print(conn.execute("SELECT COUNT(*) FROM assets_fts").fetchone()[0])
    rowid = conn.execute("SELECT rowid FROM assets_fts LIMIT 1").fetchone()[0]
    conn.execute("DELETE FROM assets_fts WHERE rowid=?", (rowid,))
    conn.execute("INSERT INTO assets_fts(assets_fts) VALUES('rebuild')")
    print(conn.execute("SELECT COUNT(*) FROM assets_fts").fetchone()[0])
# 本包输出19，18；完成后丢弃此实验库。
```

## GitHub状态：实读而非由workflow推断保护已开

```sh
git rev-parse main
gh pr view 25 --json state,mergeCommit,url
gh run view 40664491008 --json conclusion,headSha,url,jobs
gh api repos/Kairos-zhi/knot/rules/branches/main
```

实读main＝1ea1dfa，PR #25 MERGED；[运行40664491008](https://github.com/Kairos-zhi/knot/actions/runs/40664491008)
的head为同一SHA，ci job及run均success。有效规则包含pull_request、deletion、
non_fast_forward和required_status_checks，后者context为ci。
传统branches/main/protection接口返回404，因为此处有效规则由rules端点返回，
不能把该404单独解释成“没有保护”。本轮只读，未改设置。

本卡分支尚未推送，**该基线绿灯不等于Day 7候选CI已绿**。候选推送后的ci与合并
仍是独立闸门；本卡不push、不merge。

## 当前验证边界

文档与测试cwd修复已获独立本地候选Gate，无剩余阻断。首10条映射逐项核中，
后续抽查、176个本地链接及行号边界有效。独立仓库外69/69（21.00s），
AST证实仅增加一个cwd关键字；真实来源导入、FTS边界、no-backfill及远端基线均核定。
候选推送后的CI未执行，不能提前宣布Week 1最终结账。
尚未交付Week 2抽取/时间轴、前端、生产数据库迁移或整体产品验收。
