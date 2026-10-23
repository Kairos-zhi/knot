# KONT-RUN-013 Maker A

基线423fe426deb4f6f288a670430ebe332fd4e9b563。A负责client/build与Run只读query-controller接线；未改B组件/样式/viewmodel/server、vendor或历史冻结证据，未提交，待Checker/Gate。

新增run-status-source.cjs，module级唯一owner消费GET /kont/runs（credentials same-origin），只校验既有DTO/viewmodel，不复制phase推断。source维护同一seq/列表/加载/错误snapshot供window/card/icon共用；手动刷新与当前现场/内核seq变化触发读取，server seq不得倒退到已见query或当前workspace seq之前。每次刷新清旧列表并Abort上一请求，以generation丢弃现场切换、同现场乱序及卸载后的迟到响应；dispose取消在途并清监听器。query失败/畸形或包含私有扩展字段不显示旧Runs或原始诊断。

client将B的RunStatusPanel放在当前现场标题与内容之间、三种呈现均可见。workspace刷新开始即invalidate Run源；等待/失败遮旧Run与已定位正文，失败给固定错误。定位只从当前workspace snapshot重解析worksite/asset/block，在面板旁只读展示title/content和关闭，不调用mutate，不新建窗口、不运行或重建历史产物。切换现场或当前引用不存在即不显示；旧编辑表单无新增字段/功能。

build将@kont/run-status-view（既有ESM）、@kont/run-status-panel（B CJS）及@kont/run-status-source打入localModules，hostRequire仅承担原React；不依赖不存在的宿主相对模块，不安装依赖。B CSS拼入原CSS。已追踪生成产物packages/dsh-plugin/lib/client.js一并冻结，其他lib未变。

验证build exit0，focused7/7：source4、built-client语义树1、原bundle注册/样式释放1、Cordis生命周期1。程序化覆盖只GET/same-origin、现场切换及同现场乱序、seq回退与私有字段拒绝、手动恢复、取消/卸载晚响应与unsubscribe、定位当前块/删除失效、built local aliases不逃逸host、三种呈现共享源、定位零写请求、workspace刷新悬挂/失败遮旧状态和正文。无截图/模拟点击；React树测试不是官方Desktop部署或人的视觉验收。

无真实模型、用户Session/profile/凭据读取、ASAR写入、安装或部署。B组件已有独立maker-b证据，A仅将其构建入同一产物；完整产品及人的工作站体验待后续接受。
