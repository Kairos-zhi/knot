# RUN-006 独立复核

结论：`ACCEPT_HOST_OBSERVER_BINDING_LIMITED`。直接审查5文件变更，逐一复算冻结哈希一致；独立构建通过，按Maker同范围命令独立聚焦 **12/12通过**，失败0、跳过0。未跑全量，不增加或宣称全量总数。

同范围测试已实际覆盖两个关键接缝负例：config.readRun不能覆盖插件同一store，未许可和外部取消不访问persistence；真实Cordis注册重名时新store锁释放且旧owner保持。另覆盖async unprovide拒绝脱敏、旧引用closed拒绝。无需再复制同类测试。

复用的实际官方Electron/Session/JSONL worker也在本次12项中运行通过：隔离合成Session、同插件store绑定、注册零Session读取、卸载取消在途、read/close闸门期间store锁保持，句柄关闭后才完成store关闭；服务撤销，旧引用拒绝，Session和Knot字节不变。代码中的closed闸门先于pending快照，dispose同时等待异步unprovide和在途观察settled，storage finally随后关闭store；绑定失败同一路径自然清理锁。无新HTTP入口／回流或执行能力。

仅接受隔离实际Cordis/JSONL宿主服务接缝，不代表在用Desktop已部署或真实Session/模型Run。受信生产config、真实绑定、模型/成本/执行授权及人的体验仍未验证；RUN-005原有逻辑前缀、窄schema和Provider转换等限定继续适用。未读真实用户Session/凭据，未改产品代码、安装字节或旧manifest，未push/合并。

证据：`build.log`、`focused.tap`、`hash-check.json`；无本卡范围阻断项。
