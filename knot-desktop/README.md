# Knot · DSH 桌面模块

这是同一 Knot 项目的桌面宿主适配。KONT 为历史误拼；`@kont/*` 包名、协议路径与任务编号保留兼容。当前执行以仓库根 [STATE.md](../STATE.md) / [QUEUE.md](../QUEUE.md)为准，产品与设计母本仍在根 [docs](../docs/README.md)。

模块提供现场、文件夹、窗口/卡片/图标、HUD、工作岛、Store 快照和 Run 审计/对账。人的入口是官方 DeepSeek Harness Desktop；FlowGram 是保留的参考承载。两者复用同源核心，目前各自持久化；不能同时写同一个业务文件，同仓接入不代表双端运行态已经统一。

在仓库根运行，Node 22.22.3 为本轮核验版本：

```sh
node knot-desktop/scripts/build.mjs
npm --prefix knot-desktop test
npm --prefix knot-desktop run test:inventory
```

默认测试为明确列出的 40 个离线服务/程序化套件，覆盖核心、当前运行、工作站及固定历史恢复。它不打开桌面软件、不读取真实 Session、不调用模型。测试 runner 固定模块工作目录，从仓库根和模块目录均可调用。测试清单变化而未分类会拒绝执行；外部宿主/历史部署套件及各自依赖在 `test:inventory` 中逐项列出，不被算作通过或跳过。

`packages/` 来自固定已审桌面来源；[SOURCE-MANIFEST.json](SOURCE-MANIFEST.json)记录 222 项原路径、原 blob/hash 和必要适配。四份 vendor 源保留原字节 hash；构建同时核对主线 `knot-flowgram-app/src/` 对应文本，仅允许换行差别，核心内容漂移会拒绝。

候选制备仍须 26 项产品文件已跟踪并逐字节匹配真实 HEAD，暂存差异也拒绝。嵌套模块使用 v3 明确记录仓库源路径，安装产物继续为两个同级 package；旧 v1/v2 校验保留。候选验证不等于生产安装，官方宿主隔离检查使用独立临时 profile。

历史 014/017 和 d59 的公开代码闭包随测试固定，原 pin 与恢复断言保留，不需要旧本地 Git 对象或 ignored 文件。它们不是可部署的当前候选；旧 017 仍不兼容，044 合成往返只证明固定 d59 配对。历史部署/实模工具保留原严格前置条件与机器路径，不能用来更新本次模块；生产安装和模型调用须单独确定范围。

`docs/` 中的接口、研究、任务、handoff 和进度记录来自原开发阶段，日期与限定范围原样保留；其中旧“根目录”、本机路径、证据指针指原工作区。695 份历史 evidence 未整批迁入；查证请用[固定原始来源](https://github.com/Kairos-zhi/knot/tree/a05aab4c2941b7c80a8c4221aa9b90070c534d04)，不能把旧文档当作今天的加载态或部署许可。
