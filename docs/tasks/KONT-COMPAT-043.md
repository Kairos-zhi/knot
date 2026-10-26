# KONT-COMPAT-043 · 完整 Store / reader 离线配对

2026-10-27；MAKER_CANDIDATE_PENDING_CHECKER。根与Checker预核后制作，非自验收。

目标来源为038/042留下的DEBT-01：完整Store状态与具体reader能力尚未配对。复用018的字节捕获、固定pin、私人副本、全语义比较与失败关闭；保留旧018的生产入口/冻结候选。新预检仅Buffer输入、固定current7+017六文件闭包、实际read/full export，无通用插件框架或新runtime模块。

允许变更只新增scripts/store-reader-pairing.mjs、scripts/store-reader-pairing-worker.mjs、tests/store-reader-pairing.test.mjs、本卡和docs/api/store-reader-pairing.md。旧产品、旧tests、历史证据与runtime inventory不改；根单独控制STATE/QUEUE/index。当前7文件pin包含已有dirty状态，不能拿HEAD冒充现实现；017 manifest硬pin774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d。

一次build成功；聚焦5文件27项通过，含本卡7项及038/042和原018两组回归。实际current保全完整状态；017短Run丢metadata/完整导出、214字符agent Run拒绝。synthetic fixture覆盖非默认与额外标题、非空/空folder、呈现、供给、completed Run claim/receipt；所有执行无模型/Session读取。

负例覆盖未来/坏full、额外参数/假报告、同schema部分支持与改值、current源码/manifest漂移、worker/load/spawn失败、timeout、close失败、close失败后数据缺失与清理失败。仅测试隔离副本改固定代码/pin以构造反例/全保全对；公开API不提供注入入口。无raw业务state/错误输出。输入Buffer捕获、read-close磁盘不变、具体闭包和执行摘要均校验。

证据目录evidence/local/20261027-store-reader-pairing/maker，基线复用controller99份。Maker冻结后由独立Checker复核、根Gate。只降低离线读/导出能力未知；真实迁移、writer往返、生产恢复、正式候选和032过期发布清单仍未完成。无生产/profile/凭据/私人Session、模型、系统启停安装、Git mutation。
