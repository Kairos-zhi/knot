# 派生恢复承载与写入回转

044新增离线工具，保留唯一KontStore和内核。恢复指软件承载切换后继续读写当前业务数据；不是回退业务快照或导入外部Run。

`prepareSyntheticStoreRecovery()` 无参数，创建独占临时组合。A包含当前index的完整静态传递闭包12文件及package共13文件；B包含旧017入口/UI/package等7文件＋当前数据闭包7文件共14文件（含preview依赖）。逐项固定source SHA和017 manifest硬pin，捕获实际bytes后写入，禁止依赖回落原目录。原017/018与043不变。

新format为kont-synthetic-store-recovery/v1，identity=derived-current-store-on-reviewed-recovery-carrier。manifest登记A/B全部27文件来源和hash，productionCandidate=false。新pin可留档；返回的issued descriptor只在本进程verify/dispose有效，不是持久恢复凭据。`verifySyntheticStoreRecovery(artifact)` 检查源、manifest、全部字节/完整inventory及重定向；伪造/克隆descriptor拒绝。`disposeSyntheticStoreRecovery(artifact)`只清理原owned目录。准备失败和正常清理使用同一绝对父目录/prefix/realpath栅栏。

`probeStoreRecoveryRoundTrip()` 无参数，不收数据路径、外部state、reader或许可报告，内部生成synthetic状态。阶段为A1→B→A2→A3：各自独立Node子进程、临时HTTP租约，共用同一内部数据文件；前阶段成功dispose/进程close且锁释放后才交接。A使用真实当前handler；B真实调用旧apply并注册workspace/command/events/snapshot四路由。B通过实际human POST与Agent command写入，A返回后再写，A3独立重开核验。

每步全状态比较，只容许明确命令的业务delta和真实revision/seq递增。完整titles、组织、呈现、供给、两条prepared/completed Run、claim/receipt、长Core引用及全部原摘要保留。fixture的claim/return/额外title初始化是内部synthetic设置，不属于B运行或外部Run导入能力。原same-owner restore/journal/CAS保护不放宽。

父进程不改全局env；child只继承必要OS白名单并显式设置内部tmp及synthetic KONT_DATA_DIR/TOKEN/SOURCE，无NODE_OPTIONS/生产DSH变量。worker固定，不接受任意插件执行参数。timeout后等待owned子进程close；交接、dispose、lock或清理失败都阻断成功，不能由后续清理洗掉事实。

报告只含具体manifest/工具/worker摘要、计数、磁盘hash和固定事实/失败码，无业务正文/ID、token、原异常或stderr。`compatible=true`仅表示这份新synthetic组合的数据/backend回转；productionCandidateAccepted、desktopExperienceAccepted始终false。

B没有/runs或/preview路由，无Run observer执行绑定。旧UI默认window、closed fallback及晚到草稿行为仍是旧行为；不接受为当前Apple工作站体验。未验证官方宿主/真实安装、生产数据、模型、跨版本正式发布或双端三轮。新组合不改变旧017已证有损/拒长Run的历史事实。
