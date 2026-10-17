# 架构地图

更新：2026-10-18。阅读顺序：[产品形态](../product/overview.md) → 本页 → [状态与持久化](state-and-persistence.md) → [协议](protocol.md) → [运行适配](runtime.md)。

## 能力归属

| 能力 | 拥有者 | 边界 |
|---|---|---|
| 结、块、关系、供给、现场与业务动作 | Knot 操作与状态层 | 人和 Agent 共用规则；资产内容不另存一套平行副本 |
| 图标、文件夹、窗口、HUD、工作岛 | Knot 呈现层 | 显示业务状态，不编造 Run 或模型终态 |
| Agent／Session／turn／工具执行 | DSH 或外部 Harness，经薄适配接入 | Knot 保存关联和证据，不复制执行引擎 |
| 全局快捷键、捕捉、置前、托盘、系统浮层 | 原生宿主端口 | 后续窄验证，尚未冻结桌面框架 |
| 目录、NAS、项目／任务与搜索来源 | 来源适配器 | 授权、版本、覆盖度、离线与来源可核对 |
| 关系画布 | 同一模型的可选视图／适配 | 可关闭；不拥有独立资产、现场或运行真相 |
| 窗口呈现候选选择 | 可选 Jev 适配 | 根据受限候选辅助选择，不决定真实 Run 事实 |

人的入口和 Agent 入口都能进入 Knot 操作层。DSH 不是所有 UI 请求必须穿过的单向通道。各入口按能力连接，不能按页面视觉各造一套状态。

## 当前代码怎样组成

| 位置 | 已有作用 |
|---|---|
| [模型](../../knot-flowgram-app/src/knot-model.ts) | KnotNode／Block／Edge、Workspace／Worksite／Presentation 及本地命令类型 |
| [操作服务](../../knot-flowgram-app/src/services/knot-operation-service.ts) | 资产、关系、块、现场命令、输入编译、快照恢复、业务事件 |
| [选择与现场服务](../../knot-flowgram-app/src/services/knot-selection-service.ts) | 唯一 Workspace 状态、现场供给／排除、呈现引用、通知与恢复事务 |
| [纯状态规则](../../knot-flowgram-app/src/services/workspace-state.ts) | 校验、状态转换、引用合法性和默认兼容现场 |
| [持久化](../../knot-flowgram-app/src/services/asset-persistence.ts) | schema 兼容、快照、本地存储、监听与健康状态 |
| [请求适配](../../knot-flowgram-app/src/services/knot-worksite-request.ts) | 显式现场编译、深拷贝与注入接收端 |
| [兼容桥服务](../../knot-flowgram-app/src/services/knot-canvas-bridge-service.ts) | 从现有协议服务拉取命令，调用操作内核并回执 |
| [HTTP 服务](../../knot-flowgram-app/scripts/asset-write-server.mjs) | 资产快照／写入、命令、SSE、poll／ack、锁和 seq |
| [编辑器挂载](../../knot-flowgram-app/src/editor.tsx) | 服务生命周期、启动恢复与 watcher；当前仍为 FlowGram 界面 |
| [生成服务](../../knot-flowgram-app/src/services/generate.ts) | mock，占位生成，不是实际模型适配 |

旧 Context 兼容层仍有代码，不能将它理解为新建另一份可独立写入的供给状态。新增现场以 Workspace 中的状态为准。

## 哪些解耦还没完成

当前操作服务仍依赖 FlowGram 的 WorkflowDocument／linesManager。Headless 测试复用真实数据引擎与少量 DOM 桩，不代表实现已完全独立于 FlowGram。后续逐项抽离业务端口，保留旧桥兼容，不一次重写所有模型、命令和测试。

当前 UI 仍是参考承载，尚未接成新版工作站；本地请求接收函数不是网络传输。服务侧资产快照与客户端现场快照也没有自动变成同一份远端现场存储。

## 改造约束

保留稳定资产／块 ID、provenance、已有命令信封与事件语义。新增字段必须贯穿命令、快照、保存、恢复与负向验证，不能只改 interface。迁移时不能双主写；历史输入与当前供给不能混用。

当前已合入对象、验证和后续缺口见[开发状态](../development/status.md)。研发遵守[Agent 原生标准](../../knot-flowgram-app/docs/AGENT_FRIENDLY.md)，服务层验证优先。
