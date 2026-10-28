# MVP 后端接口 · Day 2

三个入口共用已初始化的 SQLite v1.1 数据库：

```python
from mvp.backend.asset_repo import AssetRepo
from mvp.backend.event_store import EventStore
from mvp.backend.rule_registry import RuleRegistry

repo = AssetRepo("~/.knot/knot.db")
asset_id = repo.add_asset(
    content_hash="caller-computed-sha256",
    media_type="text/markdown",
    content_blob=b"knot evidence",
)
asset = repo.get_asset(asset_id)
matches = repo.search_assets("knot", media_type="text/markdown", limit=50)

# 连续导入时复用连接，减少每次关闭 WAL 连接的成本。
with repo.session():
    for item in incoming_assets:
        repo.add_asset(**item)
```

初始化仍由 `init_db.py` 显式完成。构造器只规范化路径，操作时以
`mode=rw` 连接已有数据库，不自动创建、迁移或覆盖数据库；支持 `~`
及 `Path`。每次操作独立提交或回滚并关闭连接，启用外键检查。
数据库错误保留 `sqlite3` 异常类型，调用者可捕获 `IntegrityError`。
`session()` 只复用连接，每次操作仍独立提交；作用域退出（包括异常）时关闭。
已提交的条目不会因后续导入失败回滚。禁止同一实例嵌套 session 或跨线程共用。
这些接口不提供跨 Repo 的组合事务。

按 2026-10-28 拍板，连续导入必须使用 `repo.session()`；性能验收为同一临时库
1000 次连续插入 P95 <10ms 且 max <20ms。独立开关连接模式不满足该指标，
保留为便利用法，不作为导入路径。不修改 synchronous / WAL 设置。

## 返回与查询约定

- `get_asset` / `get_event` / `get_rule`：完整列名字典，找不到返回 `None`。
- 多行查询：字典列表，找不到返回 `[]`。
- JSON 列按 schema 原样返回字符串；调用者用 `json.loads` 解析。
  未提供的事件引用为 `None`，显式空列表为字符串 `"[]"`。
- `limit` 为非负整数，`0` 返回空列表；负数、布尔值及非整数抛 `ValueError`。
- 资产查询按 `imported_at DESC, rowid DESC`，事件按
  `event_time DESC, rowid DESC`，规则按 `rule_id` 升序。

## AssetRepo

`add_asset`、`get_asset`、`search_assets`、`count_assets`。
不提供 UPDATE/DELETE/replace。重复 hash 抛 `IntegrityError`，原行不变。
hash 由调用者计算，接口不读取外部文件或校验文件内容对应的 hash。
`created_at` 未提供时取当前 Unix 毫秒，与 `imported_at` 相等；显式 `0`
保留。内容约束沿用 schema：`b""` 是合法内容，blob/path 不得同时为 NULL。

`search_assets` 接受 FTS5 查询语法；`None`、空串、纯空白表示列出资产。
非法 FTS 语法传播 `OperationalError`，不降级为全量返回。
索引由现有 INSERT trigger 维护，只覆盖 `content_blob`，不读取 `file_path`。
unicode61 不是中文子串分词器；完整中文词组匹配测试不代表任意中文切词。

v1.1 的 `assets_fts` 是自持内容 FTS5 表，不含 `content=assets` 或
`content_rowid`。只为 `content_blob IS NOT NULL` 的资产创建索引行，内容显式
`CAST(... AS TEXT)`；空 blob 有索引行但没有关键词。可全表读取并执行
`INSERT INTO assets_fts(assets_fts) VALUES('rebuild')`。

`list_unindexed()` 返回所有未内嵌正文的资产字典列表（顺序同资产列表），
调用方无需另写 SQL 即可显示「未建全文索引，仅结构化可查」。这表示正文缺失，
不检测索引损坏。空白全文查询/媒体类型筛选仍可列出这些资产。

导入规则由导入脚本执行，存储接口不读取外部文件校验：

- `text/*` 且 ≤1MB：必须内嵌 `content_blob`。
- 超过 1MB 或二进制：使用 `file_path`，不内嵌正文；正文不进索引。

已有 v1.0 库必须先迁移，不能重新运行会覆盖已有库的初始化脚本：

```sh
python -m mvp.backend.migrate_fts_v1_1 /explicit/path/to/existing.db
```

迁移只重建派生 FTS 表与两个 trigger，按现有非 NULL blob 重灌，不修改业务行。
DDL、重灌与版本记录在同一事务中完成；重复跑不重复灌，保留首次 1.1 版本时间。
请在导入停止时运行，`BEGIN IMMEDIATE` 与其他写入串行。无默认数据库路径，
不存在的库不会被创建；不修改 synchronous / WAL。
本卡仅在临时库验证，未对实际业务库执行迁移。

## EventStore

`add_event`、`get_event`、`get_events_by_type`、`get_events_by_subject`、
`count_events`。仅追加，不覆写已有事件。

事件时间与记录时间均为 Unix 毫秒，默认相等。未来事件时间抛 `ValueError`，
数据库 CHECK 同时保留。`target_assets` / `evidence_refs` 只接受 list 或
`None`，其他类型抛 `TypeError`。JSON 数组中的 ID 不设额外外键；
这是现有 schema 的能力边界，不宣称验证了引用存在性。

资产和事件的只追加约束由本接口不暴露改写操作来实现；冻结 schema 本身没有
拦截所有外部 SQL UPDATE/DELETE 的触发器，不宣称数据库层完全不可变。

## RuleRegistry

`add_rule`、`get_rule`、`get_rules_by_head`、`get_active_rules`、
`deactivate_rule`、`count_rules`。

`body` 必须为 list（空列表可表示基础事实），默认版本 1、active=1。
按 head 查询包含所有版本及失活规则；活跃查询按版本且 active=1。
禁用只将 active 改为 0：实际发生变更返回 `True`，不存在或已禁用返回
`False`。计数包含 schema 的 7 条种子规则与所有失活规则。

## 验证

在仓库根目录运行（Python 3.10+，需 pytest）：

```sh
python -m pytest mvp/tests/test_backend.py -v --tb=short
```

所有测试使用 `tmp_path` 临时库，直接执行冻结 schema，不调用可能覆盖已有库的
初始化交互。测试不读取业务数据库、旧 `.runtime` 数据或真实模型。

连接和 FTS 行为依据：[Python sqlite3](https://docs.python.org/3/library/sqlite3.html)、
[SQLite FTS5](https://www.sqlite.org/fts5.html)。
