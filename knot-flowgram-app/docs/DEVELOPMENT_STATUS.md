# Knot 开发状态与验证入口

更新：2026-10-18。PR #8 已合入 main（40582f0），原 PR #6 也已合并。本页保留该批代码与验证指纹；后续接续先读[当前开发状态](../../docs/development/status.md)、[产品路线图](../../docs/product/roadmap.md)与[文档地图](../../docs/README.md)。

## 当前代码包含什么

PR #8 保留了 P0 验证链与 Canvas Bridge 原提交 `9e99a715fb070b966564298cf292fa87968cd3d9`，复建其上的三段已获独立接受的服务层代码，并纳入当时主分支文档更新；该批已合并，合并提交为 `40582f04020ecfb6bebd1b38f17e64797ec8d3e6`。

| 已接受切片 | 当前能力 | 主要入口 |
|---|---|---|
| 工作现场 W3-A v3 | 按现场隔离供给、排除、草稿及 Agent 选择；呈现实例引用同一对象；兼容保存恢复、回滚与故障隔离 | `KnotSelectionService`、`workspace-state.ts`、`asset-persistence.ts` |
| 输入编译 v2 | 显式指定现场，只读已勾选且未排除的材料；保留块；不递归读取来源父项；恢复事务中拒绝不稳定读取 | `KnotOperationService.compileWorksiteInput` |
| 本地请求适配 v2 | 将当前现场交给注入的接收函数；发送前编译；完整深拷贝，避免接收参数、返回参数与现场状态相互污染 | `prepareWorksiteRequest`、`dispatchWorksiteRequest` |

三份独立接受记录的日期均为 2026-10-04。接受范围为构造材料与服务层行为；本次复建与推送不构成新的集成独立验收。

累计请求适配候选包含 13 个文件（7 新增、6 修改），以批准提交为基线的 Git tree 为 `7392481a94025ff7541238994e7e3df741105365`。复建时 13 个文件的 Git blob 与已接受清单逐一一致。随后合入主分支文档并新增本页，候选代码保持原字节。

| 冻结补丁 | SHA256 |
|---|---|
| W3-A v3 | `E108F176A7F65D089B6666F4600D90A885835832BE478C4102CE52D68A68D23D` |
| 输入编译 v2（累计） | `9AFA7C864148014E8052EC688751BD5A1B6D94C8D8FEBECEB95C26BCAE0D8CA4` |
| 请求适配 v2（累计） | `64A2A65B2CB4F3EBED5B27DE1973B7B69FC2D41B7884CB3D7FBD0F68416F81EE` |

## 验证入口

在 `knot-flowgram-app` 目录、安装锁文件对应的依赖后执行。2026-10-17 的复建检查使用 Node 22.22.3；新增测试采用构造材料与临时存储，不需要模型凭据。

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

普通 `npm test`、`npm run build` 当前仍是空操作，不能作为检查成功的证据。类型配置主要检查 src；测试通过 tsx 实际执行，不据此声称所有测试源码均通过静态类型检查。

## 后续需要接通什么

本地请求适配器只调用注入的接收函数，不内置网络传输、Provider、Session 或 Run。现有生成服务仍使用 mock。工作现场状态模型也不等于新版工作站桌面、HUD、灵动岛或系统浮窗已经交付。

DSH 已有单次真实模型运行的独立候选与证据，仍待其独立 Checker，未纳入本次代码。真实 Codex／Hermes 派工、旧会话缩减上下文、工具读取边界、取消与崩溃恢复、工作站 UI 和完整连续协作仍需后续实现及验收。

开发继续遵守 [Agent 原生友好标准](AGENT_FRIENDLY.md)：人和 Agent 共用操作内核，查看与供给分开，呈现切换不改变资产或执行生命期。
