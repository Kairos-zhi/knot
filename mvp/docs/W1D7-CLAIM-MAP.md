# Day 7 断言 → 代码位置映射（完整）

基于本轮候选源码；SCHEMA的S编号、IMPORT的I编号逐项对应下表。
历史行号保留TD01定位；Day 7实跑数字仍是历史证据，当前新增行为见S38–S42，TD02锚点用文件及函数名。
内核与适配读取SQL保持不变；TD02既有测试仅作AC-12b允许的三文件四处版本预期适配。
Git和GitHub动态状态单列为实读证据，不谎称由某行workflow代码自动保证远端规则。

## SCHEMA.md

| 编号 | 断言 | 文件:行 |
|---|---|---|
| S01 | 新建候选库入口、父目录与SQL应用 | [mvp/backend/init_db.py](../backend/init_db.py) 的 init_database/main；[初始化测试](../tests/test_init_db.py) |
| S02 | 非交互拒绝已有文件／目录／软链，无覆盖开关；同目录临时建库、自验、硬链接原子发布、只读读回，失败清理；stdout单行JSON及0/1退出码；新库五版本记录 | [mvp/backend/init_db.py](../backend/init_db.py) 的 init_database/_validate/_readback/main、[初始化测试](../tests/test_init_db.py)、[mvp/backend/schema_v1.sql](../backend/schema_v1.sql) 的版本记录段 |
| S03 | WAL与逐连接FK启用 | [mvp/backend/schema_v1.sql:5-6](../backend/schema_v1.sql#L5-L6)、[mvp/backend/_db.py:58-62](../backend/_db.py#L58-L62)、[mvp/backend/migrate_fts_v1_1.py:36-40](../backend/migrate_fts_v1_1.py#L36-L40)、[migrate_schema_v1_2.py:29-33](../backend/migrate_schema_v1_2.py#L29-L33)、[migrate_schema_v1_3.py:44-48](../backend/migrate_schema_v1_3.py#L44-L48) |
| S04 | 七业务表＋版本表；FTS另列 | [mvp/backend/schema_v1.sql:13-193](../backend/schema_v1.sql#L13-L193)，八个普通CREATE TABLE与一个CREATE VIRTUAL TABLE；本轮表名实读见EVIDENCE |
| S05 | assets列、PK、无FK、三显式索引 | [mvp/backend/schema_v1.sql:13-28](../backend/schema_v1.sql#L13-L28) |
| S06 | history_events列、PK、无FK、四显式索引 | [mvp/backend/schema_v1.sql:35-51](../backend/schema_v1.sql#L35-L51) |
| S07 | horn_rules列、AUTOINCREMENT、无FK、两索引 | [mvp/backend/schema_v1.sql:58-68](../backend/schema_v1.sql#L58-L68) |
| S08 | eligible_snapshots列、行PK、FK/RESTRICT、两普通索引；唯一索引见S38 | [mvp/backend/schema_v1.sql:75-86](../backend/schema_v1.sql#L75-L86) |
| S09 | claims_candidates列、PK、无FK、三索引 | [mvp/backend/schema_v1.sql:93-108](../backend/schema_v1.sql#L93-L108) |
| S10 | continuation_bundles列、PK、无FK、两索引 | [mvp/backend/schema_v1.sql:114-126](../backend/schema_v1.sql#L114-L126) |
| S11 | event_atom_map四列、复合PK、FK/RESTRICT、atom索引 | [mvp/backend/schema_v1.sql:169-177](../backend/schema_v1.sql#L169-L177) |
| S12 | schema_version三列、PK、无显式索引 | [mvp/backend/schema_v1.sql:180-193](../backend/schema_v1.sql#L180-L193) |
| S13 | content_hash的NOT NULL/UNIQUE、INSERT非替换 | [mvp/backend/schema_v1.sql:15](../backend/schema_v1.sql#L15)、[mvp/backend/asset_repo.py:34-44](../backend/asset_repo.py#L34-L44) |
| S14 | blob/path至少一个非NULL，不检测空值内容或文件存在 | [mvp/backend/schema_v1.sql:17-23](../backend/schema_v1.sql#L17-L23)、[mvp/tests/test_fts.py:35-48](../tests/test_fts.py#L35-L48) |
| S15 | recorded_at≥event_time，Repo另拒未来时间 | [mvp/backend/schema_v1.sql:40-45](../backend/schema_v1.sql#L40-L45)、[mvp/backend/event_store.py:30-34](../backend/event_store.py#L30-L34) |
| S16 | 唯二显式FK及RESTRICT | [mvp/backend/schema_v1.sql:82](../backend/schema_v1.sql#L82)、[175](../backend/schema_v1.sql#L175)、[mvp/tests/test_schema_v1_2.py:61-84](../tests/test_schema_v1_2.py#L61-L84) |
| S17 | 各PK及复合PK仅禁止相同(event,atom) | [mvp/backend/schema_v1.sql:13-24](../backend/schema_v1.sql#L13-L24)、[35-46](../backend/schema_v1.sql#L35-L46)、[58-65](../backend/schema_v1.sql#L58-L65)、[75-83](../backend/schema_v1.sql#L75-L83)、[93-104](../backend/schema_v1.sql#L93-L104)、[114-123](../backend/schema_v1.sql#L114-L123)、[169-184](../backend/schema_v1.sql#L169-L184) |
| S18 | 八表NOT NULL完整列清单 | [mvp/backend/schema_v1.sql:13-24](../backend/schema_v1.sql#L13-L24)、[35-46](../backend/schema_v1.sql#L35-L46)、[58-65](../backend/schema_v1.sql#L58-L65)、[75-83](../backend/schema_v1.sql#L75-L83)、[93-104](../backend/schema_v1.sql#L93-L104)、[114-123](../backend/schema_v1.sql#L114-L123)、[169-184](../backend/schema_v1.sql#L169-L184) |
| S19 | 仅两个CHECK、独立UNIQUE为hash及同刻事件；无JSON/枚举/格式额外约束与隐含FK | [mvp/backend/schema_v1.sql:13-201](../backend/schema_v1.sql#L13-L201)，逐一核全部DDL，CHECK仅23/45，显式UNIQUE为15及196-197，FK仅82/175 |
| S20 | 两Repo无覆写入口；UUID由API生成，不是SQL格式CHECK | [mvp/backend/asset_repo.py:9-90](../backend/asset_repo.py#L9-L90)、[mvp/backend/event_store.py:16-77](../backend/event_store.py#L16-L77)、[mvp/backend/schema_v1.sql:139-149](../backend/schema_v1.sql#L139-L149) |
| S21 | 自持FTS列/tokenizer；旧外部内容声明指向不存在的content列 | [mvp/backend/schema_v1.sql:133-137](../backend/schema_v1.sql#L133-L137)、[mvp/tests/fixtures/schema_v1_0.sql:131-138](../tests/fixtures/schema_v1_0.sql#L131-L138)、[13-24](../tests/fixtures/schema_v1_0.sql#L13-L24) |
| S22 | 非NULL blob INSERT trigger、rowid与CAST | [mvp/backend/schema_v1.sql:140-144](../backend/schema_v1.sql#L140-L144) |
| S23 | DELETE trigger只清派生行，非Repo删除API | [mvp/backend/schema_v1.sql:146-148](../backend/schema_v1.sql#L146-L148)、[mvp/backend/asset_repo.py:9-90](../backend/asset_repo.py#L9-L90) |
| S24 | 空blob与NULL边界、list_unindexed仅按NULL、没有UPDATE trigger | [mvp/tests/test_fts.py:33-56](../tests/test_fts.py#L33-L56)、[mvp/backend/asset_repo.py:80-90](../backend/asset_repo.py#L80-L90)、[mvp/backend/schema_v1.sql:139-149](../backend/schema_v1.sql#L139-L149) |
| S25 | 已有库mode=rw及FTS rebuild命令 | [mvp/backend/_db.py:17-19](../backend/_db.py#L17-L19)、[mvp/tests/test_fts.py:41-48](../tests/test_fts.py#L41-L48) |
| S26 | rebuild不从assets补FTS内容、不读file_path | [mvp/backend/schema_v1.sql:133-137](../backend/schema_v1.sql#L133-L137)，自持表；[EVIDENCE的可执行临时库实验](W1D7-EVIDENCE.md#fts-rebuild的能力边界实读)，实读19→18后不回填 |
| S27 | 1.0初始化而非幂等迁移SQL；历史提交197aa5e | [mvp/backend/init_db.py](../backend/init_db.py) 的 init_database、[mvp/backend/schema_v1.sql:26-28](../backend/schema_v1.sql#L26-L28)、[186-187](../backend/schema_v1.sql#L186-L187)，git log --follow实读 |
| S28 | 1.1版本前置、DROP/重建/重灌、历史提交2a8dc18 | [mvp/backend/migrate_fts_v1_1.py:28-63](../backend/migrate_fts_v1_1.py#L28-L63)，版本拒绝44-45，重灌51-54 |
| S29 | 1.2增量表、版本接受条件与无回填，历史提交43343ff | [mvp/backend/migrate_schema_v1_2.py:26-46](../backend/migrate_schema_v1_2.py#L26-L46)、[mvp/backend/schema_v1.sql:169-177](../backend/schema_v1.sql#L169-L177) |
| S30 | 旧两个显式迁移CLI及顺序前置；第三步见S39 | [mvp/backend/migrate_fts_v1_1.py:44-45](../backend/migrate_fts_v1_1.py#L44-L45)、[66-70](../backend/migrate_fts_v1_1.py#L66-L70)、[migrate_schema_v1_2.py:35-37](../backend/migrate_schema_v1_2.py#L35-L37)、[49-53](../backend/migrate_schema_v1_2.py#L49-L53) |
| S31 | 缺库拒绝、单事务回滚、各自支持版本重复运行保持记录 | [mvp/backend/migrate_fts_v1_1.py:35-63](../backend/migrate_fts_v1_1.py#L35-L63)、[migrate_schema_v1_2.py:28-46](../backend/migrate_schema_v1_2.py#L28-L46)、[mvp/tests/test_fts.py:65-110](../tests/test_fts.py#L65-L110)、[test_schema_v1_2.py:38-58](../tests/test_schema_v1_2.py#L38-L58)、[87-116](../tests/test_schema_v1_2.py#L87-L116)、[migrate_schema_v1_3.py:44-79](../backend/migrate_schema_v1_3.py#L44-L79)、[test_schema_v1_3.py:85-104](../tests/test_schema_v1_3.py#L85-L104)、[159-169](../tests/test_schema_v1_3.py#L159-L169) |
| S32 | 导入不填映射/状态，只有eligible缺映射时抛错 | [mvp/backend/import_baseline.py:137-162](../backend/import_baseline.py#L137-L162)、[mvp/backend/frontier17_db.py:31-36](../backend/frontier17_db.py#L31-L36)、[70-72](../backend/frontier17_db.py#L70-L72) |
| S33 | DB允许多原子，适配拒绝全部多原子及eligible词表外 | [mvp/backend/schema_v1.sql:169-176](../backend/schema_v1.sql#L169-L176)、[mvp/backend/frontier17_db.py:55-71](../backend/frontier17_db.py#L55-L71)、[31-36](../backend/frontier17_db.py#L31-L36) |
| S34 | 时间≤T、旧库同刻rowid兜底、撤权延续、空集闭包投影；1.3边界见S40 | [mvp/backend/frontier17_db.py:13-28](../backend/frontier17_db.py#L13-L28)、[mvp/backend/frontier17.py:26-55](../backend/frontier17.py#L26-L55)、[mvp/backend/support_view.py:18-36](../backend/support_view.py#L18-L36) |
| S35 | 旧schema的固定SHA与迁移参考用途 | [mvp/tests/test_fts.py:17](../tests/test_fts.py#L17)、[65-71](../tests/test_fts.py#L65-L71) |
| S36 | 原算法固定SHA与三组循环用途 | [mvp/tests/test_frontier17.py:22-51](../tests/test_frontier17.py#L22-L51)、[72-84](../tests/test_frontier17.py#L72-L84) |
| S37 | 两项-text与CI常量校验 | [.gitattributes:2-3](../../.gitattributes#L2-L3)、[.github/workflows/ci.yml:29-35](../../.github/workflows/ci.yml#L29-L35) |
| S38 | 1.3版本行及同刻同事件唯一索引；重复拒绝、不同事件允许 | [mvp/backend/schema_v1.sql:195-201](../backend/schema_v1.sql#L195-L201)、[mvp/tests/test_schema_v1_3.py:56-82](../tests/test_schema_v1_3.py#L56-L82)、[mvp/backend/init_db.py](../backend/init_db.py) 的 _validate |
| S39 | 仅1.2首次升级；全部冲突先报、事务回滚、无自动去重；1.3重跑先核表及索引的存在性、唯一性、非partial、键列顺序和BINARY排序规则，通过才幂等返回；漂移以ValueError子类SchemaDriftError及[KNOT-E031]拒绝，CLI退出1，不自动修复，版本行、结构与数据保持不变 | [mvp/backend/migrate_schema_v1_3.py](../backend/migrate_schema_v1_3.py)：`migrate_schema`、`SchemaDriftError`及CLI；[mvp/tests/test_schema_v1_3.py](../tests/test_schema_v1_3.py)：`test_migration_preserves_all_rows_and_is_idempotent`、`test_all_duplicate_groups_reported_and_database_unchanged`、`test_wrong_named_index_is_not_silently_accepted`、`test_v1_3_drift_refused_without_changes`、`test_v1_3_missing_snapshot_table_refused_without_changes` |
| S40 | 未迁移1.2同刻重复合法且后写胜；合规1.3库兜底不可达，读取SQL及≤T不变 | [mvp/backend/frontier17_db.py:13-28](../backend/frontier17_db.py#L13-L28)、[mvp/backend/schema_v1.sql:196-197](../backend/schema_v1.sql#L196-L197)、[mvp/tests/test_schema_v1_3.py:188-198](../tests/test_schema_v1_3.py#L188-L198)、[56-82](../tests/test_schema_v1_3.py#L56-L82) |
| S41 | 1.4候选表尾追加source_label/source_members，可空TEXT、无默认值；编号与JSON成员数组、两种NULL语义；atom仍为词表原子；五版本行与新库自验 | [schema_v1.sql](../backend/schema_v1.sql) 的 claims_candidates/版本记录段；[init_db.py](../backend/init_db.py) 的 _validate/init_database；[test_schema_v1_4.py](../tests/test_schema_v1_4.py) 的 test_fresh_migrated_equivalence_preservation_and_rerun |
| S42 | 先判1.4并核两列，后复用1.3前置体检；E031透传、E032漂移拒绝及半成品不采纳；两列与版本行同事务，无业务回填，CLI退出0/1 | [migrate_schema_v1_4.py](../backend/migrate_schema_v1_4.py) 的 migrate_schema/_preflight/_validate/SchemaDriftError及CLI；[test_schema_v1_4.py](../tests/test_schema_v1_4.py) 的 test_refusals_preserve_bytes/test_ddl_and_version_rollback/test_cli_outside_repository |

## IMPORT.md

| 编号 | 断言 | 文件:行 |
|---|---|---|
| I01 | CLI从仓库根、新库初始化拒绝已有目标、源与目标隔离 | [mvp/backend/init_db.py](../backend/init_db.py) 的 init_database/main、[mvp/backend/import_baseline.py:110-116](../backend/import_baseline.py#L110-L116)、[178-189](../backend/import_baseline.py#L178-L189) |
| I02 | 两必传参数；预检后精确查1.1记录，缺则报错、不建库 | [mvp/backend/import_baseline.py:110-123](../backend/import_baseline.py#L110-L123)、[178-189](../backend/import_baseline.py#L178-L189)、[mvp/backend/_db.py:17-19](../backend/_db.py#L17-L19) |
| I03 | 五种后缀映射、小写化、未知类型失败 | [mvp/backend/import_baseline.py:22-26](../backend/import_baseline.py#L22-L26)、[126-127](../backend/import_baseline.py#L126-L127)、[168-169](../backend/import_baseline.py#L168-L169) |
| I04 | 非zip且≤1,000,000B，JSON同样可内嵌 | [mvp/backend/import_baseline.py:21-26](../backend/import_baseline.py#L21-L26)、[135](../backend/import_baseline.py#L135)、[mvp/tests/test_import.py:110-122](../tests/test_import.py#L110-L122) |
| I05 | 原字节SHA/内嵌，不转换编码换行，写前复比 | [mvp/backend/import_baseline.py:33-38](../backend/import_baseline.py#L33-L38)、[128-131](../backend/import_baseline.py#L128-L131)、[146-152](../backend/import_baseline.py#L146-L152) |
| I06 | 外置对象hash路径、NULL blob、不展开zip | [mvp/backend/import_baseline.py:82-105](../backend/import_baseline.py#L82-L105)、[135-149](../backend/import_baseline.py#L135-L149)，处理原文件字节，没有解包调用 |
| I07 | 对象临时写/flush/fsync/硬链接，拒覆盖坏对象 | [mvp/backend/import_baseline.py:87-104](../backend/import_baseline.py#L87-L104)、[mvp/tests/test_import.py:171-180](../tests/test_import.py#L171-L180) |
| I08 | 空blob有行、NULL无行，未索引查询不读外部文件 | [mvp/backend/schema_v1.sql:140-144](../backend/schema_v1.sql#L140-L144)、[mvp/backend/asset_repo.py:80-90](../backend/asset_repo.py#L80-L90)、[mvp/tests/test_fts.py:35-48](../tests/test_fts.py#L35-L48) |
| I09 | UTF-8 manifest每行首空白分hash/path，允许*标记 | [mvp/backend/import_baseline.py:56-73](../backend/import_baseline.py#L56-L73) |
| I10 | 成员/链接/目录覆盖、manifest自身hash及跨读取一致性 | [mvp/backend/import_baseline.py:41-79](../backend/import_baseline.py#L41-L79)、[mvp/tests/test_import.py:208-225](../tests/test_import.py#L208-L225) |
| I11 | snapshot字段、hash+mtime复比、尾部源复核及错误 | [mvp/backend/import_baseline.py:49-52](../backend/import_baseline.py#L49-L52)、[128-131](../backend/import_baseline.py#L128-L131)、[170-175](../backend/import_baseline.py#L170-L175) |
| I12 | 源mtime毫秒/未来拒绝/URI编码/metadata相对path | [mvp/backend/import_baseline.py:132-136](../backend/import_baseline.py#L132-L136)、[146-160](../backend/import_baseline.py#L146-L160) |
| I13 | session复用、单文件成对事务、失败回滚保留既有提交 | [mvp/backend/import_baseline.py:120-162](../backend/import_baseline.py#L120-L162)、[mvp/backend/_db.py:24-55](../backend/_db.py#L24-L55)、[65-78](../backend/_db.py#L65-L78)、[mvp/tests/test_import.py:133-152](../tests/test_import.py#L133-L152) |
| I14 | import事件字段与无映射/状态写入 | [mvp/backend/import_baseline.py:146-162](../backend/import_baseline.py#L146-L162) |
| I15 | content_hash判断与skip，无既有事件修补逻辑 | [mvp/backend/import_baseline.py:137-167](../backend/import_baseline.py#L137-L167) |
| I16 | 对象先发布，事务之后失败可留未引用对象，不删历史对象 | [mvp/backend/import_baseline.py:143-162](../backend/import_baseline.py#L143-L162)、[82-105](../backend/import_baseline.py#L82-L105) |
| I17 | 一行JSON字段、只累计本轮新增索引数 | [mvp/backend/import_baseline.py:117-118](../backend/import_baseline.py#L117-L118)、[163-169](../backend/import_baseline.py#L163-L169)、[188-189](../backend/import_baseline.py#L188-L189) |
| I18 | 受捕获错误仍JSON/退出1；argparse在try之前，非万能错误包装 | [mvp/backend/import_baseline.py:168-189](../backend/import_baseline.py#L168-L189) |
| I19 | MATCH+rowid JOIN、空白列出、非法查询不吞；unicode61配置 | [mvp/backend/asset_repo.py:51-74](../backend/asset_repo.py#L51-L74)、[mvp/backend/schema_v1.sql:133-137](../backend/schema_v1.sql#L133-L137)、[mvp/tests/test_backend.py:40-59](../tests/test_backend.py#L40-L59) |
| I20 | INSERT自动同步、rebuild及1.2不倒跑1.1迁移 | [mvp/backend/schema_v1.sql:140-144](../backend/schema_v1.sql#L140-L144)、[mvp/tests/test_fts.py:41-48](../tests/test_fts.py#L41-L48)、[mvp/backend/migrate_fts_v1_1.py:44-45](../backend/migrate_fts_v1_1.py#L44-L45)，补漏边界见EVIDENCE实验 |
| I21 | 基线22/19+3/22事件/0映射、重跑0/22 | [mvp/tests/test_import.py:59-107](../tests/test_import.py#L59-L107)、[mvp/backend/import_baseline.py:137-167](../backend/import_baseline.py#L137-L167)；真实研究包另按EVIDENCE命令重现 |
| I22 | 数字命令和实跑，不是数据库行数硬约束 | [mvp/tests/test_import.py:59-107](../tests/test_import.py#L59-L107)、[W1D7-EVIDENCE的计数代码](W1D7-EVIDENCE.md#22--193--22事件来源包的临时重现)；schema没有22行上限 |
| I23 | 资产/事件/FTS读回SQL | [mvp/backend/asset_repo.py:76-78](../backend/asset_repo.py#L76-L78)、[mvp/backend/event_store.py:75-77](../backend/event_store.py#L75-L77)、[mvp/tests/test_fts.py:42-44](../tests/test_fts.py#L42-L44) |
| I24 | NULL查询与原名metadata来源、基线3zip | [mvp/backend/asset_repo.py:80-90](../backend/asset_repo.py#L80-L90)、[mvp/backend/import_baseline.py:150-152](../backend/import_baseline.py#L150-L152)、[mvp/tests/test_import.py:79-98](../tests/test_import.py#L79-L98) |
| I25 | 仅修test_cli子进程cwd，未安装业务包或改CLI | [mvp/tests/test_import.py:183-194](../tests/test_import.py#L183-L194)，本轮仅189的cwd参数；[pytest.ini:1-3](../../pytest.ini#L1-L3) |

## README与实跑数字

| 编号 | 断言 | 代码位置与可复核记录 |
|---|---|---|
| R01 | 文档开工的历史基线1ea1dfa、PR #25已合 | 开工时git rev-parse main、gh pr view 25，原始摘要见[实读证据](W1D7-EVIDENCE.md#github状态实读而非由workflow推断保护已开)，不是当前main指针 |
| R02 | Day 7历史schema1.2、八普通表/FTS与显式迁移；当前1.3见S38–S40 | S04～S12、S28～S31，对应schema_v1.sql:13-193及两迁移器 |
| R03 | Repo、carry-forward和稳定支持族已实现 | [mvp/backend/asset_repo.py:9-90](../backend/asset_repo.py#L9-L90)、[event_store.py:16-77](../backend/event_store.py#L16-L77)、[rule_registry.py:8-59](../backend/rule_registry.py#L8-L59)、[frontier17_db.py:13-28](../backend/frontier17_db.py#L13-L28)、[support_view.py:7-36](../backend/support_view.py#L7-L36) |
| R04 | 候选导入22资产/22事件/19+3，不是生产部署 | I21～I24及EVIDENCE的真实来源临时库命令/输出 |
| R05 | 22391组、SCC数字对账，不是assert语句数 | [mvp/tests/test_frontier17.py:22-23](../tests/test_frontier17.py#L22-L23)、[37-46](../tests/test_frontier17.py#L37-L46)、[72-84](../tests/test_frontier17.py#L72-L84)，EVIDENCE保存本轮原输出 |
| R06 | Day 7历史测试69项，三个入口不减用例 | [pytest.ini:1-3](../../pytest.ini#L1-L3)、[mvp/tests/test_import.py:186-194](../tests/test_import.py#L186-L194)，EVIDENCE三命令实际69/69输出；未新增/删减测试 |
| R07 | CI的Python3.12、完整测试和独立字节校验 | [.github/workflows/ci.yml:11-35](../../.github/workflows/ci.yml#L11-L35) |
| R08 | main CI成功且有效规则要求ci | workflow仅证明job命名；远端run与rules必须读API，命令/实际结果见EVIDENCE，未用配置文件冒充保护已开 |
| R09 | 两个文档入口可定位，放mvp/docs而非旧docs | README从这里读的新链接及本卡两个文件；位置偏离记录见EVIDENCE首节 |
| R10 | 实时交付状态查任务卡、独立回执、PR与CI | AGENTS.md的Maker/Checker/不自验收约束及对应交付记录；README不维护本卡推送/合并中的临时状态 |

## CLAIMS（W2D8）

| 编号 | 断言 | 文件＋函数名 |
|---|---|---|
| C01 | 显式1.4、默认dry-run、一致读、单行JSON与0/1退出码，来源分列统计 | [claim_extractor.py](../backend/claim_extractor.py)：extract_claims/_extract/main/_Parser；[test_claims.py](../tests/test_claims.py)：test_all_kinds_atom_mapping_dry_run_and_idempotency/test_cli_errors_are_single_json_and_exit_one/test_cli_dry_run_write_and_outside_cwd/test_schema_v14_required_without_implicit_migration |
| C02 | 只扫内嵌md与file_path zip、URI与数据库相对对象路径、UTF-8 strict、读取与去重计数 | [claim_extractor.py](../backend/claim_extractor.py)：_is_zip/_collect；[test_claims.py](../tests/test_claims.py)：test_non_sources_are_never_scanned/test_actual_importer_root_zip_uri_and_relative_hash_path/test_undecodable_assets_and_members_skipped_individually |
| C03 | D/Q/P/T固定类型与词表原子，T为扩展，编号不写atom | [claim_extractor.py](../backend/claim_extractor.py)：KINDS/LABEL/_scan/_extract；[test_claims.py](../tests/test_claims.py)：test_all_kinds_atom_mapping_dry_run_and_idempotency |
| C04 | 按出现位置压左边界、同分句8字符否定、仅范围端点；裸号忽略，无编号黑名单 | [claim_extractor.py](../backend/claim_extractor.py)：_scan/NEGATION_WORDS/CLAUSE_SEPARATORS；[test_claims.py](../tests/test_claims.py)：test_occurrence_suppression_does_not_blacklist_or_expand/test_negation_exact_window_and_clause_boundaries/test_range_only_suppresses_own_endpoints |
| C05 | 内存包读取、顶层0嵌套≤2、4MiB/8MiB/200硬上限与显式计数；不落盘、不执行、不按成员打开本地文件 | [claim_extractor.py](../backend/claim_extractor.py)：_walk_archive及MAX常量；[test_claims.py](../tests/test_claims.py)：test_zip_members_not_opened_as_local_paths_or_executed/test_depth_limit_accepts_two_nested_levels_and_skips_third/test_member_cap_skips_whole_member_and_continues/test_total_cap_skips_remainder_without_partial_text/test_exact_member_and_total_byte_limits_are_inclusive/test_member_count_cap_reports_skipped_remainder/test_corrupt_archive_is_reported_and_other_assets_continue |
| C06 | 确定uuid5、顶层import事件聚合、成员按内容hash选代表、无概率造值、两种NULL语义 | [claim_extractor.py](../backend/claim_extractor.py)：_collect/_extract；[test_claims.py](../tests/test_claims.py)：test_nested_zip_content_dedup_and_top_asset_provenance/test_all_kinds_atom_mapping_dry_run_and_idempotency |
| C07 | 同Repo单事务、幂等只更新来源两列、用户判断不覆盖、不越权写、冲突ID拒绝 | [claim_extractor.py](../backend/claim_extractor.py)：extract_claims/_extract；[test_claims.py](../tests/test_claims.py)：test_growth_updates_only_provenance_and_preserves_user_judgment/test_batch_transaction_rolls_back_earlier_inserts/test_existing_session_reused_and_nested_transaction_rejected/test_uuid_collision_rejected_instead_of_overwriting_user_data |
| C08 | 原语料110条及52读取/24唯一是独立临时候选库实跑口径，不是硬编码；不填可信状态、不承诺Day10或产品验收 | [CLAIMS.md](CLAIMS.md)：验证边界；对应卡PR实跑读回；[claim_extractor.py](../backend/claim_extractor.py)：_collect/_extract |

## CLAIMS 确认回路（TD03）

| 编号 | 断言 | 文件＋函数名 |
|---|---|---|
| C11 | 显式review_claim及CLI、固定返回字段、schema/候选/决策/词表验证、参数与状态错误单行JSON退出1 | [claim_review.py](../backend/claim_review.py)：review_claim/_review/_vocabulary/main/_Parser；[test_claim_review.py](../tests/test_claim_review.py)：test_invalid_decision_is_zero_write/test_unknown_claim_invalid_atom_and_backdating_are_zero_write/test_cli_parameter_errors_one_json_exit_one/test_cli_success_unknown_claim_and_external_cwd |
| C12 | subject关联、三状态机、重复零写入、唯一确认事件及漂移拒绝 | [claim_review.py](../backend/claim_review.py)：_review/_latest_snapshot；[test_claim_review.py](../tests/test_claim_review.py)：test_same_decision_repeats_are_byte_preserving/test_reject_before_confirmation_has_no_fact_and_repeats_zero_write/test_subject_association_and_no_import_mapping_or_other_claim_writes/test_existing_confirmation_drift_is_refused_not_repaired |
| C13 | 首次确认事件/映射/快照/claim四步；只映射确认事件，evidence_refs为材料链；reject无事件，恢复复用事件，不越权写 | [claim_review.py](../backend/claim_review.py)：_review/_append_snapshot；[test_claim_review.py](../tests/test_claim_review.py)：test_confirm_revoke_silence_restore_full_timeline/test_subject_association_and_no_import_mapping_or_other_claim_writes |
| C14 | conditional_theorem确认前后翻转、撤权粘滞、沉默仍假、显式恢复；保持历史T读回 | [test_claim_review.py](../tests/test_claim_review.py)：test_confirm_revoke_silence_restore_full_timeline；[support_view.py](../backend/support_view.py)：compute_support（只读沿用，未修改） |
| C15 | 单Repo单连接BEGIN IMMEDIATE，由Repo事务上下文唯一提交/回滚；四步失败全部回滚 | [claim_review.py](../backend/claim_review.py)：review_claim；[test_claim_review.py](../tests/test_claim_review.py)：test_one_connection_and_one_owner_with_existing_session/test_injected_failure_rolls_back_every_table_and_file_bytes/test_failed_revoke_and_restore_do_not_change_existing_history |
| C16 | 同刻幂等、相反状态唯一约束拒绝、并发确认只有一事件、非法时间及倒退拒绝，无覆写历史 | [claim_review.py](../backend/claim_review.py)：review_claim/_review/_append_snapshot；[test_claim_review.py](../tests/test_claim_review.py)：test_opposite_decision_same_millisecond_refused_without_rewriting/test_concurrent_same_time_accept_serializes_to_one_fact/test_snapshot_unique_conflict_returns_existing_id_only_for_achieved_state/test_invalid_timestamp_is_zero_write |
| C17 | 确认事实与临时候选库演练分开；本卡不是自动确认、真实业务确认或产品接受 | [CLAIMS.md](CLAIMS.md)：确认与撤权/验证边界；本卡PR原始读回与独立复核 |

## 核对方法

代码位置均有文件内真实行；可用编辑器显示行号逐项看，也可运行：

```sh
git show HEAD:mvp/backend/schema_v1.sql
git diff main..HEAD -- mvp/backend/ mvp/tests/fixtures/
python -m pytest mvp/tests/ -q
```

对GitHub规则、运行状态和来源包行数，必须按EVIDENCE的命令读回；不能仅凭代码映射
推断这些外部/运行态事实。计划及未覆盖项与现状分节，不伪装为已实现断言。
