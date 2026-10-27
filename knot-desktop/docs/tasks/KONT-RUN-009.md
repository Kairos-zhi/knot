# KONT-RUN-009 · 持久提交防重与提交状态

授权：2026-10-23之“齐步走”；基线81ce2c4，工作树干净。本卡接续RUN-008，只做内部提交协调，不调用模型或部署在用桌面。

既查：已读开发基准、当前STATE、run/store与RUN-004/008。竞品研究既有O4/O6、F1/F3指出稳定对象、运行身份、预写记录与提交回执分离；在途Promise、HTTP成功不证明持久exactly-once。复用KontStore唯一写队列、原子rename及Run日志保全，补持久占位与诚实提交状态；不引入第二存储／执行引擎。本卡无UI，Apple基准保持。

目标：submit前持久保存一次性claim；同Run并发与正常重开后重复均不能再次submit。claim绑定Run/request/session/input与固定请求约束；兼容旧prepared记录，不允许restore擦除或替换。submit接受只表示submitted，不表示running/completed；异常／回执保存失败保留不确定性，不自动重试或释放占位。

允许run/store最小扩展、新内部协调模块及针对测试；中控维护卡、STATE/QUEUE/README。禁止新增HTTP/apply执行入口、改vendor/旧冻结证据、真实模型／用户Session／profile／ASAR写入、push／合并。callback本身不是执行授权；完整请求上下文、真人身份与金额核准另接。现有rename无fsync，不宣称断电耐久、远端exactly-once或Provider内部零重试。

Maker自测→独立Checker→Gate→一次本地提交。聚焦build、新dispatch、旧run-contract及必要snapshot测试；不重复全量。必验并发唯一提交、close/reopen防重、写claim失败不submit、submit异常不重试、回执保存失败不重发、restore保留claim与旧记录兼容。

证据根：evidence/local/20261023-run-dispatch；archive_id：kont-run-dispatch-20261023。七格收口在独立复核后登记；真实执行与终态资产回流尚未交付。

七格收口：目标＝内部同Run持久提交防重；回收＝Maker与独立Checker完成；证据＝evidence/RUN-009-INDEX.json及T/checker/final-review.json；验收＝ACCEPT_DURABLE_DISPATCH_LIMITED，无阻断，双方build＋focused19/19，8项manifest哈希一致（4份产品／测试），未跑全量；入档＝本卡与STATE/QUEUE；记录＝一次本地提交，无模型／部署／push／合并；未决＝完整上下文／真人身份／金额授权、guard与实际提交及终态回流尚未集成，同Run防重不等于远端exactly-once，rename无fsync不证明断电耐久，占位后未提交不自动恢复或释放。
