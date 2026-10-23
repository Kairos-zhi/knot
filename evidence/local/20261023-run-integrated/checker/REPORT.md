# RUN-010 r2 独立复核

结论：`ACCEPT_OWNED_RUNTIME_INTEGRATION_LIMITED`。r1生命周期阻断已修复，原审查与日志保留在checker/r1；本轮只重审窄修并独立构建、同范围聚焦 **16/16通过**，失败0、跳过0。11份r2 manifest条目、其中5份产品／测试哈希一致。未跑全量。

新增sticky cleanupFailed跨job保留；dispose等待在途后发现清理失败即拒绝EXECUTOR_CLEANUP，重复dispose仍拒绝，不再把未知资源状态当作成功屏障。API明确拒绝后不得自动store.close，应先人工对账／释放owned资源。已持久returned业务结果独立保留，附cleanupFailed而非被覆盖为failed。

实际官方隔离worker新增真实owned handle在实际释放前抛错：业务returned保留、dispose拒绝、registry仍有该Agent、store仍可写；测试随后手动调用真实handle.dispose释放，再证明sticky拒绝未消失。释放后抛错案例也拒绝dispose。此反例直接关闭r1缺口，不宣称任意底层故障自动恢复或已释放。

正常主链复核保留：唯一store prepared→默认deny精确四元及constraints摘要→持久claim→owned新Agent setup guard→准确followup→公开session/event严格对象身份/seq完整收集→实际completed终态→目标CAS原子synthetic-test回流。原白名单未放宽，无deprecated快照证据接口。并发／正常重开不重发，失败／取消／超时／CAS无伪成功资产，授权等待超时不创建Session；队列入口和rename前取消fence通过，提交后abort保留已落盘returned。正常dispose取消／drain后释放owned Agent，留存executor引用closed。

本轮官方0.2.1 Electron/Cordis/AgentLoop/Session等实际组件＋内存synthetic adapter共8次synthetic provider调用；主成功路径11条完整owned事件。真实模型0，无DSH Session持久化、用户Session／凭据或在用profile接触。

限定：trusted authorize只是内部四元/约束许可，完整上下文请求指纹、真人身份、金额核准未串接；executionAuthorized/fullExecutionAuthorization=false。owned事件是官方runtime内存流，不是持久DSH日志。无apply／HTTP执行入口、真实模型Run、Desktop部署／产品验收；无fsync断电耐久、远端exactly-once、Provider内部HTTP重试或自动故障恢复保证。dispose拒绝必须保留store并对账，不能无条件宣称屏障成功。

证据：build.log、focused.tap、hash-check.json、r1/。Checker未改产品代码；无剩余本卡范围阻断。
