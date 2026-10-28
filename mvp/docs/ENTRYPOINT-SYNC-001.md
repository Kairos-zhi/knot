# ENTRYPOINT-SYNC-001 · MVP 入口与状态同步

2026-10-28；基线 `217a0c8da3030e682267963a562e16c9d6c72db4`。用户针对工作树健康检查发现的入口漂移要求解决；初始范围为本地文档。用户随后要求先将未提交内容收进分支再推送，本卡据此固定八份文档到现有分支并推送；不含工程修复、合并或部署。

## 既查与范围

当前 main 代码已在 `mvp/`，但根 AGENTS 指向已移除的 `knot-desktop/docs/development-baseline.md`，STATE／QUEUE 仍描述旧 048–050 阶段；两层 README 和旧文档索引还有过期阶段／版本说明。

已核根 README、AGENTS、STATE、QUEUE、MVP README、SCHEMA／IMPORT、Day 7 证据和源码映射、schema／相关后端模块、CI、Git 历史及 TD01 交接复核回执。Week 1 结账和 TD01 属历史回执，本轮不重跑或重新接受这些工程结果。四周 Roadmap 原件在交接目录，仓库中无对应正文，不把历史五阶段路线当成它。

允许文件仅八份：根 `AGENTS.md`、`STATE.md`、`QUEUE.md`、`README.md`，`mvp/README.md`、`docs/README.md`、本任务卡及 `mvp/docs/development-baseline.md`。不改业务代码、fixture、原回执、旧设计正文或仓库设置。

## 变更与保全

- 新开发基准给出当前代码地图、证据优先级和已有效的治理约束；准则 v0.2 继续待审，不因此生效。
- 根状态与队列区分当前实现、历史接受、未决工程项与本轮文档卡；不自动开后端卡或调整 Roadmap。
- README 入口同步，旧文档地图加历史标识；停止把旧阶段及测试数称为当前运行态。
- 原根状态保留在固定基线 Git 对象中：STATE blob `70d86728e94bf55a100c0a76ec9dd45ed256b3cc`，QUEUE blob `675eb678151d7b52a0375a97e32ae64905da4a76`。通过 `git show 217a0c8:STATE.md`／`QUEUE.md` 原样读回，不改历史提交、旧 pin 或保留工作区。

## 自核、独立复核与 Gate

Maker 自核：八份允许文档内85个相对链接可达；改动文件无越界；无替代字符，代码围栏成对；`git diff --check` 通过。旧STATE／QUEUE的Git blob与上述值一致，两枚fixture的SHA256与CI固定值一致，业务代码和配置无差异。

独立 Checker 初核确认链接、基线、范围和历史对象，要求修正根README两处“Week 2续接”的旧摘要，并建议恢复受影响代码卡的冻结Frontier17回归红线。两处已修并获独立读回确认，Gate为 `ACCEPT_ENTRYPOINT_SYNC_LOCAL_DOCS_LIMITED`，无剩余阻断。仅接受文档内容；纯文档改动未运行完整后端测试，不以此声明运行健康，也不称主线已同步。

后续保全仅纳入上述八份文档（六份已跟踪修改＋两份新增），不遗漏未跟踪的基准和任务卡。提交／推送后以 Git HEAD、分支远端 SHA 和工作区清洁状态核定；不改写提交历史，不合并 main。P0-A 的 `fix/knot-init-create-only` 以及旧桌面 `knot-desktop-integration@2201ec1` worktree 均保持原状，不归档或清理。

独立 Checker 已再次核对上述授权／进度窄增量，确认可固定提交并推送八份文档，无阻断；既有文档 Gate 保持，实际发布不以准予发布替代远端读回。

## 恢复与接受边界

如需撤销，按允许文件逐项对照基线与本卡 diff 恢复；先确认没有后来者改动，不 reset 整仓或清理其他数据。数据、外置对象与运行目录不在本卡范围。

archive_id：`knot-entrypoint-sync-001-20261028`；检索键：MVP、入口漂移、STATE、QUEUE、开发基准。独立文档 Gate 不替代后端工程、在用部署或之的产品接受。
