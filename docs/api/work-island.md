# 工作岛运行概览

035纯组件WorkIsland消费已有createRunStatusSource的全局runs快照。没有第二source、每现场请求、轮询、计时器或订阅。当前现场详情继续由RunStatusPanel处理，状态标签继续由createRunStatusView产生。

在当前Workspace中解析Run的worksiteId，按归属现场分组，显示标题、阶段记录数和返回按钮。未知现场的记录汇入“运行归属待核对”组，保留数量和既有阶段标签，禁用返回；不自动分配归属。已知现场key加site:前缀，与未知组分域。

返回按钮调用既有mutate，沿033选择首live／首closed呈现、必要时避碰open；dirty草稿与activate／presentation更新为同批事务。它不调用模型、取消、供给写入或资产创建。当前读busy、error、Run source加载／错误、指针不属于当前现场或seq落后时只提示刷新核对，成功空列表才显示暂无记录。

这是一份核对快照，不保证实时同步或后台托管；submitted不称running，uncertain不判失败／成功，不创造失败／取消phase或进度比例。

测试seam：workstation-client-fixture的可选runResponse(request)只在/kont/runs默认响应分支取DTO，可await后仍序列化到renderer realm JSON.parse；原有onRequest自定义响应优先且旧默认不变。用于合成服务DTO与迟到／失败测试，不改变产品验证器。
