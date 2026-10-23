# KONT-RUN-009 Maker

基线：81ce2c41aad5d5bf33b3554335142cc919348022。未提交；待独立 Checker 与 Gate。

复用 KontStore 唯一串行写队列、既有文件临时写入/rename 和 Run snapshot 保全。Run 增加可选 dispatchClaim，旧 prepared 字节重开不变。claim 固定 Run/request/session/input、provider/model/maxTokens、调用者提供的 requestSha256 及约束摘要。请求摘要是绑定值，不是核准来源证明；完整上下文、真人身份与金额核准尚未接入。

内部 dispatchOnce 只有本次成功持久占位的 acquired 调用者可调用一次 submit。重复调用只返回已有 claim，不凭 claimId 重授资格；不同约束拒绝。没有新增普通命令、HTTP/apply 执行入口、并行 store 或执行引擎。未改 guard。

状态独立于 Run 终态：reserved → submitted 或 uncertain。仅精确 {accepted:true} 回执记 submitted；Run 仍 prepared、终态 receipt 仍 null。异常/超时记 uncertain；保存回执失败返回 uncertain 并保留已落盘 reserved。绝不释放/重试。超时不证明下游取消；迟到结果不再改写占位。崩溃于占位后且提交前也可能永久未提交，本卡优先防重，不提供自动恢复。

Snapshot 省略 runs 仍保留当前 journal；显式旧 journal、改动 claim/约束等不可替换当前 journal。事件仅在提交文件成功后发布，claim 写失败零 callback、零事件、原字节保留。

验证：build exit 0；新 dispatch 8 项 + 原 run-contract 5 项 + kernel/snapshot 6 项，共 19/19，详见 build.log、focused.tap。覆盖并发12调用唯一提交、正常close/reopen拒重、claim写失败、callback异常/超时、回执保存失败、restore保全、历史prepared、约束冻结及普通命令拒绝。全部为明确标记 SYNTHETIC 的本地 callback，不涉及 Agent/Provider/model/实际用户 Session/profile。

边界：沿用 rename、无 fsync，不声称断电耐久、远端 exactly-once 或 Provider 内部零重试。callback 不是执行授权，executionAuthorized 恒 false；无真实执行/真实模型/部署/安装/凭据读取。竞品依据复用既有 backend-seeker O4/O6、F1/F3 的持久身份与预写/回执分离，不另造机制。
