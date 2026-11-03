# P0-04C Codex MCP 只读入口

基于 `85417d5`，GPT-6 中控、GPT-6.1 Maker、独立 Checker、之 Gate。第一阶段先验证受支持的只读连接切片，工具仅按已知 hash 定位资产。

允许新增本卡、`mvp/codex_mcp.py`、`mvp/tests/test_codex_mcp.py`、`mvp/requirements-plugin.txt`。官方 MCP SDK 负责 stdio 协议，依赖仅安装于隔离环境。工具固定访问显式 loopback origin 的资产 meta GET，复用已有投影。只从进程环境读取 token；禁用代理与跳转，限制响应与等待。不触及真实宿主注册、在用库、正文、写入或模型。

合成 HTTP 与 SDK 客户端覆盖真实 stdio 协商、工具发现、调用与拒绝、权限头、超时、尺寸、重定向、输出裁剪。候选待独立 Checker 和 Human Gate。

## Maker 自核

启动示例使用合成服务的端口：`python -m mvp.codex_mcp --origin http://127.0.0.1:<port>`。固定使用字面 loopback 地址，必须显式给端口。入口只提供 `knot_lookup_asset`，不读取数据库路径，不发现现存服务。响应限 64 KiB，HTTP 整体等待限 2 秒，拒绝非 identity 编码与所有非 200 状态。HTTP 错误统一为 `UPSTREAM_ERROR`，无效工具参数为 `INVALID_ARGUMENTS`，文本与结构化内容使用相同裁剪结果。

隔离环境固定官方 MCP SDK 2.1.1、AnyIO 4.16.0、httpx2 2.16.0、pytest 9.2.0。以 SDK 客户端实际启动 stdio 子进程，auto 协商 2026-07-28，legacy 协商 2025-11-25。合计 36 passed（本卡 8 项，投影回归 28 项），首轮 SDK 初始化参数错误原日志保留。私有交接目录 `20261103_Knot_P0-04C_codex_mcp/` 下有 `maker-test.log`、`maker-first-failure.log` 与 `venv-freeze.txt`。仅证明 SDK 线协议与合成 HTTP；独立 Checker 及 Codex 宿主 Gate 待定。

## CI 依赖补充

独立 Checker 实证默认 CI 仅安装根开发依赖时，新增测试在收集阶段缺少 MCP SDK。中控批准扩及根 `requirements-dev.txt`，引用独立插件运行依赖，使现有 CI 安装和收集命令覆盖此入口。
全新私有 Python 3.12 venv 按根开发依赖安装成功；默认测试树收集 531 项，定向 36 passed（10.94s），两种协议协商结果一致。原始日志分别见 maker-fresh-install.log、maker-default-collect.log、maker-default-focused.log。全量仅收集。

## 独立复核与交付边界

独立 Checker 在另一个全新私有环境核根开发依赖安装、全树收集531项、定向36 passed（10.80s），关闭默认CI收集阻塞。旧BLOCKED报告和首次失败保留，修正结论亲写于私有 `CHECKER-DEPENDENCY-FIX.md`，五文件原始blob另作绑定。代码与测试未因依赖修正而改写，没有通过跳过测试解除阻塞。

候选仅固定本地提交，未推送、合并、注册或安装真实宿主；没有声称远端CI或用户体验已通过。它只按已知hash提供受限元数据，不是关键词搜索、正文阅读、持久选择、探索状态保存或完整第一阶段交付。最终提交另由独立Checker绑定；后续按阶段路线推进插件包装和正文/reader边界。
