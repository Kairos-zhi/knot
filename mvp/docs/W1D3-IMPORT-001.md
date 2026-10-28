# KNOT-MVP-W1D3-IMPORT-001 · v0.4 候选导入

日期：2026-10-28。archive_id：`knot-mvp-w1d3-import-001-20261028`。
状态：独立本地候选 Gate 限定通过，AC-1～AC-10 无剩余阻断。
检索键：`baseline import`、`22/19/3`、`manifest`、`paired transaction`。

## 受理与既查

用户明确「是的，继续开发」，按给定 Day 3 卡执行。已核 main 基线
`2c7854a3a2a186656f99dcec5f7d3ec7cda6bb00`，从干净工作树建立
`feat/knot-import-baseline`。该基线包含 Day 2 与 FTS v1.1（PR #21）。
沿用已读治理、开发基准、架构与根历史状态；本轮读了任务卡、AssetRepo、
EventStore、SQLiteRepo 及 API，复用现有插入、时间校验、FTS 和对象契约。

按卡的顺序先在源根运行 `sha256sum -c MANIFEST.sha256`：21/21 OK，退出0；
然后记录22文件 SHA256/bytes/mtime_ns，见 [完整快照](W1D3-source-snapshot.json)。
最后才建立、核验独立候选库 schema 1.1。源为用户给定的
`hermes-sync/knot-research-archive/knot_v04_baseline/Knot_数学内核研究_移交_v0.4_20261027/`。
源根经过路径规范化处理（兼容本机 junction），不写入源树。

只读字节，不运行来源脚本，不解包 zip，不联网或调用模型。实际业务库未读写或迁移。
持久候选与本机证据保存在被 Git 忽略的
`evidence/local/20261028-w1d3-import-maker/`；库为 `candidate/knot.db`，
对象仅位于该库同级 `candidate/objects/`。不将候选 DB、对象或源正文纳入提交。

## 实现与取舍

`import_baseline.py` 明确 source/db 参数，依次验证 MANIFEST、快照、schema1.1，
然后按原字节 SHA256 去重。md/py/json/sha256 ≤1,000,000B 内嵌，zip 或更大文本
保存为相对路径对象；不做字符编码转换。JSON 是任务卡明确的内嵌文本特例。
对象先落临时文件并 fsync，再硬链接原子发布，不覆盖已存在但 hash 不符的对象。

增加 `SQLiteRepo.transaction()`，必须在 session 内、不可嵌套。同一实例方法
共享事务；导入器内部组合既有 AssetRepo/EventStore，每文件一事务，成对提交
资产与 import 事件。这样后续事件失败不会留下已提交资产，而下次因 hash 跳过，
永久缺失导入事件。此前成功文件不回滚。没有引入跨实例事务或新的资产权威。

初轮独立 Checker 发现 manifest 校验与快照间的读取竞态：第一次校验后变化的
内容可能被第二次快照接受。已修复为保留 MANIFEST 原始字节与期望 hash 映射，
逐项比对快照（含 manifest 自身 hash），写入前再次校验所读字节与 mtime，
结束再核 MANIFEST 和完整快照。新增注入修改回归，确认未验证数据不入库。

旧 FTS fixture 在 Windows checkout 的 autocrlf 转换后不再满足其字节 pin。
已从 `git show 7e35731:mvp/backend/schema_v1.sql` 恢复原字节，添加精确路径
`.gitattributes -text` 保持 SHA256 `5cd92492…53370`；未改 schema 或业务值。
这是确保原32项回归在本机 checkout 后可重现所需的窄修。

## 自核验与 AC-1～AC-10

执行环境：已有 Python 3.11.15 / pytest9.1.1 / SQLite3.53.1，不安装依赖。

```powershell
# 源根执行，导入前后各一次（两次均21/21 OK）
sha256sum -c MANIFEST.sha256

# 仓库根执行；SOURCE 为上述源根，DB 为本地证据目录内 candidate/knot.db
$env:PYTHONDONTWRITEBYTECODE='1'
python -m mvp.backend.import_baseline --source $SOURCE --db $DB
python -m pytest mvp/tests/ -v --tb=short -p no:cacheprovider
```

首轮与二轮 CLI 输出（均退出0）：

```json
{"imported":22,"skipped":0,"indexed":19,"unindexed":3,"failed":[]}
{"imported":0,"skipped":22,"indexed":0,"unindexed":0,"failed":[]}
```

`indexed` / `unindexed` 为本次新增数，二轮总 FTS 行数仍为19。
本机 `run-1.json` / `run-2.json` / `acceptance.json` 保留真实输出。

| AC | 查询或核验动作 | 实测结果 |
|---|---|---|
| 1 | `SELECT COUNT(*) FROM assets` | 22 |
| 2 | `SELECT COUNT(DISTINCT content_hash) FROM assets` | 22 |
| 3 | import事件COUNT、DISTINCT subject及逐资产关联COUNT | 22 / 22，每资产恰1事件，无孤儿 |
| 4 | `SELECT COUNT(*) FROM assets_fts` / `list_unindexed()` | 19 / 3，原名为三个历史zip |
| 5 | `repo.search_assets('第十七轮')` | 3命中，包含指定第十七轮正确性md |
| 6 | CLI再次运行，同库计数复读 | 0导入/22跳过，22资产/22事件/19FTS不变 |
| 7 | snapshot(source)与导入前22项完整JSON快照比较 | sha256/bytes/mtime_ns 全部一致 |
| 8 | 源根再次 `sha256sum -c MANIFEST.sha256` | 21/21 OK |
| 9 | 全量 pytest（原32＋新增11） | Maker43/43（9.00s），独立43/43（8.49s） |
| 10 | `PRAGMA synchronous` / `PRAGMA journal_mode` | 2 / wal，未修改 |

三个未索引资产原名（metadata_json.path 可见）：

- `历史基线_原样/baseline_v0.1_原始研究包.zip`
- `历史基线_原样/baseline_v0.2_原始移交包.zip`
- `历史基线_原样/baseline_v0.3_原始移交包.zip`

指定命中：
`第14至17轮_原始增量/Knot_第十七轮_跨层增量正确性与授权观察边界_20261027.md`。
其他命中为 MANIFEST.sha256 与 07_验证结果与复现.md，均有真实索引依据。
候选库 integrity_check=ok；22个 hash 均对应原始字节，3个对象文件字节一致。

计数与事件配对读回命令（使用候选库连接）：

```sql
SELECT COUNT(*), COUNT(DISTINCT content_hash) FROM assets;
-- 22 | 22
SELECT COUNT(*), COUNT(DISTINCT subject)
FROM history_events WHERE event_type='import';
-- 22 | 22
SELECT COUNT(*) FROM assets a WHERE (
    SELECT COUNT(*) FROM history_events e
    WHERE e.subject=a.asset_id AND e.event_type='import'
) != 1;
-- 0
SELECT COUNT(*) FROM assets_fts;
-- 19
PRAGMA synchronous;
-- 2
PRAGMA journal_mode;
-- wal
```

AC-5/AC-7 程序化断言（SOURCE 为源路径，DB 为独立候选库）：

```python
before = json.loads(Path('mvp/docs/W1D3-source-snapshot.json').read_text(encoding='utf-8'))
assert verify_manifest(SOURCE) == before
hits = AssetRepo(DB).search_assets('第十七轮')
assert any(json.loads(row['metadata_json'])['path'] ==
    '第14至17轮_原始增量/Knot_第十七轮_跨层增量正确性与授权观察边界_20261027.md'
    for row in hits)
# 两项断言均通过；全部22文件SHA/mtime匹配。
```

## 独立复核与交付

独立 Checker：最终全量43/43通过（8.49s），另用真实22源包导入自己临时库并重跑，
全部 AC 复现；raw blob/object字节、源 hash/mtime、前后21/21MANIFEST、
FULL2/WAL与integrity_check均核定。另用 authorizer 拒绝首个 compound COMMIT：
保留21资产/21事件且1失败；撤销后重跑1导入/21跳过，恢复22/22。
manifest竞态漏洞修复已独立复核。代码与文档一致，最终本地候选限定 Gate 通过，
无剩余阻断。本结论不包含实际库迁移、公开推送、合并或算法运行。

最后新增旧 v1.0 库拒绝、不自动迁移的回归，Maker最终43/43通过（9.00s）；
最终候选再次运行仍为0导入/22跳过，源完整快照一致，输出保留于 final-rerun.json。

已知语义：hash已存在只跳过，不修复外部客户端先前制造的不配对资产。
失败文件可能留有未引用的正确对象，重跑可复用；不删除对象。
这不影响本候选的资产/事件1:1验收。

本卡仅限候选导入和本地代码交付；不 push、创建公开PR、合并、迁真实库或
扩展到算法运行。Day 4 算法迁移不在本卡内。
