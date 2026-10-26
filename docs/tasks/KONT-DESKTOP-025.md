# KONT-DESKTOP-025 · 新旧目录候选清单兼容

日期2026-10-25。之回复“开始”，承接024后的打包适配；保持人类可维护标准。范围为本地工具、隔离测试与只读历史候选核验，不部署在用软件、不改系统或用户数据、不调用模型、不提交/push/merge。

既查：AGENTS/开发基准、STATE/QUEUE、024独立回执；现prepare-desktop-candidate的25项清单、manifest v1和受追踪/干净HEAD门，官方隔离verify脚本与两组candidate测试。复用既有本地双目录包、官方PluginManager与原完整inventory/hash/目录拒绝规则，不引入新后端机制或框架。前端无变更，仍遵守同对象/同内核。旧固定竞品研究只支撑同一权威/明确归属，不在本卡重新调研或采纳竞品代码。

目标：保留v1精确25项只读验证；新增v2精确26项（含024 worksite-preview.mjs），新prepare默认生成v2。格式选择须显式可读；不能让v1接受26/v2接受25、任意路径或未知format。新旧格式都继续拒绝缺失/额外/篡改/重定向文件。

实现约束：旧25数组冻结为legacy inventory，新26由其加一个明确业务文件；用简单具名版本判断选择verify清单，不增加注册表/DSL/可变全局策略。保留原导出兼容或清楚声明导出当前清单；查全部调用者。官方隔离验证器应复用同一清单核验，避免另维护松散路径正则/文件计数判定；保持精确pin、离线/禁脚本、临时profile与版本拒绝，不靠修改旧候选通过。

允许文件：scripts/prepare-desktop-candidate.mjs、scripts/verify-desktop-candidate.cjs、tests/desktop-candidate.test.mjs、tests/desktop-candidate-isolation.test.mjs，以及经根审定的tests/helpers/desktop-candidate-fixture.mjs（共用隔离git fixture/清理，不写真实仓库或全局git配置）；其他必要测试helper先告知根。文档由根写。024产品源码、所有旧候选/manifest/pin、生产ledger均不改。

验证：新26产物可重复、精确清单且024模块可加载；新旧format混淆/未知/伪造自签清单/缺件/多件/内容变动/重定向拒绝；旧真实014候选原pin只读通过且前后hash保持。原HEAD与受追踪干净输入门不放宽。因当前根工作树未提交，制备测试在自建隔离git fixture中复制实际产品输入并固定本地fixture commit，不称其为根checkout正式候选；root dirty prepare必须继续拒绝。隔离git提交只用于测试，不提交真实仓库。所有递归清理先核resolved绝对路径限于自建temp根。

聚焦build、candidate工具与官方离线隔离安装/复制后加载（新模块路径必须实际可解析），并回归受影响旧候选/恢复验证；不重跑无关全量。没有真实发布候选、在用Desktop或人的UI验收。Maker与Checker分别记录真实命令/退出码/范围，制作者不自验收。

分工：workstation_maker制作；独立Checker只读审源码/冻结并自有程序化验证；根写状态/卡/索引/Gate。证据evidence/local/20261025-desktop-inventory，archive_id=kont-desktop-inventory-20261025。当前ACCEPTED_LIMITED。

独立结果：ACCEPT_VERSIONED_DESKTOP_INVENTORY_LIMITED，无阻断；11冻结项（5产品测试helper＋6日志报告）一致，独立build退出0，18相关＋3自有＝21/21，无失败/跳过，未全量。旧014真实原pin及全25文件hash前后保持；新26在官方离线/禁脚本临时profile实际安装、复制、index解析和renderer工厂通过，不兼容版本仍由官方manager拒绝。v1合成fixture只验证格式/清单选择，不称其为可运行旧包；实际旧014的外部pin才提供历史身份与兼容依据。

人类维护性通过：两具名冻结清单和简单版本分支，官方隔离验证复用同一mjs核验，没有新增版本框架/DSL/依赖/平行政策。真实root脏输入仍拒绝；测试helper只有明确产品输入与隔离本地git提交，未修改全局配置或真实仓库提交。初轮文件symlink权限EPERM留样，改目录junction后重测通过，未改系统权限或跳过验证。

七格收口：目标＝旧25兼容与新26打包工具；回收＝Maker冻结与独立Checker完稿；证据＝AJ与DESKTOP-025-INDEX；验收＝上述工具/隔离限定接受；入档＝kont-desktop-inventory-20261025；记录＝本卡/STATE/QUEUE/两API文档与最终回执，本地未提交/push/merge；未决＝真实checkout需获授权提交固定后才能制备正式候选，候选复核及生产安装另走流程，当前软件未更新，正式UI/真实Run仍未接受。
