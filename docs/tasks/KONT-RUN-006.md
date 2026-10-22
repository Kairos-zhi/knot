# KONT-RUN-006 · 插件只读服务绑定

授权：之“推进”；基线4341f87，干净。只做一个改动：把RUN-005工厂绑定到插件的同一KontStore，注册宿主内部服务；无新HTTP命令，无模型／在用桌面部署。

既查：已读index.mjs、plugin-lifecycle测试、RUN-005工厂与实际官方库测试。复用Cordis provide的fiber所有权、既有异步dispose屏障、同一资产存储和只读观察。后端沿用已复核O1–O5的共用控制面／owner机制，不另造服务总线；Apple方向不变，本卡无UI。既有证据与来源索引不重写，不重查私有原文／远端治理表。

制作：apply(ctx,config)从受信宿主config获得只读能力与许可回调，禁止客户端提供；无配置也默认拒绝，不自动读取。ctx.kontRunObserver.observe(runId)读取同一个store的Run，不可替换readRun；服务scope随插件卸载撤销，已取得引用卸载后也拒绝。卸载取消并等待在途观察释放句柄，再关闭store；外部signal仍有效。只读工厂内版本／许可／指纹策略原样复用，executionAuthorized仍恒false。

允许：最小绑定模块、index接缝、聚焦测试（尽量复用官方worker），本卡/STATE/QUEUE/必要README/回执。禁止修改旧冻结manifest、vendor、在用profile或安装字节。

Maker→独立Checker→Gate；只跑构建、绑定/生命周期及受影响官方只读测试，发现具体回归才扩测。必验：真实Cordis注册/卸载、同store绑定不可被宿主readRun覆盖、默认拒绝无I/O、卸载后拒绝、在途取消/句柄关闭与storage锁释放；无模型／真实用户Session。日志和报告简短，最多一次本地提交。未覆盖实际宿主生产配置、真实模型Run与桌面部署。

archive_id：kont-run-host-20261022；收口七格以本卡结果与controller/receipt.json登记。

结果：Maker与独立Checker构建＋受影响12/12通过，无阻断；Gate=ACCEPT_HOST_OBSERVER_BINDING_LIMITED。目标＝同store只读绑定；回收＝Maker/Checker已回执；证据＝evidence/RUN-006-INDEX.json；验收＝仅隔离实际宿主接缝；入档＝本卡/状态；记录＝一次本地提交，无模型/部署/push/合并；未决＝生产宿主配置、真实Run与人的体验。全量未重跑，不把历史51项改作当前全量。
