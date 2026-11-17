# CONTEXT-MAINT-002｜capture 水位只读来源

2026-11-17，基线 `d3d8f8f`（PR #55 HEAD）。CONTEXT-MAINT-001 交付后，`CAPTURE_STALE` 是四个原因码里唯一**不可达**的一个：实现已写好并有单测，但 MCP 层只能传 `capture=None`，所以线上工具永远不报它。本卡补上这个来源。

## 为什么现在做不到（可核事实）

- capture 跑在 workbench 进程内（`mvp/devtools/codex_capture.py`），30 秒轮询宿主库，状态只在该进程内存里（`Capture.state()`：`phase / scanned_at / last_saved_at / discovered / added_sources / retained_sources / issues / limited`）。
- workbench 有 `/api/capture-state`，但它属于 workbench 的鉴权面和端口。
- MCP 是 stdio 客户端，只连 Core 的 loopback contract（`--origin`），看不到 workbench 进程。
- 四个原因码里 `NO_SOURCE` / `NO_DECISION` / `DORMANT` 都由 `/projects` 数据即可判定，只有 `CAPTURE_STALE` 需要「宿主里比已留存更新的用户消息时间」。

**现有状态里也没有这个水位**：`state()` 不含任何 `newest_user_message_ms`，需要新采集，不是单纯暴露。

## 定义

### 1. capture 侧：采集并落盘水位

`Capture` 在每轮扫描完成后，额外计算每个项目的 `newest_user_message_ms`（宿主侧该项目的用户消息最大 `create_time`，与既有摄取口径一致：只认 `role=user` 且来源为 `user` 的完整 `input_text`）。

写入 `<state_root>/capture-state.json`，原子写（临时文件 + rename），结构封闭：

```json
{
  "version": "knot.capture-state/1",
  "updated_at_ms": <int>,
  "phase": "watching|paused|unavailable|starting",
  "projects": [{"project_id": "<uuid>", "newest_user_message_ms": <int>}]
}
```

- 最多 116 项（沿用 `discovered` 上限）。
- **只含 project_id 与时间戳**：不含标题、路径、消息正文、线程 ID、账号。
- 扫描失败或进入 `paused` 时**不更新** `updated_at_ms`，也不写入半份数据。
- 写文件失败不得让扫描整体失败，但必须在 `state()` 的 `issues` 里可见。

### 2. MCP 侧：只读消费

`mvp/codex_mcp.py` 新增可选启动参数 `--capture-state <path>`；未提供时行为与现在完全一致（不评估 `CAPTURE_STALE`）。

读取后逐项校验，任何一项不满足即**整体视为不可用**（不报 `CAPTURE_STALE`，也不报错，其余三个原因照常）：

- 文件存在、可读、体积 ≤ 1 MiB；
- `version` 精确匹配 `knot.capture-state/1`；
- `updated_at_ms` 为整数且与当前时间相差 ≤ 300 000 ms（5 分钟）；
- `phase ∈ {watching, paused, unavailable, starting}`；
- `projects` 为数组，≤ 116 项，每项 `project_id` 为小写 UUID、`newest_user_message_ms` 为整数，无重复。

判据变化只影响 `CAPTURE_STALE` 一项：`host_stamp > last_activity` 时触发，`last_activity` 仍取 manifest 保存时间（沿用 CONTEXT-MAINT-001 的修订）。

## 允许写集

`mvp/devtools/codex_capture.py`、`mvp/codex_mcp.py`、`mvp/plugin_projection.py`、`mvp/tests/test_codex_capture.py`、`mvp/tests/test_codex_mcp.py`、本卡。

## 禁止

- 不新增 HTTP 路由，不改 Core 契约，不写业务库。
- 不改 capture「只读宿主」的既有约束（仍不递归全盘、不读 auth/config/备份库）。
- 不让 MCP 直接连 workbench 端口（跨进程鉴权面不同，本卡不解决）。
- 不在 `capture-state.json` 里放任何正文、标题、路径或线程 ID。
- 不改既有 12 个 MCP 工具的名称、顺序、输入 schema。

> **修订 2026-11-17（独立复核指出）**：`knot_context_review` **自己的描述允许改**。它原写「CAPTURE_STALE 当前不评估，不会出现在结果里」，接上水位后这句已变成假话；描述必须随可达性更新，否则等于让 agent 继续读一句错的。其余 11 个工具的 description 仍逐字冻结。

## 验收

1. capture 正常运行后，`capture-state.json` 存在且结构通过封闭校验，`projects[].newest_user_message_ms` 与宿主真实消息时间一致（与已留存来源的时间对得上）。
2. 同一项目在宿主侧出现更新的用户消息 → 工具返回该项目的 `CAPTURE_STALE`，且优先级高于 `NO_DECISION` / `DORMANT`。
3. 文件缺失 / 超过 5 分钟未更新 / version 不符 / 结构非法 → 不返回 `CAPTURE_STALE`，其余三个原因照常返回；不产生 `UPSTREAM_ERROR`。
4. 文件内容逐字扫描：不含消息正文、不含标题、不含路径分隔符、不含线程 ID。
5. `paused` 状态下水位不前进（`updated_at_ms` 不变），工具按普通状态处理。
6. 未传 `--capture-state` 时，工具行为与 CONTEXT-MAINT-001 完全一致（现有测试不改即可通过）。
7. 全库 `pytest mvp/tests/ -q` 无新增失败（`test_s2_recovery.py` 的已知时序 flaky 除外）。

交付须附：真实宿主扫描产生的水位样例（脱敏）、过期/损坏/缺失三种反例的输出、文件内容扫描结果。
