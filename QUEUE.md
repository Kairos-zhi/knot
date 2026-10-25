# KONT 执行队列

更新：2026-10-24。本页与STATE为当前入口；历史过程见docs/archive/QUEUE-20261022.md。
状态只允许：MAKER、CHECKER、GATE、ACCEPTED_LIMITED、CLOSED、BLOCKED。具体verdict及验收范围保留在原回执，不改写原历史冻结文件。

| ID | 真实执行入口／本轮归档复核人 | 状态 | 证据与范围 |
|---|---|---|---|
| KONT-KERNEL-001-A | kont_maker / kont_checker | ACCEPTED_LIMITED | K/checker/final-review.json；Headless窄切片 |
| KONT-KERNEL-001-B | kont_runtime_maker / kont_checker | ACCEPTED_LIMITED | K/runtime-maker/REPORT.md、K/checker/final-review.json；正常SIGTERM，不含强杀 |
| KONT-KERNEL-001-C | kont_checker | CLOSED | K/checker/independent-check-result.json；原27哈希、20测试与8组程序化实测 |
| KONT-RESEARCH-002-A | kont_seeker / kont_checker | ACCEPTED_LIMITED | R/checker/review.json；研究限定，不批准三项工程建议 |
| KONT-RESEARCH-002-B | seeker:aily（大荒谬）/ kont_checker | ACCEPTED_LIMITED | R/checker/b-review.json；任务7699079302595283968，4份9月28日文档rev2历史补证 |
| KONT-RESEARCH-002-C | kont_checker | CLOSED | R/checker/review.json、b-review.json；两路研究复核完成 |
| KONT-DESKTOP-003入口 | kont_checker（本轮归档复核） | ACCEPTED_LIMITED | E/checker/final-review.json；历史安装制作归属见QUEUE归档，不冒称本轮重装 |
| KONT-DESKTOP-003-COMPAT-A | kont_maker / kont_checker | ACCEPTED_LIMITED | D/checker/a-final-review.json、final-review.json；精确版本与client注册，非正式UI体验 |
| KONT-DESKTOP-003-COMPAT-B | kont_runtime_maker / kont_checker | ACCEPTED_LIMITED | D/checker/final-review.json、manifest-check.json；真实安装与正常重开，无debug终态 |
| KONT-RUN-004 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | N/checker/final-review.json；44/44＋11项；仅离线准备／关联投影／原子回流，无实际Run／桌面部署 |
| KONT-RUN-005 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | O/checker/final-review.json；51/51＋5项；官方库合成会话点读／窄请求审计，不执行模型或自动回流 |
| KONT-RUN-006 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | P/checker/final-review.json；build＋focused12/12；同store绑定／卸载屏障，不新增HTTP或执行入口 |
| KONT-RUN-007 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | Q/checker/final-review.json；build＋focused9/9；JSON只读配置装配候选，不含真实profile解析／部署 |
| KONT-RUN-008 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | S/checker/final-review.json；build＋focused5/5；受控Agent单次stream保护，未接执行入口 |
| KONT-RUN-009 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | T/checker/final-review.json；build＋focused19/19；同Run持久占位／提交状态内部候选 |
| KONT-RUN-010 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | U/checker/final-review.json；r2 build＋focused16/16；官方owned组件→synthetic原子回流 |
| KONT-RUN-011 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | V/checker/final-review.json；core21＋wire4；唯一真实Flash请求／回流／重开，估算0.00046元 |
| KONT-RUN-012 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | W/checker/final-review.json；A8＋B r2 4项、独立集成／认证2项；无新增模型请求 |
| KONT-RUN-013 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | X/checker/final-review.json；build＋11项及bundle组合1项；无模型／部署 |
| KONT-DESKTOP-014 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | Y/checker/final-review.json；build＋6项，25文件一致，官方离线隔离安装；未改在用profile |
| KONT-DESKTOP-015 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | Z/checker/final-review.json；旧12项／原package2项／15冻结项一致，独立7/7 |
| KONT-DESKTOP-016 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | AA/checker/final-review.json；13冻结项，独立A13＋B4；仅只读预检／危险降级拒绝 |
| KONT-DESKTOP-017 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | AB/checker/final-review.json；17冻结项／13候选项，独立A3＋B4，合成journal完整 |
| KONT-DESKTOP-018 | run_maker＋根Maker B / live_runner_maker Checker / 中控Gate | ACCEPTED_LIMITED | AC/checker/final-review.json；11冻结项／独立9/9，真实无Run样本副本通过，原文件不改 |
| KONT-DESKTOP-019 | run_maker＋live_runner_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | AD/checker/final-review.json；独立16/16／12冻结项，真实临时安装1次／25文件一致 |
| KONT-DESKTOP-020 | 根唯一执行 / run_checker只读复核 / live_runner_maker运行脚本 | CLOSED | AE/checker/final-review.json；安装失败保全，旧桌面普通启动；升级未接受 |
| KONT-DESKTOP-021 | run_maker / run_checker / 中控Gate | MAKER | AF=20261025-desktop-store-fix；既存store兼容修复，隔离验证，不重试生产 |

根均为evidence/local/：K=20261021-kernel-adapter，R=20261021-backend-research，E=20261021-desktop，D=20261022-desktop-compat，N=20261022-run-contract，O=20261022-run-read。
CARD-KONT-20261022-RESUME已完成历史收口；之新授权“换窗口，继续开发”接续 KONT-RUN-004，旧回执STOP不再阻止本卡，不改写历史文件。
本轮仅一张工程卡，顺序Maker自测→独立Checker→Gate→回执。真实模型调用、桌面部署、push／合并未授权；不得冒称完整Run完成。
本卡Gate：ACCEPT_RUN_CONTRACT_LIMITED；当前10单元＝8项ACCEPTED_LIMITED＋2项CLOSED，完整产品接受0。中控仅留本地提交锚；真实DSH受信日志／完整上下文接缝须下一张小卡，不以合成测试顶替。
2026-10-22之授权“按照原计划继续开发”：RUN-004保持已接受，当前RUN-005顺序制作→独立复核→Gate。官方库生成的合成Session用于实际服务契约验证，不能称真实模型Run；模型／桌面部署／push／合并权限未增加。
RUN-005 Gate：ACCEPT_DSH_READ_AUDIT_LIMITED；当前11＝9限定接受＋2关闭，完整产品接受0。之随后要求“小步快跑”：后续每卡聚焦一个可验证改动，Maker／Checker不合并，够用即收口，不重复扩大验证。
当前RUN-006（之“推进”）：证据P=evidence/local/20261022-run-host；只做宿主内部绑定，聚焦测试与独立复核；不扩模型／部署权限。
RUN-006 Gate：ACCEPT_HOST_OBSERVER_BINDING_LIMITED；当前12＝10限定接受＋2关闭，完整产品接受0；未重跑全量，旧51项为历史结果。
当前RUN-007（之“快步前进”）：Q=evidence/local/20261022-run-config；只做正式装配配置，聚焦验证，无模型／在用部署权限增量。
RUN-007 Gate：ACCEPT_SERIALIZABLE_READ_CONFIG_LIMITED；当前13＝11限定接受＋2关闭，完整产品接受0；实际库测试有ASAR anchor解析base适配，非真实Desktop profile部署，未重跑全量。
RUN-008（之“齐步走”）Gate：ACCEPT_EXECUTION_GUARD_LIMITED；S=evidence/local/20261022-run-guard；Maker与独立Checker build＋focused5/5，当前14＝12限定接受＋2关闭，完整产品接受0。只约束受控Agent，synthetic provider实测，真实模型0；完整请求授权／金额预算／持久防重与终态回流未接。下一卡接持久dispatch防重与执行状态，实际调用前集中确认身份／模型／成本与部署授权。
2026-10-23之“齐步走”：RUN-009 Gate=ACCEPT_DURABLE_DISPATCH_LIMITED；T=evidence/local/20261023-run-dispatch；双方build＋focused19/19，当前15＝13限定接受＋2关闭，完整产品接受0。先持久占位再一次callback，同Run并发／正常重开拒重；submitted不等于完成，超时不等于远端取消。只做内部协调，无模型／部署；下一步集成guard、提交与受信终态回流，实际调用前仍需具体执行授权。
之“按照战线快步推进”：RUN-010 r2 Gate=ACCEPT_OWNED_RUNTIME_INTEGRATION_LIMITED；U=evidence/local/20261023-run-integrated；双方build＋focused16/16，当前16＝14限定接受＋2关闭，完整产品接受0。官方Agent/Session完整事件链经synthetic provider回流一次；失败／取消／CAS／重复拒绝，清理失败持续拒绝关闭屏障，r1阻断与源码留样保留。未部署或调用真实模型；下一步补实际请求边界核准及明确执行授权，再做受控单次实跑，不把合成纵切当真实模型闭环。
RUN-011：之明确deepseek-flash／3元且要求子agent并行，核心Maker与runnerMaker分文件并行，独立预检通过后根唯一实跑，Checker只读复核。Gate=ACCEPT_SINGLE_FLASH_RUN_LIMITED；当前17＝15限定接受＋2关闭，完整产品接受0。1生成POST、158输入／18输出、11条真实owned事件、completed、唯一generated来源块及独立重开通过；峰值估算0.00046元，非账单。本次授权已消费1/1，不再自动请求。下一步做在用桌面集成候选与正式工作站，保持宿主API／授权边界，不把隔离store试跑当已部署。
RUN-012 r2：两制作线并行、独立Checker查出opaque身份兼容P2并返修通过；Gate=ACCEPT_RUN_QUERY_VIEW_LIMITED。A8项与B最终4项、集成／未认证零读取2项通过；未全量。当前18＝16限定接受＋2关闭，完整产品接受0。只读Run契约／中文状态模型已收口，无新UI／模型／部署；下一步将该状态接到正式工作站呈现，不扩写旧表单。
RUN-013：两线并行完成共享只读source/client/bundle与面板，独立Checker Gate=ACCEPT_READONLY_RUN_PANEL_LIMITED。build＋聚焦11/11、自有实际bundle组合1/1，16冻结项一致；当前19＝17限定接受＋2关闭。冻结前workspace刷新遮旧数据风险已修；窗口／卡片／图标共用状态，当前块只读定位。非ReactDOM／视觉／人的体验验收，未部署在用Desktop，无新增模型。下一步准备受支持Desktop插件管理器部署包与隔离装配验证，不能手改在用profile/签名ASAR或复用已消费模型授权。
DESKTOP-014：Gate=ACCEPT_DESKTOP_CANDIDATE_PACKAGE_LIMITED；目录候选25文件、16冻结项一致，独立build＋6/6，官方manager在临时profile离线安装、版本拒绝与复制后runtime/renderer验证通过。当前20＝18限定接受＋2关闭。需要重启且enabled:false，不能冒称热装或在用部署；旧已安装代码rollback副本尚未准备。下一步先捕获并验证旧代码回滚候选，再经官方manager更新与正常重启验证；不动用户资产或模型授权。
DESKTOP-015：之“快步推进”，Gate=ACCEPT_INSTALLED_CODE_ROLLBACK_CANDIDATE_LIMITED；从真实installed捕获12项与2项原package，实际转换0，peer／代码不变。双方冻结15项一致，独立7/7，官方离线临时profile重装及旧runtime／renderer工厂验证通过。当前21＝19限定接受＋2关闭。原spec／选择是持久配置证据，非live manager或active查询；代码可重装不证明新数据降级或生产回滚。新增模型0，未在用profile写／桌面启停／部署／push／合并。下一步适配安装管理工具以绑定已审升级／回滚候选，补数据兼容预检；实际更新与正常重启另行核准，不能直接使用旧repo spec。
DESKTOP-016：之“继续”，Gate=ACCEPT_REVIEWED_PREFLIGHT_AND_UNSAFE_DOWNGRADE_DETECTION_LIMITED；13冻结项一致，独立A13（新3＋原RPC9＋archive1）与B4分两次通过，非全量。新工具固定014／015可信pin与原installed12/profile/selection、只读pre-upgrade计划；伪造／过期／篡改拒绝，显式安装仍DATA_COMPATIBILITY_BLOCKED/evaluate0。五Run阶段经旧版普通写入后journal1→0、资产／provenance仍在；代码可装不能证明数据可降级。当前22＝20限定接受＋2关闭。下一步补Run journal兼容恢复方案，再做真实数据预检、实际部署核准和安装后源fence转换；本轮无生产资产读、在用profile写／桌面启停／模型／push／合并。
DESKTOP-017：之“推进／继续”，Gate=ACCEPT_RUN_PRESERVING_DERIVED_RECOVERY_LIMITED；13项派生候选，旧11项＋014 store/run两项；独立A3＋B4，17冻结项一致，五阶段完整journal／claim／receipt与restore拒绝覆盖、占位拒重及prepared首claim保持，官方离线临时profile复制13项／runtime／旧renderer通过。当前23＝21限定接受＋2关闭。旧入口获得现代run.prepare／snapshot journal语义，非完全旧行为；未证明生产数据兼容／实际恢复部署。Checker完成书面回执后末条消息额度中断，根已读完整final-review／REPORT／测试与hash文件，不冒称再跑；不影响既有完成复核。下一步接入新恢复pin和部署预检；016安装拒绝、015原旧包危险降级结论不改，无生产读／部署／模型／push／合并。
DESKTOP-018：之再次“继续”，Gate=ACCEPT_PAIRED_PREFLIGHT_LIMITED；根B固定现场只读probe、A新模块配对014／017，live_runner_maker未参与本卡制作而独立复核9/9／11冻结项及真实prepare通过。现场2资产／0Run，原hash e0359bb6...及原锁不变，私人副本完整canonical读写往返，报告无正文ID；不证明真实含Run恢复或生产迁移。两目标install allowtrue均DEPLOYMENT_AUTHORIZATION_REQUIRED、evaluate0，未liveHost／桌面启停／部署／模型。当前24＝22限定接受＋2关闭。下一步补一次性安装授权执行入口与真实manager核对／正常重启安排；旧代码／候选／016拒绝门未改，不自动授予部署许可。
DESKTOP-019：之“快步推进。快步”，Gate=ACCEPT_ONE_SHOT_INSTALL_GATE_LIMITED；独立16/16、12制作冻结项匹配，临时官方manager enabled:true安装一次／25复制文件一致。wx+sync后再fence、私有permit单次消费、持久claim及transport marker；重建／并发／重开／超时／回执保存失败不重试。synthetic不能进固定生产工厂；已消费transport超时仍可能继续准备/安装，不能当取消或清标记重试。生产descriptor 928f...77a9只读复核、真实human grant0／生产claim无。Checker完整书面Review完成后末条消息容量错误，根已读回完整测试／hash／final-review。当前25＝23限定接受＋2关闭。下一步需明确实际安装授权，再以新鲜预检走官方生产manager一次安装与正常打开验证；完整context／cache／active及恢复安装未验，无生产写／模型／push／合并。
DESKTOP-020：之直接回复“我授权”，根接续已审方案唯一approve／execute；run_checker独立只读预检通过，禁止子agent安装或重试。真实结果／25已装字节／其他依赖与选择／数据hash先核，再正常打开和服务／renderer注册只读验证。失败或不确定保留占位并诊断，不清标记／强杀／重发，不模型。未事后复核前不Gate。
DESKTOP-020执行增量：一次官方manager失败ERR_PNPM_UNEXPECTED_STORE，结果uncertain；独立读回旧12文件/profile/data不变，无候选部分更新。2026-10-25根普通无调试启动官方旧Desktop，进程与数据锁存在、原hash保持，等待事后复核；不声称升级或renderer已验。DESKTOP-021修复明确store-dir与既存.modules.yaml冲突，只隔离验证并保留旧授权占位。
