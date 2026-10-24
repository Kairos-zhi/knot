# DESKTOP-019 A · Maker 自测

新增一次性初始升级执行门；复用018预检和原官方RPC模板，不修改014—018冻结源。准备计划无安装权限；trusted caller声明仅记录批准事实，不是独立真人身份认证。本轮所有批准均为synthetic-test，真实human grant为0。

稳定descriptor绑定014升级pin、017恢复pin、固定数据hash、exact enabled/saveExact/requestId。每次执行在018 source/profile/data fence通过后，以固定分区ledger wx写入、sync并close占位；再核一次fence才私有签发单次dispatchPermit。transport必须消费此permit才能取bound payload。审批摘要本身不能派发。synthetic与human ledger分区，测试不会占用未来human claim。

并发、重建计划及新Node进程重开均不能重发。错误、超时、回执保存失败保留reservation；晚到未消费permit失效。仅manager安装回执保存成功记submitted，不冒称active或产品验收。没有目录fsync，不声明断电exactly-once。超时不能撤销已发RPC，不自动重试/释放/恢复/重启。

自测：A聚焦5/5通过，使用隔离模块副本、mock018 fence及临时ledger，显式synthetic，不改真实源/profile/data。联合B聚焦7/7通过，其中官方临时manager实证归B报告，不将其算作生产部署。本轮无product/build变化，无需重建候选。

边界：内部trusted caller仍须在真实安装前获得明确授权；生产运输另核explicit kind及固定root。真实生产安装、Desktop启动/退出、模型调用均为0。交独立Checker，Maker不自验收、不提交。
