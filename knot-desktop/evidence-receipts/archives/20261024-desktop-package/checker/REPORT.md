# DESKTOP-014 独立复核

结论：**ACCEPT_DESKTOP_CANDIDATE_PACKAGE_LIMITED**，无阻断。基线 3ccb26ffb6b1f80e313f0d657924460a6f38f446。Checker 只写复核证据，没有修改产品或在用 Desktop。

两线 manifest **16/16** bytes/hash 匹配；候选 **25/25** 内容、sourceSha256 与现源一致，两个 package.json 仅候选 peer 收紧到精确 0.2.1-rc.2。独立 build exit 0，候选 lib/client.js 与新构建逐字节一致。候选 manifest SHA256：`a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8`。

独立聚焦 **6/6**，无跳过：packager3、原 bundle1、官方隔离2。明确设置 KONT_DESKTOP_CANDIDATE 为本卡冻结 candidate，未用 repo 默认 fixture。验证两次新目录重现相同清单；已有输出保留原字节、错误基线/路径重叠/redirected parent 拒绝；篡改内容、额外文件/目录、错误摘要拒绝。

允许清单包含当前 server、query、Run 模块、panel/source/view、CSS 与已构建 core/client；没有 evidence、测试、node_modules、凭据或用户资产。bundle 与 plugin 保持同级，file:../dsh-plugin 实际落到候选 plugin 目录；不是可拆开的独立 tgz。

官方 Electron 读取安装内官方 0.2.1-rc.2 库，实际 PluginManager.inspect/installBundle 在新建临时 profile 运行；pnpm offline、ignore-scripts、独立 store、空 npm 配置、禁自动 peer 安装。安装后的全部 25 文件逐字节匹配候选，故意 peer 9.9.9 被官方版本 gate 拒绝，无豁免。结果 enabled:false、restart-required/no-hmr，不能叫热加载或在用安装。

复制后的 plugin 另经官方 Cordis/WebServer 实际 apply、cookie auth、恶意 Origin、共用内核、SSE、处置及持久读回；复制后的 renderer 实际 factory/slots 与 stylesheet dispose 通过。这是隔离 runtime 与程序化 renderer 装配，不是运行 Desktop 的完整启动，也不是 ReactDOM、视觉或人的体验验收。

部署/回滚说明准确登记后续须先捕获旧已安装代码和完整依赖布局、核 hash 并验证可重装副本；现 repo 的旧 file spec 不能当旧代码回滚。本卡没有制作可用旧代码 rollback 包。无在用 profile 修改、签名 ASAR 写入、真实用户 Session/凭据读取、模型请求或全量测试。可交根 Gate；实际部署与人的体验仍另行受理，旧协议覆盖口径不变。

证据：final-review.json、build.log、focused.tap、hash-check.json、hash-check.log、verify-evidence.mjs。
