# Knot MVP 开发基准

2026-10-28。当前代码定位为 `217a0c8da3030e682267963a562e16c9d6c72db4`（PR #27 合并点）；这是本页核对基线，后续开工仍须核实际 HEAD、工作区及目标分支。本文同步已有约束与入口，不采纳新后端准则或变更产品路线。

## 阅读与事实源

1. 根 [STATE](../../STATE.md) / [QUEUE](../../QUEUE.md)：当前状态、任务与证据边界。
2. 当前任务卡：目标、允许文件、授权、验收及未覆盖项；本轮为 [入口同步](ENTRYPOINT-SYNC-001.md)。
3. [SCHEMA](SCHEMA.md)、[IMPORT](IMPORT.md)、[API](API.md) 与对应源码／测试：实现和接口；冲突时核源并记漂移，不静默改业务语义。
4. [Day 7 实跑记录](W1D7-EVIDENCE.md)、[断言映射](W1D7-CLAIM-MAP.md)及各任务回执：只证明各自基线和范围，不把旧测试数或旧 CI 当成本轮实测。

四周 MVP Roadmap 的交接原件名为 `20261028_Knot_前后端Roadmap_写死版_v1.0.md`，当前仓库未收录正文。涉及周次或范围争议时回源，不用旧 `docs/product/roadmap.md` 的五阶段与 G0–G8 替代，也不由本页重排。后端工程准则 v0.2 是本地待审草案，未作为本页的强制标准。

## 当前代码地图

| 位置 | 职责与边界 |
|---|---|
| `mvp/backend/schema_v1.sql`、`init_db.py`、`migrate_*.py` | 当前 schema 1.3、新建及显式升级；初始化会询问后删除已有目标，不能用于已有业务库或替代迁移 |
| `asset_repo.py`、`event_store.py`、`rule_registry.py`、`_db.py` | 资产／事件／规则访问与连接生命周期；session 复用连接，跨操作原子性需同一实例的显式事务 |
| `import_baseline.py` | 校验来源并逐文件提交资产＋import 事件；整批可部分完成，DB 回滚不自动删除外置对象 |
| `frontier17.py` | 纯计算内核；冻结参考独立保留，不因文档或接口整理改算法 |
| `frontier17_db.py`、`support_view.py` | SELECT-only 状态适配与支持族投影；调用方负责连接和一致读事务 |
| `mvp/tests/`、根 CI 与 pytest 配置 | 回归、冻结 fixture 校验及基准脚本；数量及通过结论绑定实跑，不由文件存在推导 |

表中的 backend 模块名相对 `mvp/backend/`。前端、时间轴、续接及桌面整体验收的完成状态按任务核定，不把占位目录或已有表结构算作功能完成。

## 不变量与工作流

- 后端查成熟机制，前端对齐 Apple 的系统组织与连续性；先查旧实现和约定，再做最小任务。第三方机制参考与源码复用分开核对。
- 人和 Agent 共用对象与操作内核；不另造资产或运行权威，宿主保持薄适配。历史承载与当前 MVP 不默认共享 Store，不双主写同一业务文件。
- 历史按现有追加契约保留；候选不自动成为用户确认。布尔、来源及正文分层授权；无可靠依赖证书时不冒险复用动态查询结果。
- 保留 carry-forward、规则版本和空支持集语义；1.2 旧库的 rowid 兜底与合规 1.3 库的唯一索引分开验证。不从自由文本猜映射。
- 每卡既查 → 拆卡 → Maker 自核 → 独立 Checker → 限定 Gate → 入档。服务层与程序化验证优先，禁止截图／模拟点击作为 Agent 开发或验证路径；人的体验由之过手。
- 自测不是自验收，文档不是运行证据，仓库整合不是部署或产品接受。提交后不 reset、amend、force push；真实模型、生产安装及合并须具体授权。

## 验证与历史追溯

文档变更核链接、事实、范围及冻结源，不为低风险文字改动重跑全部测试。代码变更在已有开发环境按任务运行针对性与必需检查；CI 当前配置为 Python 3.12、`python -m pytest mvp/tests/ -q` 和两枚 fixture SHA256 校验。配置存在不等于远端运行成功或 branch protection 已核定。

根 `docs/` 保存历史设计和研究。旧桌面候选 `ed54934`、pin 与原接受范围保留为历史来源，不复活旧承载或推导新版 MVP 已验收。旧根状态原文固定在 [STATE@217a0c8](https://github.com/Kairos-zhi/knot/blob/217a0c8da3030e682267963a562e16c9d6c72db4/STATE.md)、[QUEUE@217a0c8](https://github.com/Kairos-zhi/knot/blob/217a0c8da3030e682267963a562e16c9d6c72db4/QUEUE.md)；离线可用 `git show 217a0c8:STATE.md` / `git show 217a0c8:QUEUE.md`，不依赖旧工作区路径。
