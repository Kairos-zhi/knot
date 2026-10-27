# KONT-DESKTOP-023 · 已审 022 方案的唯一真实后续安装

日期：2026-10-25。用户在本窗口收到具体一次安装请求、正常退出要求及 022 单独许可说明后，明确回复“已退出，可以推进”。这次许可只用于已审 descriptor `1da1b0dc0adf0a3bac2840113dc9e149e731e9ceac633b26e38757e053ae5df4` 的一次后续安装与正常重启程序化验证；不含模型、重试、恢复安装、push 或 merge。

既查：已读取 AGENTS、开发基准、STATE、QUEUE、交接卡、021/022 final-review 与 022 proposal-review，并核官方桌面进程和数据锁均不存在。复用 018 完整预检、019 防重、021 recorded store 修复和 022 固定 parent→唯一 child 能力及官方 PluginManager；不改产品实现或 UI，不另研成熟机制。Apple 人的体验仍由之过手。

范围：根唯一执行，先完整 prepareReconciledDeploymentApproval，精确匹配已审 descriptor 和 proposal 文件 pin 后才签本次 grant。一次官方 offline/ignore-scripts 安装，父三记录和所有新占位永久保留。失败、超时或不确定均停止，不清锁、不强杀、不重发。安装后核 25 项字节、非 Knot 依赖/选择与原数据，再正常打开；临时 loopback 程序化 active/renderer 检查与最终无调试普通启动分别留证。无截图或模拟点击。

分工：根为唯一 controller 执行；独立 deployment_checker 只读检查执行脚本、预检资格及事后安装/运行证据，不执行 prepare/approve/execute 或启动。Checker 可写自身新证据；Maker 不自验收。

产物：`evidence/local/20261025-desktop-successor-installed`（controller/checker）、本卡及根状态队列、索引。安装脚本使用独占 invocation 文件且只调用一次 executeApprovedUpgrade；不改任何已冻结源或历史证据。

当前：ACCEPTED_LIMITED；独立final-review=ACCEPT_INSTALLED_AND_NORMAL_STARTUP_LIMITED。只接受一次安装、临时调试实际active与修复后普通Host启动；完整产品与正式Apple体验未接受。

执行读回：独立预检通过后，根完整fresh018精确生成已审descriptor并签当前human grant，唯一execute返回submitted／manager exit0／restart-required。独立25/25文件、非Knot依赖／选择／store映射及原data e035...c79ac保持。临时debug实际active与主区／侧栏注册、同源workspace／snapshot／runs读回均独立通过；Run0，新增模型0。验证器r1未记录失败stage、原因未证；r2误将snapshot与完整disk比较，按原store.snapshot去revision／seq／titles的既有契约修正，r3独立通过，r1/r2失败证据保留，无产品源码改动。

第一次普通启动失败记录：固定官方app.quit正常退出后已核无进程／锁／临时监听，再普通无debug启动。初期窗口Responding与锁存在不能证明软件可用；用户截图与官方crash-2026-10-25T05-13-52-770Z-host.log表明authenticateWebHost的fetch底层bad port。该阶段Host退出且无listener，原data hash保持，故当时拒绝Gate为部署可用；后续修复与最终结论见下。

原因与修复方案记录：只读官方ASAR源表明Desktop Host固定--host 127.0.0.1 --port 0；本机原IPv4/IPv6 TCP动态范围均1024–15000，包含Node fetch禁止端口，程序化复现6665/6666/6667/6697为bad port。实际失败端口未捕获，机制吻合不冒充已抓取该端口。原计划仅临时恢复全机IPv4 TCP默认49152–65535（start49152 num16384 store=active，仅至下次Windows启动，不写持久设置）；start1024 num13977手动回退未验证。初始方案见controller/startup-diagnosis-and-proposed-fix.json，后续执行见下；020父三记录和023全部父子占位永久保留。

临时系统修复：之在精确范围请求后明确“我确认”。首个管理员辅助进程被WindowsPowerShell5.1的UTF8无BOM中文字符串解析拦截，脚本未执行、无invocation/result且原range保持；只将授权记录字符串改ASCII，经实际5.1独立解析0错误后，再启动正确脚本。唯一netsh IPv4 TCP store=active命令exit0；实际v4TCP49152+16384，v6TCP也观察为同范围，使UNRELATED_RANGE_CHANGED断言失败。结果未篡改，差异已向之披露，v4UDP不变；只知道单条命令后观察到同步变化，不证明底层actor。没有额外setter、未测试的1024回退、持久设置、Windows重启或安装重试。

最终技术验证：普通软件main78636／Host74780在127.0.0.1:50967运行，5官方进程、无debug标记或临时调试监听，未认证/kont/runs=401，锁存在且无新增host crash，独立读回通过。安装到普通启动首次读回前原data e035保持；之后现场revision/seq到20，之直接答复“是，刚操作过”，只将其作为近期人类操作归因，不证明逐条写入。当前数据不得再描述为原hash。普通无debug renderer未直接复查；注册证据来自先前临时debug，人的正式Apple体验与完整Run仍未验。

七格收口：目标＝已审固定parent的一次真实升级与正常软件启动；回收＝根唯一执行、独立deployment_checker全部回执；证据＝AH与DESKTOP-023-INDEX；验收＝ACCEPT_INSTALLED_AND_NORMAL_STARTUP_LIMITED；入档＝kont-desktop-successor-installed-20261025；记录＝STATE/QUEUE/本卡/最终回执，本地未提交或推送合并；未决＝临时端口设置下次Windows启动失效、持久网络修复尚未授权、v6TCP实际差异与精确actor限制、正式Apple体验与新真实Run仍待后续任务。新增模型0，旧RUN-011单次许可不续用。
