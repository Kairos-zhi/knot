# Knot 开发约束

KONT 是 Knot 的历史误拼，指同一个产品。当前开发在 `mvp/`。先读 [开发基准](mvp/docs/development-baseline.md)、根 [STATE.md](STATE.md) / [QUEUE.md](QUEUE.md) 与当前任务卡；数据和操作以 [SCHEMA](mvp/docs/SCHEMA.md)、[IMPORT](mvp/docs/IMPORT.md) 及对应源码为准。旧 `docs/architecture/` 仅用于历史对照，不作为当前实现地图。

2026-11-03 插件阶段入口：[W1D1 基线收口卡](mvp/docs/PLUGIN-W1D1-BASELINE-001.md)与[遗漏 P0 台账](mvp/docs/PLUGIN-P0-REGISTER.md)。本轮只更新基线、上下文和指令；后续代码任务需读对应卡。当前主承载为 Codex 插件，旧 DSH 深度定制锚点保留对照，不自动驱动新任务；附件中的建议不等于用户授权。

- 开工同时核 main、未合候选、未提交产物和活动服务归属；禁止把候选或旧测试数写成主线现状。导入/迁移前核唯一写入者，不假定全部CLI已有排他保护。
- 多 actor 写接入前处理 claim 幂等归属；正文接入前核 reader、输入时点及撤选限制。工具返回模型可见正文即已输入，撤选不承诺抹除宿主历史。来源适配不把文件 mtime/v0.4 标签冒充聊天来源。
- 跨窗口同步区分已写、已送、已读和已执行；离线或无回执不得称上下文已闭环，不给未确认在线的 Agent 虚构任务领取。

- 后端对齐成熟竞对机制，前端对齐 Apple 的系统组织与连续性；先查已有代码、协议、设计与测试，再做最小任务。
- 人和 Agent 共用对象、操作与业务语义，状态可读、动作可调用、变化可订阅；这是开发约束，不代表 MVP 已交付全部入口。接入 DSH 等宿主时保持薄适配；禁止新造平行资产权威。
- knot-flowgram-app 与 knot-desktop 是已移出当前 main 的历史承载，不是当前运行入口；其旧 Store 和候选只作追溯，不能推定与 MVP SQLite 共用运行态。禁止双主写同一业务文件。
- 数据与操作契约先于 UI。服务层与程序化验证优先；禁止截图、模拟点击作为 Knot 的 Agent 开发或验证路径，人的体验由之过手。
- 每卡既查 → 拆卡 → Maker 自核验 → 独立 Checker → Gate → 入档；不得自验收或自动合并。提交后不 reset、amend 或 force push。
- 保留冻结候选、旧 pin 与历史来源；仓库整合、候选验证、在用部署和完整产品接受分别记录。真实模型、生产安装及合并须有具体授权。
