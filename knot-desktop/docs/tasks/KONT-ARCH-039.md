# KONT-ARCH-039 · 只读清理失败与 owner 关闭责任

2026-10-26；Maker候选，验收交原独立Checker与根Gate。archive_id=`kont-arch-read-cleanup-20261026`；检索键：ARCH-02、cleanup、owner、dispose、Store锁。

来源：跨历史架构审查ARCH-02，RUN-005/006/007只读绑定与RUN-010 r2 sticky失败屏障；上下AGENTS和开发基准。后端复用同控制面/owner及既有Promise屏障机制，无第三方代码、新状态机或业务authority；本卡无UI，呈现与运行分离原则保持。

最小改动：实际handle.close失败由工厂私有身份标记，脱敏DSH_CLOSE_FAILED不能被业务错误或取消覆盖；绑定只对该真实cleanup失败sticky，已结束观察退出pending后仍保持。普通读取拒绝/错误及干净取消不sticky；unprovide失败明确拒绝dispose。index缓存同一storage关闭Promise，observer清理成功后才关闭Store；scope先失败后storage仍拒绝、不重复清理。单owner只在旧scope成功释放后可重绑，pending/failed不得替换；storage关闭开始后禁止新binding。取得binding前注册冲突可释放新Store，取得后初始化失败受owner屏障约束。

允许产品仅dsh-run-read.mjs、run-observer-binding.mjs、index.mjs；新arch-read-cleanup.test.mjs、本卡、read-cleanup-contract.md及本地Maker证据。原78路径基线、75项非本卡/控制文件保护哈希留存；旧证据、store/kernel/executor/client/vendor/helper与26清单不改。

自核验：build退出0，7个明确入口29/29（新13、相关16），包含官方合成Session只读和既有执行器集成回归，diff检查0。新测试验证实际close优先、伪同名错误不sticky、pending全部drain、重复/并发同Promise、scope与storage交叉、重绑与初始化owner边界。失败保锁fixture只在专用synthetic Node子进程断言，退出后清父测试自建目录，不新增产品force-close或删除生产锁。

边界：未真实用户Session、模型、生产profile/数据/凭据、在用软件启停安装、系统设置、正式候选、分支stage commit PR push merge；未证明真实OS资源泄漏或恢复、native Desktop退出、人验或G3整体。Maker不自验收。七格：目标ARCH-02；监听回收无新机制；证据本地manifest/日志；验收待Checker/Gate；入档本卡；记录仅本地候选；未决为真实宿主及人工资源核对路径。
