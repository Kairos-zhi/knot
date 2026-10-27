# RUN-009 独立复核

结论：`ACCEPT_DURABLE_DISPATCH_LIMITED`。独立构建通过，同范围聚焦 **19/19通过**，失败0、跳过0：新dispatch8项＋run-contract5项＋kernel6项。8份manifest条目（其中4份产品／测试）哈希一致，未跑全量。

直接审查确认claim通过KontStore原writer queue与原子rename落盘后才返回本次acquired:true，只有该调用者进入一次submit；重复返回既有claim且不授新资格。并发12调用、正常重开、防不同约束重绑、claim写失败零callback／零事件均在独立测试通过。旧prepared记录无强制迁移写入，snapshot restore不能抹除或替换claim。

状态reserved/submitted/uncertain与Run终态分开：精确accepted回执只记submitted，Run仍prepared、receipt仍null；异常／超时不释放、不重试，晚回执不结算。回执保存失败返回uncertain，落盘reserved占位保留，重开仍拒重。约束与回调payload使用克隆快照，调用者后续修改不改已占位值。普通command／HTTP/apply没有新增执行入口，内部callback不是授权来源。

限定：只接受同Run、同KontStore正常存储／重开边界的内部防重协调；不保证跨任意Run/Session或远端exactly-once。沿用rename且无fsync，不证明断电耐久。占位后未提交可能永久保留，本卡不提供自动恢复／释放；超时不等于远端取消，也不保证callback停止。requestSha256只是调用者提供的约束绑定值，完整上下文、真人身份、金额核准、guard与真实dispatch及终态资产回流尚未接通。executionAuthorized恒false，所有callback均synthetic，无实际模型／用户Session／部署。

证据：build.log、focused.tap、hash-check.json。Checker未改产品源码，无本卡范围阻断。
