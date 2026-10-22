# Knot 中控状态

更新：2026-10-22。中控：本窗口（继续迭代 KONT）。当前阶段：官方桌面0.2.1兼容与真实加载已独立限定接受；公开研究A与飞书B均已限定接受。

## 目标与授权

- 用户授权“移交中控，开工”；按既定“后端对齐竞对，前端对齐 Apple”与 Agent 原生基准实施。
- 首卡交付为既有内核向 DSH 的 Headless 兼容纵切，已独立限定接受。当前交付为官方桌面0.2.1兼容与插件真实加载；不扩写正式前端、不调用模型、不修改签名应用包或原 Headless 安装与资产。

## 真实起点

- 当前项目：`C:\Users\x2270\Documents\ChatGPT\KONT`；分支 `codex/kont-dsh-plugin-bootstrap`，尚无提交。
- 原未接受原型：17 个文件已列 SHA256 并复制留样，见 `evidence/local/20261021-kernel-adapter/initial-files.json` 与 `original/`。
- 源仓库：`Kairos-zhi/knot`；远端 main 已 fetch 并固定 `08a2a5340edab920ce942173ba63b2c5bc369eb4`；原工作树未改。
- 首卡测试 DSH 固定 `0.1.7-rc.2`，在 `D:\dsh-sandbox`；当前开发与交付宿主为 `D:\DSH-Desktop` 官方桌面 `0.2.1-rc.2`，详见下节。

## 执行与验收

- 任务、负责人、允许文件和结果统一见 [QUEUE.md](QUEUE.md)。中控写状态与队列；Maker 写限定代码；Checker 独立核验，不制作候选。
- 第一张卡：[KONT-KERNEL-001](docs/tasks/KONT-KERNEL-001.md)。修复和适配分别落证据，失败不隐去。
- `KONT-KERNEL-001-r2` 已由独立 Checker 限定接受：23 源文件＋4 构建产物 SHA256 一致；独立构建同哈希，20/20 测试通过、无跳过，另 8 组独立程序化实测通过。
- 真实隔离 DSH 已无页面完成创建结→连接→追加块→断开；多块／generated／provenance／fixed 往返、认证／来源负例、现场隔离／排除、SSE、失败保留原字节已核验。
- 正常进程内 SIGTERM 两次退出均 exit0、锁自然消失；同路径重启 seq 7→7，冷启动事件要求 snapshot reset。物理键盘 Ctrl+C、强杀／断电恢复未测。
- 最终证据：`evidence/local/20261021-kernel-adapter/checker/final-review.json`；冻结清单：`candidate-manifest.json`（同根）。

## 下一步与边界

- 2026-10-21 用户纠偏并授权：安装官方 DSH 桌面到 D 盘，Knot 也面向该桌面宿主开发。官网 `0.2.1-rc.2` 安装包与已安装 EXE 签名有效，应用已从 `D:\DSH-Desktop\app` 启动，Host 使用 `D:\DSH-Desktop\home\profiles\desktop`，Electron 使用 `D:\DSH-Desktop\user-data`。当前尚未加载 Knot 插件；旧 `0.1.7-rc.2` 测试不外推为新版桌面兼容。新任务 `KONT-DESKTOP-003` 收敛版本适配、桌面插件激活与入口；人的交付入口改为官方桌面，Headless／Web 仅为内核测试入口。安装证据：`evidence/local/20261021-desktop/`。
- 桌面入口独立回执：`evidence/local/20261021-desktop/checker/final-review.json`，结论 `ACCEPTED_LIMITED_ENTRY_AND_CONSTRAINTS`。官方 ASAR／运行时完整版本均为 `0.2.1-rc.2`；主窗口响应、三处快捷方式读回、D盘数据路径、启动器预检与C盘拒绝通过；原23源码＋4构建未变。原 `E:\桌面\DSH.lnk` 已实际调用桌面启动器，旧快捷方式已备份到 `D:\DSH-Desktop\shortcut-backup-20261021`。接受不含 Knot 新版兼容、桌面加载、真实 Run 与人的体验。

- 本卡已完成：分离派工→自测→实际 DSH 抓到异步关闭缺陷→返修→统一测试→独立复核→证据入档。
- 下一卡先明确 DSH Run／输入／产物契约与 Apple 工作站呈现之间的接缝；真实模型需要单独明确身份、模型、成本和边界。
- 接受仅限本卡的 Headless 兼容切片；完整命令集、真实 Run／模型、正式前端与产品体验、强杀恢复、生产部署未接受。代码仍未提交／推送／合并，原 3081 实例未替换。
- [KONT-RESEARCH-002](docs/tasks/KONT-RESEARCH-002.md)：本地 `kont_seeker` 已接手官方源码／测试研究；外部大荒谬经既有 A2A→AILY 已创建远端任务 `7699079302595283968`，补查飞书既有方案与决策。桥接映射及既有回收器注册已读回；远端执行完成、产物回收和 Checker 接受尚未发生。
- 本地中控启动不表示 Hermes／其他聊天已采用；本轮仅按用户授权向外部 Seeker 派发上述检索任务。

- 研究进展读回：A报告已落盘（38项固定版本来源），Checker已书面接手独立复核；B远端 get 确认 in_progress、hasActiveRun=true，claim已生成，尚无产物。

## 2026-10-22 继续迭代

- 主线卡：docs/tasks/KONT-DESKTOP-003-COMPAT.md；A Maker查兼容，B Maker查官方Host接入工具。候选独立检查后才用官方管理API实际安装，不手改desktop profile。
- 研究A：Checker ACCEPT_RESEARCH_LIMITED；38份本地证据一致，独立重取10份官方固定源码同哈希。只接受研究，三项工程建议仍未批准。
- 飞书B：远端任务done，既有回收器已写artifact及receipt（done_pending_check、acceptance=none），SHA256已读回；Checker已接手原文抽查。上节昨日执行中状态保留为历史。

- B独立回执已回收：checker/b-review.json 为 ACCEPT_RESEARCH_LIMITED，4份在线原文最新revision2、产物/评论双哈希一致。正文为9月28日，限历史设计补证，不能替代当前r2/0.2.1实现证据。研究卡已收口为限定接受，三项工程建议未自动采用。

- 桌面兼容候选已通过独立安装前Gate（A/B 13项哈希，独立34/34测试）。官方管理器一次安装成功：bundle enabled、application applied、exit0；实际Host fiber active，真实Electron client回执 active/mainRegistered/sidebarRegistered 均true。
- 中控真实桌面纵切完成：8个有序事件，创建／连接／追加／断开、供给与排除、鉴权／Origin／旧写负例，同源浏览器入口与Bearer／磁盘状态一致。保留两个明确标注的接入验证材料，未调用模型。
- 安装后官方app.quit正常退出，所有原进程退出、锁自然释放；同路径重开seq8、状态SHA256不变，冷启动事件明确reset。当前等待独立运行复核；临时调试端口将在复核后撤销并恢复普通启动。证据根 evidence/local/20261022-desktop-compat/，尚不宣布桌面最终接受。

## 本轮最终收口（2026-10-22）

- KONT-DESKTOP-003-r2：ACCEPT_DESKTOP_INTEGRATION_LIMITED。最终回执 evidence/local/20261022-desktop-compat/checker/final-review.json；统一清单34/34项独立复算一致，SHA256 2C9265562AABEBA8BAD388387C6CBABEF14ACC22DBAAE0063CE2E2AC0F595FFA。
- 独立完整回归34/34通过、无失败/跳过；桌面Host与客户端真实加载、同内核8步操作、正常退出/锁释放、seq8重开与冷启动reset均有证据。官方EXE/ASAR未改，原Headless测试安装及3081实例未替换。
- 最终为普通官方桌面启动：D盘home/user-data/kont-data；无临时调试端口或参数。保留两份有明确标记的接入验收材料。上文推进中/待验状态为历史过程。
- 研究A/B均限定接受，三项候选尚未自动进入工程；后续先拆DSH-backed Run身份/输入快照/产物回流契约，真实模型调用需明确身份、模型、成本与边界。正式Apple工作站与人的体验仍待后续任务。
- 本轮未调用模型、提交、推送、合并或生产发布；完整产品、强杀/断电恢复不在限定接受范围。
