# DESKTOP-019 独立复核

结论：**ACCEPT_ONE_SHOT_INSTALL_GATE_LIMITED**，实现无剩余阻断。真实生产 human grant **0**，不接受实际生产部署。Checker 未签发任何 grant，没有构造或调用生产 transport。

两线 manifest **12/12** bytes/hash 匹配。独立固定聚焦 **16/16**、无跳过：执行门5、transport2、原 host9。原 client/debug 相对 9bb7fea 无 diff，没有 build 或全量。另实际只读 prepare 经已审018固定来源/private-copy预检，descriptor SHA256 与根一致：`928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9`。生产对应 claim 不存在，未调用 approve/execute。

源码及实测确认：先 wx 写入并 sync reservation，再重复018 fence，然后签发私有单次 dispatch permit。原授权 metadata 不含可直接安装的 args；B 必须消费 permit、精确核 payload、持久 claim，另 wx transport marker，才进入管理 side effect。并发8次只有一次 dispatch；重新签发及跨进程重开仍拒重。伪造、克隆、过期、源漂移、占位后漂移及未消费的晚 permit 拒绝。错误、超时、结果保存失败保留 reservation；晚成功不覆盖 uncertain，不删除标记重试。声明正文只存 hash，raw diagnostic/异常不入账本。

transport 不执行任意 JS，而校验字节精确的官方RPC模板与JSON参数后直接调用官方 PluginManager。只接受受限方法/spec/options，生产固定 canonical repo/root/profile、human 声明 kind、数据无锁与其他 Desktop 进程不存在；不自动启停程序、开调试端口或载入用户插件/Session。临时模块副本不能冒充生产根，synthetic 不能进入生产工厂；无permit与复用permit均拒绝。

独立测试实际在新 &lt;temporary-root&gt; profile 通过官方 offline/ignore-scripts manager，synthetic 授权一次安装，enabled:true、restart-required/no-hmr，25项复制字节匹配。这只证明临时完整测试链，不证明生产 profileContext、当前其他依赖或离线 cache 可安装。该链使用synthetic018 shim；真实固定来源的只读 prepare 另行验证，两种证据不混同。

授权接口是受信调用者的“已有明确许可”声明，不是独立真人身份认证或签名。测试中故意把合成声明 kind 标成 explicit-user 的负例仍在临时根被拒，不能算真实生产授权。

超时边界：未消费permit会失效；已消费的 transport 可能继续本地准备或真正安装。timeout/uncertain 不是取消，也不保证之后没有 profile 副作用，只保证不晚结算为 submitted、不自动重发。已同步的本地标记也不构成远端 exactly-once 或断电耐久保证。

未执行生产安装/启停/正常重启/active验证、恢复安装阶段、模型请求或人的体验验收；未读凭据或用户Session。固定现场数据仅经已审018私人副本预检，不能外推生产迁移接受。仍需真正人类安装授权、新鲜生产状态和实际 manager／重启结果；若结果不确定先核对，不能清标记重试。旧协议覆盖口径不变。

证据：final-review.json、focused.tap、hash-check.json、hash-check.log、verify-evidence.mjs。
