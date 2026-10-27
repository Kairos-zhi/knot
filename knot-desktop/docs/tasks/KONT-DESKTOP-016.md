# KONT-DESKTOP-016 · 候选绑定与数据兼容预检

授权：之“继续”，接续DESKTOP-015下一步；基线79dd8d1。允许本地开发、冻结候选校验、合成数据验证与独立复核。不启动／更新／重启Desktop，不写在用profile或签名ASAR，不读真实资产／Session／凭据，不调用模型，不推送／合并。

既查：开发基准、STATE、DESKTOP-014升级目录与DESKTOP-015旧代码副本、既有desktop-host-client/debug和原RPC测试。复用官方manager协议、兼容闸门与既有包校验器；补缺为可信候选绑定及数据兼容判断。无新UI，不改变Apple及人／Agent共用内核基准。

已见风险：旧store与新store均schemaVersion 4，但旧normalizeSnapshot／store投影不保留runs。只读重开磁盘不变不能证明下一次写入无损；需直接使用冻结新旧store实测，不能重build旧副本或修改旧证据来隐藏问题。

拆卡：A负责候选绑定／管理工具与必要测试，只从可信014／015 manifest生成spec，调用前核库存／摘要、拒绝伪造计划和漂移，默认只读；B负责实际新旧持久层的合成数据预检／报告与必要测试；根负责本卡、研究结果、中控与证据索引；独立Checker冻结后复核。允许scripts/desktop-deployment-plan.mjs及必要client/debug适配、tests/desktop-deployment-plan.test.mjs、scripts/desktop-data-compatibility.mjs、tests/desktop-data-compatibility.test.mjs和本卡档案。不增加业务store或另一套协议。

安装准备不等于执行授权或生产数据接受。即使显式allowInstall，候选变更或数据兼容未证仍不能把准备状态标为可部署；不接受随手布尔值冒充兼容实证。本卡若证实旧代码会损坏Run记录，应限定接受可复现检查和拒绝门，保留未解决的真实部署缺口。

验证：复用原RPC相关聚焦回归，新候选绑定／篡改／错pin／漂移拒绝；冻结真实store在新建D:/Temp合成材料上的旧→新、Run各阶段新→旧读写往返，记录磁盘hash与journal／provenance是否保留。禁止截图点击／真实模型请求；不重复全仓库测试。archive_id=kont-desktop-preflight-20261024；证据根evidence/local/20261024-desktop-preflight。

制作回收：A新增只读desktop-deployment-plan，未改legacy/client/debug，build0＋12/12（新3＋原RPC9），真实只读prepare通过、evaluate0。B r2固定双pin，4/4；五种阶段Run在旧内存与旧写后重开均1→0，只读磁盘不改，资产／provenance仍在；明确拒绝生产许可。r1留样保留，r2补调用者不能自带任意摘要导入未审代码。新manager保持pre-upgrade，实际install即opt-in仍DATA_COMPATIBILITY_BLOCKED，不发transport。

七格收口：目标＝可信包绑定与可复现的数据兼容拒绝门；回收＝两制作线冻结、独立Checker完成；证据＝evidence/DESKTOP-016-INDEX.json及AA/checker/final-review.json；验收＝ACCEPT_REVIEWED_PREFLIGHT_AND_UNSAFE_DOWNGRADE_DETECTION_LIMITED，实现无阻断、deploymentReady=false，13冻结项、独立A13＋B4分两次通过；入档＝本卡／STATE／QUEUE；记录＝一次本地提交，无生产资产／凭据会话读取、在用profile写、桌面启停、模型、push／合并；未决＝Run journal危险降级尚未修复，生产数据兼容／迁移与实际部署未接受。下一步补兼容恢复方案，不能把旧代码重装或相同schemaVersion当安全恢复证据。
