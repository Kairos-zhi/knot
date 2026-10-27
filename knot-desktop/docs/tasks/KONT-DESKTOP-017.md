# KONT-DESKTOP-017 · 保留Run的派生恢复候选

授权：之“推进”，接续DESKTOP-016发现的数据兼容缺口。基线d7e5702。本卡制作派生代码候选与合成数据／官方隔离安装验证，不实际安装或启停Desktop，不读生产资产／Session／凭据，不调用模型，不推送或合并。

既查：开发基准、STATE、014升级候选、015原旧代码、016五阶段journal丢失证据与现有打包／隔离验证工具。复用官方manager本地bundle／peer gate及现有唯一run-aware KontStore；不fork另一套存储、不无条件保存未知字段。无新UI，保留旧客户端以提供恢复时的原有交互，Apple正式体验仍未接受。

最小方案：015原旧12文件中保留11项，src/store.mjs改用014已审同名文件，并新增014的src/run.mjs，共13项。根已对照两份冻结包的src/kernel.mjs及lib/knot-model.js、snapshot.js、workspace-state.js，四项完全同hash，支持复用现代store依赖。每个候选文件登记具体来源与摘要，package／peer／patch原字节保持；不重build或覆盖原015留样。

该候选是derived recovery，**不是原安装代码原样rollback**。旧UI／旧入口配合已审数据层，目标是保留现行Run journal／claim／receipt；不承诺任意未来schema或生产降级。本卡不修改016预检的固定旧包结论，不解除管理工具的安装拒绝门。

拆卡：A负责scripts/prepare-desktop-recovery.mjs、完整候选verifier、必要tests与13项清单；B负责实际恢复合成往返与官方manager临时profile安装／复制代码／worker及renderer验证；根负责本卡／research／中控／索引；冻结后独立Checker。允许新增对应scripts/tests和evidence/local/20261024-desktop-recovery，不改产品src/lib或014／015／016历史证据。

验收：固定可信源摘要，13项来源字节、路径／额外库存／覆盖拒绝；新→恢复→新五种Run阶段读写与重开，核完整journal hash、生成块／provenance和派发占位不重授；恢复代码snapshot restore不能替换／抹除journal。官方manager离线临时profile安装后逐13项一致，实际kernel/auth/SSE/disposal/durable与旧renderer工厂通过。合成数据在全新D:/Temp中，递归清理前核绝对目标。聚焦验证足够，禁止截图点击。

archive_id=kont-desktop-recovery-20261024。生产数据兼容、真实manager状态、恢复候选接入管理计划、正式部署授权与正常重启另行核对；单次模型授权已消费，新增请求0。

制作回收：候选SHA256=774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d，13项来源映射明确。A3项；B4项覆盖五阶段新→恢复→新、普通写与不带runs restore完整保留journal／claim／receipt／来源，空或不同journal restore、约束变化拒绝；prepared合法首claim单独克隆验证，其他有占位状态不重授。官方manager离线临时profile复制全部13项一致，worker／旧renderer通过。未build冻结包。

七格收口：目标＝保留Run的派生恢复；回收＝A/B冻结、Checker书面完成，末条消息因额度中断后根读回完整档案；证据＝evidence/DESKTOP-017-INDEX.json及AB/checker/final-review.json；验收＝ACCEPT_RUN_PRESERVING_DERIVED_RECOVERY_LIMITED，实现无阻断，17冻结项／13候选项一致，独立A3＋B4；入档＝本卡与STATE／QUEUE；记录＝一次本地提交，无生产资产读／桌面启停／模型／push／合并；未决＝派生组合非原旧包，现代store语义须如实保留，生产数据兼容、接入新pin及实际部署尚未接受，不解除016安装门。
