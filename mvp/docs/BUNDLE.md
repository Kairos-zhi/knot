# Day 16 续接包

生成器 `generate_bundle(conn, asset_ids, include_open_questions=True, now=None)` 写入既有 `continuation_bundles`，不增加表或 runtime 依赖。资产必须显式选择；缺省、空选择或未知资产均拒绝，不默认全量。v1 是单用户本地可见态，`authorized_assets` 保存实际选择，`user_scoped=True` 表示显式作用域，不表示用户已经审阅包正文。

## 内容与来源

五段固定为已确认决策、条件性定理、反例、未决问题、来源清单。前三段仅含候选自身已确认且未撤销的条目；未确认问题明确标成 unconfirmed，不把候选写成事实。关闭 `include_open_questions` 后保留标题但不收问题条目。

`support_sources` 是事件 ID，不是资产 ID。生成器沿 import 事件解析所属资产，只收全部来源均在选择内的候选；确认后的 `trace_claim` 路径若还引入未选择资产，则保守省略该候选，不扩张作用域。来源清单包含资产短 ID 和 content_hash 前 12 位。“为什么”按 `trace_claim` 原路径逐项列事件 ID；断链、环或超深沿用其拒绝语义，生成事务回滚，不另造回溯算法。

正文摘录来自所选内嵌 UTF-8 资产中编号完整匹配的行。外置资产、归档成员或没有对应行时明确提示核读来源，不生成补写的正文。当前不是语言模型总结器。`support_view_snapshot` 按 claim_id 保存包内候选的 atom、status、boolean、minimal_roots，复用 claim_support；它是作用域内的候选确认视图，不是全局原子推导快照。`now` 控制该确认视图时间，trace 仍按现有当前态读取；二者状态不符则拒绝，不能据此宣称支持历史续接。调用方已有事务时使用 savepoint，不代调用方提交；否则生成器自持事务提交。

## 命令与工单

```json
{"command":"bundle.create","args":{"asset_ids":["<asset-id>"],"include_open_questions":true},"idempotency_key":"bundle-1"}
```

`POST /commands` 返回 HTTP 202，value 为 `{"command":"bundle.create","status":"queued","event_id":null,"job_id":"<job-id>"}`。它只证明持久受理，不证明生成完成。随后 `GET /jobs/<job-id>` 轮询：pending → running → done 或 failed。done 的 result 至少有 bundle_id；错误使用契约封闭错误码，不返回主机异常或路径。未知 job 返回 HTTP 404 / NOT_FOUND。后台线程独立连接 SQLite，HTTP 层不包含内容生成逻辑。

```json
{"command":"bundle.export","args":{"bundle_id":"<bundle-uuid>"}}
```

同样返回 202/queued。完成后 result 为 `{"bundle_id":"<bundle-uuid>","exported":true,"path":"<bundle-uuid>.md"}`。文件写入用户主目录下的 `.knot/exports/`，先临时文件 flush/fsync，再原子替换，随后将库中 exported 置 1。响应 path 相对于 `/contract` 声明的 `exports_root="~/.knot/exports"`。文件首行追加 bundle_id、库路径 SHA256 前 8 位与 UTC ISO8601 生成时间注释，其后正文保持原样。读取接口与启动原因见 [HTTP](HTTP.md)。导出 ID 限规范 UUID，不能传文件路径。未知 bundle 在 job 中终结为 failed/NOT_FOUND。

## 持久化与故障边界

采用既有 `.knot/http.seq` journal：jobs、幂等键和 SSE 序号共享一个锁与一次原子替换，避免另加一份 job 文件和幂等日志的跨文件提交。相同键、相同请求返回原 202 和 job ID，即使已经完成也不另生成；冲突键 BAD_REQUEST。生成完成发布 bundle.created 通知，不伪造 history_events。正常关闭等待已受理线程完成再释放单实例锁。

重启保留 done/failed 全部字段；中断的 pending/running 不自动重放，依次终结为 running/failed，并标记 interrupted_job_requires_review。已受理 job 的状态 journal 写失败时 health 降级为 degraded/read_only，后续写命令阻断，保留未完成状态供对账。首次受理的 pending 写盘失败直接拒绝请求，不启动工作；启动恢复写盘失败则拒绝启动。SQLite、导出文件与 journal 没有共同原子提交：中断可能已有包或文件但 job 未完成，failed 不能解释为“无副作用”。须核库与产物，不自动补事实或重试不明操作。

测试使用临时库、合成来源和隔离的导出目录；通过线程屏障观察真实 pending/running，不给生产线程加延时。完整运行证据见 [Day 16 回执](W3D16-EVIDENCE.md)。这不代表在用部署、真实研究材料验收或人的产品接受。
