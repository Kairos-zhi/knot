# KONT-RUN-011 Maker · offline preflight

基线53da61345f704e489b4f9b1bfbd2272d8f343dbf；Maker只做代码及隔离synthetic测试，真实模型调用0，未读取账户/profile/凭据，未提交。真实单次调用须由根在独立Checker预检后执行；此回执不代替真实Run、计费或用户验收。

新增run-request-gate，串入既有executor→guard。两层授权分离：原pre-claim许可仍绑定Run四元/constraints；实际request许可默认deny，绑定已经落盘的claimId及constraintsSha256，精确回签完整actual requestSha256/provider/model/maxTokens/reasoningEffort。旧constraints.requestSha256不作为实际许可。request快照包含除AbortSignal外所有实际options字段、messages、toolHistory/tools及owned Session.header/requestHeader()/requestContext()，严格JSON，含signal之外未知非JSON字段则拒绝。工具/工具历史禁用，text-only，reasoningEffort固定off，输入完整JSON字节默认<=8192（配置最大32768），output默认上限256（配置最大512）。

llm/stream仍同步返回AsyncIterable；在async generator内await authorizeRequest、以wx写入<claimId>.request.json的完整request/digest/授权收据后才调用next()。审计失败/冲突不进入下游。audit含generationStarted=not-attested，不把核准当生成成功。核准等待可被取消，迟到许可失效；核准后、审计后及guard紧邻next前重新比较完整实际request摘要，变化即拒绝，未冻结AbortSignal。取消在落审计后仍由active/verify阻止stream。

只读核官方安装ASAR源码：dsh-llm.prepareCall返回已解析config及受限stream入口，实际llm/stream位于streamWithRegistration；DeepSeek.prepareCall约2118调用connection/admit/modelInfo并返回generate闭包，生成POST /messages约2217在generate消费阶段。账户connection可能有元数据/账户网络，Maker没有运行该账户适配器。最终Provider HTTP序列化、URL/body、单POST及费用上限由根的一次性runner继续核验；此LLM抽象边界hash不冒称HTTP字节hash或整个Provider内部零重试证明。

构建exit0；focused21/21，详见build.log/focused.tap。包含5项新gate单位测试（明确SYNTHETIC边界stub），以独立预先计算的expected hash测试消息/header/context/route/tools变化、错误回签、默认拒绝、字节/token界限、审计碰撞原字节保留、取消/迟到核准、核准等待及审计后TOCTOU。实际官方0.2.1 AgentLoop/Session集成worker仍运行8次synthetic provider；默认无actual许可/取消actual许可/官方header在核准期间变更均0 adapter stream；成功provider入口核实审计已落盘且实际messages/toolHistory匹配。旧并发/重开/终态回流/取消/超时/CAS/关闭/sticky清理拒绝保持。

内部API：createRunExecutor新增authorizeRequest({request,requestSha256,inputBytes,limits,binding})、requestAuditDirectory、maxInputBytes、maxOutputTokens。回签为{approved:true,...binding,requestSha256,provider,model,maxTokens,reasoningEffort:'off'}；binding含runId/requestId/sessionId/inputSha256/claimId/constraintsSha256。execute结果含requestAudit摘要及审计路径；executionAuthorized仍false，不声称已核真人身份或金额。未接apply/HTTP/桌面部署，未改vendor/旧冻结证据。沿用rename无fsync，独立审计也不声称断电耐久。
