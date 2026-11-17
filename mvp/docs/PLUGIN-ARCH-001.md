# ARCH-001｜插件内置 Agent 与独立 Runtime（架构决策卡）

2026-11-17，基线 `8a57c11`。来源：用户当日架构收口稿 v0.1《Knot 插件内置 Agent 与独立 Runtime 架构》。

**本卡只做决策与边界，不写实现代码。** 已确认方向（用户稿 §1）：产品能力内置、执行运行时解耦、支持独立进程或远端部署；部署形态不得改变资产、历史与授权语义。

## 一、现状核对（可核事实，非推断）

| 层 | 现状 | 依据 |
|---|---|---|
| Core | SQLite schema 1.9；资产 / 事件 / 授权 / 关系；读走 `read_snapshot` 只读快照；写为封闭事务 | `mvp/backend/`、`mvp/contract/v1/schema.json` |
| HTTP 面 | 契约 v1 共 27 条路由；写入类仅 5 个封闭 POST：`/project-imports`、`/exploration-saves`、`/exploration-v2-saves`、`/exploration-forks`、`/commands` | `mvp/contract/v1/endpoints.json` |
| MCP 面 | 11 个工具，全部为读或探索保存；无「任务」「运行」概念 | `mvp/codex_mcp.py` |
| Agent 循环 | **不存在**。`mvp/devtools/plugin_runtime.py` 是隔离实例管理器（建库、起服务、健康检查、按锁身份停止），不是执行引擎 | 该文件 docstring |
| 宿主感知 | `codex_capture` 30 秒轮询只读 Codex 主状态库，上限 100 项目 / 2000 线程 | `PLUGIN-CAPTURE-001` |
| 插件界面 | `workbench.html` 静态页，无「当前选中资产」持久事件 | `mvp/devtools/workbench.html` |

结论：**Core 成立、Plugin 雏形成立、Runtime 不存在。** 用户稿 §2.2 的三层里缺中间一层。

## 二、必须先钉死的四个未决

### U1 命名分离（阻断级）

`plugin_runtime.py` 与用户稿 §2.2 的 Runtime 同词不同物。落实现前必须让位：实例管理器改名为 `instance_manager.py`（或等价名），`Runtime` 一词专指 Agent 执行循环。

**判据**：仓库内 `runtime` 一词只剩一种含义，可由 grep 自证。
**决策人**：中控；改名动作落到独立实现卡，本卡不改代码。

### U2 写者模型（阻断级，用户稿 §4 第 4 步的前置）

Core 当前假设单写者 + 只读快照。Runtime 独立成进程后，谁写事件必须显式选择：

| 候选 | 含义 | 代价 |
|---|---|---|
| A | Runtime 直接写 Core | 破坏单写者假设，SQLite 并发写风险，需重做事务边界 |
| B | Runtime 只读 + 提交提案，用户确认后由 Core 单写者落盘 | 需要新的「受控提案协议」，与现有导入确认哲学一致 |
| C | Runtime 持写租约，任意时刻单写者 | 需要租约生命周期与失效处理 |

**建议默认 B**：首版不引入第二写者。A 与 C 不在首版范围。
**判据**：在 B 下，Runtime 崩溃或被杀不会留下半写状态。

### U3 授权范围对象（阻断级，用户稿 §4 第 1 步）

现有授权是 actor + token 的静态 reader 授权，没有「这次任务可以用哪些资产、到何时」。需要 `selection grant`：`{grant_id, actor, task_id, asset_ids+hashes, purpose, expires_at, revocable}`。

**判据**：撤回后新的受控请求必须失败；已产生的产物不被抹除（撤回 ≠ 补偿已完成动作，与用户稿 §4 注一致）。
**约束**：grant 只授读，不推出编辑；不得由 Runtime 自行签发。

### U4 「焦点」的定义（非阻断，但决定 Q4）

可选来源：Codex 宿主线程元数据（capture 已有）、Knot 界面当前打开资产（现在无持久事件）、用户显式选择。

**建议默认**：首版只用「用户显式选择」；焦点感知仅用于**推荐候选**，永不自动流经。理由：§4 明确要求「选中后才流经」，而现有能力给不出可靠焦点事件。

## 三、用户稿 §4 首版闭环 → 现有接口映射

| 步骤 | 现有可用 | 缺口 |
|---|---|---|
| 1 用户选资产并授权 | 无 | **U3 全缺** |
| 2 Runtime 申请上下文投影 | `read_project` / `read_material` / `/project-material` 可直接复用 | 无（仅需确定 grant 校验插入点） |
| 3 Agent 执行 | 无 | **U2 + Runtime 本体** |
| 4 Core 记录事件 / 产物 / 关系 | `events`、`import_project` 可部分承载 | 缺「任务」维度：现有事件无 task_id |
| 5 插件呈现 + 撤回 | 展示可复用；撤回机制无 | **撤回入口** |

结论：五步里第 1、3、5 步各有阻断缺口；第 2 步可复用；第 4 步需要 task 维度增量。

## 四、与既有卡的关系

- **CONTEXT-MAINT-001 降为过渡件**：它用 MCP 只读工具 + 工具描述引导 agent 先查后动，是 Runtime 缺位期的最小检查点，不是「维护能力」。实现与合并不受影响，但描述中不得声称已具备上下文维护；并在卡首行标注「Runtime 缺位期过渡件」。
- **CONTEXT-LIST-001 / 002 不受影响**：列表取舍与呈现均属 Plugin 层，与 Runtime 解耦，可先行合并。

## 五、本卡验收

1. U1–U4 各有明确建议默认值、判据与决策位；U1–U3 需用户或中控签字确认后才可进入实现卡。
2. 现状核对表的每一项都可由仓库当前 HEAD 复现（文件/命令可查），不接受「据说已完成」。
3. 关系声明（第四节）写入卡内，MAINT-001 卡首行同步标注「过渡件」。
4. 本卡不新增代码、不改配置、不改契约。

## 六、允许写集

`mvp/docs/PLUGIN-ARCH-001.md`（本卡）、`mvp/docs/PLUGIN-CONTEXT-MAINT-001.md`（仅首行加过渡件标注）。

## 七、禁止

不改任何实现文件；不引入 Runtime 骨架代码；不改契约版本；不把 §3 工程建议（初期策略）写成已验证事实；不声称首版闭环可运行。
