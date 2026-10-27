# Knot · DSH 插件开发

开发基准：**后端对齐竞对，前端对齐 Apple**。人和 Agent 共用对象与操作规则；工作站是人的呈现入口，Agent 通过程序接口直接读写和订阅变化。

开发前读 [AGENTS.md](AGENTS.md)、[开发基准](docs/development-baseline.md)；最新进度见 [2026-10-27 开发报告](docs/progress/20261027-local-development.md)，任务与证据状态见 [STATE.md](STATE.md)、[QUEUE.md](QUEUE.md)。

## 桌面软件入口

之已明确：Knot 面向官方 DeepSeek Harness 桌面版开发。既有软件入口为桌面 `DSH.lnk` 或本项目 `start-kont-desktop.cmd`，安装位置为 `D:\DSH-Desktop\app`；配套home、Electron用户数据与Knot数据记录在 `D:\DSH-Desktop` 下。历史安装／启用和普通启动加载已有回执；启动器本身不安装插件。

已验官方宿主为 `0.2.1-rc.2`；[KONT-DESKTOP-003](docs/tasks/KONT-DESKTOP-003-COMPAT.md) 历史独立限定接受兼容、真实插件加载、同内核操作与正常重开读回。`npm start`／`start-kont.cmd` 保留为服务层测试入口。

023安装交接仅说明当时现场。本轮未更新在用软件，也未重读生产profile或当前加载态，不能以045／046候选隔离通过认定已部署。源码中的工作站组件和运行接缝已继续推进，但native传输、ReactDOM、人的体验及G3／G4／G5仍未完成。

## 当前候选

最新业务基线为已推送的046提交`81afa22a483baf6c2da4f9d45f29d5669acabf10`，精确11文件；其真实HEAD的26文件候选已通过官方0.2.1离线临时profile验证。显式Run对账沿同Store，要求独立exact读／写许可、默认拒绝；新取证另须已批准replay指纹，不发送模型请求。契约见[对账API](docs/api/run-reconciliation.md)。

033–037已提供现场资源库、连续HUD、工作岛及文件夹组织；038–042完成五项历史架构接缝修复。044的新14文件恢复承载已限定接受synthetic写入往返，绑定045的d59基线；它不是046最新候选的生产恢复证明，旧017仍不兼容。来源、候选pin及剩余范围见[进度报告](docs/progress/20261027-local-development.md)。

[草稿PR #12](https://github.com/Kairos-zhi/knot/pull/12)以045已审父节点为review-only基线；[草稿PR #13](https://github.com/Kairos-zhi/knot/pull/13)以045为base提交046增量。两者均未合并，独立KONT历史与main的集成问题仍未解决。本次进度文档分支为`codex/progress-report-047`，其提交／PR以仓库记录为准。

### 历史起点

`KONT-KERNEL-001-r2` 已独立限定接受：20 项测试与 8 组额外程序化实测通过，代码／产物哈希前后一致。其后桌面兼容与加载由独立子卡接受，已本地提交；历史20项不冒称当前全量测试。

[KONT-KERNEL-001](docs/tasks/KONT-KERNEL-001.md) 是限定 Headless 适配：复用既有 schema 4 快照校验、资产投影及现场规则，提供创建／更新结、连接／断开绳、现场和呈现操作，以及状态与事件出口。它不是原 OperationService 的完整迁移。

原始源码来源固定为 [Kairos-zhi/knot main 的 08a2a53](https://github.com/Kairos-zhi/knot/tree/08a2a5340edab920ce942173ba63b2c5bc369eb4)；vendor 原文和构建提取边界有 SHA256 守卫，源变更时构建拒绝静默采用。

## 构建与验证

Node 22.22.3、DSH `0.1.7-rc.2` 与官方桌面 `0.2.1-rc.2` 已在本机验证；精确兼容声明仅覆盖这两个版本。签名应用包保持原字节，桌面依赖与配置经官方管理器安装。

```powershell
npm run build
```

测试按当前任务选择隔离专项；`npm test`为全部历史入口，执行前须核对环境和传递依赖边界。本次文档写回没有构建或重跑测试；各卡数字存在重叠，不相加为总覆盖。

RUN-005历史完整测试51/51通过，无失败／跳过；在原44项上新增只读审计7组，含官方Electron/Session/JSONL实际库的隔离合成会话测试，不调用模型。后续任务的当前聚焦覆盖以STATE及对应独立回执为准，不把历史51项称为当前全量。此前实际官方桌面Host/client、同内核操作及普通重启证据保持历史限定接受，本轮没有重跑桌面安装／启停。构建使用 Node 类型擦除 API，有实验性警告。

客户端维护入口与边界见[供给预览](docs/api/worksite-preview.md)、[失败与恢复](docs/api/workspace-recovery.md)、[响应接纳](docs/api/workspace-response.md)、[变化通知](docs/api/workspace-events.md)。开发源码通过不代表在用桌面已更新，具体状态见任务卡。

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
| `GET /kont/snapshot` | `{ok, seq, snapshot}`；完整业务快照`format: kont-store-snapshot/v1`，包含titles／organization／runs；schemaVersion4仅指Canvas核心，见[完整快照契约](docs/api/store-snapshot-contract.md) |
| `POST /kont/command` | 原命令 `{type, ...}` 与 `{ok, value}`／`{ok:false,error}` 信封 |
| `GET /kont/events?since=<seq>` | 有序 SSE；重启、缓存缺口或无效历史要求重新取 snapshot |
| `GET /kont/worksites/<encodedWorksiteId>/preview` | 当前源码具备同次快照seq与现场供给预览；本轮未核在用加载态，见[契约与维护位置](docs/api/worksite-preview.md) |
| `POST /kont/runs/<encodedRunId>/reconcile` | 显式终态对账；沿原认证，exact读／写双许可，新取证另须replay核准，默认403拒绝；不授权模型执行，见[契约](docs/api/run-reconciliation.md) |

Agent 发送 `Authorization: Bearer <token>`，token 由插件在独立数据目录的 `agent-token` 文件生成，或由宿主环境提供；来源身份由宿主映射，调用体不能自行认领身份。仅接受受限 loopback／Host／Origin。浏览器通过 DSH Connection 鉴权，调用同一存储和内核。

已支持 `knot.create`、`knot.update`、`rope.connect`、`rope.disconnect`、原有 `worksite.*`／`presentation.*`，及[文件夹组织](docs/api/worksite-folders.md)的`folder.create/rename/assign`。追加块当前通过读取快照后提交 `knot.update` 的完整 blocks 完成；这不是调用模型的 `generate.grow`。未覆盖命令返回 `UNSUPPORTED_COMMAND`。

### 历史逐卡记录

以下结论均指各卡当时范围；例如RUN-004的“没有运行时适配器”不是当前结论，后续RUN-010／011已有受控适配与一次真实试跑，046另补显式对账。旧RUN-011 Flash授权已消费，本次没有新增模型调用。当前事实以本页顶部及最新API／进度报告为准。

[KONT-RUN-004](docs/tasks/KONT-RUN-004.md) 已独立限定接受，新增 `run.prepare`：显式提供 requestId、sessionId（仅计划值）、worksiteId、targetId，固定准备时输入／材料摘要并保存prepared记录；它不会执行DSH。原具名协议覆盖仍为5/16。纯prompt适配与内部原子回流仅验证离线关联契约，普通HTTP不能伪造completed。只支持新Session首turn、单用户、纯文本／无工具的给定日志投影；没有已连接的运行时适配器，不证明完整DSH事件schema、实际会话兼容或真实Run完成。新增源码尚未部署到运行中的桌面。

[KONT-RUN-005](docs/tasks/KONT-RUN-005.md) 补只读观察工厂：服务侧许可后点读一个Session，使用官方Session重放窄请求边界；系统／开发者／上下文、模型与权限变化使原指纹核准失效。无许可不读，无指纹核准不标核准，所有结果均不授权执行或自动回流。工厂尚未接入在用桌面；官方库合成会话验证不等于真实模型Run。

[KONT-RUN-006](docs/tasks/KONT-RUN-006.md) 将观察工厂绑定插件同一存储，提供宿主内部 `ctx.kontRunObserver.observe(runId)`；配置不能覆盖Run读取。默认拒绝，卸载取消在途观察、等句柄释放再关闭存储。只有开发源码接缝，尚未部署在用桌面；本卡只做受影响专项验证，不追溯改写前述全量51项结果。

[KONT-RUN-007](docs/tasks/KONT-RUN-007.md) 正式装配仅接受普通JSON/YAML的 `readAudit: { enabled: true, grants: [] }`；默认关闭，空白名单不读会话。授权逐项绑定runId/requestId/sessionId/inputSha256，可另给approvedRequestSha256；不接受函数、类、路径或配置自报版本。实际版本和Session来自宿主包服务，持久化来自宿主服务；隔离验证中的包解析base有显式适配，尚未证明在用Desktop profile装配／部署。

[KONT-RUN-008](docs/tasks/KONT-RUN-008.md) 新增Agent setup作用域保护候选：显式绑定准备记录与provider/model/maxTokens，默认拒绝；限制无工具、一次LLM stream及取消后的调用。官方执行组件配合合成提供方验证，不接插件执行入口；完整上下文请求核准、金额预算、持久防重和真实终态回流仍未接通。一次stream不等于Provider内部HTTP零重试。

[KONT-RUN-009](docs/tasks/KONT-RUN-009.md) 补内部持久提交防重：同Run先保存一次性占位，再调用submit；并发和正常重开后不再授予派发资格。`dispatchClaim`区分reserved/submitted/uncertain，接受只表示已提交；超时或回执保存失败不重发、不生成成功资产。复用现有存储，不提供新HTTP执行入口；仅合成callback测试，不含真实执行授权、远端exactly-once或断电耐久保证。

[KONT-RUN-010](docs/tasks/KONT-RUN-010.md) 将默认拒绝的服务侧许可、持久占位、受保护的官方Agent和原子回流串为内部候选。通过publish前订阅的公开`session/event`收集本次owned Session完整序列，核对实际completed终态后才回流；并发／重开不再派发，失败／取消／目标CAS冲突不追加成功资产。关闭须先await executor.dispose再关闭store；提交后取消或清理错误保留已落盘成功事实。官方组件＋合成提供方实测，产物标synthetic-test；没有新HTTP/apply入口、在用桌面部署、完整上下文／真人身份／金额授权或持久DSH日志恢复。

若执行器发生任何清理异常，后续`dispose()`会持续拒绝，调用方不能自动关闭store，须先核对并释放仍存活的owned资源；业务写入结果与清理错误分别报告。

[KONT-RUN-011](docs/tasks/KONT-RUN-011.md) 补实际请求核准：完整LLM请求、Session事实与已持久claim绑定，默认拒绝；核准及审计落盘后在调用边界重核摘要，变化或取消均拒绝。单次真实`deepseek-flash`试跑已完成：官方账户与适配器、唯一生成POST、真实completed终态、单块带来源回流、正常重开读回。输入158／输出18 Token，按官方高峰价估算0.00046元（非结算账单），低于用户3元上限。该次授权已消费，不自动重复调用。仍为独立store验证，未部署在用Desktop；通用多用户身份／计费授权、持久DSH恢复与正式工作站体验未交付。

`/kont/api/workspace`供工作站经同一Store读写，不是第二资产权威。当前组件及候选范围见最新进度页；在用桌面执行入口、外部稳定双端／三轮、细粒度多用户权限和真实体验仍待验。

[KONT-RUN-012](docs/tasks/KONT-RUN-012.md) 新增同权限的只读`GET /kont/runs`与`GET /kont/runs/<runId>`，只返回运行身份、四阶段与历史产物位置，不包含供料正文／请求审计。`createRunStatusView`把同一投影转换为工作站中文状态；已提交不代表正在运行，待核对不允许重发，完成记录不保证目标块目前仍存在。此为服务与呈现模型接缝，尚未接入正式工作站或部署在用Desktop。

[KONT-RUN-013](docs/tasks/KONT-RUN-013.md) 在客户端当前工作旁接入只读运行状态面板，window/card/icon共用一个查询源。加载、失败、切换及卸载会隔离旧记录；产物定位从当前snapshot重新解析，只读显示标题／块正文，失效不重建或重跑。bundle内置view/source/panel模块与既有风格样式；以实际打包产物和语义树程序化验证，不使用截图或模拟点击。本轮为未部署的界面候选，无新模型请求，非人的体验验收。

[KONT-DESKTOP-014](docs/tasks/KONT-DESKTOP-014.md) 提供25文件目录候选、清单摘要及打包／验证工具。候选位于`evidence/local/20261024-desktop-package/candidate`，保持两个package同级；副本精确限定官方0.2.1-rc.2。官方manager离线隔离安装、版本拒绝、复制后服务／renderer验证已通过；不等于在用Desktop部署。实际安装与旧代码回滚准备见[部署方案](docs/research/desktop-candidate-install-20261024.md)，不能用已变化的repo路径冒充旧代码回滚副本。

[KONT-DESKTOP-015](docs/tasks/KONT-DESKTOP-015.md) 从真实已安装副本保存旧12项代码与2项原package，未从仓库重建或改写旧peer。回滚目录位于`evidence/local/20261024-desktop-rollback/candidate`；官方离线隔离重装、旧kernel与renderer工厂及独立7/7检查通过。仅证明代码可重装，不代表升级后数据可降级或生产回滚；正式安装前仍须绑定已审spec、核实时状态和数据兼容，见[回滚范围](docs/research/desktop-rollback-20261024.md)。

[KONT-DESKTOP-016](docs/tasks/KONT-DESKTOP-016.md) 新增绑定可信升级／回滚包与旧installed来源的只读管理计划，inspect前复核文件与持久选择，安装保持拒绝。冻结新旧store合成实测表明：虽然同为schema4，旧版成功写入会抹掉五种阶段的Run journal，资产／provenance保留也不代表安全降级。独立A13＋B4通过，仅接受预检与拒绝门；未部署或验证生产数据。下一步补保留运行记录的兼容恢复方案，详见[数据风险与预检](docs/research/desktop-preflight-20261024.md)。

[KONT-DESKTOP-017](docs/tasks/KONT-DESKTOP-017.md) 提供保留旧界面和入口、复用已审Run数据层的13文件派生恢复候选。五阶段运行记录／派发占位／回执与来源经恢复编辑及新版重开保留，非法快照替换和占位重授被拒绝；官方离线隔离安装、独立A3＋B4通过。它是新组合，不能冒称原样旧包或生产迁移已接受；旧入口会获得现代store的run.prepare／snapshot journal语义。016安装门保持，详见[恢复范围](docs/research/desktop-recovery-20261024.md)。

[KONT-DESKTOP-018](docs/tasks/KONT-DESKTOP-018.md) 将升级与派生恢复候选绑定到固定现场文件摘要。原文件只读，014→017→014兼容写入仅发生在私人临时副本，完整状态比较且不输出正文；当前样本2资产／0Run通过，原hash与原锁未改。独立9/9，仅接受配对预检；真实含Run恢复、安装／正常重启及生产部署未接受，安装opt-in仍拒绝。见[预检范围](docs/research/desktop-paired-preflight-20261024.md)。

[KONT-DESKTOP-019](docs/tasks/KONT-DESKTOP-019.md) 新增初始升级的一次性声明／持久占位／私有dispatch permit，以及固定quiescent官方manager transport。独立16/16、临时官方安装一次25文件一致；synthetic与生产隔离，异常／超时保留不确定且不自动重试。真实安装许可为0，尚未更新Desktop；超时不等于已派发操作取消，生产完整context/cache与active仍待真实验证。具体待批准目标见[安装方案](docs/research/desktop-install-gate-20261024.md)。
