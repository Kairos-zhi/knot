# KONT-RUN-007 Maker 候选

正式apply只接受普通JSON/YAML解析后的数据：`readAudit:{enabled:false,grants:[]}`，grant为runId/requestId/sessionId/inputSha256及可选approvedRequestSha256。原函数/Class、自报版本、路径、persistence/readRun等字段拒绝；校验在存储初始化前，许可复制并深冻结。默认关闭，不查询宿主包、不读会话。

启用时先缺服务快速拒绝，再通过Cordis `ctx.inject(['pluginPackages','sessionPersistence'],...)`声明依赖，解析公开packageOf元数据并校验boot/session包名及精确0.2.1-rc.2、manifest身份/版本/目录关系；只从该session包加载Session，取宿主sessionPersistence。未导入app bootstrap或profile。旧0.1.7关闭路径不新增peer版本限制。四元组逐字段匹配，空白名单拒绝，无Session I/O；只读策略和RUN006卸载屏障复用，executionAuthorized恒false。

构建exit0，focused **9/9通过**、失败/跳过0，见build.log/focused.tap；不跑全量。覆盖严格JSON/额外字段/getter/Class/function/路径/哈希拒绝、冻结防变更、缺能力、版本/元数据、精确四元组及空授权零会话I/O、既有绑定/注册失败/卸载/lifecycle。

原官方Electron worker用JSON往返配置加载正式apply，真实官方PluginPackages.packageOf、实际Session和JSONL持久层点读通过；配置对象加载后被修改不改变已冻结许可，卸载在途取消/handle-close-before-store-close仍通过。隔离测试仅把packageOf的parentURL替换为官方ASAR anchor，非真实Desktop profile解析／manager部署；普通配置单测的临时模块/metadata是明确合成替身，不替代官方worker。所有Session均合成，0模型、0实际用户会话。

新增依赖与provider卸载由条件inject持有；关闭路径无需其存在。未改在用安装/profile、UI/vendor、历史冻结manifest，未模型/部署/提交/push/merge。真实生产profile配置与人的体验仍未覆盖；Maker不验收，交独立Checker。
