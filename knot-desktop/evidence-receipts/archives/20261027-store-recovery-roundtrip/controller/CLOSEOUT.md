# 044 七格收口

2026-10-27；archive_id=kont-store-recovery-roundtrip-20261027；检索键：KONT、COMPAT-044、派生恢复承载、A-B-A、writer往返。

- 目标：以旧受审承载加当前唯一Store补实际软件恢复组合，验证真实HTTP写入/关闭/回转/重开；不以相同Store双副本代替恢复入口。
- 监听回收：Maker与原Checker均完成并冻结停写；不新增定时或对外消息。根未代独立验收，045只读既查准备已完成，现接续精确刷新。
- 证据：独立build0、36/36（新7/相关26/自有3），Maker14冻结、103路径保护；A13/B14全部27来源/闭包匹配，265旧证据条目保持。真实B apply注册4路由，经human/Agent HTTP实际写。全状态、Run原摘要与锁/CAS/失败原子通过。
- 验收：根Gate=ACCEPT_SYNTHETIC_DERIVED_RECOVERY_ROUNDTRIP_LIMITED，无阻断，维护性通过。A1/B/A2/A3计数8/14→10/18→11/19→11/19，A3磁盘hash等于A2；仅接受具体synthetic data/backend回转。
- 入档：evidence/COMPAT-044-INDEX.json、controller/receipt.json；组合pin43546de507584eca98b0a47ea19a7879ca331c4b52f012d8279f88d9f8ae7939；checker/final-review.json SHA256=12fb0c10dbff7847993fe8e9cbac0e3a54109d82754c9a7203f1de3a530e4be6。
- 记录：原105路径全保留，现112；仅新增3scripts、1test、task/API及根索引。HEAD45ccd24b9c83e2ed9634028fb43e838c58d76244/index/remote保持，旧产品/26库存/旧tests/017018043与旧证据未改。
- 未决：恢复指软件承载继续读写当前状态，不是数据快照回退。旧UI、B缺runs/preview/observer与原017不兼容事实保留；无跨进程灾难恢复、真实数据迁移、官方manager/生产安装/人的体验接受。无模型/生产/profile/Session/凭据、正式root候选/系统或Git mutation。045重列范围及具体执行申请后再走正式候选与真实Desktop/G3。
