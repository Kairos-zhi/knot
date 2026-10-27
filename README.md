# Knot · 认知与协作连续性系统

Knot 为人和 Agent 提供共同的工作环境：材料、想法、会话和产物可以留下来，成为能继续引用、连接和加工的资产。连接让思考继续生长，思考再被资产化，人与 Agent 围绕同一组对象共建；活结可以重选和断开，但人的选择权始终在场。

**极致的聚焦，优雅的交互，便捷的连接与使用。**

---

## MVP Development (2026-10-28 onwards)

**当前主线开发位于 `mvp/` 目录。**

All MVP code is under the `mvp/` directory.  
Legacy exploration code (`knot-desktop`, `knot-flowgram-app`) has been archived (2026-10-28).  
See [mvp/README.md](mvp/README.md) for MVP documentation and quick start guide.

**四周 Roadmap**:
- Week 1: S1 导入与指纹 + CI 基建
- Week 2: S2 候选关系派生 + S3 时间轴与续接
- Week 3: 前端开发（React + TypeScript）
- Week 4: 桌面集成 + AC 验收

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
| **数据模型** | [mvp/backend/schema_v1.sql](mvp/backend/schema_v1.sql) |
| **治理规则** | [AGENTS.md](AGENTS.md) |
| **历史决策** | [26 文件候选 @ ed54934](https://github.com/Kairos-zhi/knot/tree/ed54934) |

---

## 项目状态

**主线**: `main` @ `f7d641a6` (2026-10-28 01:05)  
**MVP 初始化**: `197aa5e` (2026-10-28 01:29)  
**旧代码归档**: 本 commit (2026-10-28)

**已完成**:
- ✅ SQLite schema v1.0 (7 核心表 + FTS5)
- ✅ 数据库初始化脚本
- ✅ 26 文件候选（`ed54934`，产品化包装）
- ✅ Frontier17 算法验证（22,391 assertions）
- ✅ 四 PR 合并记录（#15-18）

**进行中**:
- 🔄 Week 1 Day 2: AssetRepo / EventStore / RuleRegistry 接口

**未开始**:
- ⏭️ 导入脚本 + v0.4 真实数据
- ⏭️ 算法迁移
- ⏭️ CI 上线
- ⏭️ 前端开发
- ⏭️ 桌面集成

---

## 治理与协作

本项目遵循 [AGENTS.md](AGENTS.md) 治理规则：
- Maker 和 Checker 责任分离
- 自我验收禁止
- 自动合并禁止
- 每次变更必须走独立分支 + PR
- 凭据泄漏零容忍

**当前窗口**:
- Maker（安鼎）: Codex CLI + lark-cli
- Checker + Holder（小禾）: 桌面 default profile
- Seeker（大荒谬）: aily-cli（调研探索）
- Human Holder（之）: 最终验收

---

## License

MIT (待确认)

---

**最后更新**: 2026-10-28 01:4x  
**下一里程碑**: Week 1 Day 3 — 22 个文件成功导入
