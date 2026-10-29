# HTTP 契约 v1 定稿

## C2 实现边界

本地 HTTP 传输读取路由正本，绑定 loopback，复用既有查询／review／trace 业务模块。bundle.create 与 bundle.export 尚未实现，固定返回 COMMAND_NOT_ALLOWED，detail.reason=not_implemented_day16；/jobs/{job_id} 仅留路由，未知 ID 返回 NOT_FOUND，不伪造 job。202 与 job 生命周期随 Day 16 交付。SSE 文件日志与 SQLite 无跨介质原子提交，pending 意图未完成时明确阻断写入和重启，须人工对账；不自动补写事实。运行方式与 selfcheck 见 HTTP.md。

## v1.4：命令结果三态与 event_id 可空

CommandResult 增加必填 status：confirmed / revoked / restored / already_accepted / already_rejected。202 要求 job_id 非空、event_id 为 null；200 要求 job_id 为 null。event_id 非空表示涉及历史确认事件（confirmed / restored，以及撤销已有确认）；event_id 为 null 表示仅候选状态变更（revoked）或幂等无变化（already_*），由 status 解释。依 I-02，候选不等于事实：拒绝从未确认的候选只更新 claims_candidates，不写 history_events，不为传输层伪造事实事件。

两份 v1.4 源逐字节复制：schema.json SHA256 `4a8175d8272788d1206fcace13b4d9c7c2b6cbd07b953afb5d5fbd579babd59d`；endpoints.json SHA256 `cfb2a314abf3476d64c3e1decaf2b6ef8dc75f8bfb049d5aa93459c2971a11f6`。以下保留 C1 历史定稿记录。

本次 C1 以锁定的 v1.3-draft 定稿：[v1/schema.json](v1/schema.json) 是 JSON 形状正本，[v1/endpoints.json](v1/endpoints.json) 是路由与参数正本。`contract_version = 1`，采用 JSON Schema draft 2020-12；保留源文件的 draft 标题。定稿指本卡规范版本锁定，不表示已合并、服务已实现或产品已接受。

## 来源与偏离

来源：任务卡 `KNOT-MVP-HTTP-CONTRACT-001`、C1 修正轮 r3 及其两份 v1.3-draft 附录。逐字节复制后的 SHA256：

- schema.json：`ccc315c64af924ca961d0866f8093484c1e721c14b07811300fdce9fee2244cb`
- endpoints.json：`d1c38899614c4939cd67c058a17d643f9fd3205cf4f23716bdc24a8afc9f6565`

相对锁定版本零偏离。此前各轮锁定值均已作废，不保留旧 JSON 副本；不修改业务库 schema。

## 端点表

下表对齐 endpoints.json 的 10 条路由；C2 路由表必须与它 1:1。成功信封逐条按 envelope 指定：plain 用 OkEnvelope，timed 的三条路由用 OkEnvelopeTimed，viewed 的资产端点用 OkEnvelopeViewed；失败用 ErrorEnvelope。`value` 按响应定义另行校验，根信封不自动约束端点 payload。SSE 数据为 ChangeEvent。参数默认、状态码、错误码以路由正本为准。

| 方法 | 端点 | 参数／响应定义 |
|---|---|---|
| GET | `/contract` | ContractInfo：contract_version、schema_sha256；可选 endpoints_sha256 |
| GET | `/health` | Health |
| GET | `/snapshot` | `as_of, view, rule_version` → Snapshot |
| GET | `/claims` | `as_of, status, atom, limit, cursor` → ClaimList |
| GET | `/claims/{claim_id}` | `as_of, view=boolean\|roots` → Claim；candidate_level 与 atom_level 必填、并排 |
| GET | `/assets/{asset_id}` | `view=meta\|content`（默认 meta）→ AssetMeta / AssetContent；信封回显对应档位 |
| GET | `/trace/{claim_id}` | `max_depth` 默认 5 → Trace |
| GET | `/events` | `since=<seq>` → SSE ChangeEvent |
| POST | `/commands` | CommandRequest → CommandResult；异步 HTTP 202 + job_id |
| GET | `/jobs/{job_id}` | Job：pending / running / done / failed |

## 写白名单与错误码

仅允许 `claim.confirm`、`claim.revoke`、`claim.restore`、`bundle.create`、`bundle.export`。
其他命令为 `COMMAND_NOT_ALLOWED`；PUT / PATCH / DELETE 一律 HTTP 405。
没有通用写入口，不提供整表覆盖。命令必须调用已有业务模块，actor 由 token 映射，source 由服务端判定；不能信任请求体自报身份。

错误码封闭集（与 Error.code 枚举一致，新增即升版）：

- `BAD_REQUEST`
- `NOT_FOUND`
- `UNAUTHORIZED`
- `FORBIDDEN_VIEW`
- `METHOD_NOT_ALLOWED`
- `COMMAND_NOT_ALLOWED`
- `CONTRACT_VERSION_UNSUPPORTED`
- `SCHEMA_VERSION_UNSUPPORTED`
- `TRACE_BROKEN`
- `TRACE_CYCLE`
- `TRACE_DEPTH_EXCEEDED`
- `BAD_AS_OF`
- `SERVER_BUSY`
- `INTERNAL`

trace 断链、成环、超深度分别返回对应错误，不返回半截路径，不统归 INTERNAL。

## 版本规则

同版本只许新增可选字段；删除、改名、改类型一律 `contract_version + 1`。新增错误码也必须升版。
前端读取 `/contract` 比较版本及 schema_sha256，不匹配则拒绝渲染，不静默降级。
数据库 schema_version 与 HTTP contract_version 分开，不互相推断。
信封类型是契约的一部分，C2 不许自选。

## v1.1 / v1.2 修订沿革与五条缺口处置

以下为定稿前的修订，不是同一已发布版本的兼容变更；19 个定义及 10 条路由以本次锁定件为准。

| 原缺口 | 已定处置 |
|---|---|
| ① AtomSupport 必填 minimal_roots 与 boolean 档冲突；Snapshot.view 不含 content | v1.1：minimal_roots 改可选；Snapshot.view 仍限 boolean/roots，description 明确 content 只属于资产端点。 |
| ② 资产 meta/content 在信封无对应 | v1.2：信封 view 为四档阶梯 boolean → roots → meta → content；meta 是资产元数据档，不含正文。 |
| ③ 二进制 content=null + path 与原类型／封闭属性冲突 | v1.1：content 可 null、path 进入 properties；if/then/else 要求 encoding=none 时必须含 path 且 content=null，其他编码 content 为 string。 |
| ④ as_of/view 可选，无法强制回显 | v1.2：新增 OkEnvelopeTimed，强制整数 as_of；v1.3 再强制 view，并新增 OkEnvelopeViewed 强制资产端点回显 view。信封类型由 endpoints.json 的 envelope 逐条指定。 |
| ⑤ 只有 payload 形状，无路由与参数 | v1.2：新增 endpoints.json，含方法、路径、参数、响应定义、错误码、状态码与 timed 标记；C2 逐条一致。 |

v1.2 同时将 Claim.candidate_level / atom_level 改为必填，新增 ContractInfo 作为 /contract 响应定义。以上五项处置已确定，不再挂为规范未决。

## v1.3 修订沿革

OkEnvelopeTimed.required 增加 view，三个 timed 端点必须同时回显整数 as_of 与 view。新增 OkEnvelopeViewed，用于 `/assets/{asset_id}`，强制 view 而不强制 as_of。endpoints.json 顶层增加 ok_viewed 映射，10 条路由各自以 envelope 指定 plain / timed / viewed，C2 不得根据 as_of 猜选信封。这些仍属定稿前修订，contract_version 保持 1。

## 已知边界与后续验证

CommandRequest.args 保持开放 object；Job.result 保持开放 object 或 null。业务载荷由已有实现模块定义，本卡不自造内部约束。

Schema 只校验结构：AtomSupport 无 view 上下文，boolean 不带来源、roots 必带来源以及信封 view 与实际内容一致，仍需 C2 行为验证。AssetContent.path 允许 null，未强制相对路径格式；ContractInfo 哈希是 string，未强制十六进制格式；CommandResult 的 event_id/job_id 互斥非空也由 C2 按路由语义校验。均保留锁定源，不扩写 schema。

C1 不证明 HTTP 路由、鉴权、时间语义、SSE、作业、只读性、单实例锁或真实 /contract 哈希响应。C2 另卡实施，本卡不写服务端。

## v1.5：异步受理状态 queued

CommandResult.status 增加 queued。202 固定为 status=queued、job_id 非空、event_id=null；受理不等于完成，完成结果看 Job。200 的 job_id=null；event_id 非空时 status 属于 confirmed/restored/revoked，event_id=null 时由 revoked/already_*/queued 解释。不能借用 confirmed（已确认事实）；pending 属于 Job 工单状态而非命令结论；accepted 与 already_accepted 的既有语义撞车。Job.status 仍仅 pending → running → done|failed。两份 JSON 从指定 v1.5 源逐字节复制并核验 SHA256，未格式化。
