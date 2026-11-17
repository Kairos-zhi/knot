# CONTEXT-LIST-001｜项目列表取舍与排序

2026-11-17，基线 `8a57c11`（PR #53 HEAD）。用户实测 Codex 插件项目列表「一坨屎」：所有已登记项目按 `project_id` 字典序原样回显，空项目、一次性导入项目、废弃项目平铺，没有最近活动、没有取舍、没有排序依据。

本卡只解决「看什么」：主列表必须有取舍标准与可核排序。不解决「谁维护」（见 CONTEXT-MAINT-001），不改写库路径。

## 现状（可核）

`mvp/backend/project_repo.py::list_projects` 对 `_scan` 结果 `sorted(projects.items())` 后逐项授权，回显 `manifest` 五字段 + `material_count` / `decision_count`。无时间维度筛选、无排序键、无折叠。

前端 `mvp/devtools/workbench.html` 按后端返回顺序平铺 `<div id="projects-list">`，卡片只有标题、"已留存 N 条材料/原话"与 `saved_at`。

## 定义

### 活动时间

`last_activity_at` = 该项目当前选中版本下，以下两者的最大值：

- 项目 manifest 资产的真实 `created_at`（不取导入者回填时间）
- 所有可读有效来源（含捕获的 Codex 用户来源）的 `message_time_ms`

无法取得任何时间时输出 `null`，不得用请求时间或当前时间顶替。

### 状态枚举

| state | 条件 |
|---|---|
| `active` | `material_count > 0` 且 `last_activity_at` 距今 ≤ 7 天 |
| `dormant` | `material_count > 0` 且（`last_activity_at` 距今 > 7 天 或 为 `null`） |
| `empty` | `material_count == 0` 且 `decision_count == 0` |

「距今」以服务端注入的单一 `now` 计算，同一响应内不得取多次时钟。

### 主列表与折叠

- 主列表只含 `active` 与 `dormant`，按 `last_activity_at` 降序；`null` 排末位；同值按 `saved_at` 降序，再按 `project_id` 升序，保证稳定。
- 主列表最多 20 项。超出部分不返回条目。
- `hidden_count` = 被折叠的 `empty` 数量 + 超出 20 项的数量。
- 撤权、不可读、manifest 损坏的项目照旧整体跳过，不进入任何计数。

### 契约增量（向后兼容）

`ProjectList`：

- `items[]` 新增 `last_activity_at`（string date-time 或 null）与 `state`（上述枚举），二者必填。
- 顶层新增 `hidden_count`（integer ≥ 0），必填。
- 既有 7 个字段名称、类型、顺序语义不变。旧客户端忽略新字段仍可工作。

`contract/selfcheck.py` 与 `endpoints.json` 按现有方式同步，不新增端点，不改 `/api/projects` 请求体。

## 允许写集

`mvp/backend/project_repo.py`、`mvp/contract/v1/schema.json`、`mvp/contract/selfcheck.py`、`mvp/tests/test_project_repo.py`、`mvp/tests/test_project_http.py`、本卡。

## 禁止

不改 `workbench.html`（前端另卡 CONTEXT-LIST-002）；不改 capture / 决策归档 / 探索路径；不新增端点或查询参数；不改已发布字段语义；不写业务库；不推送、不合并。

## 验收

1. 注入两个空项目 + 三个有料项目（分别 8 天前、2 天前、无时间），断言主列表顺序、`state`、`hidden_count` 精确匹配。
2. 21 个 `active` 项目：主列表 20 项，`hidden_count == 1`。
3. `now` 注入 7 天边界两侧各一次，`active`/`dormant` 切换正确。
4. 撤权项目不出现且不计入 `hidden_count`。
5. 旧字段逐字段不变（与基线快照对比）。
6. 全库 `pytest mvp/tests/ -q` 保持 1400 passed 级别，无新增失败。

交付须附：改动文件清单、自核命令与输出、失败记录（如有）。
