# WORKSTATION-026 独立复核

结论：`ACCEPT_SHARED_PREVIEW_CLIENT_CONSUMPTION_LIMITED`，无阻断。接受源码、build 后 factory 与组件/hook 语义，不接受 ReactDOM、正式视觉或人的 Apple 体验。

Maker manifest `02a839ca...d9b729b18` 独立复算一致。10/10 登记匹配：4 项制作源码/测试/helper，1 项 build 生成 client.js，5 项报告/日志。官方 bundled Node 独立 build 退出 0，生成物仍匹配冻结。独立聚焦 23/23，通过新客户端 10、相关旧 10、Checker 自有 3，0 fail/skip；未跑无关全量。

维护性通过。业务供给投影留在服务端；客户端的 loadWorksitePreview 负责必要的先保存、单次查询与结果准入，invalidatePreview 集中负责暂态清除、generation 和 abort。普通具名控制流，没有通用异步框架、DSL、新依赖、平行 store 或新产品文件。Abort 不是正确性的唯一依据，完成 JSON 后仍以 generation、当前现场/seq/草稿和 busy/error 核对成功或失败。原材料编辑规则与 Run 状态源保持，收起没有停止 Run。

独立实际执行 Maker 的组件 cleanup 与 plugin dispose、save pending 后组件卸载/活动现场变化/继续编辑零 GET、刷新/切换/卡片/图标失效、严格新旧 seq、固定错误、单 GET/无本地回退等专项。自有检查额外覆盖 JSON 延迟时编辑再改回原值，旧 network reject 晚于新成功，均不能复活旧内容/错误；保存 captured 文本后新增 newest 编辑不被删除，第二次 POST 确实持久化 newest。测试直接调用实际 built factory 注册组件的语义 callback，没有截图或模拟点击。

mutate 按值清 draft 的窄修复合理：旧回执只确认所提交的文本，不应删除随后编辑。runtime-draft 从失效的 raw require seam 改为实际 bundle factory，原 leave guard 草稿往返断言保持。原 run-panel-client 未改且通过。

024 和 025 的全部冻结登记仍匹配。旧真实 014 以原 pin `a1f00e43...5f1755a8` 验证 25 项；当前 inventory 仍 26，未新增文件或改 backend/清单。API 文档对维护入口、严格 seq、失效、保存边界、程序化验收和未部署的描述与实际相符。此卡没有生成真实 root 发布候选，不等于已更新在用桌面。

未访问生产数据/profile/ledger、凭据或用户 Session，未启停/安装桌面、修改系统、调用模型或 root commit/push/merge。完整 Run、正式 UI 与完整产品未接受。既有 workspace 保存错误处理未在本卡重构；固定错误保证针对新增 preview 查询。
