# DESKTOP-016 独立复核

结论：**ACCEPT_REVIEWED_PREFLIGHT_AND_UNSAFE_DOWNGRADE_DETECTION_LIMITED**。实现无剩余阻断；**deploymentReady=false**，生产数据兼容和旧版 Run 丢失风险尚未解决，实际部署未授权。Checker 未提交或 Gate。

两线最终 manifest **13/13** bytes/hash 匹配。固定 014/015 候选摘要与库存通过验证，旧 installed 源 **12/12** 与原捕获一致，profile 元数据未变；产品 src/lib 与原 client/debug 相对基线 79dd8d1 没有变化。没有 build 或重建旧候选。

独立 A 聚焦 **13/13**（原要求新3+legacy9，另包含1项只读 archive 回归），B r2 **4/4**，共分两次运行 17 项，无跳过，不是全量计数。A 覆盖真实 RPC envelope/same-origin/结果脱敏、准确候选地址、伪造/克隆/过期计划、候选 bytes/库存/selection 篡改及拒绝安装 evaluate=0。另实际执行只读 prepare，分别对 upgrade/rollback 显式 allowInstall:true，均 DATA_COMPATIBILITY_BLOCKED，evaluate=0，无 live 连接。

B 使用冻结 014/015 的真实 store，仅在新建 D:/Temp 合成状态文件操作。prepared/reserved/submitted/uncertain/completed 五阶段均从 Run 1 条变为旧内存 0 条；旧只读关闭后磁盘 hash 不变，但一次旧版成功编辑写回后，新版重开 journal 仍为 0。资产与 completed generated 块的 provenance 尚在，也不能认定 Run/claim/receipt 保留。旧无 journal 的窄资产往返通过，仅是该合成旧形状的证据。

pure preflight 对实际五阶段返回 UNSAFE_DOWNGRADE_RUN_JOURNAL_LOSS；即使合成 no-loss 结果也只返回 PRODUCTION_DATA_NOT_VERIFIED，allowed=false。管理工具不接受调用者布尔值冒充数据证明，当前只发 pre-upgrade 只读能力；inspect 前复核库存/摘要/原 installed 源和持久选择，list 仍是只读既有协议。当前没有 post-upgrade/post-rollback 阶段或实际安装能力。

本卡接受可复现预检及拒绝门，不接受生产迁移、升级可回滚性或数据降级。未读取实际用户资产、Session、凭据，不启动/更新/重启 Desktop，不写在用 profile/ASAR，不调用模型。后续仍须解决 Run journal 兼容/迁移、真实数据兼容证明、部署授权与安装后源栅栏转换；旧 schema4 数字相同不是降级安全依据。旧协议覆盖口径不变。

证据：final-review.json、a-focused.tap、b-focused.tap、hash-check.json、hash-check.log、readonly-prepare.json、verify-evidence.mjs。
