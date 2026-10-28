# Knot · 认知与协作连续性系统

Knot 为人和 Agent 提供共同的工作环境：材料、想法、会话和产物可以留下来，成为能继续引用、连接和加工的资产。连接让思考继续生长，思考再被资产化，人与 Agent 围绕同一组对象共建；活结可以重选和断开，但人的选择权始终在场。

**极致的聚焦，优雅的交互，便捷的连接与使用。**

---

## MVP Development (2026-10-28 onwards)

**当前主线开发位于 `mvp/` 目录。** 开工先读 [开发基准](mvp/docs/development-baseline.md)、[状态](STATE.md) 与 [队列](QUEUE.md)；历史桌面文档不作为当前执行入口。

All MVP code is under the `mvp/` directory.  
Legacy exploration code (`knot-desktop`, `knot-flowgram-app`) has been archived (2026-10-28).  
See [mvp/README.md](mvp/README.md) for MVP documentation and quick start guide.

**四周 Roadmap**：交接原件为 `20261028_Knot_前后端Roadmap_写死版_v1.0.md`，正文尚未收录本仓。涉及周次与任务范围须回源核定；本页不重新摘要排期，也不使用旧五阶段路线替代。

**验收标准**:
- AC-01: 时间节省 ≥50%
- AC-02: 决策追溯准确率 ≥90%
- AC-05: 未决问题不杜撰

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

MVP 开发不依赖这些材料，它们仅供历史追溯和参考。

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

**文档开工基线（历史定位）**：`1ea1dfa`（2026-10-28，PR #25 合并点）。
数字命令与输出见[本轮实读证据](mvp/docs/W1D7-EVIDENCE.md)，断言出处见[代码映射](mvp/docs/W1D7-CLAIM-MAP.md)。

**已完成**:
- SQLite v1.3：7张业务表、1张版本表及自持FTS，初始化和显式迁移已实现；TD01 同刻同事件唯一索引已随 PR #27 合入 `217a0c8`。
- AssetRepo/EventStore/RuleRegistry、carry-forward快照查询和稳定支持族视图已实现。
- v0.4来源包候选导入：22资产、22条import事件、19内嵌/3外置；不代表生产库已导入。
- Frontier17 的 Day 7 历史证据记录22,391组断言及69项测试；这些数字不是本轮实跑或当前总数。
- CI配置已在仓库：Python3.12、完整测试及独立字节钉检查；[此运行](https://github.com/Kairos-zhi/knot/actions/runs/40664491008)是历史记录。本轮入口同步未重跑测试或查询远端 CI／保护规则。

**交付跟踪**：当前状态与队列以根 STATE／QUEUE 为入口，具体结论绑定对应任务卡、独立复核回执、提交与CI证据；文档同步不代表软件重新验收。

**后续计划（非已交付能力）**:
- 后续候选关系抽取、时间轴及续接按正式任务卡推进。
- 前端与桌面集成、真实协作和整体验收。

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

**最后更新**：2026-10-28（数据模型与导入契约说明）
**下一阶段**：候选关系、时间轴与续接按正式任务卡推进，周次与范围回源核定。
