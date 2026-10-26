# KONT-WORKSTATION-030 · 现场变化通知

2026-10-25，之“继续开发”，沿用子Maker/独立Checker。既查baseline/STATE/QUEUE、旧W2/W3/W5与路线图同一对象/状态可订阅、当前client/028–029、store.eventsSince及protocol SSE。复用既有共享操作/事件内核，不新造同步协议；前端落实既有连续性/真实状态，非扩旧表单业务或新增设计值。

缺口：服务已有认证GET /kont/events?since=seq，客户端尚未订阅，其他窗口更新只能手动发现。现事件内存200条，冷启/缓存缺口reset；server只按URL since，不以Last-Event-ID实现恢复。普通frame id=seq/data事件，reset data={seq,snapshotRequired:true}。

目标：组件挂载且有已接纳快照/无workspace错误时，仅一条同源EventSource。refresh/mutate请求开始先关闭并失效旧流；成功接纳响应（含029草稿确认）后从新seq重订阅。关闭间隙由backlog/reset提示，不按source区分自己的事件，也不维护pending事件缓存或新状态机。后端revision仍最终防陈旧写，不能声称读取和订阅原子或绝对实时。

有效普通通知seq是非负安全整数，必要时核frame id一致；<=已知seq忽略。更高seq或合法reset（即便seq相等）清preview/产物及运行状态视图，复用028 error屏障，用固定本地提示要求刷新核对，保留data/draft，关闭流。事件只读序号/reset标记，不展示或保存事件正文、不合并业务对象。格式坏/无效seq/reset或error/缺EventSource/构造异常，固定监听失败提示并close，不能静默宣称监听正常；禁止native重连替代恢复。不自动workspace GET、POST或重放命令。

组件cleanup及插件dispose关闭流/失效generation；旧message/reset/error回调迟到不触状态或再开流，请求完成也不能在未挂载或provider关闭时开流。真正重新挂载在无workspace错误时从当前seq恢复，错误时仍要人工刷新。刷新失败维持屏障，成功才重新订阅；busy核对状态沿028。断线仅在当前挂载工作站内可知，不承诺后台全局监听。

维护性：少量具名start/stop与通知函数、一个generation/句柄即可，明确provider和component生命周期，不增加通用observer框架/状态机/平行store。产品仅client.cjs及正常build生成bundle，无新产品文件/build模块/style/inventory/后端改动。

允许新tests/workspace-events-client.test.mjs及必要tests/helpers/workstation-client-fixture.mjs注入真实接口形状的fake EventSource；其他现client factory独立fixture可仅补EventSource依赖，不减旧断言。若需重挂载seam，显式新方法而非改变旧unmountComponent语义。旧source/test文件若因不适用EventSource宿主改动须列明原因。根卡/状态/API文档。

验证：实际built factory/注册组件语义、EventSource回调协议（非截图模拟点击）及隔离真实HTTP SSE后端契约。唯一流/同源since、ownPOST无误锁、backlog更高seq/reset/旧重复seq、坏JSON/断线/缺能力/构造异常、无后台正文泄露、零自动workspace GET/POST、刷新失败/成功恢复、草稿/已知快照保护、旧回调与组件/插件卸载及pending响应禁止重开、必要真实重挂载。回归026–029/草稿/runpanel/bundle/protocol；旧014pin25/current26只读保持。

Maker=workstation_maker；独立Checker=deployment_checker；根Gate。证据evidence/local/20261025-workspace-events，archive_id=kont-workspace-events-20261025。当前ACCEPTED_LIMITED。无生产data/profile/凭据/Session/模型、系统/桌面启停安装、真实root提交推送合并；不接受实际dsh-app长流/浏览器布局/正式Apple/人的体验或在用部署。

独立Gate=ACCEPT_WORKSPACE_CHANGE_NOTIFICATION_LIMITED，无阻断，维护性通过。10/10冻结匹配，独立build退出0；聚焦56/56（本卡10含隔离HTTP SSE1＋相关旧43＋Checker自有3），无失败/跳过。自有直接queued旧message/error回调、继承lastEventId的equal reset、pending初始GET卸载与POST延迟JSON期间ownwrite均通过；旧fixture仅补EventSource依赖，新remount不改旧unmount语义。旧014原pin25/current26保持。

七格收口：目标＝工作站变化通知→手动核对；回收＝子Maker冻结/独立Checker完成停写；证据＝AO与WORKSTATION-030-INDEX；验收＝源码/构建/factory-hook回调及隔离HTTP SSE契约限定接受；入档＝kont-workspace-events-20261025；记录＝本卡/STATE/QUEUE/API/README/控制回执；未决＝实际dsh-app长流、原子/绝对实时同步、全局后台观察、完整命令幂等、正式Apple/人的体验与在用部署。
