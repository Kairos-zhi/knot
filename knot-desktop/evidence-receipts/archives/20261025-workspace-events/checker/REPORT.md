# WORKSTATION-030 独立复核

结论：`ACCEPT_WORKSPACE_CHANGE_NOTIFICATION_LIMITED`。无阻断，限定当前工作站挂载期通知、手动刷新屏障、源码/build/程序化与隔离HTTP契约；实际dsh-app长流未验证。

Maker manifest `489f0902...8e8223a1` 独立复算，10/10登记匹配：4项源码/测试/helper、1项bundle、5项报告日志。官方bundled Node独立build退出0，生成物仍吻合冻结。聚焦56/56：030新10（含真实隔离HTTP SSE1）、旧相关43、Checker自有3，0 fail/skip。026–029、草稿/runpanel/bundle/store/protocol原相关断言通过，未跑无关全量。

维护性通过。少量具名start/stop/require-refresh函数，一个流句柄/generation与mounted边界，复用error屏障；无新框架、状态机、pending事件缓存、平行store、依赖或产品文件。workspace请求前关旧流，成功接纳及草稿确认后按新seq重建，避免按source猜ownwrite。高序号或reset仅提示手动刷新，不合并业务数据或自动GET/POST；断线/坏格式/缺能力明确失败并close，原生自动重连不能冒充恢复。

独立实际执行所有10新专项，含缺EventSource/构造异常、frame与id/reset校验、已显示/pending预览清除、刷新失败/成功、组件/plugin cleanup及pending响应不重开、真实remount。自有额外直接捕获旧onmessage/onerror回调后再替换流，queued调用仍无效；equal reset即便继承上一lastEventId也正确要求刷新；pending初始GET cleanup后完成不建流；POST的JSON仍延迟时旧ownwrite回调不误锁，成功从确认seq建一流。

隔离真实HTTP SSE实际验证认证、普通backlog id/data、冷启reset无id、非法游标拒绝及断开回收订阅。它与fake EventSource组合不等于真实浏览器EventSource或dsh-app长流验证，也不能声称读取/订阅原子或绝对实时。真正陈旧写防线仍是后端revision。通知不是命令回执，刷新仍不证明未知历史动作是否执行。

helper新增明确remount重建hook生命周期，原unmountComponent语义保持；run-panel旧独立factory只补EventSource stub，未弱化原断言。API文档/README符合实现。旧014原pin全25通过，current26未变，无正式根候选。

未触生产data/profile/ledger、凭据/用户Session、桌面启停安装、系统、模型或root提交/push/merge。无全局后台订阅、Last-Event-ID恢复、完整历史/Run、ReactDOM/浏览器布局、视觉、正式Apple工作站或人的体验验收；未重试SSR或安装依赖。

收口文档增量已核：通知按全 workspace seq，其他现场或 Run 变化也要求核对，不按事件正文筛当前现场；与已审实现一致。只更新文档审查摘要，未改产品或重跑测试。
