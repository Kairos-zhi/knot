# KNOT-MVP-FTS-FIX-001 · FTS 结构修复

日期：2026-10-28。archive_id：`knot-mvp-fts-fix-001-20261028`。
检索键：`FTS5`、`rebuild`、`migration`、`list_unindexed`、`schema 1.1`。
状态：独立 Checker 本地候选 Gate 限定通过，无剩余阻断。无真实库迁移或公开发布。

## 既查与受理

用户转交 Day 2 拍板记录与本卡，当前窗口接手。Day 2 已在独立新口径 Gate
通过后补本地提交 `7e35731`。FTS 分支为 `fix/knot-fts-1-1`，从该提交衔接；
不重新修改已提交候选，不推送公开、不自动合并，也不启动 Day 3 导入。

已读原 schema、三个 Repo、连接公共模块、测试、API、拍板及任务卡，沿用此前
已读的治理与开发基准。复用现有 FTS trigger、MATCH+rowid JOIN 和 schema
版本记录；参考 SQLite FTS5 普通自持表/rebuild、Python sqlite3 事务文档。
当前外部内容表声明的字段与 assets 不匹配，原完整 fixture 在
`tests/fixtures/schema_v1_0.sql` 冻结保留，来自 `7e35731`，SHA256 为
`5cd92492ff80f7ea7730d6f808d2a242212f025c455b9e29ffd63bc0d0253370`。

## 最小实现与取舍

- S1：移除 `content=assets` 和 `content_rowid`，FTS 自持正文；仍使用 unicode61。
  仅对非 NULL blob 插入索引行，显式 CAST AS TEXT。空正文有行无 token。
  新增 schema_version 1.1，不覆写 1.0 历史。
- S2：迁移脚本从 schema 的标记区读取相同 DDL，避免声明漂移。
  `BEGIN IMMEDIATE` 后 DROP 两个 trigger 和 FTS、重建、重灌、写版本记录，
  同一事务提交。逐条 execute，不用会隐式提交的 executescript。
  版本只接受 1.0/1.1，不存在的库拒绝创建。重复执行保留原版本时间与业务行。
- S3 选择 B：`list_unindexed()` 返回所有缺少内嵌正文的资产，调用者无需写 SQL
  即可标注「未建全文索引」。无需向 assets 加列，避免正文与标志可能不一致；
  assets/history_events/horn_rules 原列结构保持。此查询不承担索引损坏诊断。
- S4：API 与 add_asset docstring 写明 text/* ≤1MB 必须内嵌，超过 1MB
  或二进制走 file_path。由 Day 3 导入脚本执行大小/类型判断，Repo 不读取文件
  猜测正文。此轮不开发导入脚本或前端。
- init_db 只窄改版本说明与验证读取 1.1，避免两条版本记录时仍显示 1.0。

## Maker 自核验（AC-1～AC-7）

运行环境沿用 Day 2：Python 3.11.15 / SQLite 3.53.1 / pytest 9.1.1。
均使用自动回收的临时磁盘库；原实际数据库、旧运行目录不读写。

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python -m pytest mvp/tests/ -v --tb=short -p no:cacheprovider
python -m mvp.tests.benchmark_backend
git diff --check
```

全量 32 passed（3.00s），退出码 0。其中 FTS 新增 6 个测试函数、9 项运行。

| AC | 自核验结果 | 主要测试 |
|---|---|---|
| 1 | rebuild 成功，新建库及迁移库均通过 | test_rebuild_scan_search_and_unindexed |
| 2 | FTS 全表扫可用，行数等于非 NULL blob 资产数（包括空 blob） | 同上，迁移前后业务快照测试 |
| 3 | 正文唯一关键词命中数为 1，rebuild 后仍为 1 | 同上 |
| 4 | file_path 正文关键词 0 命中，list_unindexed 可指出该资产 | 同上 |
| 5 | 非空 v1.0 库迁移两次，FTS 行数、业务行、版本首写时间不变 | test_nonempty_migration_twice_preserves_business_data |
| 6 | 全量 32 绿，FTS ≥4 项 | test_backend.py + test_fts.py |
| 7 | 三个业务表 PRAGMA table_info 与 v1.0 完全一致 | test_fresh_and_migrated_business_columns_identical |

额外安全覆盖：中途 DDL 报错回滚所有 DROP/CREATE，索引与版本保持原状；
未知 schema 拒绝；不存在的数据库不被创建；迁移后新插入仍触发索引；
六张业务表列/rowid/数据快照一致，FULL/WAL 保持。

临时 v1.0 库预置正文、空正文和外部正文各一条，实读输出：

```text
migration run 1: {'schema_version': '1.1', 'indexed_assets': 2}
FTS rows before rebuild: 2
FTS rows after rebuild: 2
search hits: 1
unindexed hashes: ['external']
synchronous: 2
journal_mode: wal
migration run 2: {'schema_version': '1.1', 'indexed_assets': 2}
```

CLI 另在临时库执行 init_db.py（显示 1.1），迁移 CLI 两次均输出
`{"schema_version": "1.1", "indexed_assets": 1}`，无异常。

修复后性能复测（临时库 1000 次插入、100 次 FTS）：scoped median2.900、
P95 3.150、max8.836ms，新口径通过；FTS max7.588ms。独立开关连接仍不通过
（P95 15.097、max22.131ms），导入必须使用 session，未修改耐久设置。

## Gate、入档与交付边界

独立 Checker：全量 32/32 通过（3.49s），另做 AC-1～AC-5/AC-7 自有验证：
fixture 与 Day 2 Git 源逐字节相等；fresh/migrated 全部 sqlite_master 定义一致；
非空库迁移两次 indexed_assets=2，业务行、1.0 版本不变；rebuild 2→2；
未内嵌正文可见；integrity_check=ok；FULL/WAL 保持。独立 scoped 性能
median2.959 / P95 3.233 / max10.250ms，新口径通过；FTS max17.628ms。
Checker 指出的测试函数计数已从 7 修正为 6（参数化运行仍为 9），最终文档
回执确认准确。本地候选 Gate 限定通过，无剩余阻断；不由 Maker 自验收。

本页与 API 为本地证据入口。DDL 仅替换派生索引，不改业务表列或数据；
不改变 synchronous / WAL，不把正文复制进索引后仍保留外部内容声明。
不包含真实库迁移、Day 3 导入、前端、公开 push/PR 或合并。
Day 3 卡仍须等待本卡独立收口及中控派发。
