# KONT 中控指针

更新：2026-10-27；045已推送并建审阅草稿PR12，main集成仍单列。046新分支codex/run-reconciliation-046以d59bcf2为父基线，显式终态对账源门独立限定接受，提交/候选/增量PR状态以046执行回执为准；无在用部署或新模型调用。
六态：MAKER / CHECKER / GATE / ACCEPTED_LIMITED / CLOSED / BLOCKED；LIMITED不等于完整产品接受。

046源门收口：Gate=ACCEPT_EXPLICIT_RUN_RECONCILIATION_LIMITED；独立build/74项（新12、相关58、自有4）与维护性通过，Maker14项冻结、910保护。POST /kont/runs/{id}/reconcile沿原人/Agent认证，独立exact写grant默认拒绝+原exact读grant/approved replay指纹，只有close成功后经同owner Store回流；三claim态、并发/重复单块、取消/队列/提交后不撤回与completed免IO均核。旧observe仍只读，三种request摘要不混同；unsupported context或未完成保留原claim，不扩大Run schema。旧044正例绑定完整d59 A13+三script，原40条assert/pin保持；实际当前漂移拒绝、043七数据源回归通过。证据evidence/RUN-046-INDEX.json及evidence/local/20261027-run-reconciliation/checker/final-review.json；提交/候选/推送执行另见evidence/local/20261027-root-candidate-046/controller。对账不授权模型执行，不读真实Session/生产；没有native/人的体验或G3/G4/G5整体接受。

045执行收口：之明确允许推送并指定Kairos-zhi/knot后，根在codex/workstation-release-045精确112一次commit=d59bcf29de1aeae80528357c0b48e80c62c322f8，全部blob与最终清单一致；build无漂移，真实HEAD制26正式本地候选pin ad5fb65ab02535d7a7fc4e1314a28bfc5281aef05ca946db50c76f55441e5471。官方0.2.1 RunAsNode临时profile offline验证26/runtime8/workstation10及订阅清理0通过，原Checker独立读回Gate=ACCEPT_COMMITTED_ROOT_CANDIDATE_OFFICIAL_ISOLATION_LIMITED。release分支已远端SHA读回；针对main的PR实际422无共同历史，未重写/force/merge，main仍08a2a5340edab920ce942173ba63b2c5bc369eb4。另以已审父45ccd24建立review-only基线，创建[草稿PR #12](https://github.com/Kairos-zhi/knot/pull/12)，精确1commit/112files，仅审阅不解决main集成。证据evidence/local/20261027-root-candidate-045/controller/{receipt.json,PUBLICATION.md}及045/checker/execution-final-review.json。旧准备计划/终读均留样；提交/候选/推送许可按本次已执行范围消耗，不扩张到在用安装/生产读写/模型。真实Desktop/G3、人验/双端三轮、主线集成尚未完成，完整产品接受仍0。

044收口：Gate=ACCEPT_SYNTHETIC_DERIVED_RECOVERY_ROUNDTRIP_LIMITED；独立build/36项（本卡7、相关26、自有3）与维护性通过，Maker14项冻结、103保护。新B14=旧017承载7+当前数据闭包7，A当前入口闭包13；组合pin43546de507584eca98b0a47ea19a7879ca331c4b52f012d8279f88d9f8ae7939。实际A1→B真实apply四路由/human+Agent HTTP写→A2写→A3重开，完整state/journal原hash保持，revision/seq为8/14→10/18→11/19→11/19。仅离线synthetic软件承载回转，不是业务备份回退、原017兼容、旧UI体验或生产恢复接受。证据evidence/COMPAT-044-INDEX.json及evidence/local/20261027-store-recovery-roundtrip/controller/CLOSEOUT.md、receipt.json。原105路径保留、现112，HEAD/index/remote不变；旧产品/26库存/017/018/043/旧tests保持，无模型/生产/正式root候选/安装/系统/Git提交发布。下一步045按实际112重列精确范围，不沿用032旧50。

043收口：Gate=ACCEPT_OFFLINE_STORE_READER_PAIRING_LIMITED；独立build/31项（本卡7、相关20、自有4）与维护性通过，Maker13项冻结、97项保护。新增固定current7/017六文件闭包的离线Buffer读/完整导出预检，实际字节pin/全语义比较，分拒绝、有损和保全；不改旧业务代码、旧018或旧测试。current保全，017短引用有损、长业务Run拒绝，pairCompatible=false；接受工具不接受该恢复配对。证据evidence/COMPAT-043-INDEX.json及evidence/local/20261027-store-reader-pairing/controller/CLOSEOUT.md、receipt.json。原99路径保留、现105，HEAD/index/remote不变。DEBT-01离线能力未知缩小，writer往返/真实迁移恢复及DEBT-02发布清单仍未完成；无模型/生产/正式候选/安装/系统/Git提交发布。Maker最终通知额度异常未阻止独立Checker完整复核，不以异常冒充通过。

本轮修复顺序：038完整Store导出/恢复/Agent Read（ARCH-01）→039清理失败与owner关闭责任（ARCH-02）→040跨版本投影（ARCH-03）→041呈现实例语义（ARCH-04）→042业务引用域（ARCH-05）。以evidence/local/20261026-architecture-history-checker/REPORT.md及findings.json为受理依据，不改旧冻结证据、不恢复新增功能叠加。先前038派工曾因额度限制失败，未产生源码改动；本次恢复同一Maker/Checker上下文。

042及本轮收口：Gate=ACCEPT_CORE_RUN_REFERENCE_DOMAINS_LIMITED；独立build/85项（相关80、自有5）与维护性通过，Maker15项冻结、92保护。仅run.mjs分Core业务opaque引用与Run/DSH受限身份，保留字面/hash/旧journal，安全地址与许可不放宽。原五触发按各卡边界闭合，038–041关键契约在最终代码回归；完整产品接受仍为0。证据evidence/ARCH-042-INDEX.json及evidence/local/20261026-architecture-repair-closeout/REPORT.md、readback.json。原73路径保留、现99，HEAD/index/remote不变。旧reader/完整数据迁移配对、032过期发布清单仍待独立处理；普通长Worksite默认标题限制未改。非真实宿主/人验/G3整体/G4/G5接受，无模型/生产/安装/系统/Git提交发布。

037最新收口：Gate=ACCEPT_WORKSITE_FOLDER_CLIENT_LIMITED；独立build/91项（本卡9、自有5、相关77）与维护性通过，r2 Maker17冻结、保护64文件、路线6份一致。资源库按文件夹/未归组投影同一现场，创建/改名/归入/移出沿036原命令；回显在dirty/标题清理前确认，较新输入保留，已知组织丢失/损坏拒收。可访问名称用人类标题，业务ID保持；无变化动作不POST。仅现provider增加组织接纳/回显与标题瞬态，Run源/请求生命周期保持；backend/helper不改。证据evidence/WORKSTATION-037-INDEX.json及evidence/local/20261026-worksite-folders-client/controller/receipt.json。原69路径保留、现73，HEAD/index/remote不变。不是ReactDOM/真实宿主/键盘焦点输入法/人验、完整Project或G3整体/G4/G5接受；无模型/生产/部署/系统或Git提交发布。

036最新收口：Gate=ACCEPT_WORKSITE_FOLDER_CONTRACT_LIMITED；独立build/61项（本卡10、自有4、相关47）与维护性通过，r2 Maker18冻结、保护60文件、路线6份一致。organization v1由同Store持有，folder.create/rename/assign沿同内核/CAS/事件，只改现场引用；旧文件读不写迁移，导出/服务restore显式保全，执行态缺组织拒绝及Run guard通过。兼容补句为docs-only，已测代码/原日志不变；单独core会丢组织、旧二进制迁移/降级未验。证据evidence/WORKSTATION-036-INDEX.json及evidence/local/20261026-worksite-folders/controller/receipt.json。原63路径保留、现69，HEAD/index/remote不变。无文件夹UI/完整Project/真实宿主/人验/G3整体或G4/G5接受；无模型/生产/安装/系统或Git提交发布。

035最新收口：Gate=ACCEPT_WORK_ISLAND_OVERVIEW_RETURN_LIMITED；独立build/75项（本卡7、自有3、相关65）与维护性通过，Maker12冻结、保护53文件、路线6份一致，唯一授权测试helper增量另记。工作岛消费同一Run源按真实现场ID归组，沿原四phase标签，回现场复用原子保存/唤出；未知归属禁导航，迟到/错误源不冒充完成。证据evidence/WORKSTATION-035-INDEX.json、evidence/local/20261026-work-island/controller/receipt.json。原59路径保留，现63，HEAD/index/remote不变。不是实时后台托管或G3整体/真实宿主/人的体验/G4/G5接受；无模型/部署/系统或Git提交发布。

034最新收口：Gate=ACCEPT_WORKSITE_HUD_CONTINUITY_LIMITED；独立build/68项（本卡6、自有3、相关59）与维护性通过，r2 Maker18冻结、保护范围50文件、路线6份一致。window/card/icon共用唯一无state HUD和原provider草稿/保存/预览；显示目标/真实Agent选择/供给，未知Agent不冒充未选择。证据evidence/WORKSTATION-034-INDEX.json、evidence/local/20261026-worksite-hud/controller/receipt.json。现59待整合路径，原55保留，HEAD/index/remote不变。树位置/key不代验ReactDOM焦点/输入法；真实宿主/人的体验及G3整体、G4/G5待验。无模型/部署/系统或Git提交发布动作。

033最新收口：Gate=ACCEPT_WORKSITE_LIBRARY_REUSE_LIMITED；独立build/58项（本卡10、自有4、相关44）与维护性通过，Maker12冻结、路线6份及原032范围外46稳定文件一致。现场资源库可读保存的呈现/草稿/供给数量，显式唤出复用同一实例/布局；原三态共享命令生成，不新增后端。证据evidence/WORKSTATION-033-INDEX.json、evidence/local/20261026-worksite-library/controller/receipt.json。现55待整合路径，原50全部保留，HEAD/index/remote不变；032旧提交计划须重审。阶段1/2交界及G3/G4/G5未完成，下一片仍沿原W5/G3；文件夹/HUD/工作岛、真实宿主及人的体验待验。未模型/部署/系统或提交推送合并。

| 单元 | 状态 | 证据（根见下） |
|---|---|---|
| KERNEL-001-A | ACCEPTED_LIMITED | K/checker/final-review.json |
| KERNEL-001-B | ACCEPTED_LIMITED | K/runtime-maker/REPORT.md |
| KERNEL-001-C | CLOSED | K/checker/independent-check-result.json |
| RESEARCH-002-A | ACCEPTED_LIMITED | R/checker/review.json |
| RESEARCH-002-B | ACCEPTED_LIMITED | R/checker/b-review.json |
| RESEARCH-002-C | CLOSED | R/checker/review.json、b-review.json |
| DESKTOP-003入口 | ACCEPTED_LIMITED | E/checker/final-review.json |
| DESKTOP-003-COMPAT-A | ACCEPTED_LIMITED | D/checker/a-final-review.json、final-review.json |
| DESKTOP-003-COMPAT-B | ACCEPTED_LIMITED | D/checker/final-review.json、manifest-check.json |
| RUN-004 | ACCEPTED_LIMITED | N/checker/final-review.json；44/44＋11项自有检查；仅离线服务契约 |
| RUN-005 | ACCEPTED_LIMITED | O/checker/final-review.json；51/51＋5项；官方库只读接缝／窄请求审计 |
| RUN-006 | ACCEPTED_LIMITED | P/checker/final-review.json；build＋focused12/12；同store宿主只读绑定／卸载屏障 |
| RUN-007 | ACCEPTED_LIMITED | Q/checker/final-review.json；build＋focused9/9；JSON只读配置装配候选 |
| RUN-008 | ACCEPTED_LIMITED | S/checker/final-review.json；build＋focused5/5；受控Agent单次stream保护候选 |
| RUN-009 | ACCEPTED_LIMITED | T/checker/final-review.json；build＋focused19/19；同Run持久占位／提交状态 |
| RUN-010 | ACCEPTED_LIMITED | U/checker/final-review.json；r2 build＋focused16/16；owned运行组件／原子synthetic回流 |
| RUN-011 | ACCEPTED_LIMITED | V/checker/final-review.json；core21＋wire4；真实Flash 1POST／completed／单块来源／独立重开 |
| RUN-012 | ACCEPTED_LIMITED | W/checker/final-review.json；A8＋B r2 4项，集成／认证2项；只读接口与viewmodel |
| RUN-013 | ACCEPTED_LIMITED | X/checker/final-review.json；build＋11项／独立bundle组合1项；只读面板候选 |
| DESKTOP-014 | ACCEPTED_LIMITED | Y/checker/final-review.json；25文件／16冻结项一致，build＋6项官方隔离检查 |
| DESKTOP-015 | ACCEPTED_LIMITED | Z/checker/final-review.json；15冻结项／旧安装12项／原package2项一致，独立7/7 |
| DESKTOP-016 | ACCEPTED_LIMITED | AA/checker/final-review.json；13冻结项，独立A13＋B4；五阶段Run丢失检测／安装拒绝 |
| DESKTOP-017 | ACCEPTED_LIMITED | AB/checker/final-review.json；17冻结项／13候选项，独立A3＋B4；五阶段journal保留 |
| DESKTOP-018 | ACCEPTED_LIMITED | AC/checker/final-review.json；11冻结项，独立9/9，真实2资产／0Run副本无损、原hash未变 |
| DESKTOP-019 | ACCEPTED_LIMITED | AD/checker/final-review.json；12冻结项／独立16项，临时官方安装1次／25文件一致 |
| DESKTOP-020 | CLOSED | AE/checker/final-review.json；一次安装失败，旧12／profile／data保全，普通旧桌面启动读回 |
| DESKTOP-021 | ACCEPTED_LIMITED | AF/checker/final-review.json；11冻结项／独立9项，既存store／file-link依赖隔离25项一致 |
| DESKTOP-022 | ACCEPTED_LIMITED | AG/checker/final-review.json；20冻结项／独立10项＋资格11／谓词5场景；已审proposal1da1...5df4 |
| DESKTOP-023 | ACCEPTED_LIMITED | AH/checker/final-review.json；一次安装25/25、临时active/注册/三GET及修复后普通Host启动通过；系统active设置临时有效，v6TCP同步变化已披露 |
| WORKSTATION-024 | ACCEPTED_LIMITED | AI/checker/final-review.json；独立build/32项，旧preview与新GET共用纯投影；维护性通过，打包适配见025，未部署 |
| DESKTOP-025 | ACCEPTED_LIMITED | AJ/checker/final-review.json；独立build/21项、旧014原pin全25保持、新26官方隔离加载；真实root干净HEAD门不放宽 |
| WORKSTATION-026 | ACCEPTED_LIMITED | AK/checker/final-review.json；独立build/23项，客户端消费共用GET，保存/编辑/切换/卸载与迟到隔离通过；未部署 |
| WORKSTATION-027 | ACCEPTED_LIMITED | AL/checker/final-review.json；独立build/20项，纯阅读区/默认收起原文与来源计数；SSR不可用，未部署 |
| WORKSTATION-028 | ACCEPTED_LIMITED | AM/checker/final-review.json；独立build/34项，固定错误/刷新屏障/草稿保留；未部署 |
| WORKSTATION-029 | ACCEPTED_LIMITED | AN/checker/final-review.json；独立build/42项，DTO/版本与原现场草稿回显，未部署 |
| WORKSTATION-030 | ACCEPTED_LIMITED | AO/checker/final-review.json；独立build/56项，唯一订阅/手动刷新/生命周期，未部署 |
| DESKTOP-031 | ACCEPTED_LIMITED | AP/checker/final-review.json；独立build/58项、新26复制后纵切、旧25默认官方检查通过；非在用部署 |
| RELEASE-032 | GATE | AQ/checker/final-review.json；历史准备初审限定接受，033后旧50/48冻结须重审，未stage/commit |
| WORKSTATION-033 | ACCEPTED_LIMITED | evidence/local/20261026-worksite-library/checker/final-review.json；独立build/58项，资源库摘要/同现场唤出复用，无部署 |
| WORKSTATION-034 | ACCEPTED_LIMITED | evidence/local/20261026-worksite-hud/checker/final-review.json；独立build/68项，三态共用唯一输入HUD，无部署 |
| WORKSTATION-035 | ACCEPTED_LIMITED | evidence/local/20261026-work-island/checker/final-review.json；独立build/75项，同源运行概览/返回现场，无部署 |
| WORKSTATION-036 | ACCEPTED_LIMITED | evidence/local/20261026-worksite-folders/checker/final-review.json；独立build/61项，同Store文件夹组织/持久恢复契约，无UI部署 |
| WORKSTATION-037 | ACCEPTED_LIMITED | evidence/local/20261026-worksite-folders-client/checker/final-review.json；独立build/91项，客户端文件夹组织/输入回显，无部署 |
| ARCH-038 | ACCEPTED_LIMITED | evidence/local/20261026-arch-state/checker/final-review.json；独立build/66项，Store完整快照/Agent Read/Core投影，无部署 |
| ARCH-039 | ACCEPTED_LIMITED | evidence/local/20261026-arch-lifecycle/checker/final-review.json；独立build/34项，只读cleanup/owner屏障，无部署 |
| ARCH-040 | ACCEPTED_LIMITED | evidence/local/20261026-arch-epoch/checker/final-review.json；独立build/74项，Run/资产epoch与导航令牌，无部署 |
| ARCH-041 | ACCEPTED_LIMITED | evidence/local/20261026-arch-presentation/checker/final-review.json；独立build/89项，登记呈现/常驻HUD/独立inspector，无部署 |
| ARCH-042 | ACCEPTED_LIMITED | evidence/local/20261026-arch-identities/checker/final-review.json；独立build/85项，ARCH-05限定修复，无部署 |
| COMPAT-043 | ACCEPTED_LIMITED | evidence/local/20261027-store-reader-pairing/checker/final-review.json；独立build/31项，离线reader预检工具通过，实际current/017仍不兼容 |
| COMPAT-044 | ACCEPTED_LIMITED | evidence/local/20261027-store-recovery-roundtrip/checker/final-review.json；独立build/36项，新B14恢复承载真实HTTP写入回转；不授生产恢复/部署许可 |
| RELEASE-045 | ACCEPTED_LIMITED | evidence/local/20261027-release-preparation-refresh/checker/execution-final-review.json；d59已推、26正式候选官方隔离限定通过，草稿PR12仅父基线审阅；无生产部署 |
| RUN-046 | ACCEPTED_LIMITED | evidence/local/20261027-run-reconciliation/checker/final-review.json；独立build/74项，显式双许可同owner回流；执行回执见root-candidate-046/controller，不授生产/模型许可 |

证据根均在evidence/local/：K=20261021-kernel-adapter，R=20261021-backend-research，E=20261021-desktop，D=20261022-desktop-compat，N=20261022-run-contract，O=20261022-run-read，P=20261022-run-host，Q=20261022-run-config，S=20261022-run-guard，T=20261023-run-dispatch，U=20261023-run-integrated，V=20261023-run-live。
- 授权／范围：[收口卡](docs/tasks/CARD-KONT-20261022-RESUME.md)；执行侧：[QUEUE](QUEUE.md)；基准：[开发约束](docs/development-baseline.md)。
- 交付宿主：D:\DSH-Desktop，官方0.2.1-rc.2；023新候选已安装，临时调试实际active及主区/侧栏注册独立通过；最终普通无debug运行，5进程/Host端口50967/认证屏障有效。普通运行下renderer未再次直接查询，人的体验不由服务读回代验。
- 最新证据：AH=evidence/local/20261025-desktop-successor-installed；AH/controller/final-receipt.json与evidence/DESKTOP-023-INDEX.json，短交接为docs/handoff/20261025-desktop-installed.md。020／021／022与023失败阶段回执保持；旧短交接仅代表023前现场。
- 旧叙事完整保留：[STATE归档](docs/archive/STATE-20261022.md)；旧QUEUE见同目录归档。
- 023收口时29单元＝26项ACCEPTED_LIMITED＋3项CLOSED，完整产品接受0。023 Gate=ACCEPT_INSTALLED_AND_NORMAL_STARTUP_LIMITED；fresh完整018精确匹配1da1...5df4后唯一manager安装成功，25文件及非Knot依赖/选择保持，020父三记录和023唯一父子占位永久保留，机会不重置。临时debug实际active/主区与侧栏/同源三GET独立通过。第一次普通启动真实bad port失败，用户后明确“我确认”授权临时IPv4 TCP范围调整；唯一netsh IPv4 TCP store=active执行成功，IPv4范围49152–65535，同时观察IPv6 TCP变为相同范围，导致隔离断言UNRELATED_RANGE_CHANGED，实际差异已披露，底层联动actor未完全证明，无额外setter/回退。修复后普通Host端口50967、无debug、/kont/runs未认证401、无新崩溃独立核实。原data保持至最初普通启动，后续seq8→20由用户明确“是，刚操作过”说明近期操作；不能把当前hash称为原e035。临时系统设置下次Windows启动失效，未持久写或重启Windows；永久修复尚未授权。新增模型0，RUN-011授权仍已1/1使用。
- 未决：在用Desktop执行入口／正式Apple工作站、通用多用户授权／完整命令面／per-Agent权限、持久DSH Session恢复、强杀／断电与生产交付；dispose拒绝时不得自动关闭store。不得沿用已消费的单次授权再次付费请求。

024收口记录： Gate=ACCEPT_SHARED_WORKSITE_PREVIEW_QUERY_LIMITED；30单元＝27限定接受＋3关闭。workstation_maker制作，独立Checker维护性及源码/build/隔离服务验证通过，32/32。原store.preview与GET /kont/worksites/<encodedId>/preview共用纯函数，同次read/seq、完整来源、供给隔离与无别名，旧调用兼容。不新增UI/部署/模型或改已装候选/用户现场；下一张须版本化候选inventory并保留旧25验证，再接正式客户端。证据AI=evidence/local/20261025-worksite-preview、evidence/WORKSTATION-024-INDEX.json；API文档docs/api/worksite-preview.md。本地未提交；开发许可不续用为安装/系统永久修改/提交推送合并许可。

最新开发025收口：Gate=ACCEPT_VERSIONED_DESKTOP_INVENTORY_LIMITED，31单元＝28限定接受＋3关闭。v1旧25/v2新26显式清单，官方验证器复用同一严格核验；独立build、21/21相关与自有检查通过，旧014原pin及全25文件前后保持，隔离新26实际官方离线安装/复制/index与renderer工厂加载通过。人类可维护性通过，无新增框架/依赖/平行政策。真实root仍未提交，干净HEAD/受追踪输入门明确拒绝制备，fixture commit不代表正式发布提交；在用软件未更新。证据AJ=evidence/local/20261025-desktop-inventory，evidence/DESKTOP-025-INDEX.json；格式文档docs/api/desktop-candidate-formats.md。不生产/模型/系统/真实root提交推送合并。

最新026收口：Gate=ACCEPT_SHARED_PREVIEW_CLIENT_CONSUMPTION_LIMITED，32＝29限定接受＋3关闭。独立build/23项（新10＋相关旧10＋自有3）通过；4制作文件/1bundle/5报告日志冻结一致。已有预览动作改同源GET，保存成功再读、严格seq/身份/草稿，失效取消且拒迟到；保存回执只清捕获文本，不丢较新草稿。业务筛选不复制，普通具名请求/失效函数，人类维护性通过。024/025冻结源保持、旧014原pin25和当前26清单不变。证据AK=evidence/local/20261025-worksite-preview-client，evidence/WORKSTATION-026-INDEX.json。只接受源码/实际bundle工厂/组件hook语义，不是ReactDOM/正式Apple体验或在用部署；旧workspace保存错误处理未重构，不生产/模型/系统/真实root提交推送合并。

最新027收口：Gate=ACCEPT_SUPPLY_PREVIEW_PANEL_LIMITED，33＝30限定接受＋3关闭。纯SupplyPreviewPanel沿用026生命周期，材料数量、默认收起原文/来源标签/历史条数、坏DTO整体抑制与无副作用通过；独立build/20项，9冻结项保持，人类维护性通过。AL=evidence/local/20261025-supply-preview-panel，evidence/WORKSTATION-027-INDEX.json。旧014原pin25及当前26清单保持；官方ASAR依赖不可解析，SSR未执行，语义树不代表实际浏览器/正式Apple体验。未部署/生产/模型/系统/真实root提交推送合并。

最新028收口：Gate=ACCEPT_WORKSPACE_RECOVERY_LIMITED，34＝31限定接受＋3关闭。子Maker制作，独立build/34项及8冻结项通过，人类维护性通过。固定workspace错误、失败屏障/手动刷新、不自动重放、busy中性状态和孤立draft离页保护；旧026/027断言与旧014pin25/当前26保持。AM=evidence/local/20261025-workspace-recovery，evidence/WORKSTATION-028-INDEX.json。刷新不证明未知命令是否执行，草稿只在本页内存，无跨重启/恢复UI/正式Apple体验/在用部署。无生产/模型/系统/真实root提交推送合并。

最新029收口：Gate=ACCEPT_WORKSPACE_RESPONSE_ADMISSION_LIMITED，35＝32限定接受＋3关闭。子Maker制作，独立build/42项、9冻结项与维护性通过。JSON先接纳后emit/清draft：实际读取字段/同类身份/独立版本floor、原现场全部草稿echo；未知字段原对象保持，不复制完整schema。旧028只修真实POST成功fixture，断言保持；旧014pin25/current26保持。AN=evidence/local/20261025-workspace-response，evidence/WORKSTATION-029-INDEX.json；维护API与README历史测试表述已核。不是所有命令效果/幂等或跨重启恢复；未正式Apple/浏览器/人验或在用部署，无生产/模型/系统/真实root提交推送合并。

最新030收口：Gate=ACCEPT_WORKSPACE_CHANGE_NOTIFICATION_LIMITED，36＝33限定接受＋3关闭。子Maker制作，独立build/56项、10冻结项与维护性通过。唯一挂载SSE流、请求前close/接纳新seq后重建，变化/reset/断线清旧并要求手动刷新，不自动业务读写/replay。生命周期/ownwrite竞态及隔离真实HTTP SSE契约通过；不是actual dsh-app长流或原子实时同步。AO=evidence/local/20261025-workspace-events，evidence/WORKSTATION-030-INDEX.json。旧014pin25/current26保持。未正式Apple/浏览器/人验或在用部署，无生产/模型/系统/真实root提交推送合并。

最新031收口：Gate=ACCEPT_INSTALLED_WORKSTATION_INTEGRATION_LIMITED，37＝34限定接受＋3关闭。子Maker制作，独立build/58项与10冻结项、人类维护性通过。官方offline新26复制后服务/index/store与renderer factory-hook经真实HTTP/SSE测试桥跑10行为，三路径/hash核实、前后26字节保持/subscriptions0；另独立旧014原pin25默认官方验证exit0。AP=evidence/local/20261025-installed-workstation，evidence/DESKTOP-031-INDEX.json。fixture commit/pin不是root release；synthetic header与官方cookie验证分开。未actual dsh-app/native EventSource/ReactDOM/人的体验/在用部署，无生产/模型/系统/真实root提交推送合并。
