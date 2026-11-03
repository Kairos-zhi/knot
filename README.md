# Knot · 认知与协作连续性系统

Knot 为人和 Agent 提供共同的工作环境：材料、想法、会话和产物可以留下来，成为能继续引用、连接和加工的资产。连接让思考继续生长，思考再被资产化，人与 Agent 围绕同一组对象共建；活结可以重选和断开，但人的选择权始终在场。

**极致的聚焦，优雅的交互，便捷的连接与使用。**

---

## 当前开发入口（2026-11-03）

当前核心位于 `mvp/`，主承载方向为 Codex 插件，先支持创作者探索与思考连续性。DSH 候选保留对照。开工先读[开发基准](mvp/docs/development-baseline.md)、[STATE](STATE.md)、[QUEUE](QUEUE.md)及[本轮收口卡](mvp/docs/PLUGIN-W1D1-BASELINE-001.md)。本次文档修订更新基线与同步状态，工程实现按具体任务卡推进。

旧 knot-desktop/knot-flowgram-app 已移出 main，不是运行入口；根 ctx 为第一屏快照，不证明插件已交付。[MVP说明](mvp/README.md)提供数据与操作入口。

原四周 Roadmap 已在本轮交接包本地归档；未复制到公开仓，不再称原件缺失。旧 AC-01 时间节省≥50%、AC-02决策追溯≥90%、AC-05未决不杜撰保留原任务适用范围，不单凭这些指标宣布创作者探索阶段已完成。

---

## 历史参考（仅供追溯，MVP 不使用）

### 旧探索代码（已归档，2026-10-28）
- `knot-desktop/` — 旧桌面模块尝试
- `knot-flowgram-app/` — 旧 FlowGram React 原型
- `阶段2_dispatch/` — 旧任务派发卡

这些目录已从 main 分支移除，但历史 commits 中仍可追溯（见 `f7d641a6` 之前的提交）。

### 研究材料
- `evidence/` — 214 份结论件（PR #15-18 相关）
- `docs/` — 旧架构文档（部分可能过时）

这些目录不是当前运行入口；涉及产品与研究结论时，按当前任务卡定向引用。文档、研究和讨论也是开发材料，旧实现不作为现行实现地图。

---

## 从这里读

| 你想了解什么 | 入口 |
|---|---|
| **MVP 快速开始** | [mvp/README.md](mvp/README.md) |
| **数据模型** | [mvp/docs/SCHEMA.md](mvp/docs/SCHEMA.md) |
| **导入契约** | [mvp/docs/IMPORT.md](mvp/docs/IMPORT.md) |
| **原始 SQL** | [mvp/backend/schema_v1.sql](mvp/backend/schema_v1.sql) |
| **治理规则** | [AGENTS.md](AGENTS.md) |
| **历史决策** | [26 文件候选 @ ed54934](https://github.com/Kairos-zhi/knot/tree/ed54934) |

---

## 项目状态

本次核对远端 main 为 `5a731a0e4509350ad0bc4e258cf903ffc83a81c5`。#49/F1 与 #50/N1 已合入，包含只读 front 入口及 schema 1.6 新建库。已有库升级仍走显式迁移。L2a 整链、DSH 集成及 claim 修复草稿分开登记于 STATE。

本次文档修订未重跑产品测试；旧Day7、CI、独立复核与用户体验保持各自范围。当前遗漏前置见[P0任务卡](mvp/docs/PLUGIN-P0-REGISTER.md)。文档同步不是生产部署或完整产品接受。

---

## 治理与协作

本项目遵循 [AGENTS.md](AGENTS.md) 治理规则：
- Maker 和 Checker 责任分离
- 自我验收禁止
- 自动合并禁止
- 每次变更必须走独立分支 + PR
- 凭据泄漏零容忍

**协作分工**：Maker实现与自核，独立Checker复核，之把守最终接受与合并；
本页不把某个固定账号、模型或窗口视作长期角色绑定。

---

## License

MIT (待确认)

---

**最后更新**：2026-11-03（本地基线与上下文收口）
**下一动作**：按当前收口卡与 P0 台账完成复核、送达登记；工程任务按具体卡推进。
