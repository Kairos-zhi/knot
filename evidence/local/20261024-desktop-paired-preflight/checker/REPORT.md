# DESKTOP018 独立 Checker

本卡未参与A/B制作，只读审查、先审真实文件读取安全边界，再独立测试与实际预检。A为run_maker，B为根；Checker为live_runner_maker。历史016/017制作经历不替代本卡独立检查，017实现与候选本卡未修改。

结论：ACCEPT_PAIRED_PREFLIGHT_LIMITED，无本卡未决实现阻断。接受范围仅固定014升级与017派生恢复的私有签发只读配对预检、固定真实现场文件的私人副本兼容证据，以及安装默认拒绝。计划deploymentReady=false，两个target即allowInstall:true仍DEPLOYMENT_AUTHORIZATION_REQUIRED；没有真实安装RPC、live Host连接或生产迁移许可。

独立执行A新3项与原016回归3项、B3项，共9/9 exit0。独立复算A/B冻结manifest共11项文件bytes/hash全一致。覆盖固定候选配对、同源准确RPC形状、内部data摘要投影、不可接受调用者自造report/pin/spec/phase、私有WeakMap签发/伪造/过期拒绝、source/data/恢复inventory漂移在transport前拒绝；B合成含Run的完整canonical读写与脱敏、损坏/未知schema/字段/非bytes拒绝。

独立actual-preflight使用真实prepareDesktopRecoveryPreflight：固定D:/DSH-Desktop/kont-data/worksites.json仅read/lstat/realpath，原路径从未交给KontStore，不创建原.lock；实际store读写只在新D:/Temp私人副本。014→017→014读/普通draft编辑/重开全状态canonical一致，故意draft/revision/seq差异以外不丢字段。真实样本assetCount=2、runCount=0；源文件前后SHA256同为e0359bb66a44a41c082ab12c845cbea6a70435e5c9d6f7bc641277a16c3c79ac，原.lock前后均不存在。报告只hash/数量，无正文、对象ID或请求。未知topfields/schema不为4即拒绝，源锁/重定向/变化拒绝；异常使用固定code，避免状态diff泄漏。

在真实source/selection/artifact/data栅栏均启用情况下，独立对upgrade和recovery调用allowInstall:true，均拒绝授权且evaluator次数0；克隆真实计划亦UNISSUED_PLAN。此处没有发送实际manager inspect/list或install请求；A的RPC形状验证为明确synthetic transport seam，不冒称live API接受。

边界：真实样本无Run，不能将本轮实际数据结果扩称生产Run/claim/receipt恢复证明；合成含Run检查和017五阶段证据各自保留。未验证生产迁移、实际升级/恢复、正常重启、live插件active、人的工作站体验、多用户权限或强杀断电。原015危险旧包/016降级拒绝不变，本卡配对恢复为017派生候选。未读凭据/DSH Session、未启停Desktop、未模型、未提交。
