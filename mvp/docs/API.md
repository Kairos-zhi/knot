# MVP 后端接口 · Day 2

三个入口共用已初始化的 SQLite 数据库（新库为 v1.2，保留1.0/1.1历史版本记录）：

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
这些接口不提供跨 Repo 实例的组合事务。`repo.transaction()` 可在已打开的
session 内把同一实例的一组方法调用成对提交，异常时一起回滚，不允许嵌套。
Day 3 导入器以一个内部实例组合既有 AssetRepo/EventStore 方法：每文件一对
资产与 import 事件使用同一事务，不另写一套插入 SQL；此前成功文件保持提交。

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

## v0.4 baseline 导入

```sh
python -m mvp.backend.import_baseline --source /baseline --db /candidate/knot.db
```

必须显式指定已有 v1.1 候选库，不自动创建或迁移。先校验 MANIFEST 完整覆盖
目录文件及其原始字节 hash，再记录 hash/mtime、检查 schema，最后逐文件导入。
来源保持只读；不执行其中脚本、不解包 zip、不联网、不调用模型。

类型映射为 md→text/markdown、py→text/x-python、json→application/json、
sha256→text/plain、zip→application/zip；未支持的扩展名计入 failed。
其中 JSON 按任务卡视为可内嵌文本。1MB 在此明确为 1,000,000 原始字节：
可内嵌文本不超过阈值时原字节保存，其他写入库同级
`objects/<hash前2位>/<完整hash>`，file_path 为该相对路径。
对象先 fsync，再原子发布，既有同名对象必须 hash 一致，不覆盖损坏对象。
失败文件可能留下未引用的正确对象，重跑可复用，不删除历史对象。

source_uri 和事件 source 使用 `file://` 加百分号编码的源相对路径，
metadata_json 的 path 保留原相对文件名；创建时间/事件时间取源 mtime 毫秒。
每个新资产恰一条 import 事件，引用列表明确为 `[asset_id]` 与 `[]`。
hash 已存在则跳过，不补写事件。`indexed`/`unindexed` 计数只统计本次新导入。

输出一行 JSON：`imported`、`skipped`、`indexed`、`unindexed`、`failed`。
有失败时 CLI 返回非零；逐文件提交的成功结果保留。结束后再次验证 manifest
及全部源文件 hash/mtime；任何变化都会记录失败，不能声称源完整性通过。

## Frontier17（Day 4）

`frontier17.py` 为原脚本纯函数核心的原样提取；签名、算法与判据冻结。
输入为有限正 Horn 规则、稳定事件 ID、eligible 集合和确定的接收者策略。
`incremental_scc` 仍返回 `(support, recomputed_count)`。
`notification_delta` 是内部比较，不能直接作为对外消息；对外投影使用
`authorized_outbox`，不包含已撤销键的旧值。这里未实现消息投递或真实 A2A。

独立的 `frontier17_db.py` 提供：

```python
load_state(conn, snapshot_time, *, event_atom=None, rule_version=1)
evaluate_from_db(conn, snapshot_time, *, event_atom=None, rule_version=1)
incremental_from_db(conn, snapshot_time, old_snapshot_time,
                    *, event_atom=None, rule_version=1)
```

三个适配函数只执行 SELECT，连接与一致性读事务由调用方管理。
`load_state` 返回 `(atoms, mapping, eligible, rules)`：atoms 为活跃指定版本
规则 head/body 的并集并排序；eligible 通过 `eligible_at(conn, T)` 读取：每个事件
取 `snapshot_time <= T` 的最后状态并carry-forward。沉默不改变状态，撤权粘滞，
取消撤权须显式新增is_eligible=1行；同刻多行按最大rowid兜底（未来唯一约束另卡）。
mapping 始终来自 event_atom_map。可选 event_atom 仅做一致性断言，传值与表
不一致即 ValueError，不能覆盖库中映射。

schema 虽允许一个事件多原子，当前冻结内核仅接受单值映射；适配层遇到多原子
显式 ValueError，不合并或取首个。eligible事件缺映射或不在规则原子词表也报错。
evaluate/incremental适配返回终态support字典；incremental适配先从旧快照全算，
再用同一份规则/映射增量计算新eligible。它不持久化旧support，不支持规则/映射
变化下复用已缓存旧状态。

从显式已有v1.1候选库增量升级：

```sh
python -m mvp.backend.migrate_schema_v1_2 /explicit/candidate.db
```

只增量创建event_atom_map、索引和首次1.2版本记录，不回填Day 3的资产。
v1.0须先跑FTS迁移；未知版本/缺库拒绝；迁移不改FULL/WAL。此轮仅临时库测试。

## 支持族视图（Day 5）

```python
from mvp.backend.support_view import compute_support

view = compute_support(conn, snapshot_time, rule_version=1)
```

返回原生dict/list/bool/int/str，可直接json.dumps，无缓存、无写入：

```json
{
  "snapshot_time": 20,
  "rule_version": 1,
  "atoms": {"p": {"boolean": true, "minimal_roots": [["ev-1"], ["ev-2"]]}},
  "eligible_count": 2
}
```

时间口径包含T（snapshot_time≤T）：每个事件取此前最后状态并carry-forward。
沉默不改变可信或撤权状态，取消撤权须显式新增is_eligible=1行。同刻多行以最大
rowid兜底，这是现有schema的读取规则，未来唯一约束另卡，不在本接口偷偷修表。
snapshot_id只是行标识，不是快照组；从未出现过的事件不在eligible中。

M(p)的元素是来源事件ID集合。minimal_roots内层按ID升序，外层先按长度、再按
字典序；原子键按名字排序。因此相同数据库视图和参数重复调用，JSON插入顺序稳定。
boolean严格等于bool(minimal_roots)，只投影指定版本的活跃规则head/body词表。
既有映射错误继续显式抛ValueError，不按payload_json/metadata_json自由文本判定。
接口不读取资产或事件正文。连接及跨多次SELECT的一致性读事务仍由调用方管理。
snapshot_time与rule_version须为Python原生int，bool/浮点等抛TypeError。

空快照的判据是从空集Horn闭包是否可达，不能按body是否为空判断：

- `p ∈ boolean_closure(∅, rules)`：true、`minimal_roots=[[]]`。
- 从空集闭包不可达：false、`minimal_roots=[]`。
- 若空根与非空根并存，空根是非空根的真子集，最小化后只保留`[[]]`。

默认种子空快照中，question/evidence/counterexample/decision/open_question/
support_relation均为true/[[]]；conditional_theorem/premise/proof为false/[]。
`[[]]`表示无条件成立，`[]`表示无支持；前端不能把无条件成立展示成已有来源证据。
本卡不改前端、不做时间轴对比或支持族缓存。
