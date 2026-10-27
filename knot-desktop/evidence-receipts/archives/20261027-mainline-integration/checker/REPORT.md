# 048 主线模块接入 · 独立工程复核

结论：限定通过，无剩余阻断。范围为从main基线接入同一Knot桌面模块、固定历史来源和必要构建/候选路径适配；不代表main已合并、正式候选已制备或在用软件接受。

## 来源与范围

最终以controller/working-freeze-r5.json（ec068f512c83b93ad41ae184fab17c2a2c0ba519cf57b2fe4aa01e59627d9f26）为准，300路径实际字节全部匹配。222原路径逐项核对a05原blob/hash和新SOURCE-MANIFEST当前hash，11项适配明确；26产品字节不变。原main386中四文档为批准差异，其余382的Git内容保持。原baseline记录的是Git blob SHA：9项工作字节与blob相同，373项存在checkout CRLF差异、规范换行后相同，不能称382当前raw字节等于baseline。300冻结清单另外独立记录真实工作字节。

59份历史fixture逐个对照原始来源：18个d59代码文件由真实历史blob核对；017的14项、014的27项与旧已审原manifest/产物字节核对，provenance pin7092e19c…保持。不是从当前实现重造历史。043原29条assert保留；044原35条中的34条原文本保留，唯一当前漂移拒绝改为在owned临时root装配实际当前13源后调用，仍断言CURRENT_SOURCE_MISMATCH；旧pin和故障语义未减弱。原695份evidence未搬入，新增fixture为公开代码/manifest，不含业务数据或Session内容。

## 行为与验证

- 独立运行一次40套portable runner：内含build成功，235/235、零skip。这是r2冻结版本的运行证据；此后变化限候选拒绝门、相关测试/helper和文档/manifest，产品/build及其他套件代码未变。
- r3新增shadow Git拒绝门：固定名knot-desktop不能自己成为Git根绕过outer HEAD；旧standalone v2 fixture保留。独立绝对路径专项在旧cwd运行10/11，014历史fixture的相对cwd定位失败，日志保留并反馈中控。
- 最终r5将candidate helper及014fixture/两处package读取改为import.meta锚，独立从新repo根重跑candidate6+monorepo5共11/11。包括HEAD、untracked、dirty、工作文件恢复但index仍dirty、错误模块、shadow .git、重定向/输出重叠和篡改v3源映射拒绝。旧v1/v2原pin仍通过。11项与前述235重叠，不相加为总量，未再次跑全套。
- 自有3/3：无Git metadata、无旧ignored evidence的模块导出运行043/044真实15项；历史文件篡改及未知路径被固定helper拒绝；无关cwd运行inventory明确40个included与外部依赖。noGit子15为首项内部断言，不重复计总。初版自有harness继承NODE_TEST_CONTEXT导致子stdout为空、断言失败；保留初日志，仅清除子进程该变量并显式TAP后实际15项通过，无产品变动。

v3区分固定module repoPath与不变artifact布局，实际HEAD blob原字节检查、index检查及realpath/output fences保留。外部expected pin仍是信任来源，manifest自报source字段不冒充独立来源授权。官方验证worker改为脚本自身位置锚，未运行官方宿主。本轮所有候选制备成功案例都是owned synthetic测试，未制备正式发布候选。

## 架构、维护与限界

维护性通过：根保留原产品/设计/架构与FlowGram，新增桌面模块不新造业务Store或路线；固定vendor四原SHA与main规范文本等值双门保持。当前是同源核心、不同运行持久owner，禁止双主写同一业务文件；双端统一运行态未完成。portable runner穷举分类所有顶层suite，不以skip或隐含外部依赖伪装全仓通过。历史部署/实模脚本保留原前置条件与外部依赖，模块README明确旧文档范围，公开SOURCE-MANIFEST没有机器绝对路径。

只读核新根文档、模块入口、适配源码、相关测试与fixture来源；未对83份原历史文档重新作全域安全审计。它们来自已公开a05固定来源且原字节受映射核验。未发现本轮新增私人材料/凭据；没有真实Session、生产profile、模型或安装/系统操作。

根接续Maker制作，独立Checker执行本复核，未自行修改产品或Git。实际新HEAD的26候选与官方离线临时profile验证须在根精确提交后另做执行Gate；当前branch仍以08a为HEAD、index空，main未合并。本回执不授予main merge、生产迁移/部署、模型、native传输/ReactDOM/真人体验或G3/G4/G5整体接受。旧PR12–14及全部旧freeze保持。

证据：audit.json/audit.mjs、portable.log、candidate-r3.log、candidate-r5.log、own-cases.log及own-cases-initial-harness.log。设计预核与import检查点保留，不改为工程通过记录。
