# Knot 本地 HTTP 契约 v1

本页是前端接入的人读说明。JSON 形状来源是 [schema.json](../contract/v1/schema.json)，路由与参数正本是 [endpoints.json](../contract/v1/endpoints.json)，版本与已知边界见 [CHANGELOG](../contract/CHANGELOG.md)。C2 提供本地传输实现，验证限于合成临时库；生产部署及产品接受另行核定。

## 端点与信封

| 方法 | 端点 | 输入与输出 |
|---|---|---|
| GET | `/contract` | ContractInfo：contract_version + 落盘 schema 原始字节的 schema_sha256；可选 endpoints_sha256 |
| GET | `/health` | Health：status、contract_version、schema_version、read_only、uptime_s；目标还含 seq、db_path_sha256，不回真实库路径 |
| GET | `/snapshot` | `as_of, view, rule_version` → Snapshot（atoms + counts） |
| GET | `/claims` | `as_of, status, atom, limit, cursor` → ClaimList（items + next_cursor） |
| GET | `/claims/{claim_id}` | `as_of, view=boolean\|roots` → Claim；candidate_level 与 atom_level 必填、分别展示，不从原子支持反推候选确认 |
| GET | `/assets/{asset_id}` | `view=meta\|content`（默认 meta）→ AssetMeta / AssetContent；信封回显对应 meta / content |
| GET | `/asset-search` | 必填 `q`，可选 `limit=1…20`（默认 10）→ AssetSearchResult |
| GET | `/explorations` | 可选 `limit=1…20`（默认 20）→ ExplorationList |
| GET | `/explorations/{exploration_id}` | 可选正整数 `revision`，默认当前修订 → ExplorationCheckpoint |
| POST | `/exploration-saves` | ExplorationSave → ExplorationReceipt |
| GET | `/trace/{claim_id}` | `max_depth` 默认 5 → Trace；断链／成环／超深度分别报 TRACE_BROKEN / TRACE_CYCLE / TRACE_DEPTH_EXCEEDED |
| GET | `/events` | `since=<seq>` → SSE ChangeEvent；seq 持久递增，重启不归零，重放不重复 |
| POST | `/commands` | CommandRequest → 同步 CommandResult.event_id；异步 HTTP 202 + job_id |
| GET | `/jobs/{job_id}` | Job；pending / running / done / failed，轮询完成后读取结果 |

JSON 成功信封为 `{contract_version: 1, ok: true, value: ...}`，失败信封为 `{contract_version: 1, ok: false, error: {code, message, detail?}}`。
端点的 value 必须按对应 `$defs` 校验，根信封自身不限制 value 内容；SSE 的数据形状为 ChangeEvent。
前端先读 `/contract`，版本或哈希不匹配则拒渲染；库版本另以 schema_version 表达。

## as_of：本次读实际采用的时间坐标

`as_of` 是 Unix 毫秒整数，可选，默认服务端 now。支持 as_of 的端点**必须回显服务端实际使用值**：省略时回显采样得到的 now，显式过去值则回显同值；未来时间必须报 `BAD_AS_OF`，不得截断到 now 或悄悄忽略。
例如查询 T 时，支持族／eligible 状态按截至并包含 T 的快照计算；不是拿当前状态再贴一个历史时间标签。该业务时间参数也不替代 SQLite 的一致读事务。

信封类型由 endpoints.json 的 `envelope` 逐条指定：`/snapshot`、`/claims`、`/claims/{claim_id}` 三个 timed 端点用 OkEnvelopeTimed，整数 as_of 与 view 均必填；`/assets/{asset_id}` 用 OkEnvelopeViewed，view 必填，as_of 可省略；其余用 OkEnvelope（`/events` 的 SSE 数据仍为 ChangeEvent）。不支持时间坐标的端点若回显 as_of 则使用 null。实际时间采样、历史计算与未来值拒绝由 C2 真实服务测试验证。

## view：I-05 授权分层

信封采用四档阶梯 `boolean → roots → meta → content`，各端点按路由正本限制可用档位。

| 档位 | 允许返回 |
|---|---|
| boolean | atom_level 只给真假；candidate_level 按 v1.9 保留自身 boolean/minimal_roots；不含正文 |
| roots（默认） | 给真假与来源事件 ID 的 minimal_roots；不得返回正文 |
| meta（资产端点默认） | 资产元数据（AssetMeta），不含正文；信封 view=meta |
| content | 经该档授权才返回正文 |

服务端执行授权并在信封回显实际 view；UI 隐藏字段不能替代服务端分层。设有 `KNOT_TOKEN` 时 content 档须 token；未设时 loopback 全开，这是任务卡规定的 v1 临时态。token 映射 actor，source 一律服务端判定，请求体不能自报可信身份。

AtomSupport.minimal_roots 已改可选，以支持 boolean 档省略来源；roots 档必须有来源仍由 C2 按实际 view 检查。Snapshot.view 保持 boolean/roots 两档；content 只属于资产端点。二进制资产使用 `content=null`、`encoding=none` 并必须含 path；该条件已由 AssetContent 的 if/then/else 表达。`/snapshot`、`/claims`、`/claims/{claim_id}` 用 OkEnvelopeTimed，`/assets/{asset_id}` 用 OkEnvelopeViewed，两类均强制 view；只有这两类之外使用 OkEnvelope 的端点可省 view。实际档位与授权内容一致性由 C2 真实服务测试验证。

`GET /assets/{asset_id}?view=content&require_reader=true` 要求服务处于配置身份模式，Bearer token 解析到的 actor 须有该资产的 reader 授权。单用户开放态、无效 token、缺少授权或 reader 表均返回 `FORBIDDEN_VIEW`。参数仅接受字面值 `true`，与其他 view 搭配或重复传入时返回 `BAD_REQUEST`。省略参数时沿用既有授权语义。

`GET /asset-search` 要求配置身份、有效 Bearer token 和 reader 表。仅搜索当前 actor 有 reader 授权、可通过短文本读取校验的内嵌正文。查询最多 128 UTF-8 字节、8 个空白分隔词，按 Unicode casefold 后的字面子串逐词匹配，标点按原样处理。控制字符、非法 UTF-8、当前 token 和有限凭据标记返回 `BAD_REQUEST`。授权结果按导入时间与行 ID 倒序，返回首批 `asset_id`、`content_hash`、`media_type` 及 `has_more`。搜索最多检查 1000 个授权候选，一秒预算内无法确定首批结果时返回 `SERVER_BUSY` / 503，`detail.reason=search_limit`，无部分结果。

## event_time 与 recorded_at：两条时间轴

`event_time` 表示事件发生时间；`recorded_at` 表示系统记录时间，二者均为 Unix 毫秒，不能在协议层重命名、合并成一个 timestamp 或互相代填。例如历史导入可发生于 1000、记录于 2000，两值应分别保留。EventStore 默认未提供 event_time 时才采用当前 recorded_at，并拒绝未来事件；数据库约束 recorded_at >= event_time。

TracePathItem 同时要求这两个字段。as_of 是查询坐标，ChangeEvent.ts 是 SSE 通知时间字段，seq 是增量序号；它们均不应冒充事件的上述两条时间轴。状态读取继续复用既有 support_view / claim_support 的快照语义，不在 HTTP 层另写时间判定。

## 写入与实现边界

停点接口要求配置身份和有效 Bearer token。服务解析 actor，写请求只接受至多 128 KiB 的严格 UTF-8 JSON。调用方提供探索 UUID、幂等 UUID、预期版本和全量有序引用。版本零用于创建。成功或同键同请求重放均返回不含笔记的收据。版本或键冲突返回 409，未知或其他所有者对象返回 404。读取重核当前 reader。失效引用保留锚点，隐藏对应理由与停点说明。有限凭据标记和本次 token 触发写入拒绝或读回抑制。停点修订在 SQLite 中原子追加，独立于下述旧命令和全局事件流。

服务进入只读或停止时，停点保存及同键重放均在写入前返回 409 `SERVER_BUSY`，原因 `server_read_only`。状态恢复后可携原键提交。

`/commands` 白名单包含 claim.confirm / claim.revoke / claim.restore / bundle.create / bundle.export。其他命令返回 COMMAND_NOT_ALLOWED，PUT/PATCH/DELETE 返回 HTTP 405。错误码完整封闭集与版本规则见 CHANGELOG。

C2 实现为 stdlib http.server + threading，绑定 127.0.0.1；默认端口 7318，`.knot/http.port` 可改，KNOT_PORT 覆盖。单实例锁 `.knot/http.lock`，冲突明确 SERVER_BUSY；SSE seq 落盘 `.knot/http.seq`。不得对外绑定或 CORS 通配放行，业务逻辑复用现有模块。

## 怎么起

在仓库根，使用已有 schema 1.4 的候选库运行（不会自动初始化或迁移）：

```sh
python -m mvp.backend.http_server --db candidate/knot.db
```

绑定地址固定为 `127.0.0.1`。端口优先级为显式 `--port`、`KNOT_PORT`、库同级 `.knot/http.port`、默认 `7318`；`--port 0` 用于临时测试，stdout 的 listening 行给出实际端口。状态目录固定在库同级 `.knot/`，不可另指定目录绕过单实例锁。

## 锁与重启

锁文件位于库同级 `.knot/http.lock`，JSON 记录 `pid`、UTC ISO8601 `started_at` 和库绝对路径 SHA256 的前 16 位 `db`，不记录真实路径。正常退出释放锁；启动遇到遗留锁时检查 PID 存活，进程已死、文件损坏或无有效 PID 时自动删除陈旧锁，仅重试一次。PID 仍存活或重试未取得锁则返回 `SERVER_BUSY`，detail 含 `pid`（无法读取时为 null）及 `stale_checked=true`；存活的服务不会被顶掉。

PID 可能被其他进程复用，存活检查无法完全排除这种情况，会保守报忙；保留的 `started_at` 供人工结合进程信息判断，不自动终止进程。

`.knot/http.seq` 保存序号、重放帧及幂等键；不要单独删除它来“重置”。通知不是业务事实库，业务写入仍只经 claim_review。SQLite 与文件日志不能跨介质原子提交：服务先持久化 pending 意图，业务提交后原子替换通知日志，之后才发布内存帧；中途故障时 health 返回 degraded/read_only，后续命令与重启明确拒绝（incomplete_command_requires_review），保留意图供人工对账，不自动补事件或重放不明写入。

## 怎么打

```sh
curl http://127.0.0.1:7318/contract
curl 'http://127.0.0.1:7318/snapshot?as_of=0&view=boolean'
curl -N 'http://127.0.0.1:7318/events?since=0'
curl -H 'Content-Type: application/json' -d '{"command":"claim.confirm","args":{"claim_id":"<id>"},"idempotency_key":"request-1"}' http://127.0.0.1:7318/commands
```

设置 `KNOT_TOKEN` 时，写命令及 content 档须带 `Authorization: Bearer <token>`；服务端映射到中性 actor `local-user`，不接受 body 自报 source/actor。不设 token 的 loopback 全开仅为 v1 临时态。未提供跨源放行头。

同步结果必带 status，job_id 为 null；未确认候选被拒返回 revoked/event_id=null（I-02，不写事实事件）；撤销已有确认返回 revoked/原事件 ID；重复操作返回 already_accepted 或 already_rejected/event_id=null。同一幂等键重复相同请求返回原结果，不新增帧；不同请求复用键则 BAD_REQUEST。SSE 类型取实际业务 status，例如 claim.confirm 恢复已撤确认时发 claim.restored。since 为排他的序号下界。

Day 16 的 bundle.create / bundle.export 返回 HTTP 202，CommandResult.status=queued、event_id=null、job_id 非空。create 的 args 必须显式给非空 asset_ids，可选 include_open_questions；export 的 args 给规范 UUID bundle_id。`/jobs/{job_id}` 返回持久的 pending → running → done|failed；done.result 包含 bundle_id，导出另含 exported=true 与相对 path。未知 ID 返回 NOT_FOUND。幂等键在重启后仍返回原 job；细节、导出位置和中断对账见 [BUNDLE](BUNDLE.md)。运行中契约文件与启动字节不符则 CONTRACT_VERSION_UNSUPPORTED，需按审定版本重启。

## 怎么自检

安装 requirements-dev.txt 后，在仓库根运行：

```sh
python -m mvp.contract.selfcheck --db candidate/disposable.db
python -m pytest mvp/tests/ -q
```

selfcheck 对存在的输入库做 SQLite backup 到临时目录。输入路径不存在时在临时目录创建 schema 1.7 库。它遍历全部二十个路由，核对未认证的查找和停点接口拒绝，并检查六次同步命令。成功汇总 26 PASS / 0 FAIL 并退出 0。具备 reader 授权的停点保存、读回和恢复由专项测试验证。

## Run A：读续接包、导出基准与启动错误

`/contract` 声明 `exports_root="~/.knot/exports"`。`bundle.export` 的 `Job.result.path` 与 Bundle.export_path 均相对 exports_root，例如 `<bundle-id>.md`；旧 Day 16 工单保存当时结果，不回写历史工单。导出文件首行是 `<!-- knot-bundle bundle_id=<id> db=<库路径SHA256前8位> generated=<UTC ISO8601> actor=<actor> -->`，其后正文逐字节保留原生成结果，不在响应中披露库路径。

`GET /bundles/{bundle_id}` 默认 `view=roots`，返回 authorized_assets、open_questions 清单，数组长度即计数，context_text=null。open_questions 按冻结的字符串数组契约返回 claim_id；库存的问题对象保持原样。`view=content` 返回全文，设置 KNOT_TOKEN 时须带 Bearer token，否则 FORBIDDEN_VIEW / 403；不设 token 时沿用本地 v1 开放态。未知 id 返回 NOT_FOUND / 404，非法 view 返回 BAD_REQUEST / 400。两个档位均只读，不导出、不更新 exported；未导出时 export_path=null，导出后为相对 exports_root 路径。

启动失败向 stdout 输出 ErrorEnvelope 并退出 1，不进入 listening。detail.reason：缺库或不可读为 db_unreadable；版本不支持为 unsupported_schema（code=SCHEMA_VERSION_UNSUPPORTED）；端口占用为 port_in_use；http.seq 存在未完成命令为 pending_requires_review；其他异常为 internal。message 给出可操作说明，不包含主机异常文本或绝对路径。pending 日志保留供人工核对，不恢复或重放。既有存活实例仍按 SERVER_BUSY 拒绝。Windows 禁用地址复用以稳定识别已占端口。

本轮原始响应、正文比对和测试证据见 [Run A 回执](XWIN-A-EVIDENCE.md)。

## Run B1：CLI 连服务与显式离线

`knot_query` 的 events、asset、claims、support（claim/atom）、trace，以及 `claim_review` 的 accept/reject 默认走 HTTP。省略 `--server` 时读取库同级 `.knot/http.port`；服务成功绑定后写入实际端口。没有端口文件提示“先起服务或加 --offline”。显式 `--server` 仅接受 loopback HTTP origin。

```sh
python -m mvp.backend.knot_query support --db candidate/knot.db --claim <id> --at <Unix毫秒>
python -m mvp.backend.knot_query events --db candidate/knot.db --start 0 --end <Unix毫秒> --server http://127.0.0.1:7318
python -m mvp.backend.claim_review --db candidate/knot.db --claim <id> --accept
python -m mvp.backend.knot_query claims --db candidate/knot.db --atom decision --offline
```

`--offline` 在持有 `.knot/http.guard` 的 OS 排他锁期间检查 http.lock 的 PID 活性，并在整个读／写期间保留 guard，阻止服务同时启动；存活 owner 拒绝，陈旧 owner 允许。OS 锁随进程退出释放，guard 文件本身可保留。服务启动与 reconcile 使用同一 guard。

events 映射 `/timeline`（半开区间 [start,end)，limit 最大 500），asset 映射 `/assets?content_hash=`（64 位 hex，未命中输出 []），claims 映射 `/claims?atom=`（按服务端顺序分页，最多输出 --limit 条）；support 分别映射 `/claims/{id}?as_of=` 与 `/claims?atom=&as_of=`（读完所有页）；trace 原样读取 `/trace/{id}?max_depth=`。`/events` 仍是 SSE。两种来源均输出一行 JSON；CLI 不重算 boolean/minimal_roots，候选真值与原子视图并列且互不推导。

## Token 与 actor

同步 claim.confirm / claim.revoke / claim.restore 的幂等记录与 bundle 一样绑定服务解析的 actor。仅同 actor、同 key、同请求体可重放；不同 token 映射到同 actor 时仍可重放。跨 actor 或请求体冲突返回 400 BAD_REQUEST，detail.reason=idempotency_key_conflict，不返回旧结果、不追加事件或 seq。

历史 journal key 缺 actor 时拒绝该 key 的重放，不猜测 local-user，也不自动补写旧日志；新 key 的独立动作仍可用。调用方须先核对旧动作结果，不能收到冲突后自动换 key 重发。绑定随 journal 持久化，在重启后仍生效；此规则不新增逐 claim 写 ACL，也不改变正文 reader 权限。

服务端 `KNOT_TOKENS` 接受 JSON token→actor 映射，例如 `{"<token-a>":"hermes","<token-b>":"codex"}`。`KNOT_TOKEN` 仍映射 local-user；两者 token 重合时以 KNOT_TOKENS 为准。CLI 用自身 KNOT_TOKEN 作为 Bearer token。未配置 token 时沿用 loopback 开放态，actor=local-user。写命令无有效 token 返回 UNAUTHORIZED，content 档返回 FORBIDDEN_VIEW；不接受请求体自报 actor。

新确认事件的 payload.actor 在 review 自己的事务内、提交前注入；已有确认事件的撤销／恢复不改写历史 actor。pending 同时保存 actor 与 since；bundle.export 的 actor 透传到导出首行，正文与 job 状态机、持久结构和失败语义保持原状。

## Pending 离线对账

`/health.pending` 为 null 或 `{command,actor,since}`，since 为意图写入时的 Unix 毫秒；旧意图没有时间时为 null。pending 未完成时保持既有失败封闭规则，拒绝写入及重启。

```sh
python -m mvp.backend.reconcile --db candidate/knot.db --list
python -m mvp.backend.reconcile --db candidate/knot.db --clear --reason "已核对数据库与意图，人工决定丢弃意图"
```

两种操作只许离线。list 给出 pending 身份／时间／命令及 body 的 hash、参数键摘要，不输出凭据值。clear 必须有非空 reason：先向 `~/.knot/reconcile.log` 追加完整原 pending、body 摘要、理由、UTC 时间与本机操作者，flush/fsync 成功后才原子替换 http.seq 清除 pending；审计失败不清空。不补事件、不回放命令、不清 jobs/frames/keys。

逐条输出、两种 selfcheck 与独立复核见 [Run B1 回执](XWIN-B1-EVIDENCE.md)。

## 探索关系与分岔 HTTP（C3a 候选）

配置 token 身份后，`POST /exploration-v2-saves` 完整提交版本、材料、关系和停点；`GET /explorations/{exploration_id}/v2` 返回当前或指定历史；`POST /exploration-forks` 以明确源修订及事件创建新探索。请求字段和返回形状以 contract 为准。旧路由的成功形状不变，旧入口遇新版本或分支返回 `snapshot_version_required`。关系及停点按当前 reader 与凭据规则抑制，公开 origin 不包含 actor；来源摘要仅指数据库快照文本。

默认新库仍为 1.7，不自动迁移。服务在启动时核对并报告实际 1.7、1.8、1.9，旧 1.6 保持非探索功能；低版本新操作返回 `exploration_migration_required`，结构漂移返回 `exploration_schema_invalid`，坏快照返回 `exploration_snapshot_invalid`。服务启动后不得在外部迁移或替换其数据库，真实迁移须另行授权并核唯一写入者。已运行旧服务与其他 CLI 的安全性未由此证明。

写入返回不含正文的收据。响应丢失或输出失败时结果可能未知，调用方可明确以同目标、同请求和同 key 重放恢复；只读状态拒绝写入和重放。探索内容不进入全局命令 journal/SSE。已送达宿主的内容不因撤选而抹除。新 MCP 工具和人的使用接受另卡。

fork 请求只包含来源锚，不重新提交源正文；获授权的 fork 可在核心中完整复制历史快照（其中可能已有凭据标记）。返回的收据不含正文，后续 GET 才依当前规则抑制敏感文本；不能据此称持久历史从未包含该内容。

探索路由的固定错误如下；没有 reason 的行不回传原始异常或请求正文。

| HTTP | code | detail.reason | 含义 |
|---|---|---|---|
| 400 | BAD_REQUEST | 无 | 无效参数或格式 |
| 400 | BAD_REQUEST | asset_unavailable / sensitive_content | 材料当前不可用 / 请求或结构元数据含敏感内容 |
| 403 | FORBIDDEN_VIEW | 无 | 缺少有效配置身份 |
| 404 | NOT_FOUND | 无 | 目标或来源不可见、不存在或源锚不匹配 |
| 409 | BAD_REQUEST | revision_conflict / idempotency_conflict / snapshot_version_required | 修订、请求 key 冲突或旧入口不支持新快照 |
| 409 | SCHEMA_VERSION_UNSUPPORTED | exploration_migration_required / exploration_schema_invalid | 合法低版本需迁移 / 结构或来源漂移 |
| 409 | SERVER_BUSY | server_read_only | 服务处于只读状态 |
| 500 | INTERNAL | exploration_snapshot_invalid | 持久快照格式损坏 |
| 500 | INTERNAL | 无 | 内部错误，包括写后收据投影失败 |

无 reason 的内部错误或响应中断可能发生在提交之后，不能据此判定回滚；核对后可显式用原请求和原 key 重放恢复。
