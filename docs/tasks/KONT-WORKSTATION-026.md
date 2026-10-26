# KONT-WORKSTATION-026 · 工作站消费共用供给预览

日期2026-10-25。之“可以继续”接续025，沿用人类可维护标准。本卡替换已有供给预览的客户端重复筛选，不扩旧编辑表单或另造正式工作站视觉。只开发/隔离程序化验证，不部署、不模型/用户Session/生产数据/系统设置或真实root提交推送合并。

既查：AGENTS/开发基准、024 API/纯投影与025格式、当前client.reveal/mutate/refresh/生命周期及run面板测试。后端复用已审共用GET，不改规则或权限；固定竞品共享query研究既有依据，不新引入竞品代码。前端沿用已读Apple设计原则：同现场身份、查看不隐含供给、状态可理解、渐进披露与连续性，不新定色彩/布局/动效。原正式Apple工作站整体仍待后续任务。

目标：原“查看本轮供给”先按现有规则保存脏草稿，成功后用同源GET /kont/worksites/<一次编码id>/preview取seq与preview。移除该动作里手写的materials筛选；左侧材料选择等既有编辑规则不重构。服务拒绝或返回不符时显示可理解的预览错误，不降级成本地猜测结果。

一致性：结果只在当前活动现场仍为请求id、请求仍最新、客户端仍存活、未正在刷新/写入/错误、请求后的本地草稿未变时显示。响应seq必须等于请求核对的当前workspace seq；较旧/较新均要求刷新核对，不混合不同时刻的界面与供给。一次请求只有一个GET；不付费、不重试。切换/刷新/开始写入/草稿编辑/替换请求/卸载立即清旧预览与错误并取消请求，迟到/忽略abort的响应仍被拒。等待与失败不展示旧正文，适用窗口/卡片/图标；收起不停止真实Run。

可维护性：优先在既有client/provider中用少量具名请求/失效函数和临时UI状态实现，不复制业务供给规则或store，不新建通用异步框架/DSL，不扩文件inventory。错误仅显示固定可读信息，不泄露后台原文。尽量沿用既有React hooks/模块加载接口；必要新产品模块需先向根报告后确定范围。

允许：packages/dsh-plugin/src/client.cjs、tests/worksite-preview-client.test.mjs、受影响tests/run-panel-client.test.mjs/tests/runtime-draft.test.mjs，另批准tests/helpers/workstation-client-fixture.mjs共用实际built factory/hook/注册语义检查；只因兼容测试seam变化而必要修改旧测试，其余必要helper先报告。scripts/build.mjs原则不需改，新产品文件不预授权。根写任务/状态/API文档。后端024源码、025清单、旧候选与在用软件不改。

验证：直接调用注册组件/请求函数/hook seam作语义检查，不模拟点击或截图。测编码id/同源GET、脏保存先后及失败零GET、两现场隔离、刷新/seq漂移/新草稿/出错/取消/卸载/乱序保护、等待隐藏旧内容、可理解错误。以实际build后的client.js factory组合验证依赖与注册；相关run面板/draft/client bundle/024服务回归。保持历史旧25真实pin可读，新26inventory不变，无正式根候选声明。

分工：workstation_maker制作并自测；独立Checker不参与产品制作，自有程序化验证与人类维护性复核；根Gate/入档。证据evidence/local/20261025-worksite-preview-client，archive_id=kont-worksite-preview-client-20261025。当前ACCEPTED_LIMITED；不把客户端语义树/hook检查当ReactDOM/视觉/人的正式体验或真实桌面部署。

独立结论ACCEPT_SHARED_PREVIEW_CLIENT_CONSUMPTION_LIMITED，无阻断。build退出0，20相关＋3自有＝23/23，无失败/跳过。10冻结记录（client/newtest/runtime-draft/helper4制作文件＋1生成bundle＋5报告日志）一致；024/025冻结记录、旧014真实pin25、当前26清单保持。

代码维持少量具名loadWorksitePreview/invalidatePreview、一个generation/AbortController，后端投影唯一，不新框架/业务store/依赖；先保存、严格身份/seq/draft、清旧及拒迟到独立通过。mutate只按捕获的已保存文本清dirty，保留保存中追加的新草稿；自有验证第二次POST确实保存该新文本。组件cleanup与plugin dispose分开、响应JSON延迟也核请求身份，取消不单靠abort。新preview读取失败使用固定信息；既有workspace保存错误处理不在本卡重构，不能声称全站错误都已收敛。

七格收口：目标＝已有供给预览动作消费后端共用契约；回收＝Maker冻结与独立Checker完成；证据＝AK与WORKSTATION-026-INDEX；验收＝源码/生成bundle/组件语义限定接受；入档＝kont-worksite-preview-client-20261025；记录＝本卡/STATE/QUEUE/API文档/回执，无真实root提交推送合并；未决＝正式发布候选、在用桌面更新、ReactDOM/正式Apple体验与真实Run仍待后续任务。无生产/模型/系统变更。
