# Knot 开发约束

KONT 是 Knot 的历史误拼，指同一个产品。当前开发在 `mvp/`。先读 [开发基准](mvp/docs/development-baseline.md)、根 [STATE.md](STATE.md) / [QUEUE.md](QUEUE.md) 与当前任务卡；数据和操作以 [SCHEMA](mvp/docs/SCHEMA.md)、[IMPORT](mvp/docs/IMPORT.md) 及对应源码为准。旧 `docs/architecture/` 仅用于历史对照，不作为当前实现地图。

- 后端对齐成熟竞对机制，前端对齐 Apple 的系统组织与连续性；先查已有代码、协议、设计与测试，再做最小任务。
- 人和 Agent 共用对象、操作与业务语义，状态可读、动作可调用、变化可订阅；这是开发约束，不代表 MVP 已交付全部入口。接入 DSH 等宿主时保持薄适配；禁止新造平行资产权威。
- knot-flowgram-app 与 knot-desktop 是已移出当前 main 的历史承载，不是当前运行入口；其旧 Store 和候选只作追溯，不能推定与 MVP SQLite 共用运行态。禁止双主写同一业务文件。
- 数据与操作契约先于 UI。服务层与程序化验证优先；禁止截图、模拟点击作为 Knot 的 Agent 开发或验证路径，人的体验由之过手。
- 每卡既查 → 拆卡 → Maker 自核验 → 独立 Checker → Gate → 入档；不得自验收或自动合并。提交后不 reset、amend 或 force push。
- 保留冻结候选、旧 pin 与历史来源；仓库整合、候选验证、在用部署和完整产品接受分别记录。真实模型、生产安装及合并须有具体授权。
