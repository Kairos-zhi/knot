# 同现场HUD

034在窗口／卡片／图标三态中保留一个输入HUD，不增加协议或持久schema。WorksiteHud是无hooks纯组件；编辑状态、草稿隔离与请求生命周期由已有Workstation provider持有。

HUD作为kont-columns的第二个固定子组件，固定key为worksite-hud；第一个子区域在详细材料和紧凑呈现之间切换。它始终显示当前activeWorksiteId对应标题、真实Agent标识（仅null为未选择，缺失／空白／非字符串为选择待核对）、供给数与可展开选材标题，以及唯一现场草稿textarea、保存和预览动作。未将资产添加表单的材料正文textarea算成现场输入。

保存使用原mutate，预览使用原loadWorksitePreview：必要时先保存该现场草稿，再读取024共用投影。刷新／切换／三态变更的失效与迟到保护沿既有provider。收起不隐含停止、供给变更、复制现场或创建Run。busy/error使用快照待核对说明；保存失败保持本页草稿并要求显式刷新，不重放。

组件tree位置/key和唯一textarea的程序化证据见tests/worksite-hud-client.test.mjs。该证据不能代替ReactDOM挂载／输入法／焦点／人的体验验证，也不代表后台执行或模型发送已接入。
