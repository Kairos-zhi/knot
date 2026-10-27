# DSH-backed Run 接缝既查

2026-10-22，固定官方 Desktop 0.2.1-rc.2 发布字节，只读 ASAR；不启动／恢复 Agent，不调用模型，不访问 Provider 配置。方法沿用项目 `scripts/desktop-host-archive.mjs`，原档未写入。各成员路径与 SHA256 见本轮 `research/manifest.json`。

| 能力 | 发布源码实际行为 | 本卡采用／边界 |
|---|---|---|
| 提交 | `SessionPromptRequest` 为 requestId、sessionId、mode(queue/steer)、content、可选clientTimeZone；`commands.prompt` 最后调用 followup/steer，返回 accepted:true | 纯函数编译 queue 形状；不发送。accepted 不是 turn 成功 |
| 去重 | `hasPromptRequest` 查两个 inbox 和 snapshotEvents 中 user/message.source.rpcId | requestId与runId分离；不声称所有跨进程／任意命令 exactly-once |
| 关联 | user/message.data 为 UserMessage(id/content/source)，没有turn字段；rpcId在source中，turn由包围的turn/start建立 | 检查实际输入与rpcId，绑定已观测turn；不能预测 nextTurn |
| 终态 | agent-loop 持久写 turn/start {turn}、turn/end {turn,reason}；reason有completed/aborted/blocked/error/max-tokens/interrupted/forked | 只有对应completed且完整输入／输出证据才允许回流；idle不替代终态 |
| 产物 | assistant/message {turn,step,message,stream,...}，message为content与source.kind=model | 使用对应持久内容，delta/attempt不作为正式资产；不读其他会话最后一条文本 |
| 取消 | cancel({sessionId}) 要求已附着普通Agent，调用 agent.cancel(user,{keepInbox:true})，仅返回accepted | 不以断流或cancel ack判cancelled；队列尚可能有待执行项，本卡不实现发取消 |
| follow | 实际request只有address、maxMessages、turnWindow、assistantStream；先发snapshot(header/cursor/records/hasMore)，后发cursor+1起连续event | 源码注释说resume cursor，但wire无afterSeq；不能发明该参数。窗口有hasMore时补page后再判断完整性 |
| page | address、throughSeq、可选beforeSeq/maxMessages/turnWindow | 后续真实适配须固定同一throughSeq并补齐所需日志；本卡只验证完整证据片段，不实现网络翻页／恢复 |

源码定位：`dsh-api-session-controller/lib/index.js` prompt约925、去重1128、cancel1061、follow1512；`lib/typert.host.js` 内命名type declarations；`dsh-agent-loop/lib/index.js` turn约937–1034；`dsh-session/lib/index.js` snapshotEvents/eventAt/append。行号为本机发布提取字节，不能替代语义检查。

Knot 复用：当前 KontStore 资产／事件／原子事务；冻结getBlocks/nextBlockId；既有现场checked/excluded、稳定ID、provenance。参考旧 `compileWorksiteInput` 与 `prepareWorksiteRequest` 的显式输入语义，不搬mock和页面依赖。当前资产没有独立per-asset revision，以实际内容哈希与store revision/seq记录选定版本；不能将全局seq冒充对象版本。

竞对取舍沿用已独立复核的冻结研究 O4/O5/O7/F4，重读当前报告对应段落：持久对象与session分离、输入准确、有限事件和产物来源；未重新声称竞品最新线上能力，未复制竞品代码。前端沿用Apple基准，此卡没有UI改动。

实际执行身份／模型／成本／工具权限仍须在真实调用前明确授权；准备记录和合成日志测试都不是实际DSH Run。当前开发源码尚未安装到Desktop，不用既有桌面限定接受替本卡背书。

本卡实现只检查给定事件的关联投影，不替代DSH完整事件schema校验，也不证明日志真实性。新Session首turn、单user、纯文本/tool-free限制是本卡收窄策略，不是DSH一般能力限制；未执行真实DSH Session日志兼容测试。允许的system/developer/request-context元数据也不代表完整模型上下文已经过授权审计。
