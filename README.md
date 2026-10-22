# Knot · DSH 插件开发

开发基准：**后端对齐竞对，前端对齐 Apple**。人和 Agent 共用对象与操作规则；工作站是人的呈现入口，Agent 通过程序接口直接读写和订阅变化。

开发前读 [AGENTS.md](AGENTS.md)、[开发基准](docs/development-baseline.md)；当前任务与证据状态见 [STATE.md](STATE.md)、[QUEUE.md](QUEUE.md)。

## 桌面软件入口

之已明确：Knot 面向官方 DeepSeek Harness 桌面版开发。使用桌面 `DSH.lnk` 或本项目 `start-kont-desktop.cmd` 打开安装在 `D:\DSH-Desktop\app` 的软件；DSH home、Electron 用户数据与 Knot 数据目录均在 `D:\DSH-Desktop` 下。本机已通过官方插件管理器安装并启用 Knot，普通启动会加载它；启动器本身不安装插件。

本机官方桌面固定 `0.2.1-rc.2`；[KONT-DESKTOP-003](docs/tasks/KONT-DESKTOP-003-COMPAT.md) 已独立限定接受兼容、真实插件加载、同内核操作与正常重开读回。`npm start`／`start-kont.cmd` 保留为服务层测试入口。

桌面中现有「KONT 工作现场」入口及两个明确标注的接入验证材料。现有客户端用于接入核验；正式 Apple 工作站界面、真实模型／完整 Run 尚待后续卡。最终回执：`evidence/local/20261022-desktop-compat/checker/final-review.json`。

## 当前候选

`KONT-KERNEL-001-r2` 已独立限定接受：20 项测试与 8 组额外程序化实测通过，代码／产物哈希前后一致。其后桌面兼容与加载由独立子卡接受，已本地提交；历史20项不冒称当前全量测试。

[KONT-KERNEL-001](docs/tasks/KONT-KERNEL-001.md) 是限定 Headless 适配：复用既有 schema 4 快照校验、资产投影及现场规则，提供创建／更新结、连接／断开绳、现场和呈现操作，以及状态与事件出口。它不是原 OperationService 的完整迁移。

原始源码来源固定为 [Kairos-zhi/knot main 的 08a2a53](https://github.com/Kairos-zhi/knot/tree/08a2a5340edab920ce942173ba63b2c5bc369eb4)；vendor 原文和构建提取边界有 SHA256 守卫，源变更时构建拒绝静默采用。

## 构建与验证

Node 22.22.3、DSH `0.1.7-rc.2` 与官方桌面 `0.2.1-rc.2` 已在本机验证；精确兼容声明仅覆盖这两个版本。签名应用包保持原字节，桌面依赖与配置经官方管理器安装。

```powershell
npm run build
npm test
```

当前完整测试51/51通过，无失败／跳过；在原44项上新增只读审计7组，含官方Electron/Session/JSONL实际库的隔离合成会话测试，不调用模型。此前实际官方桌面Host/client、同内核操作及普通重启证据保持历史限定接受，本轮没有重跑桌面安装／启停。构建使用 Node 类型擦除 API，有实验性警告。

## 服务层隔离启动（测试）

默认 DSH 安装在 `D:\dsh-sandbox`，可用进程环境变量 `DSH_INSTALL` 指定。开发 home、profile、资产与独立 Agent token 位于当前项目 `.runtime/`，不复用原 DSH 用户配置。

已有实例占用默认 3081 时，为新测试选择空闲端口或 `KONT_PORT=0`，不要停止其他实例。例如在当前 PowerShell 进程：

```powershell
$env:KONT_PORT = '0'
npm start
```

启动器输出本次 DSH 浏览器登录入口，但不会自动打开浏览器；该入口与 Agent Bearer token 是不同凭据。`KONT_RUNTIME_DIR` 可指定独立临时数据目录。正常进程内关闭经过 DSH 的清理流程；物理键盘 Ctrl+C、强杀和断电恢复的覆盖范围以任务回执为准。

## 程序接口

| 接口 | 用途 |
|---|---|
| `GET /kont/snapshot` | `{ok, seq, snapshot}`，snapshot 使用既有 `schemaVersion: 4` |
| `POST /kont/command` | 原命令 `{type, ...}` 与 `{ok, value}`／`{ok:false,error}` 信封 |
| `GET /kont/events?since=<seq>` | 有序 SSE；重启、缓存缺口或无效历史要求重新取 snapshot |

Agent 发送 `Authorization: Bearer <token>`，token 由插件在独立数据目录的 `agent-token` 文件生成，或由宿主环境提供；来源身份由宿主映射，调用体不能自行认领身份。仅接受受限 loopback／Host／Origin。浏览器通过 DSH Connection 鉴权，调用同一存储和内核。

已支持 `knot.create`、`knot.update`、`rope.connect`、`rope.disconnect` 及原有 `worksite.*`／`presentation.*` 操作。追加块当前通过读取快照后提交 `knot.update` 的完整 blocks 完成；这不是调用模型的 `generate.grow`。未覆盖命令返回 `UNSUPPORTED_COMMAND`。

[KONT-RUN-004](docs/tasks/KONT-RUN-004.md) 已独立限定接受，新增 `run.prepare`：显式提供 requestId、sessionId（仅计划值）、worksiteId、targetId，固定准备时输入／材料摘要并保存prepared记录；它不会执行DSH。原具名协议覆盖仍为5/16。纯prompt适配与内部原子回流仅验证离线关联契约，普通HTTP不能伪造completed。只支持新Session首turn、单用户、纯文本／无工具的给定日志投影；没有已连接的运行时适配器，不证明完整DSH事件schema、实际会话兼容或真实Run完成。新增源码尚未部署到运行中的桌面。

[KONT-RUN-005](docs/tasks/KONT-RUN-005.md) 补只读观察工厂：服务侧许可后点读一个Session，使用官方Session重放窄请求边界；系统／开发者／上下文、模型与权限变化使原指纹核准失效。无许可不读，无指纹核准不标核准，所有结果均不授权执行或自动回流。工厂尚未接入在用桌面；官方库合成会话验证不等于真实模型Run。

`/kont/api/workspace` 只为最初 UI 候选保留兼容，不能成为另一个资产权威。正式前端、真实生成／Run、外部 Codex／Hermes、MCP／A2A、细粒度权限和生产部署仍未交付。本轮不替换既有运行实例，也不将绿色表单作为 Apple 对标结果。
