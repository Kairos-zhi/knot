# KONT-RUN-010 · 官方执行组件集成纵切

授权：2026-10-23之“按照战线快步推进”；基线7a7aafd。主线从分立模块进入一条实际组件链：准备记录→默认拒绝的服务侧许可→持久占位→受保护Agent→真实组件终态→原子回流。仅隔离synthetic provider，真实模型／桌面部署权限未增加。

既查：已读开发基准、STATE与RUN-009源码，RUN-008官方worker展示AgentRegistry/SessionStore/SystemPrompt/AgentLoop/LlmRuntime真实链；RUN-004已有目标CAS与原子generated块回流，RUN-005审计仍为只读。复用竞品O4/O6、F1/F3的持久身份／运行身份／提交与终态分离，不造执行引擎或平行资产库。本卡无UI，Apple基准保持。

交付：内部薄协调候选，唯一store读Run；服务侧精确许可默认deny；持久claim后只创建自己拥有的新Session，setup安装现有guard；使用准确requestId与准备输入followup；终态日志只能从该owned官方Session获得，调用者不得提供日志。成功经既有returnRun一次追加带provenance的块。submitted和whenIdle均非成功证据；失败／取消／目标变化不得伪造成功。重复与正常重开不再提交，超时／关闭隔离晚回流，等待Agent资源释放。

允许新协调模块、官方隔离worker与针对测试，必要的原run/store/dispatch窄适配须说明真实差异；禁止过滤或伪造官方日志凑通过、扩为任意工具／多轮，禁止改vendor／历史证据／在用profile／ASAR或新增HTTP/apply执行入口。所有合成提供方产物标synthetic-test。服务许可不是已核真人／金额授权；完整上下文指纹若未串接明确登记，不宣称已可执行真实付费请求。

验证：build＋集成官方worker及受影响dispatch/run-contract/guard聚焦测试；成功仅一块与provenance，失败／取消／目标CAS拒绝，无许可不创建、不提交，并发／重开拒重，dispose屏障与保留引用。Maker→独立Checker→Gate→一次本地提交；不全量重跑。

证据根：evidence/local/20261023-run-integrated；archive_id：kont-run-integrated-20261023。完整产品、真实模型／终态与人的桌面体验未接受。

实现收敛：终态证据通过公开`session/event(session,event)`在publish前订阅，仅接受本次owned Session对象的连续序列，完成后核对Session.seq；不调用官方已弃用的snapshotEvents，也不声称已持久保存DSH Session日志。取消在store队列执行及rename前设检查；提交已完成后不能撤销。业务写入成功与后续资源清理错误分开返回，避免把已落盘产物误报失败。

r1独立测试16/16通过，但Checker提出P2阻断：cleanup失败只附业务回报、dispose仍resolve，不能作为安全关闭store的屏障。r2窄修需sticky记录cleanup失败，dispose在drain后明确拒绝；业务returned仍保留。失败屏障未解决前不Gate，r1证据保留。

七格收口：目标＝官方owned组件内部纵切；回收＝Maker r2与独立Checker完成；证据＝evidence/RUN-010-INDEX.json、U/checker/final-review.json与r1留样；验收＝ACCEPT_OWNED_RUNTIME_INTEGRATION_LIMITED，无剩余阻断，双方build＋focused16/16，11项冻结条目一致（5份产品／测试），未跑全量；入档＝本卡与STATE/QUEUE；记录＝一次本地提交，无模型／部署／push／合并；未决＝完整上下文／真人／金额授权、持久DSH日志恢复与在用桌面入口未交付。r2已通过真实owned handle释放前故障用例，dispose持续拒绝；调用方须保留store并核对释放资源，不能视为自动恢复。合成提供方8次，真实模型0；主成功路径11条完整owned事件，产物synthetic-test。
