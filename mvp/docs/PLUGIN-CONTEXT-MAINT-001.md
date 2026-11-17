# CONTEXT-MAINT-001｜上下文维护唤醒

2026-11-17，基线 `8a57c11`。用户判断：**Knot 缺乏维护项目上下文的能力**——插件必须能唤醒 agent 去维护，否则只能靠人手动导入。当前所有「上下文」都是导入时的一次性快照（`context_sync_policy.py` 自述为 draft local context proposal），没有任何角色负责让它保持正确：没有更新触发、没有过期判定、没有缺口检查。`list_projects` 也不承担这个判断。

本卡只做**一个只读入口 + 明确的维护语义**，让 agent 在会话里能自己发现「这个项目的上下文已经不对了」。不做自动写入、不做后台定时器、不做会话钩子。

## 定义

新增 MCP 只读工具 `knot_context_review`。

### 输入

无请求参数（沿用现有工具的服务身份与 reader 作用域，与 `knot_*` 既有工具一致）。

### 输出

```
{
  "checked_at": <ISO8601>,
  "items": [
    {
      "project_id": <uuid>,
      "title": <string>,
      "reasons": [<reason_code>, ...],       // 非空，最多 4 项，固定顺序
      "suggested_action": <action_code>,     // 取 reasons 中优先级最高者的动作
      "last_activity_at": <ISO8601 | null>
    }
  ]
}
```

- `items` 按 `last_activity_at` 降序（null 末位），最多 20 项。
- 无待维护项时返回 `items: []`，不得返回假条目或占位项目。

### 原因码（固定，不加自由文本）

| code | 判定 | suggested_action |
|---|---|---|
| `CAPTURE_STALE` | capture 已启用且宿主存在比已留存更新的用户消息 | `review_capture` |
| `NO_SOURCE` | 项目在当前版本下无任何可读有效来源 | `import_material` |
| `NO_DECISION` | 有材料但 `decision_count == 0` | `curate_decision` |
| `DORMANT` | `last_activity_at` 距今 > 30 天 | `archive_or_merge` |

优先级：`CAPTURE_STALE` > `NO_SOURCE` > `NO_DECISION` > `DORMANT`。

`capture` 未启用时**不得**报 `CAPTURE_STALE`，也不得因此返回空结果冒充「一切正常」——此时该原因不参与评估，其余原因照常给出。

### 工具描述（agent 唤醒的关键，必须逐字落地）

工具 description 必须包含：在开始任何与 Knot 项目相关的工作（读材料、整理决定、写回顾）之前先调用本工具；把返回的待维护项原样呈现给用户，由用户决定是否处理；本工具只读，不修改数据库、不导入、不写入。

这是本卡区别于普通查询工具的实质：它给 agent 一个每轮都要经过的**检查点**，而不是等人想起来手动导入。

### 边界

- 只读，不开事务写、不触发 capture 扫描、不改 manifest。
- 不新增 HTTP 端点；MCP 工具数 11 → 12，既有 11 个工具的名称、描述、顺序、输入 schema 全部保持不变。
- `projects` 未启用时不注册本工具。
- 输出不含正文、原话、绝对路径、账号或凭据。

## 允许写集

`mvp/codex_mcp.py`、`mvp/plugin_projection.py`、`mvp/tests/test_codex_mcp.py`、`mvp/tests/test_plugin_package.py`（仅工具计数断言）、本卡。

## 禁止

不改 `project_repo.py`（取数走现有 `list_projects` / `read_project`）；不改前端；不加写路径；不加定时器或后台线程；不清洗既有工具描述。

## 验收

1. 有 4 类缺陷项目各一个时，`reasons` 与 `suggested_action` 逐项匹配，顺序符合优先级。
2. capture 关闭时 `CAPTURE_STALE` 不出现，其余原因仍正确；不返回空列表冒充正常。
3. 撤权 / 不可读项目不出现，且不产生假条目。
4. 超过 20 项时截断到 20，顺序为 `last_activity_at` 降序。
5. 工具描述包含上述三句语义（逐字断言），既有 11 个工具描述经 diff 无变化。
6. 本工具调用前后库文件 mtime 与行数不变（只读证明）。
7. 全库 `pytest mvp/tests/ -q` 通过，无新增失败。

交付须附：工具描述 diff、自核命令与输出、只读证明、失败记录（如有）。
