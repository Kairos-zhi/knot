# KONT-RUN-007 · 可序列化宿主只读配置

授权：之“快步前进”；基线ae972e5，工作树干净。只做正式装配：插件JSON/YAML配置→真实宿主能力→已有RUN-006绑定；不部署在用桌面、不调用模型。

既查：RUN-006的apply仍接收函数/Class作为测试注入；已读包声明、bundle patch、绑定/官方worker。官方app-boot公开`ctx.pluginPackages.packageOf(specifier,parentURL)`返回包元数据（name/version/dir/manifestPath），原getDshRuntimeVersion也以app-boot自身包版本为准。运行时有既有sessionPersistence；不另开资产库或运行器。沿用既查O1–O5共用控制面/owner，Apple基准不改，本卡无UI。未扫描用户Session/凭据或远端私有来源。

交付：新增只接受普通可序列化数据的`readAudit`配置（enabled与精确四元绑定grants、可选approvedRequestSha256，默认关闭/无授权）。禁止函数、Class、路径、额外字段或HTTP更新授权；冻结许可快照。通过宿主公开包查询取得实际app-boot/session包版本，严格0.2.1-rc.2，从该受信包装载Session并使用ctx.sessionPersistence；配置不能自报版本/替换service/readRun。需要的宿主服务声明依赖/缺失拒绝，保留旧0.1.7的禁用路径。复用RUN-006退出屏障。

允许最小配置/装配模块、index、必要包声明、已有worker与聚焦tests、短README/本卡/状态/回执。正式装配入口不再接RUN-006测试函数配置；底层bindRunObserver直接单测可保留。禁止手改profile/ASAR/旧manifest或安装依赖到在用桌面。

Maker→独立Checker→Gate；只跑build+配置/装配/生命周期/受影响官方worker。必验：JSON往返可加载；关闭/空白名单无会话读取；授权精确绑定；版本/缺服务/非法字段拒绝；真实官方库完成点读；卸载屏障不回归。若隔离测试对profile解析有替身，明确范围，不冒称已验证实际profile manager部署。所有executionAuthorized=false，未授权真实模型/在用桌面部署。一次本地提交，证据根evidence/local/20261022-run-config。

archive_id：kont-run-config-20261022；七格收口写简短结果与controller receipt，够用即停测。

结果：Maker与独立Checker build＋focused9/9通过，5文件冻结无阻断；Gate=ACCEPT_SERIALIZABLE_READ_CONFIG_LIMITED。目标＝JSON配置装配候选；回收＝两侧已回执；证据＝evidence/RUN-007-INDEX.json；验收＝限定配置／授权／卸载接缝；入档＝本卡与STATE/QUEUE；记录＝本地提交，无模型/部署/push/合并；未决＝真实Desktop profile解析（隔离worker明确适配ASAR anchor）、在用部署、真实Run与人的体验。全量未重跑。
