# CP1-VISUAL-001 · 插件探索工作台

2026-11-14 用户要求持续推进插件并将可视化提上日程。本卡沿用 f907b74 的 11 工具及服务核心，实现开发期本地只读工作台；CP1-WEEK-02 的固定私有目录仍待附件字段授权，不复制 HISTORY 材料。

允许文件：mvp/devtools/workbench.py、mvp/devtools/workbench.html、mvp/tests/test_workbench.py，以及本卡。独立 Reviewer 先复核定义，实施后复核差异和测试。启动卡缺陷在原 runtime 文件中另行修复。

输入为显式 loopback 后端 origin 及进程环境 KNOT_WORKBENCH_TOKEN。凭据由 Python 代理保留，浏览器只获得投影。页面第一次打开不读取业务数据；操作者逐次点击刷新列表、加载停点、查找、来源和单页阅读。只列当前 actor 的最多 20 条探索；页面不宣称全库目录或项目识别。

工作台复用现有投影、reader 和 hash 约束；仅开放有限 GET 映射，不开放任意代理或写操作。请求校验 Host、同源及参数闭合，拒绝跨站读取；响应 no-store，正文只以 textContent 展示。页面不持久化 token、正文或笔记，不自动分页、重试、同步或保存。返回内容进入浏览器可见范围；复制回聊天后进入聊天历史。

验收：真实合成后端的列表、v2 停点、单页长读、无权读取、错误 hash、写路由拒绝、跨源拒绝；页面脚本程序化验证关系/不可用状态/空数据/恶意字符串与显式请求次数。禁止截图或模拟点击作为验收。

开发顺序：本卡完成后继续显式保存与返回恢复，再定义项目身份、用户确认记录及平台同步协议。开发者能力推断和公开证据授权各自单列，不由探索关系推断。

## 启动入口

在仓库根使用已安装 requirements-plugin.txt / requirements-dev.txt 的 Python 环境。先用 runtime 的显式 init/start 创建隔离后端；runtime 的 KNOT_RUNTIME_TOKEN 由操作者在本地进程环境中设定。将相同凭据赋给 KNOT_WORKBENCH_TOKEN，然后执行：

```powershell
& $knotPython -B -m mvp.devtools.workbench --origin http://127.0.0.1:<后端端口>
```

打开命令返回的本地 URL。工作台终端 Ctrl+C 停止代理；再用 runtime stop 停止后端。token 不填入网页、URL 或命令行。已有 reader 授权决定可读资料；新空库展示空列表。需要私有资料时沿用已有独立环境及其授权，不运行重复导入。

页面仅请求经过投影校验的 list/load/search/slice/source。浏览器投影将修订号转换为十进制字符串以保持 64 位整数精度，不更改原 HTTP/MCP 契约。读取正文前由操作者指定资产与 hash；下一页沿用上页锚点，编辑输入会清空正文及下一页状态。

## 程序化证据与独立结论

Maker：test_workbench.py 最终 15 passed。涵盖真实合成 SQLite/HTTP 的列表、停点、长读、来源未知、撤权、hash 错误、只读与同源边界；五类接口的 HTTP-200 错误形状不得旁路投影。Node VM 执行原页面脚本，验证首次零请求、文本按字面展示、一次单页读取、选择变更清空锚点和不可用材料禁选。没有浏览器截图或模拟点击。

独立 Checker（Agent 01a1d98b-bf53-7322-9f27-da73e0dff3c6）先通过定义，随后发现错误形状旁路；修复后独立重跑 15 passed，并以真实 HTTP 核验仅固定错误码可出边界，结论 PROCEED，范围仅本地只读工作台。视觉排版、使用体验、平台同步、安装与阶段接受仍待各自验证。
