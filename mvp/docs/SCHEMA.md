# SQLite 数据模型（v1.2）

本文描述当前实现；逐条出处见[断言与代码映射](W1D7-CLAIM-MAP.md)。
SQL定义仍以[schema_v1.sql](../backend/schema_v1.sql)为准。

## 新建库与连接

在仓库根目录、已有开发环境中运行，目标路径须是准备新建的候选库：[S01]

```sh
python -m mvp.backend.init_db candidate/knot.db
```

初始化会建立父目录并应用当前schema。已有文件时会询问是否覆盖；确认后会删除旧库，
所以该命令不能代替迁移。新库包含1.0、1.1、1.2三行版本记录，不代表执行过三次生产迁移。[S02]

schema启用WAL；外键开关属于连接，Repo及两个迁移器各自启用
`PRAGMA foreign_keys=ON`。自己建立SQLite连接写入时也须开启，否则不能依赖FK拦截。[S03]

## 七张业务表与版本表

当前为**7张业务表＋1张schema_version元数据表**，另有派生FTS虚表；不能把当前普通表
总数写成7。下面列出全部普通表、主键、外键和显式索引。SQLite自动主键/唯一索引另见约束节。[S04]

| 表 | 当前用途与关键列 | 主键 | 外键 | 显式索引 |
|---|---|---|---|---|
| assets | 原始资产：hash、media_type、blob/path、source_uri、created_at/imported_at、metadata_json | asset_id | 无 | idx_assets_hash(content_hash)、idx_assets_created(created_at)、idx_assets_media(media_type) |
| history_events | 历史事件：event_type、subject、source、event_time/recorded_at、target_assets、evidence_refs、payload_json | event_id | 无 | idx_events_type(event_type)、idx_events_time(event_time)、idx_events_recorded(recorded_at)、idx_events_subject(subject) |
| horn_rules | Horn规则：head、body、rule_version、active、description | rule_id，INTEGER AUTOINCREMENT | 无 | idx_rules_head(head)、idx_rules_version(rule_version) |
| eligible_snapshots | 每个事件的状态行：snapshot_time、event_id、is_eligible、trust_level、reason | snapshot_id（行ID） | event_id→history_events.event_id，ON DELETE RESTRICT | idx_eligible_event(event_id)、idx_eligible_time(snapshot_time) |
| claims_candidates | 待核候选：claim_type、atom、support_sources、extraction_method、confidence、unverified、user_response、proposed_at/reviewed_at | claim_id | 无 | idx_claims_atom(atom)、idx_claims_type(claim_type)、idx_claims_unverified(unverified) |
| continuation_bundles | 续接包：created_at、user_scoped、authorized_assets、support_view_snapshot、open_questions、context_text、exported | bundle_id | 无 | idx_bundles_created(created_at)、idx_bundles_exported(exported) |
| event_atom_map | 事件主张的原子：event_id、atom、origin、created_at | (event_id, atom) | event_id→history_events.event_id，ON DELETE RESTRICT | idx_event_atom_atom(atom) |
| schema_version | 版本审计：version、applied_at、description | version | 无 | 无显式索引 |

八行对应[S05]～[S12]，按表顺序逐行核对。

## 数据约束：数据库实际保证什么

| 约束 | 当前业务含义 |
|---|---|
| assets.content_hash NOT NULL UNIQUE | 同一hash不能重复入库；重复写入不会替换旧资产。[S13] |
| assets CHECK(content_blob IS NOT NULL OR file_path IS NOT NULL) | 至少一个存储位置非NULL；`b""`符合条件，空字符串path也不被该CHECK排除，不能把它说成“文件必然存在”。[S14] |
| history_events CHECK(recorded_at >= event_time) | 数据库拒绝记录时间早于事件时间；EventStore另在写入前拒绝未来事件时间。[S15] |
| 两个event_id外键 | 状态行及映射不能引用不存在的历史事件；RESTRICT阻止删除仍被引用的事件。须开启FK。[S16] |
| 各主键、event_atom_map复合主键 | 标识行；映射的同一(event_id,atom)不能重复，不同atom可属于同一事件。[S17] |

完整NOT NULL列按表列示：[S18]

- assets：content_hash、media_type、created_at、imported_at。
- history_events：event_type、event_time、recorded_at。
- horn_rules：head、body、rule_version、active。
- eligible_snapshots：snapshot_time、event_id、is_eligible。
- claims_candidates：claim_type、atom、extraction_method、proposed_at、unverified。
- continuation_bundles：created_at、user_scoped、authorized_assets、exported。
- event_atom_map：四列中的event_id、atom、created_at；origin可空。
- schema_version：applied_at。

当前仅有上面两个CHECK；除主键外，单独声明的UNIQUE只有content_hash。
JSON形状、confidence范围、0/1标志取值、SHA256格式与UUID格式均未由schema作额外CHECK。
JSON引用字段也不是外键：subject/target_assets/evidence_refs/support_sources/
authorized_assets不因写了某个ID就得到引用存在性校验。[S19]

assets/history_events“只追加”由现有Repo不提供覆写入口实现，schema没有封锁所有外部
UPDATE/DELETE的不可变触发器；两个Repo会生成UUID v4，不能据此宣称任意SQL写入均被校验。[S20]

## FTS：派生索引与正文边界

assets_fts为自持内容FTS5虚表，列为asset_id（UNINDEXED）与content；没有
`content=assets`或content_rowid声明，使用`unicode61 remove_diacritics 2`。
旧v1.0的外部内容声明指向assets，但assets没有content列，导致旧rebuild失败；
1.1已解耦。旧定义及当前定义均有冻结/源码可核。[S21]

- assets_fts_insert：资产插入且content_blob非NULL时，以资产rowid、asset_id及
  `CAST(content_blob AS TEXT)`新增一条索引内容行。[S22]
- assets_fts_delete：资产被外部SQL删除时，按旧rowid删除派生索引行；该触发器
  不表示资产Repo提供删除API。[S23]

空blob有索引行但没有token；NULL blob没有FTS行，file_path正文不会被读取。
`AssetRepo.list_unindexed()`列出NULL blob资产，不检查索引是否损坏。
当前无资产UPDATE同步触发器，受支持入口依赖只追加契约。[S24]

在已有候选库上重建倒排索引：[S25]

```python
from contextlib import closing
from pathlib import Path
import sqlite3

uri = Path("candidate/knot.db").resolve().as_uri() + "?mode=rw"
with closing(sqlite3.connect(uri, uri=True)) as conn, conn:
    conn.execute("INSERT INTO assets_fts(assets_fts) VALUES('rebuild')")
```

这是从FTS自持内容重建倒排，**不会**从assets补回已经丢失的FTS内容行，也不会读取
外部对象正文；不能把它当成任意资产/索引不一致的修复器。重建测试和实读命令见
[本轮数字与证据](W1D7-EVIDENCE.md)。[S26]

## 版本链与升级

| 版本 | 对应实现与变更 | 当前历史边界 |
|---|---|---|
| 1.0 | `197aa5e`初始化schema、规则种子和旧FTS；init_db创建新库 | 初始化SQL不是重复应用的迁移脚本。[S27] |
| 1.1 | `2a8dc18`的migrate_fts_v1_1：DROP旧派生FTS和两个触发器，重建并重灌非NULL blob | 仅接受含1.0且无其他未知版本的1.0/1.1库；1.2库拒绝。[S28] |
| 1.2 | `43343ff`的migrate_schema_v1_2：增量CREATE映射表/索引及首次版本行 | 版本集合限1.0/1.1/1.2且至少含1.1或1.2，不回填、不改旧业务表。[S29] |

在仓库根，对明确已有的候选库按需运行；不要在1.2库上倒跑FTS迁移：[S30]

```sh
python -m mvp.backend.migrate_fts_v1_1 candidate/knot.db
python -m mvp.backend.migrate_schema_v1_2 candidate/knot.db
```

这两行表示1.0→1.1→1.2的顺序，已是1.1时只执行第二行，已是1.2时不需升级。
两器均以mode=rw拒绝缺库、BEGIN IMMEDIATE包住变更，错误整体回滚；重复执行各自
支持的版本不会重复灌入FTS行或改写已有版本记录时间。[S31]

### 1.2不backfill的实际后果

Day 3导入资产及import事件，不生成原子映射或可信状态。**未进入eligible的旧事件**
没有映射，不会单凭“历史中存在”就让支持族报错；一旦它进入eligible而仍无映射，
适配层抛`ValueError: eligible event has no event_atom_map row: ...`，不会猜默认值。[S32]

存储表允许一事件多atom（复合PK）；冻结内核只接受单值映射，适配层会对表中任意
多原子事件显式报错，即使该事件当前不eligible。eligible原子不在当前规则词表也报错。[S33]

状态采用每事件截至并包含T的最后一行，同刻最大rowid兜底；撤权粘滞，取消撤权须
显式新写可信行。空快照是否成立取决于空集Horn闭包，不是“没有事件就全假”。[S34]

## 两枚字节钉与核验

| 文件（相对仓库根） | SHA256与用途 |
|---|---|
| mvp/tests/fixtures/schema_v1_0.sql | `5cd92492ff80f7ea7730d6f808d2a242212f025c455b9e29ffd63bc0d0253370`，旧schema迁移回归参考。[S35] |
| mvp/tests/fixtures/frontier17_reference_20261027.py | `056528f4e11ce652084ae5694b9eeda23ef44c9bd2d782b352ed49b47e76b1cd`，原算法差分与计数基线。[S36] |

.gitattributes对二者设置-text防止checkout换行转换，CI以写死常量独立校验。[S37]

## 计划与未覆盖

映射填充、候选关系抽取、同刻唯一约束、索引内容损坏恢复、前端展示不属于本轮交付；
不要把已有表结构当成这些功能已经完成。真实数据库迁移仍须明确目标及独立核验。
