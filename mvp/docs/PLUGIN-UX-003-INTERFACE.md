# UX-003｜工作台 SSR 能力接口

2026-11-15；基线 `2db7657` 加工作区 UX-003 候选。后端 Maker 的允许文件仅为 `mvp/devtools/workbench.py`、新 `mvp/tests/test_workbench_capabilities.py` 与本卡；HTML 由前端负责人 Laplace 维护。

## 协议（先定义，供前后端共同采用）

既有 `GET /` 在返回 HTML 的唯一 `<body>` 上声明以下有限枚举，不新增 API、脚本、业务请求或能力探测。

| 属性 | enabled | disabled／缺失 |
|---|---|---|
| `data-write`（始终存在） | 当前 server 的 `writer is not None`，已安装既有显式保存桥 | `writer is None`；不能展示保存可用或同步可用 |
| `data-context`（始终存在） | 当前 server 的 `context is not None`，已安装既有本机项目包预览／导出桥 | `context is None`；不能展示本机导出可用或同步可用 |
| `data-history`（保留旧协议） | 仅当当前 server 的 `history_asset is not None`，且由既有构造校验确保 asset/hash 显式成对绑定，输出 `enabled` | 不输出该属性；不额外输出 `disabled`，不自动回顾 |

`enabled` 只表示当前进程已配置该入口，不表示上游在线、权限有效、材料可读、已有保存结果或操作必然成功。保存仍遵守原准备／明确确认／未知结果锁定流程；本机导出不等于上传或多端同步。两个桥独立：只有保存、只有导出、两者都有、两者都无均合法；回顾绑定与两者独立。

前端仅以 `document.body.dataset.write === 'enabled'`、`context === 'enabled'`、`history === 'enabled'` 为启用条件；缺失或未知值一律按禁用处理。HTML 模板保留原始 `<body>`，这些声明由服务端在既有根响应中注入。静态直接打开模板不具备服务端能力声明。

示例（只声明能力，不携带配置值）：

```html
<body data-write="disabled" data-context="disabled">
<body data-write="enabled" data-context="enabled" data-history="enabled">
```

声明仅有上述固定属性及字面量，不包含 token、后端／工作台端口、origin、文件路径、assetId、hash 或序列化 server 配置。不得通过读取 writer.state、checkpoint、决定包或探测上游判断能力。

## 请求及兼容边界

根响应仍把原脚本替换为既有同源 `/workbench.js`；不改变脚本内容或 HTTP 安全头。默认进入零业务请求不变。显式绑定回顾时，保留既有一次决定包加载；不增加保存状态／导出预览／来源预取或自动重试。能力标记不代替原接口的授权、校验或错误处理。

不改 UI、DB、迁移或其他接口，不做模型调用、生产安装、推送、合并，不建立平台或自动采集。

## 协调与核验

协议先写本卡，再直接发给 Laplace（`01a1df6f-dfb5-7782-9719-ffa6a5e17bf6`）协调；Maker 自核不代表独立 Checker／Gate 接受。

已先发送协议给 Laplace，发送工具返回成功；主Agent随后转述 Locke 独立接口定义 PASS。实现仅在既有根响应注入固定字面量，保存／导出严格按 `is not None`，回顾保持原条件；未触碰 HTML 或其他人的候选文件。

Maker 实测使用指定 SDK Python：`D:/c-moved/hermes-sync/handoff/20261103_Knot_P0-04C_codex_mcp/venv/Scripts/python.exe`，以 `-B -m pytest ... -q -p no:cacheprovider --tb=short` 执行。

| 验证组 | 本轮结果 |
|---|---|
| `test_workbench_capabilities.py`、`test_workbench_write.py`、`test_decision_history_http.py`、`test_workbench.py` | 54 passed，24.83 秒 |
| 前端补齐显式 enabled 夹具后：`test_workbench_draft.py`、`test_workbench_relations.py`、`test_workbench_usability.py`、`test_workbench_history.py`、`test_workbench_sections.py`、`test_context_workbench.py` | 38 passed，24.38 秒 |

合计分两组 92 passed；不是全库回归或独立实现验收。此前联合运行处于前端更新 HTML／旧夹具尚未更新的窗口，77 passed／15 failed；失败已通报前端，由前端完成夹具适配，本 Maker 未改旧测试。上述后续两组已覆盖同一十文件并全部通过。

新增能力文件含 13 项：真实 `create_server` 的保存／本机导出／回顾八种组合；真实 HTTP 根 HTML 和脚本响应；闭合且无重复的 body 属性；无 token、端口、路径、assetId、hash 泄漏；服务端不触发上游／投影／桥状态或业务操作，重复读取不改变私有目录内容；以真实响应字节和 SSR dataset 驱动独立 DOM 模型验证默认零请求、显式回顾仅一次原 GET；以禁止布尔转换的桥对象证明严格 `is not None`、对象独立和禁用回退；四种不完整／非法回顾绑定仍拒绝。

`git diff --check` 通过。生产进程、真实业务库、模型及安装未操作；无迁移、提交、推送或合并。候选实现待独立 Checker／Gate。


最终独立联合Gate PASS；Locke另独立后端26 passed并核对4973实际新SSR。实际运行与候选指纹记录于UX-003末节。Maker测试不替代该独立结论，未声称全库全绿或能力配置即操作成功。
