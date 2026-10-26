# 现场资源库与唤出

033新增客户端入口，不新增HTTP、模型或持久schema。资源库直接投影已接纳的Workspace和资产；本页草稿仍由既有provider的draft map持有。

标题按钮只切换activeWorksiteId，保留原卡片／图标形态。逐条“唤出”先激活现场，再将首个未关闭呈现展开为window；没有未关闭实例时复用首个closed实例。选择顺序为持久数组顺序，与主区first-open规则一致；其他实例和layout保留。无任何实例才open，`view:<worksiteId>`碰撞时依次加`:1`、`:2`，全局核对呈现ID。

三态按钮复用相同选择和ID生成。操作经既有mutate同批原子提交，包含其他现场待保存草稿；失败不乐观切换、不自动重放，保持草稿并要求刷新核对。唤出和切换都不调用运行、取消、资产创建或供给修改。

条目显示已保存的呈现形态，closed文本为“呈现已关闭”；没有实例显示“尚未打开”。供给数仅为该现场checked且非excluded、实际存在的资产数。草稿区分已保存内容与本页未保存文本；busy/error下整体注明快照待核对。摘要不表示实时Run状态。

组件回调及共用store持久恢复验证见 `tests/worksite-library-client.test.mjs`；语义树不代表ReactDOM或人的体验验收。
