# DESKTOP017 Maker B

新增verify-desktop-recovery.cjs、desktop-recovery-data.mjs与desktop-recovery-isolation.test.mjs。先调用A完整candidate verifier，固定恢复pin 774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d，014源pin亦固定；未知digest在任何包读/store创建前拒绝。未build或改014/015/016冻结产物，未修改产品store。恢复候选明确为015旧11项加014原store/run两项的13文件派生组合，不是原installed rollback或完全旧行为；现代store会支持run.prepare，snapshot保留journal。

使用014与恢复候选的真实持久层，所有数据新建D:/Temp/kont-recovery-data-*。五阶段prepared/reserved/submitted/uncertain/completed依次014写→恢复读→成功普通worksite.update→无runs字段snapshot restore→关闭→014重开。逐阶段journal hash与完整runs深比较保留，claims/receipts未变，generated block内容/来源保持。读时磁盘hash不变，写/restore改变工作现场revision而不改变journal。显式空runs与有效但不同journal restore均拒绝且文件字节不变。有claim四阶段重复acquire=false、改requestSha约束RUN_DISPATCH_CONFLICT且字节不变；prepared主链仍无claim，另克隆合成文件验证合法首claim成功一次、重复false。completed合成回流是synthetic-test，无Agent/Provider/模型执行。

官方PluginManager实际offline installBundle(enabled:false)安装到新临时profile，全部13文件hash/bytes等于候选，bundle/plugin realpath均在临时根，原peer未改，无豁免。manager返回restart-required/no-hmr，不冒称热加载或实际部署。copied恢复plugin经旧desktop兼容worker实际official Cordis/WebServer/auth/kernel/SSE/disposal/persistence通过；旧UI renderer实际module factory/slots/stylesheet dispose通过。仅旧UI外壳，不声称现代Run面板或人的体验接受。

聚焦4/4 exit0，before/read/write/restore/reopen hashes与运行状态见data-report.json；安装见isolated-install.json。所有owned stores先close，安全核对绝对临时根后清理。未读在用profile/生产资产/凭据/用户Session，未启停Desktop、未模型/部署/提交。只证明该派生代码组合的合成数据恢复路径；生产数据兼容、实际恢复部署与正常重启仍未验证，部署许可为false。等待独立Checker与根Gate。
