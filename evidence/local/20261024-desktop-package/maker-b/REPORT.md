# RUN014 Maker B

制作verify-desktop-candidate.cjs、desktop-candidate-isolation.test.mjs与具体部署/回滚说明，未改产品src/lib、A脚本、在用profile/ASAR或旧证据。既查开发基准、DESKTOP003COMPAT、旧官方manager实际0.2.1源码、现bundle依赖落点，复用官方public PluginManager.inspect/installBundle、official pnpm、旧official Cordis/WebServer worker及renderer bundle测试方式。

最终指定A冻结candidate，manifest SHA256 a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8，先校验摘要/25文件，再用file绝对bundle目录通过official manager真实离线安装到新D:/Temp/kont-candidate-manager-* profile。保持兄弟file依赖落点；official pnpm强制offline/ignore-scripts/禁auto peers/独立store、空npm config。无版本豁免。实际安装成功且enabled:false/no-HMR返回restart-required，不冒称manager热加载或Desktop部署。

临时profile实际解析copied plugin，全部25文件逐字节等于candidate而非repo source；从copied plugin执行official0.2.1 Cordis/WebServer apply，cookie auth/hostile origin/共用kernel/schema4/SSE/disposal/durable readback通过；copied renderer bundle的真实module factory/slots注册与stylesheet dispose通过。后者是renderer装配程序化验证，非运行窗口渲染或人的体验。临时profile均回收。最终聚焦2/2：指定A候选成功链；临时副本故意不兼容peer9.9.9被official gate拒绝。原candidate不变，未覆盖网络安装。

最早source布局探路一次失败原因是隔离profileContext缺少官方patchPath/overlays；补全公开profile形状后source探路通过，最终证据已改为A候选。错误不作为正式candidate通过证据。

说明中明确实际部署前另捕获旧已安装code/dependency-layout及hash并验证rollback副本；旧file spec指repo不能当旧代码回滚。本卡未读取/打包用户profile数据，未制作可用旧代码rollback包、未部署、未读凭据/用户Session、未模型、未提交。等待独立Checker与根Gate。
