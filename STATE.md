# Knot 当前执行状态

更新：2026-10-28。代码核对基线为 `217a0c8da3030e682267963a562e16c9d6c72db4`（PR #27 合并点），开发位于 `mvp/`。开工仍须核当前 Git HEAD、工作区与远端；本文不是实时 Git 查询结果。

## 当前文档任务

[ENTRYPOINT-SYNC-001](mvp/docs/ENTRYPOINT-SYNC-001.md)：修正入口与状态漂移，分支 `codex/fix-mvp-entrypoints`。文档限定复核通过；用户随后授权固定提交并推送本分支，实际完成状态以 Git 提交与远端读回为准，不能据本文称 main 已更新。产品代码、fixture、数据库与在用软件不变。

当前读取顺序：[开发基准](mvp/docs/development-baseline.md) → 本页／[队列](QUEUE.md) → 当前任务卡 → [SCHEMA](mvp/docs/SCHEMA.md)／[IMPORT](mvp/docs/IMPORT.md)及源码。

## 已实现与证据边界

- 资产、历史事件、规则访问，共享 SQLite 生命周期，候选导入，Frontier17 适配，carry-forward 与稳定支持族投影均已入库。导入按文件提交资产＋事件，整批可部分成功；外置文件不随 DB 回滚自动撤销。
- 当前 schema 为 1.3，新增 `(snapshot_time,event_id)` 唯一索引；1.2 旧库读取仍保留 rowid 兜底。实现和迁移边界见 [SCHEMA](mvp/docs/SCHEMA.md)、[断言映射 S38–S40](mvp/docs/W1D7-CLAIM-MAP.md)及对应测试。
- CI 与冻结 fixture 核验配置已入库。Day 7 的69项测试、22资产／22事件／19内嵌＋3外置、22,391组断言均是[历史实跑证据](mvp/docs/W1D7-EVIDENCE.md)，不写成当前重新运行结果。TD01 交接复核记录81项测试及独立临时库核验，属于该卡历史证据，本轮未重跑。
- 本轮仅做文档、Git 和冻结文件核对，不据此判定完整后端运行健康、真实业务库已迁移或产品已验收。

## 下一阶段与未决

Week 1 已有结账回执，TD01 已合入本基线；下一阶段按四周 MVP Roadmap 和正式任务卡推进。Roadmap 交接原件名为 `20261028_Knot_前后端Roadmap_写死版_v1.0.md`，正文当前不在仓库；涉及周次／范围先回源，不用旧五阶段／G0–G8 顶替。

后端工程准则 v0.2 是本地待审草案；本轮未实现初始化保护、一致读入口或迁移重跑结构核验。P0-A 初始化保护已由另一独立 worktree 推进（本次只读定位为 `fix/knot-init-create-only@618c7b2`），不属于本卡，也不据此宣称已合入 main。Week 2 抽取／时间轴、后续续接、前端、桌面与整体接受须按任务分别核定，不因现有表结构视作完成。

## 旧桌面阶段追溯

旧048–050记录、候选 `ed54934`／pin及其限定接受是历史来源，不是当前MVP运行状态。原根文件完整保留在 [STATE@217a0c8](https://github.com/Kairos-zhi/knot/blob/217a0c8da3030e682267963a562e16c9d6c72db4/STATE.md)、[QUEUE@217a0c8](https://github.com/Kairos-zhi/knot/blob/217a0c8da3030e682267963a562e16c9d6c72db4/QUEUE.md)，离线可用 `git show 217a0c8:STATE.md`／`QUEUE.md`。

旧桌面实现已从当前主线移出；保留工作区未同步或恢复。历史部署与未决 Gate 不外推为新版已完成或已取消；需要沿用时先明确产品对象、基线及适用性。
