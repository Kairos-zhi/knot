# RUN-007 独立复核

结论：`ACCEPT_SERIALIZABLE_READ_CONFIG_LIMITED`，无本卡范围阻断。独立复算5候选文件哈希一致，构建通过；同Maker范围聚焦 **9/9通过**，失败0、跳过0。未跑全量，不宣称全量总数增加。

直接审查确认正式apply只接受readAudit普通数据并在存储初始化前校验；配置不能提供callback、Session Class、路径、自报version、service或readRun。许可复制深冻结，四元字段精确匹配，空／错许可不读Session。关闭路径不查宿主包，启用缺服务快速拒绝，条件ctx.inject声明pluginPackages/sessionPersistence。宿主packageOf元数据与实际manifest名／版本／目录关系核对后，从受信session包加载Session；精确0.2.1闸门保持。

本次9项包含实际官方Electron worker：JSON往返配置加载正式apply、真实PluginPackages.packageOf与Session/JSONL合成夹具通过；配置随后被修改不改已冻结许可。注册零Session读取，RUN-006卸载取消／关闭句柄后才释放store锁的屏障未回归，所有executionAuthorized=false、模型0。

必须限定：worker将packageOf的parentURL适配为官方ASAR anchor，**未验证真实Desktop profile manager解析／装配／部署**。常规配置单测的临时package metadata/module为合成替身；官方worker才是实际库证据，但Session仍合成，非真实模型Run。未扩展原只读、运行或资产语义，未新增HTTP授权入口。生产profile、真实绑定／执行及人的体验未覆盖；既有窄schema、逻辑日志与Provider转换限定继续适用。未读真实用户Session或凭据，未改源码／安装／push／merge。

证据：build.log、focused.tap、hash-check.json。无新增来源研究、全量测试或二次文档审查。
