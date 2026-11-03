# Knot 当前执行状态

更新：2026-11-03（Asia/Shanghai）。本轮只做本地基线、上下文收口同步及遗漏 P0 补卡，不开展插件或后端功能实现。任务为 [PLUGIN-W1D1-BASELINE-001](mvp/docs/PLUGIN-W1D1-BASELINE-001.md)；新阶段 W1D1 不覆盖旧 MVP Week 1。

## 本轮基线

- 本地开工 HEAD 与远端 refs/heads/main 均为 `6977bc29e18481cf930dca96bdbecd1cee0503d0`（PR #48 合并点），开工工作树干净。这是查询时点，不是持续监控。
- 文档分支 `codex/w1d1-baseline-sync-20261103`；本轮本地修改不代表 main、远端或在用环境更新。
- 核心在 `mvp/`；`ctx/` 是 M1 第一屏快照，不证明完整工作台交付。
- 当前主承载方向为 Codex 插件，支持创作者探索与思考连续性。DSH 候选保留作对照；旧“直接高度定制 DSH”锚点不再作为新任务默认入口。附件中的具体建议不自动成为授权。

## main 实现与边界

| 范围 | 源码事实及边界 |
|---|---|
| 初始化/迁移 | 新建 schema **1.4**；已有文件/目录/悬空软链拒绝，不询问后删除。1.5/1.6 为显式迁移；不能把迁移器存在写成新库已是1.6 |
| 资产/支持 | Repo、Frontier17、编号候选、确认/撤回、支持视图、时间查询和 trace 已有；不证明通用自然语言理解或任意关系编辑 |
| 续接/运输 | bundle/jobs、HTTP、CLI、持久 journal 与 SSE since 重放已有；不是通用 Agent 调度，也非真实模型续接验收 |
| 权限 | token→actor、reader 正文授权、bundle 幂等 actor 绑定已有；同步 claim 幂等仍只比较 body，见 P0-03 |
| 一致读 | read_snapshot 与 HTTP/离线查询入口已有；不再按“空白待实现”派卡，本轮仅静态核源 |
| 来源/查找 | manifest 文件导入已有；origin=v0.4、event_time 来自文件 mtime，不等于聊天来源适配。FTS 不等于现有 HTTP 关键词入口 |
| Codex | 本机扩展机制已核；没有本轮 Knot 插件安装、发现、连接或用户使用验收证据 |

## 候选独立登记

| 候选 | 定位 | 当前状态 |
|---|---|---|
| L2a → CLI → HTTP | `b0aa782 → f2cf022 → 57cbaf2` | 独立 worktree 依赖链，历史复核保留；未入上述 main，待具体 Gate |
| F1 | PR [#49](https://github.com/Kairos-zhi/knot/pull/49)，`7091c6a` | 本轮查询 open/draft/unmerged；四项历史证据缺口未闭合 |
| N1 | PR [#50](https://github.com/Kairos-zhi/knot/pull/50)，`edf8d5a` | 本轮查询 open/draft/unmerged；新建库1.6是该候选行为，不是 main |
| DSH 001/001B | 独立 knot-first-usable 基于 `57cbaf2` | 旧001交互被用户否定，后续001B保留限定技术复核；两者不混同。casework/dsh未跟踪产物仍在，未获体验/生产接受 |

## 人员、运行与接受

Codex 负责本轮收口，独立 Checker 复核。4个相关Codex窗口已读回基线、路线及本轮范围。Hermes桌面中控桥仍记录不可达，原通知无claim/receipt；落盘不等于已读。Dot有退出协作历史，未取得重新在线证据，不占执行槽位。私有路径/进程/同步回执仅登记本地交接件。

已有隔离开发HTTP实例保留运行，原DSH窗口已确认案例环境归属。后续只读取证将PID文件中的父进程与实际监听/锁owner的子进程对应，消除了“两个PID是两个实例”的疑点；当前只识别到这一条Knot HTTP服务链，不证明不存在直接SQLite写入者或已绑定运行时代码hash。旧001体验失败与001B后续修改分别保留，不把后台存活当作体验通过。本轮不重启、迁移、接管或另开写入者。禁止双主写是约束，不等于全部导入/迁移入口已具强制排他机制。

本轮未重跑产品测试。旧测试数、限定 Checker 结论、用户体验、发布和完整产品接受分开。当前动作见 [QUEUE](QUEUE.md)、[P0台账](mvp/docs/PLUGIN-P0-REGISTER.md)。

旧状态完整保留于 [STATE@6977bc2](https://github.com/Kairos-zhi/knot/blob/6977bc29e18481cf930dca96bdbecd1cee0503d0/STATE.md)。旧 Week1、TD01、ENTRYPOINT-SYNC-001、048–050、冻结候选及 pin 不改；旧接受不外推，路线变化不抹去未决。
