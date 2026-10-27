# DESKTOP-015 独立复核

结论：**ACCEPT_INSTALLED_CODE_ROLLBACK_CANDIDATE_LIMITED**，无阻断。准备基线 338ef08b57b2f29859df77cbf0e85f1f115f39bb。Checker 未修改产品、build 旧候选、提交或 Gate。

两线冻结记录 **15/15** bytes/hash 匹配。候选 manifest SHA256：`d5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336`。独立通过 installed resolver 定位旧 bundle/plugin，直接读取旧代码与候选核对：**12/12** 逐字节一致，另 **2/2** 原 package 一致；实际转换 0，原 peer 保持。测试前后均读回源与 profile 元数据，hash 未变。没有从当前 repo 或旧 file spec 重建旧代码。

显式 KONT_DESKTOP_ROLLBACK 指向本卡 candidate，独立聚焦 **7/7**、无跳过：捕获器 4 项及官方隔离 3 项。覆盖旧字节保留、仅依赖标签重定位的合成分支、额外库存/依赖/peer/路径/重定向拒绝、输出保留及篡改拒绝。真实指定旧包通过官方 manager offline/ignore-scripts/独立 store 安装，全部旧 12 项复制字节匹配；错误 pin 与未清单 .npmrc 在安装前拒绝，无兼容豁免。

复制后的旧代码执行官方 0.2.1 Cordis/WebServer worker：cookie auth、恶意 Origin、共用 kernel、SSE、处置及原 schema4 的合成持久读回通过；旧 renderer 实际 module factory/slots/style dispose 通过。enabled:false、restart-required/no-hmr 只证明新临时 profile 安装和另行隔离 apply，不证明 live Desktop 加载或热装。

根官方 readProfileManifest 投影，与独立只读 package 元数据及 hash 一致：旧 source 指当前 repo、bundle 已选择、版本 0.1.0。profile SHA256 为 `074125faf53fc9832aa075e35617adfa773806a6321dc0267b9e969d0e9d5283`。这些足以支撑本卡持久配置和 installed 代码留样。独立 Context 的 listBundles 缺真实 loader 而 operation-error；本轮没有把它写成 live manager/listPlugins/active inventory 成功，也没有为此启动桌面或调试端口。

限定边界：旧代码可重装不等于升级后用户数据可降级。未读取真实用户资产、Session、凭据或 Provider；没有验证新 schema/Run journal/Session 与旧代码的数据兼容，更没有执行生产回滚。正式更新/回滚前仍须重新核 installed 字节/选择状态、读取真实 manager 状态并单独确认数据兼容和正常重启安排。renderer 工厂不是 ReactDOM/视觉或人的体验验收。无在用 profile/ASAR 写入、Desktop launch/restart/部署、模型请求或全量测试；旧协议覆盖口径不变。

证据：final-review.json、focused.tap、hash-check.json、hash-check.log、verify-evidence.mjs。
