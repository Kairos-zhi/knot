# 规则候选抽取（W2D8）

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
本卡不提供可信快照生产者、不填 event_atom_map，不触及 Day 10 数据源决策，也不据此宣称产品验收。[C08]
