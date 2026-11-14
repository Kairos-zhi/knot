# CP1-WEEK-01：隔离插件运行入口

本切片把已冻结的 Knot MCP 候选变成一个可交接的本地开发运行入口。它只服务一个操作者显式指定的私有 runtime root，不发现、接管或迁移已有 Knot 服务，也不继承父进程中的 `KNOT_TOKEN` / `KNOT_TOKENS`。

## 运行边界

- `init` 只创建新数据库；目标已存在时拒绝，不覆盖。
- `start` 只启动 `mvp.backend.http_server`，绑定 loopback；默认使用临时空闲端口。
- `status` 只检查管理记录、PID 和 `/health`；没有管理记录时不会猜测或接管外部服务。
- `stop` 核对当前 transport lock、PID、启动时间和操作系统进程创建身份后，使用绑定到该进程实例的系统句柄停止服务。
- 所有运行日志写入 runtime root，输出只返回状态、端口、schema 和错误码，不打印正文或凭据。

## 最短自检流程

在仓库根目录，用隔离 Python 执行：

```powershell
$python = $knotPython # 已配置、已安装依赖的绝对解释器路径
$root = 'C:\path\to\private\knot-runtime'
# 先在本地进程环境设置 KNOT_RUNTIME_TOKEN（至少16字符），不写进命令行或版本库。

& $python -B -m mvp.devtools.plugin_runtime check --root $root
& $python -B -m mvp.devtools.plugin_runtime init --root $root
& $python -B -m mvp.devtools.plugin_runtime start --root $root
& $python -B -m mvp.devtools.plugin_runtime status --root $root
& $python -B -m mvp.devtools.plugin_runtime stop --root $root
```

`init` 和 `start` 必须由操作者明确执行；工具不会自动初始化或选择默认用户库。MCP 插件仍通过 `mvp/codex_plugin/build.py` 构建，须把 `status` 返回的 loopback 端口作为显式 origin，再由操作者在隔离宿主中执行一次真实工具查询。

新 init 创建绑定数据库文件身份的 runtime-root.json；已有数据库不自动认领。版本1旧运行目录不升级或接管，请保留并选择新的隔离根。start 使用 KNOT_RUNTIME_TOKEN 建立独立 local-user 身份映射，替换继承的 token 配置；MCP 客户端的 KNOT_TOKEN 及工作台的 KNOT_WORKBENCH_TOKEN 应使用同一隔离凭据。读取资产仍须有对应 reader 授权，新空库不自动授权或导入资料。

生命周期调用通过管理锁串行执行；控制目录和文件拒绝软链/联接点。后端只使用标准库，以当前 Python 的基础解释器直接启动，避免 Windows venv 监督进程留下子服务。启动失败通过保留的 Popen 句柄回收实际服务，独立于可变锁内容。

already_running 证明现有服务归属及健康，不重新配置或验证新传入凭据；修改凭据需显式 stop 后重新 start。stop 使用操作系统终止进程，操作者应先完成当前调用；journal 及数据库保留，未知写结果按原请求恢复，不以重启自动重发。

## 有限验收

原12e6f0d的3项测试仅证明初始生命周期，独立复核发现归属、授权与失败清理缺口，原接受表述由本次修复及新证据取代。新增真实隔离后端/MCP集成覆盖11工具发现和探索查询、继承凭据403、停止后PID消失及端口关闭、记录发布失败后服务回收；反例检查另见 test_plugin_runtime.py / test_plugin_runtime_integration.py。具体最终测试结果与独立结论另行绑定。桌面安装、真实材料导入、人的体验及平台同步尚待验证。

Maker 最终组合验证：37 passed（运行入口10、工作台15、插件打包及v2 MCP12），29.38秒。本轮未改变 backend、HTTP/MCP 契约或原11工具描述符，未使用真实材料、未调用真实模型。最终进程枚举未见测试后端残留。

独立 Checker（Agent 01a1d98b-14d2-7d23-9c8e-6f1179c2c7a5）独立通过10项运行入口测试，核对最终源码和测试hash及文档，结论 PASS，可冻结四份运行入口文件；范围仅隔离 Windows runtime。先前 HOLD 与原始提交保留，不能外推为生产部署或产品接受。
