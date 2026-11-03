# Knot 当前执行状态

更新：2026-11-03（Asia/Shanghai）。本次修订记录远端主线、独立工程候选和上下文同步增量。任务为 [PLUGIN-W1D1-BASELINE-001](mvp/docs/PLUGIN-W1D1-BASELINE-001.md)；新阶段 W1D1 不覆盖旧 MVP Week 1。

## 本轮基线

- 初版开工时本地及远端 main 均为 `6977bc2`（#48 合并点）。本次核对远端 main 为 `5a731a0e4509350ad0bc4e258cf903ffc83a81c5`，本地 main 仍为 `6977bc2`。
- 文档草稿 [#51](https://github.com/Kairos-zhi/knot/pull/51) 来自 `codex/w1d1-baseline-sync-20261103`，仍从 `6977bc2` 分叉。下列产品事实按远端 main 核对。
- 核心在 `mvp/`；`ctx/` 是 M1 第一屏快照，不证明完整工作台交付。
- 用户最新明确先完成交接包定义的 Codex 第一阶段，再基于共用核心推进 Hermes、DSH 薄适配。第一阶段的五组能力与收口条件见 [阶段路线](mvp/docs/PLUGIN-CODEX-PHASE1.md)；不能收窄为工具发现、检索或固定续接案例。DSH 候选保留作对照，附件的具体建议不自动成为执行授权。

## main 实现与边界

| 范围 | 源码事实及边界 |
|---|---|
| 初始化/迁移 | 新建 schema **1.6**，校验 1.0 至 1.6 七条版本记录。已有文件/目录/悬空软链拒绝，已有库升级须显式迁移 |
| 资产/支持 | Repo、Frontier17、编号候选、确认/撤回、支持视图、时间查询和 trace 已有；不证明通用自然语言理解或任意关系编辑 |
| 续接/运输 | bundle/jobs、HTTP、CLI、持久 journal 与 SSE since 重放已有；不是通用 Agent 调度，也非真实模型续接验收 |
| 权限 | token→actor、reader 正文授权、bundle 幂等 actor 绑定已有；同步 claim 幂等仍只比较 body，见 P0-03 |
| 一致读 | read_snapshot 与 HTTP/离线查询入口已有；不再按“空白待实现”派卡，本轮仅静态核源 |
| 来源/查找 | manifest 文件导入已有；origin=v0.4、event_time 来自文件 mtime，不等于聊天来源适配。FTS 不等于现有 HTTP 关键词入口 |
| Codex | 已有独立候选的隔离 app-server 插件发现、启动和合成 meta 调用证据；本轮未向当前用户桌面配置安装，真实正文及人的使用尚未验收 |

## 主线合入与候选登记

| 候选 | 定位 | 当前状态 |
|---|---|---|
| L2a → CLI → HTTP | `b0aa782 → f2cf022 → 57cbaf2` | 独立 worktree 依赖链，历史复核保留；未入上述 main，待具体 Gate |
| F1 | PR [#49](https://github.com/Kairos-zhi/knot/pull/49)，`7091c6a` | 已合入 `2ec6d6c`，提供只读视图与取件入口。四项历史证据缺口仍保留 |
| N1 | PR [#50](https://github.com/Kairos-zhi/knot/pull/50)，`edf8d5a` | 已合入 `5a731a0`，主线新建库为 1.6。历史独立复核缺口单列 |
| P0-03 / P0-08 | [#52](https://github.com/Kairos-zhi/knot/pull/52)，`a33ca1276d55ee983842c355bfa26b2cac7fd584` | 开放草稿，未合并。独立 Checker 已绑定候选，Maker 全量 501 passed、2 skipped，Human Gate 待定 |
| P0-04B | 独立分支 `codex/p0-04b-meta-projection`，`85417d5f4e23946214a16a39e16e9fde52c42ba0` | 离线元数据投影，28 项定向测试与独立复核通过；仅本地提交，未推送/合并/接入宿主 |
| P0-04C | `codex/p0-04c-codex-mcp`，`df0b9a108016d83e6dbbd59a8b2a50fc9c4c7a7c`，依赖 `85417d5` | 本地只读 MCP 入口；默认依赖收集阻塞已修，独立定向36项通过、全树只收集531项，最终提交已独立绑定。未推送/注册宿主，不是关键词查找或正文阅读 |
| P0-04D | `codex/p0-04d-plugin-package`，`8f59798e16a1dd7703bd81d88dff66ee5fdda198`，依赖 `df0b9a1` | 本地封装候选，六文件。独立40项定向通过，依赖清单增量后另核4项包测试；535是收集数。Codex临时配置中真实发现/调用及令牌转发正反对照通过；未推送、未装在用环境 |
| DSH 001/001B | 独立 knot-first-usable 基于 `57cbaf2` | 旧001交互被用户否定，后续001B保留限定技术复核；两者不混同。casework/dsh未跟踪产物仍在，未获体验/生产接受 |

## 人员、运行与接受

GPT-6 中控、GPT-6.1 实现，独立 Checker 复核。PR51/52 的固定增量通知已由四个 Codex 窗口、Hermes、Dot 共 6/6 读回；Dot 的接收者 claim/receipt 与日志经独立核验。Hermes 通过已有会话排队提交并产生合法回执，旧桥失败及旧回执枚举差异仍保留。该闭环只覆盖原固定 DELTA，不代表本轮路线和后续代码增量已全部送达。路线新广播发出后，用户明确无开发计划的窗口无需同步；后续仅覆盖当前开发/复核 Agent，不再追旧窗口齐套回执。P0-04A 未找到可验证的 Knot 宿主，未运行真实宿主 canary；这不阻止隔离适配开发。

此前隔离开发HTTP实例归属已由原DSH窗口确认，父进程与实际监听/锁owner的子进程也已对应。P0-04D开工只读快照中，原端口已无监听、原父子PID均未见；不再用旧快照声称服务仍在线，也不据此推定业务库无其他写入者或自行恢复服务。旧001体验失败与001B限定复核保留。本轮只启动临时合成测试服务，不重启、迁移或接管案例环境。禁止双主写是约束，不等于全部导入/迁移入口已具强制排他机制。

本次文档修订未重跑产品测试。旧测试数、限定 Checker 结论、用户体验、发布和完整产品接受分开。当前动作见 [QUEUE](QUEUE.md)、[P0台账](mvp/docs/PLUGIN-P0-REGISTER.md)。

旧状态完整保留于 [STATE@6977bc2](https://github.com/Kairos-zhi/knot/blob/6977bc29e18481cf930dca96bdbecd1cee0503d0/STATE.md)。旧 Week1、TD01、ENTRYPOINT-SYNC-001、048–050、冻结候选及 pin 不改；旧接受不外推，路线变化不抹去未决。
