# KONT-DESKTOP-014 · 可审查部署候选包

授权：之先说“慢慢来”，随后go，接续RUN-013已接受候选。基线3ccb26f；本卡准备包与隔离装配，不修改在用Desktop、不调用模型或发布／合并。

既查：开发基准、当前STATE、packages/desktop-bundle及现build。官方Desktop 0.2.1-rc.2及支持的pluginManager为在用安装入口；不得手改profile／签名ASAR或用旧CLI代替。当前bundle的file:../dsh-plugin是本地目录依赖，必须核对实际依赖落点，不能把孤立tgz宣称便携安装包。

A线：制作部署候选打包工具与必要测试，明确源commit／内容allowlist／文件hash、依赖关系与宿主版本，输出不可覆盖、路径安全。不包含凭据、用户资产、evidence、测试或node_modules；包含最新server、只读query、client面板及已构建核心。优先可以实际解析的最小目录候选，不凭空发布版本。

B线：核官方manager的本地包入口与隔离装配，给具体部署／回滚计划。能在独立临时profile真实manager验证则做；若需未授权网络或在用状态，不绕过，改用官方包解析器＋实际Cordis apply／renderer候选组合，并明确未验证manager安装。不用假的manager成功回执顶替。

分文件并行：A=packager／布局模板／tests；B=隔离validator／tests／安装方案；根=本卡／STATE／QUEUE／README；独立Checker核内容边界、可复现性、依赖与真实隔离证据。只聚焦必要检查，不重复全量或截图点击。通过后一次本地提交，包及证据在evidence/local/20261024-desktop-package，archive_id=kont-desktop-package-20261024。

未覆盖：在用Desktop正式安装／重开、真实ReactDOM／人的体验、通用执行授权及再次模型调用。历史单次模型授权已消费。本卡隔离通过不能外推在用部署成功。

制作回收：A build＋4项，B指定最终candidate的2项官方manager隔离验证完成。25个安装文件与候选一致，manifest摘要a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8。根已复算两线16项冻结文件，尚不代替独立Checker。B回执使用KONT-RUN-014为本卡制作别名，唯一中控ID仍KONT-DESKTOP-014，不新增任务或接受计数。子agent曾因运行额度中断，独立复核恢复前保持CHECKER，不Gate或提交。

七格收口：目标＝可审查候选包与官方隔离装配；回收＝两线冻结、额度恢复后Checker完成；证据＝evidence/DESKTOP-014-INDEX.json与Y/checker/final-review.json；验收＝ACCEPT_DESKTOP_CANDIDATE_PACKAGE_LIMITED，无阻断，25候选文件／16冻结项一致，独立build＋6/6；入档＝本卡与STATE/QUEUE；记录＝一次本地提交，无模型／在用部署／push／合并；未决＝目录候选须完整保持同级依赖，不是独立tgz；manager隔离enabled:false、restart-required/no-hmr不等于在用激活，旧代码rollback包、正常Desktop重开与人的体验尚未验证。
