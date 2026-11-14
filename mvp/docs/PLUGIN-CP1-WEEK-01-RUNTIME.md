# CP1-WEEK-01：隔离插件运行入口

本切片把已冻结的 Knot MCP 候选变成一个可交接的本地开发运行入口。它只服务一个操作者显式指定的私有 runtime root，不发现、接管或迁移已有 Knot 服务，也不继承父进程中的 `KNOT_TOKEN` / `KNOT_TOKENS`。

## 运行边界

- `init` 只创建新数据库；目标已存在时拒绝，不覆盖。
- `start` 只启动 `mvp.backend.http_server`，绑定 loopback；默认使用临时空闲端口。
- `status` 只检查管理记录、PID 和 `/health`；没有管理记录时不会猜测或接管外部服务。
- `stop` 只停止管理记录中且数据库哈希一致的进程。
- 所有运行日志写入 runtime root，输出只返回状态、端口、schema 和错误码，不打印正文或凭据。

## 最短自检流程

在仓库根目录，用隔离 Python 执行：

```powershell
$python = (Get-Command python).Source
$root = 'C:\path\to\private\knot-runtime'

& $python -B -m mvp.devtools.plugin_runtime check --root $root
& $python -B -m mvp.devtools.plugin_runtime init --root $root
& $python -B -m mvp.devtools.plugin_runtime start --root $root
& $python -B -m mvp.devtools.plugin_runtime status --root $root
& $python -B -m mvp.devtools.plugin_runtime stop --root $root
```

`init` 和 `start` 必须由操作者明确执行；工具不会自动初始化或选择默认用户库。MCP 插件仍通过 `mvp/codex_plugin/build.py` 构建，须把 `status` 返回的 loopback 端口作为显式 origin，再由操作者在隔离宿主中执行一次真实工具查询。

## 有限验收

CP1-WEEK-01 的程序化验收覆盖：新库创建、schema 1.9 health、启动/状态/停止、数据库路径越界、未初始化拒启、进程收尾以及凭据环境不继承。它不代表桌面插件安装、真实材料导入、模型使用、平台同步或人的产品接受。
