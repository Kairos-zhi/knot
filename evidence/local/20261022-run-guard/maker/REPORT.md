# KONT-RUN-008 Maker 候选

新增单一Agent setup保护模块；未接apply/公开执行入口，不创建运行器或资产owner。默认无批准即拒绝；批准精确绑定runId/requestId/sessionId/inputSha256/provider/model/maxTokens，且只接受prepared新Session首turn/step。tool-free assembly、准确user-rpc prompt、请求及最终stream route/token值均核验；只准一次llm.stream，Agent错误重试/后续turn及工具输出拒绝。

实际签名已核：setup在publish前；assemble与agent/request等待next；llm/stream同步返回AsyncIterable。LLM service事件不是Agent scopeTarget，因此该边界同时过滤sessionId和官方currentInitiator，兄弟Agent不受误伤。取消/卸载关闭保护并取消Agent；显式dispose等待whenIdle，拒绝钩子保留到Agent scope结束，避免先移钩子导致失守。

构建exit0，focused **5/5通过**、失败/跳过0；只跑guard官方worker与既有binding测试，不跑全量。官方0.2.1 Electron隔离worker使用真实Cordis、AgentRegistry、SessionStore、SessionProjectionRegistry、SystemPrompt、ToolRuntime、AgentLoop、LlmRuntime，AgentFactory setup装保护；仅provider adapter为内存synthetic，无网络/凭据/profile/持久化Session。合成provider总6次（成功/错误/工具输出/兄弟/取消/卸载各一次），真实模型0，不称真实Run。

实际反例：无批准/错四元组、错误input/tools/provider/model/maxTokens均0下游；绕过Agent请求直接调用LLM被阻断；一次stream后新turn不再触发provider；error不重试、tool-call输出在交给执行循环前阻断；兄弟隔离；外部取消和Agent卸载后，留存Agent引用不再触发provider，取消后的显式留存LLM引用同样拒绝。

范围：一次llm.stream不是端到端HTTP次数保证，本卡只阻断Agent层重试，Provider内部HTTP重试另验；maxTokens不是金额预算。RUN005完整请求指纹、真实用户/金额/执行授权尚未接到dispatch；executionAuthorized恒false。保护只覆盖受控Agent，宿主其他插件绕过或直接调用adapter不在本候选保证内。持久dispatch防重、终态回流、实际模型/桌面部署和人的体验另卡。未改历史冻结证据/vendor/在用安装，未提交/push/merge；待独立Checker，Maker不验收。
