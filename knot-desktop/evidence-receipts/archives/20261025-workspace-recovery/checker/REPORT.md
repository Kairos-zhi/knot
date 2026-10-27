# WORKSTATION-028 独立复核

结论：`ACCEPT_WORKSPACE_RECOVERY_LIMITED`。无阻断，仅接受当前客户端的固定错误、显式刷新屏障与本页草稿连续性；不接受跨重启恢复或完整未知命令核销。

Maker manifest `ae5ed3cf...baa8cb6f4` 独立复算一致，8/8登记匹配：2项源码/新测试、1项生成bundle、5项报告日志。官方bundled Node独立build退出0，生成物仍匹配冻结。聚焦34/34：028新8、相关旧23、Checker自有3；0 fail/skip。026十项异步、027五项阅读组件与既有草稿/run-panel/bundle/store五项相关测试均保持通过，未跑无关全量。

维护性通过：一个普通具名workspaceFailureMessage映射有限读/写状态，api负责传输和必要code读取，refresh只读，mutate负责写且以既有error早返回作屏障。无新异常类、通用框架、状态机、平行store、依赖或产品文件。409只读固定code，其他错误body不读，后台message和fetch异常原文不显示；401/403按状态分类。未知写入诚实提示待核对，不保证未落盘或可安全重试。

独立实际执行所有专项：错误时保存/切现场/供给/创建等界面与旧保留callback均零额外POST，草稿仍可编辑；刷新失败不解锁，GET成功只解除屏障不重放；显式再保存用最新revision和当前draft。保存中新增编辑按值留存，known data/seq与本页draft失败时保持，预览/运行产物隐藏。busy中性状态避免清error后闪回保存成功。

Checker自有补充无dirty的presentation未知写入再延迟刷新，状态保持“正在核对”且旧callback不能绕过；HTTP500伪装STALE_REVISION正文也不被读取或误判冲突；孤立draft离页仍警告，原现场重新出现后仍能按原id取回文字，没有迁移到其他现场或自动POST。

根文档docs/api/workspace-recovery.md与实现相符。旧014真实候选按原pin验证25项，current26 inventory保持，未生成正式根候选。

刷新不是未知命令是否执行的回执，也不提供完整幂等；用户仍需检查新快照后决定是否重复创建。草稿保护只在当前provider内存，未提供跨应用重启或孤立草稿恢复界面。程序化built factory/hook语义不等于ReactDOM、视觉或人的Apple体验。未重复SSR尝试或安装依赖。未触生产/profile/ledger、桌面启停安装、系统、用户凭据/Session、模型、root提交/push/merge、完整Run或完整产品。
