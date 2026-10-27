# DESKTOP-017 独立复核

结论：**ACCEPT_RUN_PRESERVING_DERIVED_RECOVERY_LIMITED**，实现无剩余阻断；仍 **deploymentReady=false**。Checker 未修改产品、build 原包、提交或 Gate。

两线冻结记录 **17/17** bytes/hash 匹配。固定候选 digest `774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d`。独立逐文件核 **13/13**：015 旧 UI/index/package/patch 等 11 项，014 store.mjs 与 run.mjs 两项；没有代码或 peer 转换。两包 kernel 与三个 lib 逐字节相同，现代数据层依赖闭包成立。原 014/015 摘要仍通过，016 管理脚本与已冻摘要相同。

独立 A **3/3**、B **4/4**，分两次运行，无跳过；没有全量或重建旧包。A 覆盖来源映射、路径/额外库存/覆盖/摘要与身份重标拒绝。B 在全新 &lt;temporary-root&gt; 使用固定实际候选持久层，五阶段 prepared/reserved/submitted/uncertain/completed 经恢复只读、普通成功写、不带 runs restore、014 重开后，完整 journal hash/deep equality 与资产/generated provenance 保持；只读磁盘不变。显式空 journal 与改 journal 的 restore 均拒绝且原磁盘字节保留。

reserved/submitted/uncertain 的原 claim 不再 acquired，变更 requestSha256 约束拒绝；completed 原 claim 不再授予。prepared 无 claim 在另一个合成副本合法首次 acquired=true，第二次 false。另有独立纯函数负例，completed 即使没有既有 claim 也拒绝新派发且不变内存；该函数与恢复包 run.mjs 字节相同。这里没有模型或真实执行。

指定 017 候选通过官方 manager 离线安装到新临时 profile，全部 13 项复制字节一致；版本 gate 无豁免，enabled:false、restart-required/no-hmr。复制后的旧 entry/现代 store 经官方 worker 的 auth、kernel、SSE、处置和持久读回；旧 renderer 实际 module factory/slots/style disposal 通过。这是隔离装配，不是在用 Desktop 安装或启动。

派生恢复不等于原样旧版：旧入口使用现代 store 后，已认证 snapshot 包含 journal，通用 command 可准备 Run；claim/settle/return 仍没有 HTTP 执行入口。旧 UI 没有新 Run 面板。原 015 回滚和 016 会丢 journal 的历史证据不能重写为安全。

本结论仅覆盖当前合成数据与候选构成。生产资产、Session、凭据未读，任意未来 schema/生产迁移与恢复安全未验。016 工具仍保持旧 pin 和安装拒绝；接入 017 需要另核可信 pin、真实管理状态、数据兼容、部署授权和正常重启。未模型、部署或人的体验/ReactDOM/视觉验收；旧协议覆盖口径不变。

证据：final-review.json、a-focused.tap、b-focused.tap、hash-check.json、hash-check.log、verify-evidence.mjs。
