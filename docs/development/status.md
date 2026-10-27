# 当前开发状态

2026-10-27 增量：本分支正在接入 [Knot 桌面模块](../../knot-desktop/README.md)，实施与独立 Gate 以根 [STATE.md](../../STATE.md) 及 [048 任务](desktop-integration.md)为准。桌面能力此前已有分项限定接受；它们不自动证明本次迁入正确或已部署。下文保留 2026-10-18 的原前端合并与验证记录，旧“DSH 尚未在本仓库”的描述指当时基线。

状态核对：2026-10-18。代码基线为 main 合并提交 `40582f04020ecfb6bebd1b38f17e64797ec8d3e6`。[PR #8](https://github.com/Kairos-zhi/knot/pull/8)已合并，包含原 PR #6；后者也已被 GitHub 标记为 MERGED。本页只更新文档，不重新执行模型或产品测试。

## 已合入与已接受

| 能力 | 证据与范围 | 仍不能据此证明 |
|---|---|---|
| 结／块／绳、操作与资产持久化 | 原工程与操作断言 | 所有目标功能、真实生成 |
| Canvas Bridge | 原 PR #6 的服务、插件、poll／ack 与断言 | 生产 HTTP、跨进程恰好一次 |
| W3-A v3 | 原独立 Checker 接受：构造材料下的现场隔离、共享呈现、恢复及故障 | 全部 G1、完整产品 UI／远端同步 |
| 输入编译 v2 | 原独立接受：显式现场、供给／排除、事务与只读副本 | 旧模型历史与工具边界 |
| 本地请求适配 v2 | 原独立接受：深拷贝、发送时数据、注入接收端 | 网络 transport、Session／Run |

三段新增接受日期均为 2026-10-04。2026-10-17 在独立克隆复建，13 个候选文件的 Git blob 与接受清单逐一一致；复建树为 `7392481a94025ff7541238994e7e3df741105365`。完整累计补丁 SHA256 为 `64A2A65B2CB4F3EBED5B27DE1973B7B69FC2D41B7884CB3D7FBD0F68416F81EE`。

这些旧独立接受与合并前复测，不扩展为新版工作站的产品验收。

## 合并前实际验证

Node 22.22.3，锁定依赖恢复后完成：类型检查、七套行为测试和生产构建，九项最终退出码均为 0。首次输入套件 14 组断言通过后，验证脚本 stdout 与测试日志同名导致进程错误；原记录保留，分开日志后只重跑剩余检查，产品代码未变。

在应用目录执行：

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/tsx/dist/cli.mjs tests/knot-worksite.assert.ts
node node_modules/tsx/dist/cli.mjs tests/knot-recovery-events.assert.ts
node node_modules/tsx/dist/cli.mjs tests/knot-persistence-lifecycle.assert.ts
node node_modules/tsx/dist/cli.mjs tests/knot-worksite-input.assert.ts
node node_modules/tsx/dist/cli.mjs tests/knot-worksite-request.assert.ts
node node_modules/tsx/dist/cli.mjs tests/knot-operation-service.assert.ts
node node_modules/tsx/dist/cli.mjs tests/knot-canvas-bridge.assert.ts
npm run build:prod
```

报告可用 KNOT_WORKSITE_REPORT、KNOT_RECOVERY_REPORT、KNOT_PERSISTENCE_REPORT、KNOT_INPUT_REPORT、KNOT_REQUEST_REPORT 指定独立 JSON 路径；测试会写同名 .log，外部 stdout 使用不同文件名。

普通 build／test 仍是空脚本；src 类型检查不包含所有测试类型检查。构建已有依赖 filename／dirname 模拟警告，不描述为“零警告”。

## 待验与未交付

- DSH 单次真实请求：独立工作区候选成功，仍待其独立 Checker，未在本次 main 代码中。
- 完整工作站、图标文件夹操作、HUD／工作岛、同对象外部呈现：有目标与部分数据基础，未完整交付。
- 真实 Codex／Hermes、连续三轮、取消、崩溃恢复、旧 Session 缩减输入：未完成集成验收。
- 本地 Agent 项目／任务索引、目录／NAS、Appshot、跨设备：后续适配。
- Jev、复杂关系编排与社区生态：后续验证／长线。

旧本地工作区的未提交资产与 UI 改动不包含在 PR #8 中。仓库资产示例中的旧标题／本机来源不是完整研究正文，也不是当前全量索引；当前资料入口是[文档地图](../README.md)。

## 下一动作

完成本次产品知识文档审查；推进冻结 DSH 候选的独立核验与一个真实运行纵切，并让最小工作站调用相同业务入口。工作包与结束条件见[近期计划](plan.md)。
