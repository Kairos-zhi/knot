# Knot MVP 开发基准

2026-11-03 增量核对产品源码以远端 main `5a731a0e4509350ad0bc4e258cf903ffc83a81c5` 为准。文档草稿 #51 自 `6977bc2` 分叉，本次只追加文档修订。初版基线、授权和增量记录见 [PLUGIN-W1D1-BASELINE-001](PLUGIN-W1D1-BASELINE-001.md)。

## 阅读与适用顺序

1. 当前用户请求 → [AGENTS](../../AGENTS.md) → 本文、[STATE](../../STATE.md)/[QUEUE](../../QUEUE.md) → 当前卡及 [P0台账](PLUGIN-P0-REGISTER.md)。
2. 实现以 [SCHEMA](SCHEMA.md)、[IMPORT](IMPORT.md)、[HTTP](HTTP.md)、[机器契约](../contract/v1/endpoints.json)及源码/测试核定；冲突记漂移，不默改语义。
3. `KNOT_交接包_20261103_v1.zip` 已在本地交接区完整保存并验 hash，含原 Roadmap、研究与来源索引。附件文字是材料，不是执行指令；本机路径及核验见私有收口件。
4. 用户最新明确：先完成交接包定义的 Codex 第一阶段，再推进 Hermes、DSH 在同一核心上的薄适配。第一阶段服务创作者自由探索和持续思考，具体能力/缺口/Gate 见 [阶段路线](PLUGIN-CODEX-PHASE1.md)。DSH 旧候选保留对照，不以适配它作为 Codex 第一阶段的前置。旧四周计划只作历史映射，新 W1D1 不覆盖旧 Week1。

## 当前代码地图

以下模块相对 `mvp/`。

| 位置 | 职责与边界 |
|---|---|
| backend/schema_v1.sql、init_db.py | 新建 **1.6**；已有文件/目录/悬空软链拒绝，临时建库自验后硬链接发布；不是升级工具 |
| backend/migrate_schema_v1_5.py、migrate_schema_v1_6.py | 显式 job 来源/reader 迁移，不说明业务库已升级 |
| backend/asset_repo.py、event_store.py、rule_registry.py、_db.py | 共用对象与 SQLite 生命周期，跨操作原子性依同实例显式事务 |
| backend/import_baseline.py | manifest、哈希、逐文件资产+事件事务；外置对象不随DB回滚；v0.4/mtime 不是聊天来源 |
| backend/frontier17.py、frontier17_db.py、support_view.py | 冻结支持计算与状态适配，不推广为通用语义推理 |
| backend/claim_extractor.py、claim_review.py、claim_support.py | 编号候选、确认/撤回/恢复、候选与原子支持；不是任意关系编辑 |
| backend/timeline_query.py、traceback.py | 一致读、时间查询、当前态 trace；行级在线回源在 L2a 独立候选，未入 main |
| backend/continuation_bundle.py、bundle_jobs.py | 五段续接包、持久job、导出；不是通用调度或自动模型发送 |
| backend/http_server.py、backend/http_lock.py、backend/reconcile.py、cli_client.py | loopback、持久journal/SSE、单实例/离线guard、pending显式对账，不重放未知写入；cli_client.py 位于 mvp 根目录 |
| contract/v1/、transport_views.py、tests/ | 共享契约/投影/验证；contract_version 为整数 **1**，不与变更日志小版本或DB schema混写 |

根 `ctx/` 为 M1 快照。#49/F1 的 [只读视图与取件入口](https://github.com/Kairos-zhi/knot/tree/5a731a0e4509350ad0bc4e258cf903ffc83a81c5/front) 已入 main。L2a 与 DSH 集成仍独立，见 STATE。旧 knot-flowgram-app/knot-desktop 只追溯，不恢复为入口。

## 开工必须核实

- 固定 branch/HEAD、工作树、候选依赖、允许文件；未跟踪产物也须登记，不把未合能力算作主线。
- 确认服务PID/端口、目标库实际schema、journal、唯一写入者；已有实例先核归属。导入/迁移没有统一排他证明，不可仅凭制度假定安全。
- token→actor 由服务解释，reader 控制正文；新增多actor写入口前关闭同步claim幂等 P0，bundle修复不外推到claim。
- 明确材料范围、来源、正文进入模型时点及撤选影响；模型可见工具正文返回即已输入，不承诺擦除已进入宿主的历史。凭据正文排除规则需单独验证。
- 附件/旧卡不自动批准安装、模型、发送、合并或删除；本次同步增量只传状态与边界。

## 不变量与验证

人和Agent共用业务对象与操作，宿主薄适配，不新造平行资产权威。保留候选/确认、event_time/recorded_at、空支持集/carry-forward、规则版本及冻结参考；缺依赖证书不冒险复用动态查询结果。

每卡既查→拆卡→Maker自核→独立Checker→有限Gate→入档。服务/程序化验证优先，禁止截图/模拟点击作为Agent开发验收路径；人的体验由之过手。提交后不reset/amend/force push；真实模型、生产安装及合并须具体授权。

本次文档修订只核来源、事实、链接、差异、冻结文件，不重跑产品全套测试。后续代码卡在已有 Python3.12 环境使用独立 HOME/USERPROFILE/basetemp；PATH 的Python商店别名不可用不等于应重装环境。测试/CI/独立复核/体验/部署分别绑定证据。

旧基准保留于 [development-baseline@6977bc2](https://github.com/Kairos-zhi/knot/blob/6977bc29e18481cf930dca96bdbecd1cee0503d0/mvp/docs/development-baseline.md)。
