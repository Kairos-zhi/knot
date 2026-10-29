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
| boolean | 只给真假；不得返回 minimal_roots 或正文 |
| roots（默认） | 给真假与来源事件 ID 的 minimal_roots；不得返回正文 |
| meta（资产端点默认） | 资产元数据（AssetMeta），不含正文；信封 view=meta |
| content | 经该档授权才返回正文 |

服务端执行授权并在信封回显实际 view；UI 隐藏字段不能替代服务端分层。设有 `KNOT_TOKEN` 时 content 档须 token；未设时 loopback 全开，这是任务卡规定的 v1 临时态。token 映射 actor，source 一律服务端判定，请求体不能自报可信身份。

AtomSupport.minimal_roots 已改可选，以支持 boolean 档省略来源；roots 档必须有来源仍由 C2 按实际 view 检查。Snapshot.view 保持 boolean/roots 两档；content 只属于资产端点。二进制资产使用 `content=null`、`encoding=none` 并必须含 path；该条件已由 AssetContent 的 if/then/else 表达。`/snapshot`、`/claims`、`/claims/{claim_id}` 用 OkEnvelopeTimed，`/assets/{asset_id}` 用 OkEnvelopeViewed，两类均强制 view；只有这两类之外使用 OkEnvelope 的端点可省 view。实际档位与授权内容一致性由 C2 真实服务测试验证。

## event_time 与 recorded_at：两条时间轴

`event_time` 表示事件发生时间；`recorded_at` 表示系统记录时间，二者均为 Unix 毫秒，不能在协议层重命名、合并成一个 timestamp 或互相代填。例如历史导入可发生于 1000、记录于 2000，两值应分别保留。EventStore 默认未提供 event_time 时才采用当前 recorded_at，并拒绝未来事件；数据库约束 recorded_at >= event_time。

TracePathItem 同时要求这两个字段。as_of 是查询坐标，ChangeEvent.ts 是 SSE 通知时间字段，seq 是增量序号；它们均不应冒充事件的上述两条时间轴。状态读取继续复用既有 support_view / claim_support 的快照语义，不在 HTTP 层另写时间判定。

## 写入与实现边界

写白名单仅含 claim.confirm / claim.revoke / claim.restore / bundle.create / bundle.export；其他命令 COMMAND_NOT_ALLOWED，PUT/PATCH/DELETE 全部 HTTP 405。没有通用写或整表覆盖入口。错误码完整封闭集与版本规则见 CHANGELOG。

C2 实现为 stdlib http.server + threading，绑定 127.0.0.1；默认端口 7318，`.knot/http.port` 可改，KNOT_PORT 覆盖。单实例锁 `.knot/http.lock`，冲突明确 SERVER_BUSY；SSE seq 落盘 `.knot/http.seq`。不得对外绑定或 CORS 通配放行，业务逻辑复用现有模块。

## 怎么起

在仓库根，使用已有 schema 1.4 的候选库运行（不会自动初始化或迁移）：

```sh
python -m mvp.backend.http_server --db candidate/knot.db
```

绑定地址固定为 `127.0.0.1`。端口优先级为显式 `--port`、`KNOT_PORT`、库同级 `.knot/http.port`、默认 `7318`；`--port 0` 用于临时测试，stdout 的 listening 行给出实际端口。状态目录固定在库同级 `.knot/`，不可另指定目录绕过单实例锁；锁内记录 PID，第二个进程返回 SERVER_BUSY。正常退出释放锁；异常退出的遗留锁不会自动抢占，先核实原进程及日志再人工处置。

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

C2 的 bundle.create / bundle.export 固定返回 COMMAND_NOT_ALLOWED，detail.reason 为 not_implemented_day16；`/jobs/{job_id}` 保留路由，未知 ID 返回 NOT_FOUND。C2 不生成假 job，不交付 202 生命周期；该部分随 Day 16 补齐。运行中契约文件与启动字节不符则 CONTRACT_VERSION_UNSUPPORTED，需按审定版本重启。

## 怎么自检

安装 requirements-dev.txt 后，在仓库根运行：

```sh
python -m mvp.contract.selfcheck --db candidate/disposable.db
python -m pytest mvp/tests/ -q
```

selfcheck 对存在的输入库做 SQLite backup 到临时目录；输入路径不存在时仅在临时目录创建 schema 1.4 库，不创建输入路径。所有合成种子及命令均只落临时副本，输入库不变。它启动临时端口、调用全部十个端点（含 SSE 与未知 job），逐条按契约定义校验，另检查六次同步命令状态，逐行 PASS/FAIL；成功汇总 16 PASS / 0 FAIL、退出 0，失败退出 1。jsonschema 仅用于开发自检与测试，服务运行不导入第三方库。分页、历史支持、授权、SSE 多客户端与跨进程重启、单实例及只读哈希由真实服务测试覆盖；不代表在用部署或人的产品验收。
