# DESKTOP015 Maker B

仅新增verify-desktop-rollback.cjs及desktop-rollback-isolation.test.mjs，不改产品、根状态、A捕获脚本或在用Desktop。复用RUN014官方0.2.1 PluginManager公开inspect/installBundle离线隔离流程；旧代码用既有desktop-compat-worker测试，不套最新Run/query或面板假设。

最终输入为A从真实installed字节捕获的rollback candidate，manifest SHA256 d5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336。B先调用A verifyDesktopRollback，以可信摘要核完整inventory、originalPackages2项与唯一允许依赖落点转换，拒绝未知文件/目录/redirect。实际旧product12项，非RUN014新代码25项。原peer保留0.1.7-rc.2 || 0.2.1-rc.2，未豁免或改版本gate。

官方manager在新D:/Temp/kont-rollback-manager-* profile执行真实installBundle(enabled:false)，官方pnpm强制offline/ignore-scripts/禁auto peers/独立store、空npm配置，安装成功返回restart-required/no-hmr。不是实际Desktop active或已回滚。resolver所得installedBundle和plugin均realpath限定临时profile内；复制后全部12文件按可信manifest逐hash/bytes验证。copied旧plugin actual Cordis/WebServer apply、cookie auth/hostile origin/共用kernel/schema4/SSE/disposal/durable readback通过；copied旧renderer实际module factory/slots注册/stylesheet dispose通过。临时profile清理。

聚焦3/3 exit0：真实旧捕获件完整隔离安装/运行；错误可信pin在建profile前拒绝；未知bundle/.npmrc在调用manager前拒绝。测试从已捕获artifact的临时副本读取，不再读取用户profile，不以最新repo源模拟旧版本。最初generic布局探路仅用于开发，未计作最终旧installed证据。

本卡未部署、未开关Desktop、未读凭据/用户Session、未调用模型、未提交。未证明当前Desktop活跃态、真实回装、人的UI体验、数据回滚或网络安装；回装代码候选验证不自动包含用户数据恢复权限。等待独立Checker与根Gate。
