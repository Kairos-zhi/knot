# KONT-RUN-004 · Run 身份、输入与产物契约最小纵切

日期：2026-10-22。授权来源：之“换窗口，继续开发”，经当前中控交接。旧收口 STOP 仅结束旧轮次，本卡继续开发；不重装、不 push／合并、不调用模型。

## 既查与取舍

- Git 基线：`3535c393bfabf1e5628e4750fa2c17acb610d116`，干净工作树。此前 9 单元的限定接受原封保留。
- 当前 `KontStore` 是 schema4 单一资产权威，拥有串行事务、原子落盘、revision/baseSeq、提交后事件与冷启 reset；`preview` 只编译 checked 减 excluded。复用，不另建资产库／事件总线。
- 原 checkout `knot-accepted-core-publish` 的 `knot-operation-service.ts:549`、`knot-worksite-request.ts`、`knot-model.ts`、`docs/architecture/runtime.md` 已读：显式现场输入、getBlocks 兼容、历史 provenance 不递归供给、receiver 不等于 transport/Run。复用语义，剥离 FlowGram 依赖；不复用 mock 生成器。
- 官方安装 ASAR 只读提取 `dsh-agent`、`dsh-agent-loop`、`dsh-session`、`dsh-api-session-controller` 等 0.2.1-rc.2 发布字节，来源及 SHA 在 `evidence/local/20261022-run-contract/research/manifest.json`。`prompt({requestId,sessionId,mode:'queue',content})` 返回 accepted；requestId 写入 user/message.source.rpcId；turn/start、turn/end 有独立 turn 与 seq；follow 提供 snapshot/event 与 cursor；cancel 仅申请且 keepInbox=true。不能把 accepted／idle／取消回执当终态。
- DSH `hasPromptRequest` 查 inbox 和当前 session 用户消息，不能外推跨进程 exactly-once。Knot 保存 runId、requestId、发送时输入；session/turn 只由对应日志证据建立关联，不能凭预估的下一个 turn 绑定。
- 后端竞对依据：已限定复核的 `docs/research/20261021-backend-seeker.md` O4/O5/O7 与 F4：持久对象与运行身份分离、准确输入、有限事件恢复、产物带来源。仅采用机制；不复制竞品实现，不引入 PTY／worker 引擎。所读竞品来源为冻结版本，未声称当前线上能力。
- 前端：沿用开发基准 Apple 组织／连续性；本卡不改 UI。远端治理母本和 8 份私有飞书原文本轮未重查，不宣称全域既查。

## 本卡边界与实施

单卡顺序：中控既查与拆卡 → 分离 Maker 实施、自测 → 独立 Checker → 中控 Gate／回执。

1. 复用现场编译，固定 runId/requestId、现场/目标/对话/agent 引用、输入内容与 SHA256、当时 revision/seq；准备态明确为 prepared，不能触发模型。
2. 薄 DSH 契约适配生成已查到的 prompt 形状；只读检查带 sessionId 的 DSH 日志证据，以 rpcId 和实际文本对应输入，再以 turn/start/end 与 assistant/message 对应产物。不新增运行引擎、Provider 或自动重试。
3. 输入清单和产物回流契约走同一存储／现有 knot.update 或其内部原子路径；保留稳定块 ID 与 provenance。失败／取消／未知／序列缺口／身份或输入不匹配不能写正式 generated 块。若实施需要超出此边界，先在本卡报告具体缺口。
4. 对外命令只能准备，运行证据回流由服务层内部接口持有，不给普通 HTTP 命令提供伪造 completed 入口。不接入桌面正在运行的插件，不改变已接受安装字节。

允许文件：`packages/dsh-plugin/src/` 的最小 Run 模块及必要 store/kernel 接缝；相关 tests；本卡、研究、STATE/QUEUE、README、独立证据与回执。冻结 vendor 不改。先不实现实际 prompt/cancel/follow 的网络调用。

## 验证与收口

必须覆盖：现场供给/排除/隔离、历史来源不递归、提交后来源变动不改旧输入、引用/哈希/重启读回；DSH wire 与事件顺序；错误/取消/错 session/request/turn/输入/重复回流、目标变化及存储失败不产生伪成功。测试事件必须显著标注 synthetic，不冒充实际 Run。

Maker 自测不是接受；独立 Checker 检查实际代码、负例与持久读回，并给限定结论。没有真实模型／运行时调用，本卡只可接受服务层契约切片，完整 Run、实际桌面部署、人的体验、强杀恢复仍未覆盖。最终按目标、回收、证据、验收、入档、记录、未决七格收口。

## 制作候选范围

Maker `run_maker` 完成4文件冻结，自测44/44（原38＋新增6组）；独立 `run_checker` 44/44回归和11项自有检查通过，结论 `ACCEPT_RUN_CONTRACT_LIMITED`。准备态记录 plannedSessionId，不声称真实绑定；固定的是本适配器提交的用户prompt，不是完整模型可见上下文。回流只支持新Session首个且唯一turn、单用户、完整seq0起日志、纯文本/tool-free；常见runtime-context额外输入、多turn、工具、未知事件均拒绝。实际DSH transport未连接，真实性由后续受信适配器负责，本卡只检查给定证据的内部关联，不是完整DSH事件schema验证器。

同一事务写资产块与Run回执，提交后依次发布knot.updated／run.returned。历史Run journal不随snapshot restore抹除；restore携带journal时必须与当前一致。新增run.prepare为Knot扩展，原具名协议覆盖保持5/16。

## 七格收口

- 目标：准备记录／固定输入／薄wire适配／原子回流离线契约纵切完成。
- 回收：分离run_maker、独立run_checker均已回执，无新增定时件或外部投递。
- 证据：`evidence/RUN-004-INDEX.json`，本地证据根 `evidence/local/20261022-run-contract/`；冻结候选4文件未改。
- 验收：中控按独立 `checker/final-review.json` Gate为ACCEPTED_LIMITED；不自验收，不扩大到真实Run／产品。
- 入档：本卡、既查研究、STATE／QUEUE／README与handoff指针；旧冻结清单保持原字节。
- 记录：仅本地提交留审查锚；未push／合并／安装／启停桌面；模型及实际执行调用0。
- 未决：受信DSH日志读取与完整上下文／模型／权限核验、实际会话绑定与执行、取消／恢复、多turn／工具／多模态、桌面部署、人的体验和生产journal生命周期。completed receipt是历史关联，不能推定人工改写后当前块仍原样存在。
