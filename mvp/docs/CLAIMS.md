# 规则候选抽取、确认与支持视图

入口为 [claim_extractor.py](../backend/claim_extractor.py) 的 `extract_claims(repo, *, write=False)`。
需要显式已有的 schema 1.4 数据库；不初始化、不迁移，不调模型或网络。
人和 Agent 共用候选表与此操作，抽取结果仍是未核验候选，不是已确认事实。[C01]

```sh
python -m mvp.backend.claim_extractor --db candidate/knot.db
python -m mvp.backend.claim_extractor --db candidate/knot.db --write
```

默认 dry-run，只读一致快照，返回预计新增／更新／不变的数量；`write=True` 才写。
CLI 的 stdout 为单行 JSON，成功退出 0，参数／库／文件错误退出 1。
`counts` 按 claim_type 计去重候选，`inserted`／`updated`／`unchanged` 是本次计划或实际动作。
`sources.md` 与 `sources.zip` 分别报告同样的计数和压制、解码、解包边界计数。
同一候选可同时由 md 和 zip 支持，分来源数不保证与全局数相加相等。[C01][C02]

## 来源与词表

只扫 `media_type='text/markdown' AND content_blob IS NOT NULL` 的内嵌正文，
以及有 `file_path`、`source_uri` 末段或存储路径后缀为 `.zip` 的顶层资产。
导入器的 `file://root.zip`、百分号编码 URI 及相对数据库目录的无后缀对象路径均支持；
相对对象路径以 `repo.db_path.parent` 为基准。外置 md、Python、JSON 和 manifest 不扫。
正文均 UTF-8 strict 解码；每次失败计入该来源的 `undecodable`，跳过该份正文，继续其余来源。[C02]

| 前缀 | claim_type | atom |
|---|---|---|
| `D-##` | decision | decision |
| `Q##-##` | question | open_question |
| `P##-##` | counterexample | counterexample |
| `T##-##` | relation | conditional_theorem |

**T 是扩展项，Roadmap 原文仅 D/P/Q，保留 T 已由之拍板。**
`atom` 保存词表原子，抽取编号保存在 `source_label`；不从自由文本猜映射或补编号。
完整编号的两段数字各为 1–2 位，不规范化补零；编号前不能是 ASCII 字母或数字，
编号末尾不能继续接数字。[C03]

## 按出现位置压制

常量为 `LABEL`、`LEFT`、`RANGE`、`NEGATION_WORDS`、`CLAUSE_SEPARATORS`、`NEGATION`、`BARE`。
压制只针对当前出现位置；其它位置出现相同编号仍可建候选，不按编号维护黑名单。[C04]

| 规则 | 判据与计数 |
|---|---|
| R1 左边界 | 前一字符 `[A-Za-z0-9]` 时忽略并计 `suppressed_left_boundary`，如 `ALL ROUND-16`／`ALL ROUND-17` 中的伪 D 编号 |
| R2 邻近否定 | 编号前同一分句内，关键词末尾距编号开头最多 8 字符（含空格），计 `suppressed_negation`；不按整行压制 |
| R3 范围 | `D-\d+\s*[～~—]\s*D-\d+` 中的端点各计 `suppressed_range`；不展开，也不牵连同行其它编号 |
| 裸号 | `P14～P17`、`T10～T17`、`Q18（三个义务）`、`P16：最小反例` 等族级引用不建行，按裸号出现计 `bare_ignored` |

R2 关键词恰为：`不新增`、`不得`、`禁止`、`不做`、`不再`、`取消`、`放弃`。
分句分隔符恰为：`。；;｜|` 与换行。R3 优先于 R2；被 R1 拦下的不再计 R2/R3。
例如 `不新增 D-48；D-02` 只压 D-48；`继承 v0.3 D-01～D-47，D-05` 只压两个端点。
真实语料其它正文的 D-01、D-47 保留；D-48 仅见于拒绝新增位置，不产生候选。[C04]

## 内存解包边界

顶层资产文件只读入内存，使用 `ZipFile(BytesIO(...))`；包内只读 `.md` 和用于递归的 `.zip`，
后缀不区分大小写。不调用 extract、不写临时文件、不执行成员。
成员路径仅作为逻辑字符串，从不拼成本地路径打开；嵌套层级用 `!` 连接。[C05]

| 模块常量 | 值与边界行为 |
|---|---|
| `MAX_DEPTH` | **2，顶层为 0**；最多嵌套两层，第三层包不读，按跳过包计 `depth_exceeded` |
| `MAX_MEMBER_BYTES` | 4 MiB（4,194,304 bytes），适用于 md 和嵌套 zip；超限整成员跳过，计 `oversize_member` |
| `MAX_ARCHIVE_BYTES` | 8 MiB（8,388,608 bytes）／每个包，累计已读相关成员的解压字节，含嵌套 zip 文件自身字节；即将超限时停止此包余项，计一次 `oversize_archive` |
| `MAX_MEMBERS` | 200 个非目录条目／包，包括不读取正文的后缀；超限停止此包余项，计一次 `too_many_members` |

**深度口径经之纠正为顶层 0**，取代任务卡初稿的“顶层 1”；这样真实语料的三级包
对应 0/1/2，可读 52 份 md，唯一内容 24 份。四个边界均含等于，不静默截断正文。
每个包独立累计总量；跳过深度／单成员上限的成员不计入已读总量。
读取前核 ZIP 声明大小，同时对实际读取做 `MAX_MEMBER_BYTES+1` 的有界检查。
损坏、加密或不支持的包计 `archive_errors` 并停止该包剩余处理；已读有效正文保留，
其它顶层资产继续。顶层资产文件不可读等文件错误使本次操作失败，写事务整体回滚。[C05]

`md_members_read` 是实际读出的包内 md 出现次数；`unique_md_contents` 是读出内容的 sha256 去重数，
二者均在 UTF-8 解码前统计，因此无效正文也计读取／唯一内容，但不会建候选。
重复内容每次出现都参与压制计数（保证与测量脚本口径一致），候选和成员溯源另行去重。[C02][C05]

## 写入、溯源与幂等

一个 `(claim_type, source_label)` 对应一条规则抽取候选。
`claim_id=uuid5(NAMESPACE_URL, f"knot:claim:{claim_type}:{source_label}")`，确定性重跑。
schema 的“UUID v4”只是注释，DDL 没有该 CHECK；此处明确使用 uuid5。[C06]

- `support_sources`：所有支持的**顶层资产**对应的 import 事件 ID，升序去重 JSON 数组。嵌套包不是资产，不伪造事件；资产无 import 事件时该部分贡献为空。
- `source_members`：支持此候选的 zip 内容按 sha256 去重，每份内容从所有出现路径中选字典序最小的逻辑路径，数组升序。多资产引用相同内容保留全部顶层事件，但只留一条代表成员。
- `source_label` NULL 表示无编号来源；当前抽取器只产生带编号候选，不写 NULL。
- `source_members` NULL 表示来源就是资产本身；纯内嵌 md 候选为 NULL，存在 zip 支持时记录成员数组。
- `extraction_method='rule_based'`，`confidence` 留 NULL；新候选由 schema 默认 `unverified=1`，`user_response`／`reviewed_at` 留 NULL。[C06]

已有确定 ID 且两份来源 JSON 字符串相同，完全不动并计 `unchanged`；不同只更新
`support_sources`／`source_members`。不会改 `user_response`、`unverified`、`reviewed_at`、
`proposed_at` 或其它字段。来源数组按当前扫描结果重新聚合，不追加陈旧来源。
确定 ID 若撞到不同类型／编号／原子／抽取方式的既有行，报错并回滚，不接管该行。[C06][C07]

`write=True` 在**同一 Repo 实例**的 `session()` 内，用 `with repo.transaction()` 包住
扫描与整批写入。已有 session 会复用；已有活动 transaction 则拒绝，避免两个事务所有者。
任意写入失败整批回滚。不写 `assets`、`history_events`、`eligible_snapshots`、`event_atom_map`。[C07]

## 验证边界

真实 v0.4 语料在独立候选库验证：D47／Q13／P28／T22，共 110；md 压制为左边界4、否定1、
范围2、裸号12，zip 范围10、裸号28。D-01 对应 3 事件／5 成员，D-47 对应 1／1，
T14-01 对应 6 事件／NULL；D-48 无行。二次写入 0 新增、0 更新、110 不变。
这些数字是指定语料证据，不是函数对其它输入的硬编码要求。[C08]

程序化回归见 [test_claims.py](../tests/test_claims.py)，真实语料实跑与 CI 另附本卡 PR 证据。
上述 W2D8 抽取不提供可信快照生产者、不填 event_atom_map，不据此宣称产品验收；
下述 TD03 增加用户主动触发的确认生产者。[C08][C11]

## 确认与撤权（TD03）

[claim_review.py](../backend/claim_review.py) 的
`review_claim(repo, claim_id, *, decision, now=None)` 只响应显式 `accept`／`reject`。
不是自动确认或批量确认；没有后台任务、模型调用或定时器。
要求已有 schema 1.4；未知候选、非法决策、候选 atom 不在当前活动 version 1 词表（规则头与体的并集）
均以 ValueError 拒绝，不写任何表。[C11]

```sh
python -m mvp.backend.claim_review --db candidate/knot.db --claim CLAIM_ID --accept
python -m mvp.backend.claim_review --db candidate/knot.db --claim CLAIM_ID --reject
```

CLI stdout 单行 JSON，成功退出 0，参数／库／状态错误退出 1。
成功返回固定六字段：`claim_id`、`decision`、`status`、`event_id`、`snapshot_id`、`atom`。
未确认就拒绝没有事件和快照，对应两个 ID 均为 NULL。[C11]

### 状态机与写入

| 当前状态 | accept | reject |
|---|---|---|
| 无确认事件 | 首次写三行及 claim 更新，`confirmed` | 只更新 claim，`revoked`；已拒绝则 `already_rejected`、零写入 |
| 有确认事件且最后快照有效 | `already_accepted`，零写入 | 只追加撤权快照及 claim 更新，`revoked` |
| 有确认事件且最后快照已撤权 | 只追加恢复快照及 claim 更新，`restored` | `already_rejected`，零写入 |

“零写入”包括不刷新 `reviewed_at`。关联键是
`history_events.event_type='user_confirm' AND subject=claim_id`，不靠 label 或 atom 猜关联。
本回路每个候选只创建一个确认事件，恢复不另造事件。
若已有多个确认事件、映射不是恰好该 atom 一行、或缺少有效快照，拒绝并报告，不自动修复。[C12]

| 首次 accept 的四步 | 内容 |
|---|---|
| history_events 新增 | UUID v4；`event_type='user_confirm'`、`subject=claim_id`、`source='user_review'`、`event_time=recorded_at=now`；`evidence_refs` 原样保留 claim.support_sources；payload 含 claim_type/source_label/atom/decision=accept |
| event_atom_map 新增 | 只映射此确认 event_id → claim.atom 一行，`origin='user_confirm'`、`created_at=now` |
| eligible_snapshots 新增 | 新 UUID；`snapshot_time=now`、该确认 event_id、`is_eligible=1`、`trust_level='trusted'`、`reason='claim <label> accepted'` |
| claims_candidates 更新 | `unverified=0`、`user_response='accept'`、`reviewed_at=now`，其余字段不动 |

reject 从不新建 history_events 或映射；此前确认过且有效时，仅追加该事件的
`is_eligible=0, trust_level='revoked', reason='claim <label> rejected'` 快照。
claim 更新为 `unverified=1, user_response='reject', reviewed_at=now`。
未确认过时只更新这三列，没有快照。恢复显式追加 `is_eligible=1, trust_level='trusted'`
的新快照，并将 claim 改回 accept 的三列；旧事件、映射及快照不覆写、不删除。[C12][C13]

### I-02、carry-forward 与支持族

**映射的是确认事件，不是 import 事件。** 文件存在不能证明定理成立：材料只通过
`evidence_refs` 提供证据链，不直接作为可信事实进入 Horn 计算。
确认事件只映射一个原子，与 Frontier17 的一事件一原子约束一致。
资产、import 事件和其它候选不修改。[C13]

以 T17-01／`conditional_theorem` 为例，确认前为 `false/[]`；确认后
`compute_support(conn, now)` 为 `true/[[confirm_event_id]]`。
撤权后为 false，取更晚 T 而不新增行仍为 false；沉默不改变状态。
再确认必须新增有效快照，才恢复 true；历史 T 的读回仍保持撤权。
这个翻转示例不泛化到所有原子：已有空支持的无条件可达原子本就可能为 true。[C14]

### 事务、时间与同刻冲突

`review_claim` 复用单个 Repo 实例：必要时开一次 `session()`，
`with repo.transaction()` 发起 BEGIN IMMEDIATE，包住读取与四步写入；
**只有该 Repo 的事务上下文提交或回滚**，没有另开 EventStore／AssetRepo 连接。
已有 session 会复用，已有活动 transaction 则拒绝，避免嵌套事务所有者。
事件、映射、快照或 claim 更新任一步失败，整批回滚。[C15]

`now` 可注入非负 SQLite 64 位整数毫秒；bool、非整数、负值及溢出值拒绝。
缺省在取得写锁后读当前毫秒。既有确认事件的时间不能回退到已有事件／快照之前。
`(snapshot_time,event_id)` 唯一索引保持不变：同毫秒同状态重试直接幂等；
若插入冲突后发现最新同刻状态已达成，也返回已有 snapshot_id 与 `already_*`。
同毫秒的相反状态冲突报错，须用更晚 now 重试；不偷偷挪时间、不 INSERT OR REPLACE、
不删索引或历史行。[C15][C16]

程序化验证见 [test_claim_review.py](../tests/test_claim_review.py)：确认／撤权／沉默／恢复的
support 输出、三表读回、幂等字节、五个 subject 反查、并发同刻确认、冲突拒绝、
故障回滚及 CLI。真实语料仅在独立候选库演练，不替之确认真实业务候选；
完整产品接受与 Day 10 后续接口仍分别验收。[C17]

## 候选级支持视图（W2D10）

[claim_support.py](../backend/claim_support.py) 提供
`claim_support(conn, claim_id, *, at)` 与
`claim_support_many(conn, *, at, claim_ids=None, status=None)`。
候选级真相只看 `subject=claim_id` 的 `user_confirm` 事件和截至并包含 T 的最新
`eligible_snapshots` 行；`user_response`、`unverified` 的手工标记不能代替确认事件。[C18]

| 确认事件与快照 | status | boolean | minimal_roots |
|---|---|---|---|
| 没有确认事件 | unconfirmed | false | `[]` |
| 有且仅一个确认事件，≤T 最新行 is_eligible=1 | confirmed | true | `[[event_id]]` |
| 有且仅一个确认事件，≤T 最新行 is_eligible=0 | revoked | false | `[]` |
| 有确认事件，但≤T 没有快照 | 报错，视作数据缺陷 | — | — |

同一候选多确认事件报错；非法快照值、确认映射缺失或不等于候选唯一 atom、词表外
atom 也报错，不猜测、不修复。已有确认发生在 T 之后且 T 前没有快照时，仍按上表报错。
撤权采用 carry-forward：撤权时刻及后续无新行的时刻都为 revoked；恢复必须由
`review_claim(..., decision='accept')` 显式写新快照，根仍是原确认事件。[C19]

每条输出包含 `claim_id/source_label/atom/at/status/boolean/minimal_roots/atom_view`。
`atom_view` 原样取自既有 `compute_support(conn, at)['atoms'][atom]`，是旁证，
**不得用它反推候选 boolean**。相同 atom 的候选只有各自确认才能为真。[C18]

任务卡所载 110 条真实语料候选分布为 decision 47／counterexample 28／
conditional_theorem 22／open_question 13。未确认任何候选时，decision、counterexample、
open_question 已无条件可达（true／`[[]]`）；conditional_theorem 为 false／`[]`。
确认 D-01 前后，decision 原子视图都为 true／`[[]]`，但候选真值只有 D-01 翻转；
不能因此把全部 47 条 decision 都报成已确认。确认 T17-01 后 T17-02 仍未确认，
即使两者 atom_view 都为 true。本卡回归用合成标签语料复现上述分布；这不构成真实
业务确认或产品验收。[C18][C20]

批量返回 `{"at": T, "counts": {"confirmed": ..., "revoked": ..., "unconfirmed": ...},
"claims": [...]}`。`claim_ids=None` 表示全量，空列表返回空集，未知 ID 报错，重复 ID
去重；`status` 过滤三个状态之一。counts 统计两个过滤条件之后返回的候选。
claims 按 source_label 升序，同编号以 claim_id 打破平局，NULL 编号排最前；
同库同 T 结果的 JSON 字节稳定。[C20]

函数复用调用者传入的唯一连接：无事务时拥有一个 `BEGIN` 读事务，并在成功／失败后
`ROLLBACK` 释放；已有事务时参与，不提交也不回滚调用者事务。所有候选、事件、快照、
映射和 Horn 输入在同一数据库视图中读取，不写表、不缓存、不新建库或派生表。
函数不改变连接 row_factory；只读连接约束由调用者配置，CLI 明确用 `mode=ro`。[C21]

```sh
python -m mvp.backend.claim_support --db candidate/knot.db --at 1000
python -m mvp.backend.claim_support --db candidate/knot.db --at 1000 --claim <claim_id>
python -m mvp.backend.claim_support --db candidate/knot.db --at 1000 --only unconfirmed
```

CLI 单候选输出单个对象，批量输出上述对象；stdout 单行 JSON，成功 0，参数／库错误 1，
失败只输出 error 对象，没有部分结果。`--only` 仅供批量模式，不能和 `--claim` 同用。
`at` 必须为非负 SQLite 整数（0～2^63−1），无墙钟依赖；此处业务时间条件并不代替
数据库一致读事务。程序化验证见 [test_claim_support.py](../tests/test_claim_support.py)。[C22]
