# Desktop 候选装配与部署边界

本卡准备可审查候选和隔离装配，不改在用 Desktop、profile、签名 ASAR 或凭据，不运行模型。既查为开发基准、DESKTOP-003-COMPAT 已接受范围、旧官方 manager 接口证据、现 `packages/desktop-bundle`。官方安装固定 0.2.1-rc.2。

官方 `PluginManager.inspect` 的 path 分支要求绝对本地路径、可读 package.json、dsh.bundle；相对安装 spec 被拒绝。`installBundle` 调用官方 profile pnpm，验证 bundle patch 和实际版本兼容；无 HMR 时返回 restart-required/no-hmr，不代表已在 Desktop 活跃。官方源位置：安装 ASAR 的 `@deepseek-ai/dsh-plugin-manager/lib/index.js`，既有留样位于 `evidence/local/20261022-desktop-compat/runtime-maker/source/`。未修改或替代 manager 实现，也未写版本豁免。

候选保留 `packages/desktop-bundle` 与 `packages/dsh-plugin` 兄弟目录，bundle 的 `file:../dsh-plugin` 按该落点解析；不是可任意拆开的两个独立 tgz。部署 spec 应为 `file:<候选绝对路径>/packages/desktop-bundle`，整个候选树应保持可用且部署前校验 Maker A manifest。只有单个bundle目录或复制某个tgz，不能代替验证过的布局。

本轮脚本在 `D:/Temp/kont-candidate-manager-*` 新建独立 profile，通过官方 manager inspect/installBundle(enabled:false) 和官方 pnpm 强制 offline/ignore-scripts/关闭自动peer安装/独立store。npm配置为空，未读取在用 profile。兼容闸门照常执行；相同布局的故意错误版本被拒绝。随后从临时 profile 解析 pnpm 复制的候选包，核对字节，再以官方 Cordis/WebServer 实际 apply、认证、共用内核操作、SSE、处置与持久读回；renderer 候选 bundle另做模块工厂/slots注册与清理程序化验证。两条验证分开报告：manager安装成功且需重启，隔离runtime实际apply；没有声称manager热加载、真实Desktop部署或人的体验已接受。临时profile最后回收，安装与运行只使用公开合成材料。

后续真实部署的具体方案：先只读捕获在用 manager 的旧bundle spec、选择状态与版本，并将旧已安装bundle/plugin代码字节及其完整依赖相对布局保存为可重装rollback副本，生成hash并隔离验证；旧spec若指原repo目录，repo已变化，不能充当旧代码回滚包。本卡没有读取或打包用户profile数据，也没有制作或验证该旧代码rollback包。实际部署获授权后，经同一官方manager inspect→installBundle安装本卡已审候选，遵守版本gate；若报告需重启，先保存工作并正常重启，再核active、只读Run状态与持久数据。失败时停止重试，保留诊断，由官方manager回装已验证的rollback副本并恢复原选择状态、正常重启核对；不手改profile，不把用户数据恢复或删除自动纳入代码回滚。

验证入口：官方Electron RunAsNode执行 `scripts/verify-desktop-candidate.cjs <candidate-root> <reviewed-manifest-sha256>`；先核可信manifest摘要及全部25文件，安装后全部25项再逐字节对比候选。聚焦测试 `tests/desktop-candidate-isolation.test.mjs`，可由KONT_DESKTOP_CANDIDATE指定A冻结输出。该测试依赖仓库既有官方runtime worker，不是独立部署器；默认临时制作候选仅供日常回归，最终证据必须指定本卡候选。未覆盖网络安装、在用Desktop启停、用户Session、人的UI体验、强杀断电或实际rollback。
