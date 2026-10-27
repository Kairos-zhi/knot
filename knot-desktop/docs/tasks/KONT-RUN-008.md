# KONT-RUN-008 · 单次执行作用域保护

授权：之“齐步走”；基线30e28af。目标是下一步真实执行所需的最小保护模块，保持未接通模型／桌面执行入口。

既查：复用RUN-004准备记录、RUN-005请求审计与既有DSH执行权威。已核官方0.2.1-rc.2的AgentFactory、Headless runner、system-prompt和LLM waterfall源码：Agent setup在发布前，支持作用域钩子；SessionController.selectModel会保存全局默认，不采用。沿用竞品研究的单一运行owner与请求关联机制；本卡无UI，Apple设计基准保持。官方运行库只读，不读取个人Session或凭据。

最小交付：可安装在Agent setup中的作用域保护；默认拒绝，批准必须绑定准备记录及明确provider/model/maxTokens。限制无工具、单次模型stream、无额外step／重试；取消与卸载后失效。精确可用签名以实际官方库隔离验证为准；如无法完整约束则收敛并登记缺口，不把token上限称为金额预算。

允许：新增保护模块、必要测试／官方隔离worker及短说明。禁止接宿主公开执行入口、真实模型调用、修改在用profile/ASAR、旧冻结manifest/vendor、push或合并。synthetic provider只用于程序化反例，不称真实模型Run。Maker制作自核验→独立Checker→Gate；只跑build与受影响聚焦测试。

证据根：evidence/local/20261022-run-guard；archive_id：kont-run-guard-20261022。中控维护STATE/QUEUE和本卡，Maker冻结源码与测试，Checker独立复核；限定接受后一次本地提交。真实执行授权、持久dispatch防重与终态回流另卡。

七格收口：目标＝受控Agent单次stream保护候选；回收＝Maker与独立Checker均完成；证据＝evidence/RUN-008-INDEX.json与S/checker/final-review.json；验收＝ACCEPT_EXECUTION_GUARD_LIMITED，无阻断，双方build＋focused5/5，3冻结文件一致，未跑全量；入档＝本卡与STATE/QUEUE；记录＝一次本地提交，无模型／部署／push／合并；未决＝未接apply/dispatch，完整上下文核准／身份／金额预算／持久防重／终态回流仍缺，一次stream不保证Provider内部HTTP零重试，人的体验未验收。
