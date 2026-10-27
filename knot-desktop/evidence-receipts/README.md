# Knot 结论件发布包

这是各阶段结论的派生发布副本，供审阅来源、适用提交与验收边界。它不是新工程验收，也不表示主线已合并或软件已部署。

本包收录214份来源结论：其中41份历史索引、55份择要人读材料，覆盖52个归档单元。原建议的137是分组额度；本次补齐048/049分阶段材料并提升人读材料，不以凑137替代逐文件选择。精确来源和角色见[CATALOG.json](CATALOG.json)。

## 先读当前收口

- [048源门、真实候选执行和发布读回](archives/20261027-mainline-integration/INDEX.json)。软件候选固定为ed54934，26文件pin7ac0e3ab13b680de16403bcf62ff290959bfdf9fa7024f804e6885f2e7308c18；本次仅整理结论，没有重跑或重制软件。
- [049失败与r2修复链](archives/20261027-local-sync-049/INDEX.json)。r1源门在切换前核90逻辑路径；后续发现24公开源码引用悬空，r2保持66运行路径元数据并恢复24引用。不能用最终同步成功抹掉旧失败或称90项全程未变。
- 单次真实模型记录属于RUN011当时已消费的许可，原计数保留。本次发布没有模型调用。不同任务与重叠测试数字不得相加当总验收。

## 如何复核

[SCRUB-MANIFEST.json](SCRUB-MANIFEST.json)逐项记录原SHA、派生SHA、JSON Pointer或文本span、替换规则及删除元数据表的原条目数。原件未改；7处运行元数据表投影有明确删除记录，不冒称全部只改路径。JSON重新序列化与Markdown未改文本另按各文件声明处理。公开diff只含原值摘要，不含原私密值。

原索引中的files[].sha256指原件，不指脱敏副本。[REFERENCE-MAP.json](REFERENCE-MAP.json)区分已发布派生件、本地未包含材料及未重新验证的历史引用。完整过程日志、TAP、运行资料、安装产物和原始快照留在受控本地归档；不承诺全部可公开提供。现有测试需要的59份固定代码fixture继续随代码保留，本包没有删除或改写它们。

在仓库根执行：

```sh
node knot-desktop/evidence-receipts/verify.mjs
```

此工具只检查本派生包的文件清单、字节、路由和阶段完整性，不能仅凭原SHA证明未公开原文的内容或完成新的产品验收。原件到副本的逐字段比较由本次独立Checker另核；最终提交和草稿PR以Git记录为准。

路径占位符保留来源间的必要对应关系，区分用户home、桌面宿主、沙箱、临时目录和不透明标识；它们不是可执行安装参数。Gate/verdict/status、计数/布尔、原提交/候选pin与受限范围保持其原始结论；范围文字中的精确本机路径替换另逐span记录。

## 按归档单元阅读

| 归档单元 | 阶段与来源 | 人读材料 |
|---|---|---|
| 20261021-desktop | [阶段索引](archives/20261021-desktop/INDEX.json) | 原件仅结构化回执 |
| 20261021-kernel-adapter | [阶段索引](archives/20261021-kernel-adapter/INDEX.json) | [人读1](archives/20261021-kernel-adapter/runtime-maker/REPORT.md) |
| 20261022-closeout | [阶段索引](archives/20261022-closeout/INDEX.json) | [人读1](archives/20261022-closeout/maker/receipt.md) |
| 20261022-desktop-compat | [阶段索引](archives/20261022-desktop-compat/INDEX.json) | [人读1](archives/20261022-desktop-compat/runtime-maker/REPORT.md) |
| 20261022-run-config | [阶段索引](archives/20261022-run-config/INDEX.json) | [人读1](archives/20261022-run-config/checker/REPORT.md) |
| 20261022-run-contract | [阶段索引](archives/20261022-run-contract/INDEX.json) | [人读1](archives/20261022-run-contract/checker/REPORT.md) |
| 20261022-run-guard | [阶段索引](archives/20261022-run-guard/INDEX.json) | [人读1](archives/20261022-run-guard/checker/REPORT.md) |
| 20261022-run-host | [阶段索引](archives/20261022-run-host/INDEX.json) | [人读1](archives/20261022-run-host/checker/REPORT.md) |
| 20261022-run-read | [阶段索引](archives/20261022-run-read/INDEX.json) | [人读1](archives/20261022-run-read/checker/REPORT.md) |
| 20261023-run-dispatch | [阶段索引](archives/20261023-run-dispatch/INDEX.json) | [人读1](archives/20261023-run-dispatch/checker/REPORT.md) |
| 20261023-run-integrated | [阶段索引](archives/20261023-run-integrated/INDEX.json) | [人读1](archives/20261023-run-integrated/checker/REPORT.md) |
| 20261023-run-live | [阶段索引](archives/20261023-run-live/INDEX.json) | [人读1](archives/20261023-run-live/checker/REPORT.md) |
| 20261023-run-query | [阶段索引](archives/20261023-run-query/INDEX.json) | [人读1](archives/20261023-run-query/checker/REPORT.md) |
| 20261024-desktop-install-gate | [阶段索引](archives/20261024-desktop-install-gate/INDEX.json) | [人读1](archives/20261024-desktop-install-gate/checker/REPORT.md) |
| 20261024-desktop-installed | [阶段索引](archives/20261024-desktop-installed/INDEX.json) | [人读1](archives/20261024-desktop-installed/checker/REPORT.md) |
| 20261024-desktop-package | [阶段索引](archives/20261024-desktop-package/INDEX.json) | [人读1](archives/20261024-desktop-package/checker/REPORT.md) |
| 20261024-desktop-paired-preflight | [阶段索引](archives/20261024-desktop-paired-preflight/INDEX.json) | [人读1](archives/20261024-desktop-paired-preflight/checker/REPORT.md) |
| 20261024-desktop-preflight | [阶段索引](archives/20261024-desktop-preflight/INDEX.json) | [人读1](archives/20261024-desktop-preflight/checker/REPORT.md) |
| 20261024-desktop-recovery | [阶段索引](archives/20261024-desktop-recovery/INDEX.json) | [人读1](archives/20261024-desktop-recovery/checker/REPORT.md) |
| 20261024-desktop-rollback | [阶段索引](archives/20261024-desktop-rollback/INDEX.json) | [人读1](archives/20261024-desktop-rollback/checker/REPORT.md) |
| 20261024-run-panel | [阶段索引](archives/20261024-run-panel/INDEX.json) | [人读1](archives/20261024-run-panel/checker/REPORT.md) |
| 20261025-desktop-inventory | [阶段索引](archives/20261025-desktop-inventory/INDEX.json) | [人读1](archives/20261025-desktop-inventory/checker/REPORT.md) |
| 20261025-desktop-reconciled-attempt | [阶段索引](archives/20261025-desktop-reconciled-attempt/INDEX.json) | [人读1](archives/20261025-desktop-reconciled-attempt/checker/REPORT.md) |
| 20261025-desktop-store-fix | [阶段索引](archives/20261025-desktop-store-fix/INDEX.json) | [人读1](archives/20261025-desktop-store-fix/checker/REPORT.md) |
| 20261025-desktop-successor-installed | [阶段索引](archives/20261025-desktop-successor-installed/INDEX.json) | [人读1](archives/20261025-desktop-successor-installed/checker/REPORT.md) |
| 20261025-installed-workstation | [阶段索引](archives/20261025-installed-workstation/INDEX.json) | [人读1](archives/20261025-installed-workstation/checker/REPORT.md) |
| 20261025-release-readiness | [阶段索引](archives/20261025-release-readiness/INDEX.json) | [人读1](archives/20261025-release-readiness/checker/REPORT.md) |
| 20261025-supply-preview-panel | [阶段索引](archives/20261025-supply-preview-panel/INDEX.json) | [人读1](archives/20261025-supply-preview-panel/checker/REPORT.md) |
| 20261025-worksite-preview | [阶段索引](archives/20261025-worksite-preview/INDEX.json) | [人读1](archives/20261025-worksite-preview/checker/REPORT.md) |
| 20261025-worksite-preview-client | [阶段索引](archives/20261025-worksite-preview-client/INDEX.json) | [人读1](archives/20261025-worksite-preview-client/checker/REPORT.md) |
| 20261025-workspace-events | [阶段索引](archives/20261025-workspace-events/INDEX.json) | [人读1](archives/20261025-workspace-events/checker/REPORT.md) |
| 20261025-workspace-recovery | [阶段索引](archives/20261025-workspace-recovery/INDEX.json) | [人读1](archives/20261025-workspace-recovery/checker/REPORT.md) |
| 20261025-workspace-response | [阶段索引](archives/20261025-workspace-response/INDEX.json) | [人读1](archives/20261025-workspace-response/checker/REPORT.md) |
| 20261026-arch-epoch | [阶段索引](archives/20261026-arch-epoch/INDEX.json) | [人读1](archives/20261026-arch-epoch/controller/CLOSEOUT.md) |
| 20261026-arch-identities | [阶段索引](archives/20261026-arch-identities/INDEX.json) | [人读1](archives/20261026-arch-identities/controller/CLOSEOUT.md) |
| 20261026-arch-lifecycle | [阶段索引](archives/20261026-arch-lifecycle/INDEX.json) | [人读1](archives/20261026-arch-lifecycle/controller/CLOSEOUT.md) |
| 20261026-arch-presentation | [阶段索引](archives/20261026-arch-presentation/INDEX.json) | [人读1](archives/20261026-arch-presentation/controller/CLOSEOUT.md) |
| 20261026-arch-state | [阶段索引](archives/20261026-arch-state/INDEX.json) | [人读1](archives/20261026-arch-state/controller/CLOSEOUT.md) |
| 20261026-work-island | [阶段索引](archives/20261026-work-island/INDEX.json) | [人读1](archives/20261026-work-island/controller/CLOSEOUT.md) |
| 20261026-worksite-folders | [阶段索引](archives/20261026-worksite-folders/INDEX.json) | [人读1](archives/20261026-worksite-folders/controller/CLOSEOUT.md) |
| 20261026-worksite-folders-client | [阶段索引](archives/20261026-worksite-folders-client/INDEX.json) | [人读1](archives/20261026-worksite-folders-client/controller/CLOSEOUT.md) |
| 20261026-worksite-hud | [阶段索引](archives/20261026-worksite-hud/INDEX.json) | [人读1](archives/20261026-worksite-hud/controller/CLOSEOUT.md) |
| 20261026-worksite-library | [阶段索引](archives/20261026-worksite-library/INDEX.json) | [人读1](archives/20261026-worksite-library/controller/CLOSEOUT.md) |
| 20261027-local-sync-049 | [阶段索引](archives/20261027-local-sync-049/INDEX.json) | [人读1](archives/20261027-local-sync-049/checker/REPORT.md) · [人读2](archives/20261027-local-sync-049/r2/checker/REPORT.md) · [人读3](archives/20261027-local-sync-049/CLOSEOUT.md) |
| 20261027-mainline-integration | [阶段索引](archives/20261027-mainline-integration/INDEX.json) | [人读1](archives/20261027-mainline-integration/controller/CLOSEOUT.md) · [人读2](archives/20261027-mainline-integration/checker/REPORT.md) |
| 20261027-progress-writeback | [阶段索引](archives/20261027-progress-writeback/INDEX.json) | [人读1](archives/20261027-progress-writeback/controller/CLOSEOUT.md) |
| 20261027-release-preparation-refresh | [阶段索引](archives/20261027-release-preparation-refresh/INDEX.json) | [人读1](archives/20261027-release-preparation-refresh/controller/CLOSEOUT.md) |
| 20261027-root-candidate-045 | [阶段索引](archives/20261027-root-candidate-045/INDEX.json) | [人读1](archives/20261027-root-candidate-045/controller/CLOSEOUT.md) · [人读2](archives/20261027-root-candidate-045/controller/PUBLICATION.md) |
| 20261027-root-candidate-046 | [阶段索引](archives/20261027-root-candidate-046/INDEX.json) | [人读1](archives/20261027-root-candidate-046/controller/CLOSEOUT.md) |
| 20261027-run-reconciliation | [阶段索引](archives/20261027-run-reconciliation/INDEX.json) | [人读1](archives/20261027-run-reconciliation/controller/CLOSEOUT.md) |
| 20261027-store-reader-pairing | [阶段索引](archives/20261027-store-reader-pairing/INDEX.json) | [人读1](archives/20261027-store-reader-pairing/controller/CLOSEOUT.md) |
| 20261027-store-recovery-roundtrip | [阶段索引](archives/20261027-store-recovery-roundtrip/INDEX.json) | [人读1](archives/20261027-store-recovery-roundtrip/controller/CLOSEOUT.md) |

41份历史gate索引在[CATALOG.json](CATALOG.json)中以legacy-gate-index角色单列，原状态和阶段不改成今天的状态。任何旧pushed=false、待后续Gate或历史生产安装结论都保留当时口径。
