# KONT-RESEARCH-002 · 公开后端专项（Seeker）

状态：`done_pending_check`。访问日期：2026-10-21（Asia/Shanghai）。这是研究交付，等待独立 Checker；没有采纳、实现或产品验收效力。

## 一页结论

本次只查两个必选官方仓库，未增加 AFFiNE。OpenCove `main` 固定在 `e10604b9d940ed7752c6fe931e23024d6003aa55`；Canvas Cowork `main` 固定在 `9b80a7fd33e039aa520707887d7ca23441546568`，均通过 `git ls-remote … refs/heads/main` 取得，随后按 SHA 读取源码。目录 HTML 仅用于定位，结论以固定 SHA 文件为准。证据目录及逐文件 URL、SHA256 见 [证据索引](../../evidence/local/20261021-backend-research/seeker/source-index.json)。

1. **同一控制面已有成熟参照。** OpenCove 有可验证的 command/query 注册器、边界校验、稳定错误、node usecase 与持久 owner 分层；官方架构文档声称 Desktop/CLI/Web 共用这些 contracts。Knot r2 已有单内核 `/kont/snapshot`、`/command`、`/events`，不需要再发明总线。应借鉴的是明确 owner 和错误/生命周期契约，而非搬入另一套画布/存储。[O1–O3]
2. **Run 不能用 session、node 或 HTTP 成功替代。** OpenCove 区分 durable node、运行 session、provider resumeSessionId、远端 route，支持在途恢复合并、PTY 补流与超窗恢复；这些不能证明任意命令跨进程 exactly-once。Flowith CLI 的 UUID nodeId + 预写节点 + 异步提交 + 数据库轮询可核证，但其生成服务器、队列、取消与事务实现没有在本次公开仓库中暴露，必须记为未知。[O4–O7、F1–F3]
3. **上下文来源需在提交时固定。** Flowith 文本历史只沿指定 follow 节点的父链构建、限制条数、阻止环；它不是整个画布自动入模，也不是版本化来源清单。Knot 已有 schema4 来源、供料/排除/隔离；接真实 Run 时仍需验证提交时的实际输入、来源版本、产物归属及迟到回包处理，不能只看关系边或最终文本。[F4、O8]

本次没有运行竞品测试/服务/模型，没有登录或外发业务数据。下面“有测试”只表示已读到测试源码和断言，**不表示本机执行通过**。研究只支持最多三项后续候选，是否拆卡由中控决定。

## 机制矩阵

证据等级：**C**=固定版本代码可见；**T**=相应测试源码可见但未运行；**D**=官方文档声称；**I**=本报告推断；**U**=未知/未核实。C/T 不等同于生产运行证明。

| 问题/机制 | OpenCove | Canvas Cowork / Flowith | 对 Knot r2 的处理判断（研究建议） |
|---|---|---|---|
| 人/Agent 共用命令及 owner | **C** `createControlSurface` 按 id+kind 找 handler，validate 后 handle，统一错误 envelope；`nodeControlHandlers` 委派 workspace usecase。**D** Desktop/CLI/Web 共用 contracts。[O1–O3] | **C** Live 模式 broadcast `BotAction`，按 actionId 收响应，跳过 ack 等最终响应；headless `gen` 直接调用 HTTP/数据库适配。**D** 无浏览器也能生成。[F1–F2] | **可复用机制，需适配实现**：保持原 KnotOperationService/业务命令；同源语义不等于所有 transport 已逐条证明。**不采用** Flowith 的直接数据表写入作为第二权威。 |
| 订阅/断流 | **C/T** PTY attach 区分 controller/viewer，afterSeq 补流；早于保留窗或 presentation fence 发 overflow，测试要求 presentation_snapshot；晚加入收到 metadata/state。[O5] | **C** RealtimeLite join/broadcast/heartbeat；onclose 只清 heartbeat，本次所读类未见自动重连/事件游标重放。headless `pollNode` 读 durable row，瞬态失败继续、鉴权错误退出、超时保留 nodeId。[F2–F3] | Knot r2 已有 seq+reset，**无需重复建事件层**。真实 Run 应复用现有 snapshot/事件 owner；重连不能触发重复生成（**I**）。 |
| 身份及恢复 | **C** durable nodeId、runtime sessionId、resumeSessionId、route(endpointId/remoteSessionId) 分立。`prepareOrRevive` 先检测 live，再恢复/准备。**T** 原远端 worker binding 重启恢复、并发重复 node 合并测试。[O4、O6] | **C** question/response UUID、convId、nodeId；先 upsert question+init response，再 POST；submitted/finished/failed/timeout 分立。**U** 服务端持久 job/run 身份及提交与入队原子性。[F1、F3] | **需适配**：Knot Run 对象关联 DSH session/turn，不让 Knot 变成另一个模型运行器。nodeId、requestId、RunId 各自语义需拆卡定义。 |
| 取消/幂等 | **C** `session.kill` 调 runtime.kill，未知 session 失败；`prepareOnce` 仅按 workspaceId+nodeId 合并在途 Promise，finally 清除。**U** 所有业务命令的持久去重/取消后产物结算。[O4、O7] | **C** HTTP AbortSignal 是请求超时；`run` 超时可稍后 read-db。`upsertNodes` 采用 merge-duplicates，但源码注释提示既有 row 要 PATCH 以避免分区重复。**U** 服务端取消、扣费回滚、幂等键、重复提交去重。[F1–F3] | **不采用** 把断 HTTP/轮询 timeout 等同取消，或把 upsert / actionId 等同端到端幂等。先验证 DSH 已有取消/turn 身份再补缺。 |
| 持久化/冲突恢复 | **C** sync.writeState 校验 baseRevision；store 将 expectedRevision 带入 SQLite transaction，事务内再次检查 revision。**T** 已读缺失 baseRevision 拒绝、非显式空覆盖保护、显式清空放行测试。**U** 本次未验证硬断电/跨版本损坏恢复完整链。[O6] | **C** 直接数据库读写节点，PATCH 覆盖 data 未带可见版本前置条件。生成提交失败可能客户端补 failed；这不证明服务器任务停止。**U** 服务端并发合并/崩溃事务/冲突策略。[F1–F3] | **需适配**：Knot 的 seq 事件排序不自动证明 CAS。先在原内核验证并发旧写，再决定是否补 expected revision；不改成整画布快照随意覆盖（**I**）。 |
| 上下文隔离 | **C** Space/Workspace 从持久状态解析 execution directory、mount 与 approved roots；这是文件/运行位置边界。**U** 无据此声称模型语义上下文自动隔离。[O8] | **C/T** follow 父链到根，maxTurns 默认20，seen 防环，角色映射，媒体转文本占位；genText 验证 follow 在该 canvas。**U** 服务端是否另行增加历史/检索内容。[F4] | **可复用“实际输入可检查”的测试思路，需适配** Knot 的显式供料/排除/isolation；**不采用** 父链自动授权及媒体占位替代真实多模态来源。 |
| 来源版本/产物回流 | **C** finalMessage 按 session/provider/cwd 找 resumeSessionId 和最后消息，remote 路由回查询；**U** 该入口本身不提供 Knot 式 block/sourceVersion 引用。[O8] | **C** response 保存 model/status/timestamp，question/response 用 p_id/conv_id 连回 canvas；GenResult 返回 questionNodeId/nodeId、文本或URL。**U** 不可变输入版本、引用授权、产物事务回流保证。[F1、F4] | **需适配**：回包通过 Knot 原命令产生 generated block + provenance；独立验证提交后来源修改、删对象、取消后迟到结果，不把“URL返回”当资产已落盘。 |

## 最多三项后续工程候选（未批准）

| 候选 | 依据与复用/适配/不采用 | 建议验真条件与下一卡价值 |
|---|---|---|
| 1. 原命令的并发旧写与失败边界专项 | **复用** 原内核/存储；**适配** O6 的事务内版本前置条件及稳定冲突错误；**不采用** 第二套 state store/整库迁移。先查 Knot 原有协议/测试是否已覆盖，已覆盖则只补兼容层测试。 | 两个客户端同基线并发修改不静默丢内容；冲突不推进业务状态；拒绝后读 snapshot 可重试。仅在现有内核缺口成立时补卡，直接保护多人/多Agent写入。 |
| 2. DSH-backed Run 生命周期纵切 | **复用** DSH Agent/Session/turn owner、Knot snapshot/events；**适配** O4/O5 的 durable identity 与 runtime reattach 分离。**不采用** OpenCove PTY/WebSocket/worker 架构整搬。**未知** DSH 是否已有完整幂等和取消语义，开卡前必须查本地协议/测试。 | Headless 提交→观察→断流重连→取消→读回；重复请求不重复启动（按明确定义的边界）；区分 accepted/running/cancel_requested/cancelled/finished/failed，终态以真实 runtime 回执为据；重启后不凭 UI 状态自动再执行。解决 r2 真实 Run 未接的核心缺口。 |
| 3. Run 输入清单与 generated block 回流纵切 | **复用** schema4 provenance/多块、供料排除和隔离；**适配** F4 的确定性上下文构建测试，不照抄其父链或20条限制。**不采用** 浏览/连线即默认授权。 | 固定源 id+版本/实际内容摘要与授权边界；提交后改来源不改旧Run输入；被排除/隔离内容不入 payload；回包只通过现有命令写 generated block，保留 Run/来源关联；取消/删除后迟到回包按明文策略处理。让后续 Run 可解释、可重放核查。 |

## 精确源入口（固定版本）

以下路径均对应 `source-index.json` 中同名原始文件、SHA256 及完整 permalink，避免 main 漂移；行号以下载快照为准。

### OpenCove · e10604b9

- **O1 / D** [CONTROL_SURFACE.md](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/docs/architecture/CONTROL_SURFACE.md)：Contract Shape、Transport、Architectural Boundary、Adding A Capability。它是架构声明；未将“所有现存UI已完全统一”当独立实测结论。
- **O2 / C** [controlSurface.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/controlSurface.ts#L20)：`createControlSurface` 的 register/invoke；handler kind/validate/handle/error envelope。
- **O3 / C/T/D** [nodeControlHandlers.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/nodeControlHandlers.ts)、[nodeControlUseCases.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/contexts/workspace/application/nodeControl/nodeControlUseCases.ts#L127)：`createNodeForNodeControl`、runtime.validateTarget/launchAgent/spawnTerminal/commit/cleanup。配套 [nodeControl.spec.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/tests/unit/contexts/nodeControl.spec.ts#L314) 包含 generic agent/terminal update 拒绝及 runtime owner metadata 断言；[CLI契约文档](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/docs/cli/CANVAS_NODE_CONTROL.md)。
- **O4 / C/T** [sessionPrepareOrReviveHandler.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/sessionPrepareOrReviveHandler.ts#L41)：`inFlightNodes` / `prepareOnce`、live session 检查、4路恢复并发；[parallel.spec.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/tests/contract/controlSurface/controlSurfaceHttpServer.sessionPrepareOrRevive.parallel.spec.ts#L71)：并发恢复共享重复在途 node。清除 map 后不提供跨进程持久幂等。
- **O5 / C/T** [ptyStreamHub.attach.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/ptyStream/ptyStreamHub.attach.ts#L16)：`attachPtyStreamClient`，controller/viewer、seq、presentation fence；[sessionStreaming.integration.spec.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/tests/contract/controlSurface/controlSurfaceHttpServer.sessionStreaming.integration.spec.ts#L360)：catch-up、metadata/state、overflow→presentation_snapshot 断言。PTY补流不能外推为所有 SSE 或 durable event journal 保证。
- **O6 / C/T** [syncHandlers.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/syncHandlers.ts#L355)：`sync.writeState`；[write.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/platform/persistence/sqlite/write.ts#L80)：`writeNormalizedAppState` 事务内 expectedRevision；[PersistenceStore.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/platform/persistence/sqlite/PersistenceStore.ts#L234)；[syncWriteState.spec.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/tests/contract/controlSurface/controlSurfaceHttpServer.syncWriteState.spec.ts#L64)；[nodeWorkerBindingRecovery.spec.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/tests/contract/controlSurface/controlSurfaceHttpServer.nodeWorkerBindingRecovery.spec.ts#L41)（后者涉及 Electron native modules，本次仅阅读）。
- **O7 / C** [sessionRecords.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/sessionRecords.ts)：`SessionRoute` / `SessionRecord`；[sessionHandlers.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/sessionHandlers.ts#L470)：`session.kill`；kill 调用返回不是这里可见的取消终态/结算证据。
- **O8 / C** [resolveSpaceWorkingDirectoryFromStore.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/resolveSpaceWorkingDirectoryFromStore.ts)、[sessionStreamingHandlers.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/sessionStreamingHandlers.ts#L184)：Space/mount/approved roots；[sessionFinalMessageHandler.ts](https://github.com/DeadWaveWave/opencove/blob/e10604b9d940ed7752c6fe931e23024d6003aa55/src/app/main/controlSurface/handlers/sessionFinalMessageHandler.ts#L57)：`session.finalMessage` 与本地/远端来源定位。没有把最后消息定位等同完整来源链。

### Canvas Cowork · 9b80a7fd

- **F1 / C** [generate.ts](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/lib/generate.ts#L486)：`run` 先 upsert 两节点、workerFetch、失败时补 failed、轮询/超时保留身份；`GenResult`、`buildTextRequest`、`genText`。对应 [generate.test.ts](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/__tests__/generate.test.ts#L38) 仅请求构建/参数等测试，非服务器执行测试。
- **F2 / C/D** [index.ts](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/index.ts#L199)：`RealtimeLite`、`registerWithFrontend`（L935）、`sendAndWait`（L2887）；[http.ts](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/lib/http.ts#L116)：`workerFetch` / `rest`、认证与请求超时；[README](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/README.md) / [API recipes](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/references/api.md) 为文档层证据。
- **F3 / C** [canvas.ts](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/lib/canvas.ts#L135)：`upsertNodes` / `patchNodeData` 注释及实现；[pollNode](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/lib/canvas.ts#L256) 的失败/鉴权/退避/timeout 分支。分区重复现象是源码注释声称，未查私有数据库 DDL，不作独立验证结论。
- **F4 / C/T** [buildHistoryMessages](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/lib/generate.ts#L368) / `genText`（L603）；[ergonomics.test.ts](https://github.com/flowith-ai/canvas-cowork/blob/9b80a7fd33e039aa520707887d7ca23441546568/scripts/__tests__/ergonomics.test.ts#L15)：父链角色/次序、无follow无history、cap、防环，以及 system+history+prompt 请求测试。未证明服务端无额外上下文。

## 限制与角色自检

- 范围完整：两个必选项目、三个研究问题均有列项；未展开第三项目或重新评判产品方向。已读开发基准、STATE/QUEUE/README 与用户10月18日报告；该旧报告只作为定位线索。
- 出处完整：每个关键结论对应固定 commit 文件/函数；能找到测试的列测试，找不到的保持 U。公开仓库提供的 CLI/文档不等于 Flowith 后端开源；未核证内容不写“已具备”。
- 采集限制：GitHub tree API 403 限流，采用官方目录 HTML 定位和 raw 固定SHA文本；两个猜测路径返回404，未纳入证据。未使用二手博客/产品截图作为实现证据。
- 无运行结论：竞品测试未执行，未安装依赖、启动服务或模型；Knot r2 当前接受范围取本地中控文档，不重新接受完整内核、Run或前端。Knot 开发不走模拟点击。
- 复用边界：两个仓库 LICENSE 快照为 MIT；本次仅比较机制，未复制实现进入产品，依赖/安全/具体复用仍须独立审查。没有改变“后端对齐竞对，前端对齐 Apple”。
- 自检结果：覆盖度=三问齐全；出处=固定版本且区分C/T/D/I/U；完整性=公开/闭源边界、取消/幂等未知、未运行测试及候选未批准均已列明。**Seeker完成，待独立Checker；不自验收。**
