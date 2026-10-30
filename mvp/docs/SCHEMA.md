# SQLite 数据模型（v1.4）

本文描述当前实现；逐条出处见[断言与代码映射](W1D7-CLAIM-MAP.md)。
SQL定义仍以[schema_v1.sql](../backend/schema_v1.sql)为准。

## 新建库与连接

在仓库根目录、已有开发环境中运行，目标路径须是准备新建的候选库：[S01]

```sh
python -m mvp.backend.init_db candidate/knot.db
```

初始化会建立父目录，在目标同目录的唯一临时文件应用当前schema，关闭连接并只读自验后，
以硬链接原子发布，再只读读回目标。已有文件、目录或软链（含悬空软链）一律拒绝，
不交互、不打开写、不覆盖；失败清理本次临时文件，不留下半成品。文件系统须支持硬链接。
stdout为一行JSON，status为created/refused/failed；成功退出0，拒绝或失败退出1，人话写stderr。
无覆盖开关；该命令不能代替迁移。新库包含1.0、1.1、1.2、1.3、1.4五行版本记录，不代表执行过五次生产迁移。[S02][S41]

schema启用WAL；外键开关属于连接，Repo及迁移器各自启用
`PRAGMA foreign_keys=ON`。自己建立SQLite连接写入时也须开启，否则不能依赖FK拦截。[S03]

## 七张业务表与版本表

当前为**7张业务表＋1张schema_version元数据表**，另有派生FTS虚表；不能把当前普通表
总数写成7。下面列出全部普通表、主键、外键和显式索引。SQLite自动主键/唯一索引另见约束节。[S04]

| 表 | 当前用途与关键列 | 主键 | 外键 | 显式索引 |
|---|---|---|---|---|
| assets | 原始资产：hash、media_type、blob/path、source_uri、created_at/imported_at、metadata_json | asset_id | 无 | idx_assets_hash(content_hash)、idx_assets_created(created_at)、idx_assets_media(media_type) |
| history_events | 历史事件：event_type、subject、source、event_time/recorded_at、target_assets、evidence_refs、payload_json | event_id | 无 | idx_events_type(event_type)、idx_events_time(event_time)、idx_events_recorded(recorded_at)、idx_events_subject(subject) |
| horn_rules | Horn规则：head、body、rule_version、active、description | rule_id，INTEGER AUTOINCREMENT | 无 | idx_rules_head(head)、idx_rules_version(rule_version) |
| eligible_snapshots | 每个事件的状态行：snapshot_time、event_id、is_eligible、trust_level、reason | snapshot_id（行ID） | event_id→history_events.event_id，ON DELETE RESTRICT | idx_eligible_event(event_id)、idx_eligible_time(snapshot_time)、uq_eligible_snapshot_event(snapshot_time,event_id) [S38] |
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
| uq_eligible_snapshot_event UNIQUE(snapshot_time,event_id) | 1.3库同刻同事件第二行在写入期被拒；同刻不同事件仍可写。[S38] |
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

当前仅有上面两个CHECK；除主键外，独立UNIQUE约束为content_hash及(snapshot_time,event_id)。
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
| 1.1 | `2a8dc18`的migrate_fts_v1_1：DROP旧派生FTS和两个触发器，重建并重灌非NULL blob | 仅接受含1.0且无其他未知版本的1.0/1.1库；1.2及更新版本库拒绝。[S28] |
| 1.2 | `43343ff`的migrate_schema_v1_2：增量CREATE映射表/索引及首次版本行 | 版本集合限1.0/1.1/1.2且至少含1.1或1.2，不回填、不改旧业务表。[S29] |
| 1.3 | `d074757`（TD01）的migrate_schema_v1_3：新增同刻同事件唯一索引及版本行 | 前置含1.2且无未知版本；全部冲突组先报错，拒绝自动去重；已是1.3须核对承诺结构，通过才返回created=false。[S38][S39] |
| 1.4 | TD02的migrate_schema_v1_4：表尾追加source_label与source_members及版本行 | 需要1.3，由原1.3迁移器升级1.2或体检1.3；前置漂移为[KNOT-E031]。1.4重跑核两列，漂移／半成品以[KNOT-E032]拒绝，不采纳、不修复。[S41][S42] |

在仓库根，对明确已有的候选库按需运行；不要在新版库倒跑旧迁移器：[S30]

```sh
python -m mvp.backend.migrate_fts_v1_1 candidate/knot.db
python -m mvp.backend.migrate_schema_v1_2 candidate/knot.db
python -m mvp.backend.migrate_schema_v1_3 candidate/knot.db
python -m mvp.backend.migrate_schema_v1_4 candidate/knot.db
```

这四行表示1.0→1.1→1.2→1.3→1.4的顺序，已是1.1时从第二行开始，已是1.2时可直接执行第四行（内含1.3前置），已是1.3时执行第四行。
已是1.4时仅重复第四行幂等；不能在新版库倒跑旧迁移器。各器以mode=rw拒绝缺库、BEGIN IMMEDIATE包住各自变更；1.4的1.3前置独立提交，随后两列及1.4版本行在同一事务提交或回滚。重复执行各自
支持的版本不会重复灌入FTS行或改写已有版本记录时间。[S31]

1.3迁移先按(snapshot_time,event_id)汇总全部重复组，错误列出每组时间、事件和行数。
有冲突时不建索引、不写版本、不改数据；无冲突时索引与版本行同事务提交。
同名但定义不兼容的索引也拒绝；冲突须由人决定如何处理。[S39]

1.3幂等重跑也须核结构，不能把版本行或对象同名当作结构证明：
`eligible_snapshots`须为表；其`uq_eligible_snapshot_event`索引须存在、UNIQUE、非partial，
有效键列须恰为按序的`(snapshot_time,event_id)`，两列均采用BINARY排序规则。[S39]

发现漂移即抛出继承`ValueError`的`SchemaDriftError`，CLI退出1并向stderr报告具体不符项。
拒绝不创建、删除或重建索引，不补写或改写版本行，不改业务数据；修复须另行决定。[S39]

错误码格式为`[KNOT-E0xx]`，消息以稳定码开头；首个条目`[KNOT-E031]`表示
1.3版本行与承诺结构漂移。例如：
`[KNOT-E031] schema drift: index uq_eligible_snapshot_event is missing; version row 1.3 present, no changes made`。[S39]

### 1.4候选编号与包内来源

`claims_candidates`在`reviewed_at`之后追加两列可空TEXT，无默认值、无新增索引或约束。
`source_label`存抽取编号（如`T17-01`、`D-12`、`Q18-01`），NULL表示来源没有编号。
`source_members`存包内成员路径的JSON数组，NULL表示来源就是资产本身（例如内嵌md），不是包内成员。
`atom`仍为NOT NULL的规则词表原子，如`conditional_theorem`，不存编号；两列由后续抽取器写入，本卡不回填。[S41]

迁移器先检查1.4标记，已存在时只核本版本承诺：表存在、两列存在、TEXT亲和且可空，
通过才返回`created: false`，不改`applied_at`。未到1.4时复用1.3迁移器前置，
随后重开事务核1.3及两列均不存在，执行两次ALTER、核结构、写1.4版本行。
版本行在但缺列／类型不符／不可空，以及任一列已在但版本行缺失，均以E032拒绝，
不补列、不补版本行；未标1.4且缺候选表以ValueError拒绝。[S42]

| 错误码 | 含义 |
|---|---|
| `[KNOT-E031]` | 1.3承诺结构漂移，由原1.3迁移器前置体检报告。[S39][S42] |
| `[KNOT-E032]` | 1.4候选来源列漂移或未标版本的半成品；只报告，不采纳、不修复。[S42] |

### 1.2不backfill的实际后果

Day 3导入资产及import事件，不生成原子映射或可信状态。**未进入eligible的旧事件**
没有映射，不会单凭“历史中存在”就让支持族报错；一旦它进入eligible而仍无映射，
适配层抛`ValueError: eligible event has no event_atom_map row: ...`，不会猜默认值。[S32]

存储表允许一事件多atom（复合PK）；冻结内核只接受单值映射，适配层会对表中任意
多原子事件显式报错，即使该事件当前不eligible。eligible原子不在当前规则词表也报错。[S33]

状态采用每事件截至并包含T的最后一行；撤权粘滞，取消撤权须显式新写可信行。
空快照是否成立取决于空集Horn闭包，不是“没有事件就全假”。[S34]

已升级到1.3的合规库：唯一索引保证同刻同事件只有一行，SQL中最大rowid兜底不可达，
仅作防御保留。未迁移的v1.2库：没有该索引，同刻重复行仍可存在，读侧继续按最大rowid
后写胜。两种库分别有测试；carry-forward语义及读取SQL不变。[S40]

## 两枚字节钉与核验

| 文件（相对仓库根） | SHA256与用途 |
|---|---|
| mvp/tests/fixtures/schema_v1_0.sql | `5cd92492ff80f7ea7730d6f808d2a242212f025c455b9e29ffd63bc0d0253370`，旧schema迁移回归参考。[S35] |
| mvp/tests/fixtures/frontier17_reference_20261027.py | `056528f4e11ce652084ae5694b9eeda23ef44c9bd2d782b352ed49b47e76b1cd`，原算法差分与计数基线。[S36] |

.gitattributes对二者设置-text防止checkout换行转换，CI以写死常量独立校验。[S37]

## S3 显式资产读权限迁移（1.6）

在已有 1.5 候选库运行 `python -m mvp.backend.migrate_schema_v1_6 candidate/knot.db`。
本迁移只新增 `asset_readers(asset_id TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY(asset_id,actor))`
及 1.6 版本行；迁移时已有资产登记 `local-user` reader，不推测其他 actor。
新表、历史 reader 和版本行同事务提交，失败回滚。重跑只核结构并返回 `created:false`，
不补授权、不改版本时间；缺表、结构漂移或未标版本的同名对象均拒绝，不自动修复。
初始化仍创建 1.4；需要本功能时按顺序显式运行 1.5、1.6 迁移，不由服务启动升级。

未配置 `KNOT_TOKENS`/`KNOT_TOKEN` 时为 `single-user`，不受 reader 表限制。
配置模式 token 仅解析 actor，正文读权限由 reader 表判定；无 reader 返回 403 `FORBIDDEN_VIEW`，
meta 仍可读。续接包取 selected 与 readable 的交集，正文说明排除计数；
无 eligible 的确认事件或 atom boolean=false 的条目降至未决问题并标注“证据无效”。
该容错仅用于包投影，claim/trace 原有严格校验不变。

## 计划与未覆盖

映射填充、候选关系抽取、索引内容损坏恢复、前端展示不属于本轮交付；
不要把已有表结构当成这些功能已经完成。真实数据库迁移仍须明确目标及独立核验。
