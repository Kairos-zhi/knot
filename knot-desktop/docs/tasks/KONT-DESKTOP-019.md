# KONT-DESKTOP-019 · 一次性升级安装执行门

授权：之“快步推进。快步”，接续018。基线9bb7fea；本卡开发执行器与隔离验证，不等于用户已批准写入在用profile或启停Desktop。真实human grant本轮0，模型授权不续用，禁止push／合并。

既查：开发基准、STATE、014／017固定候选、018固定数据只读副本与原source栅栏、官方PluginManager源码及原RPC契约。复用官方安装器／bundle gate／事务与既有预检，不造第二套profile写入或命令协议。无新UI，人／Agent数据层保持唯一。

最小执行范围为初始upgrade一次：内部签发短期、不可克隆计划，精确绑定014升级spec／pin、017恢复pin、固定数据hash、源profile／选择和supported options。可信调用者须在明确人类授权后声明批准；接口只记录该声明，不提供真人身份认证。synthetic-test与explicit-user-approval私有grant区分；声明正文只hash，不入档。未知spec／选项／伪造／过期／漂移拒绝。

调用前复核018全部栅栏；按稳定descriptor（不含随机id／expiry）在固定.runtime/desktop-install命名空间先wx持久占位并同步，再一次transport。synthetic与human固定分区，测试不得占未来生产claim。并发／正常重开／reserved／uncertain均拒重；异常／超时／结果保存失败不得删除占位或自动重发，不冒称exactly-once或断电耐久。

实际安装通过官方PluginManager API。018拒原锁，因此当前优先正常关闭Desktop后的quiescent管理器路径：生产工厂固定profile，私有human grant验证、原数据无锁／无其他Desktop进程后才建立manager；不自动关进程、不放松018锁检查。隔离工厂只能新建D:/Temp私profile，可接synthetic grant并用offline／ignore-scripts及官方bundled pnpm安装；禁止把synthetic送进生产。两种工厂均严格校验原官方RPC envelope及固定spec／选项，不能接受任意JS。

职责：run_maker=A执行门与持久claim／测试；live_runner_maker=B受限quiescent transport及官方临时manager集成／测试；run_checker独立Checker（已恢复可用）；根只做卡／研究／中控／索引，不制作实现。允许新增相应scripts/tests与evidence/local/20261024-desktop-install-gate，不改旧预检行为／签名ASAR／在用profile。临时profile安装enabled:true仍仅restart-required，不等于产品已激活。

验收：未批准／伪造／过期／错绑定／源变更→零install，稳定claim跨实例拒重，并发唯一dispatch，失败／超时／结果写失败保留reservation；synthetic不能进生产transport，任意表达式拒绝；实际官方临时安装25项复制字节一致。只聚焦必要检查，不截图点击、不模型、不全量。archive_id=kont-desktop-install-gate-20261024。

未覆盖：生产完整profile context／离线cache及当前其他依赖是否可完成安装、真实manager结果、正常重启与active验证、恢复安装阶段及人的体验。实际升级前仍需明确授权与新鲜预检；本卡不执行真实生产入口。

制作回收：A5项；B新2＋原RPC9共11项。两线12冻结项一致，临时官方manager enabled:true真实安装一次、25文件字节一致、返回restart-required。根先审发现直接callback可绕reserved不重试策略，已补占位后的私有单次permit、B消费与独占transport marker，及占位落盘后重新fence；缺失／伪造／复用／超时后未消费permit拒绝。原debug未改，不同时交付live路线。根真实只读prepare的稳定descriptor SHA=928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9，未签human grant或生产调用。

七格收口：目标＝一次性初始升级执行能力；回收＝A/B冻结、Checker完整书面复核及完成消息已回，末条final容量错误不改已完成证据；证据＝evidence/DESKTOP-019-INDEX.json及AD/checker/final-review.json；验收＝ACCEPT_ONE_SHOT_INSTALL_GATE_LIMITED，实现无阻断，独立16/16、12冻结项、25临时复制文件一致；入档＝本卡／STATE／QUEUE；记录＝一次本地提交，无真实human grant／生产调用／Desktop启停／模型／push／合并；未决＝生产profile完整context/cache及真实manager结果、正常打开／active验证、恢复安装仍未验。超时uncertain不是取消，已消费transport可能继续本地准备／安装，需核对既有操作，不能重发或清标记。真正变更前需一次明确用户许可并新鲜预检，审批接口本身不是身份认证。
