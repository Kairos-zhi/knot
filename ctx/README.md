# knot-ctx / M1 第一屏

本目录是运行时试点（**不入仓**）。定稿后由 holder 走 knot 仓新分支 PR 迁入 `ctx/`。

## 分工边界（谁改什么，不许越界）

| 片 | 负责 | 只允许写 |
|---|---|---|
| A 采集服务 | Codex（a2a-20261026-001） | `server.mjs`、`scripts/probe.mjs`、本 README 的「运行」节 |
| B 第一屏界面 | 大荒谬（a2a-20261026-002） | `public/index.html`（+ `public/assets/`） |
| C 独立核验 | harness（a2a-20261026-003） | `~/hermes-sync/handoff/20261026_M1_核验报告_harness.md` |
| 环境与只读断言 | 小禾（holder） | `scripts/readonly-assert.mjs`、`start.cmd`、`contract/fixture.json`、本 README |

禁改：任何源文件（Hermes 的库/日志、仓库、hermes-sync 内容）、任何第三方依赖、构建步骤。

## 契约

见 `~/hermes-sync/handoff/20261026_第一屏规格_v1.md` §数据契约。端口 127.0.0.1:7317。

## 运行

```
node server.mjs            # 起服务
node scripts/probe.mjs     # 采集自检
node scripts/readonly-assert.mjs --snapshot   # 采基线（跑前）
node scripts/readonly-assert.mjs --verify     # 校验没写源（跑后）
```
