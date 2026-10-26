# KONT-WORKSTATION-027 · 可复用供给阅读区

日期2026-10-25。之“持续推进”承接026，沿用后端人类可维护标准与Apple连续性/渐进披露。本卡只开发及程序化验证，不部署/模型/系统/生产数据/真实root提交推送合并。

既查：治理基准、024–026回执与API、现client预览内联段/build、既有设计原则及style.css、Block模型（manual/generated与provenance[]）、hook/factory测试。后端共用query和运行链均保持，固定竞品共享控制面研究无新采纳；本卡只负责读取呈现，不复制供给判断或加载linked来源。

最小目标：把原供给预览内联片段提为一个具名纯呈现组件SupplyPreviewPanel（可在既有client.cjs导出，不新增产品文件），由Workstation消费。它不取数、不保存、不改选择、不执行；状态/生命周期继续归026 provider。props明确worksiteId、preview、loading、error；身份不匹配、等待、错误或不可读数据不渲染旧正文。

内容：保留草稿/材料标题摘要/空供给说明；明确材料数量，每材料使用原生details/summary按需展开“查看原文与来源”，展示返回blocks原文、人工/生成来源标签和历史来源记录条数。只说明记录，不把provenance当额外供给、不自动读其他资产；不暴露block/Run/Session等内部ID作标签，不计算token/费用。空块诚实说明，无效块用固定可读错误而非崩溃/静默伪造。内容以React文本节点渲染，无HTML注入。

设计范围：独立阅读组件是正式工作站可复用的窄切片，替换已有预览阅读区，不扩旧编辑表单，不另改色彩/尺寸/布局/材质。复用kont-preview既有样式与原生details键盘语义；无截图/模拟点击验证，不声称完整Apple工作站/视觉/人的体验已接受。

人类可维护性：组件具名、普通分支/映射、明确输入与只读职责，无通用框架/状态副本/新依赖；DTO可读性检查只保护渲染，不再验证后端完整schema/供给权限。client新增导出仍由现build factory打包，文件inventory保持26，无新运行时依赖。

允许：packages/dsh-plugin/src/client.cjs、tests/supply-preview-panel.test.mjs、必要tests/helpers/workstation-client-fixture.mjs/test client相关seam；只有为现pure组件解析所需的测试适配，原026时序断言不得弱化。新产品file/build/style/清单/后端原则不改；确有必要先报根。根负责卡/状态/API文档。

验证：纯组件直接调用和实际built factory/注册组件语义组合；材料顺序/数量/空草稿空供给、完整正文/来源计数、默认details不open、缺/错id与loading/error旧正文抑制、异常blocks、恶意文本不成HTML、无取数或业务动作；相关026时序/草稿/run面板/client bundle回归。语义树若解析函数节点要用可读通用“纯组件展开”测试seam，不硬编码组件名绕过，也不另写一份展示实现。旧014pin与当前26库存可只读确认，不生产打包或安装。

分工：workstation_maker制作/自测；独立Checker自有程序化复核与维护性审查；根Gate/归档。证据evidence/local/20261025-supply-preview-panel，archive_id=kont-supply-preview-panel-20261025。当前ACCEPTED_LIMITED。

独立结论ACCEPT_SUPPLY_PREVIEW_PANEL_LIMITED，无阻断，维护性通过。9/9制作冻结项匹配，build退出0；聚焦20/20（新5＋旧相关13＋Checker自有2），无失败/跳过。026原10项异步断言保持通过；旧014原pin25与当前26清单保持。Maker首轮漏括号语法失败及修复记录保留。官方ASAR依赖解析MODULE_NOT_FOUND，真实SSR未执行；文本节点与默认收起仅由语义树验证，不能外推实际HTML、键盘或浏览器布局效果。

七格收口：目标＝可复用纯供给阅读区；回收＝Maker冻结/独立Checker停写；证据＝AL与WORKSTATION-027-INDEX；验收＝源码/构建/组件语义限定接受；入档＝kont-supply-preview-panel-20261025；记录＝本卡/STATE/QUEUE/API与控制回执；未决＝正式Apple工作站、浏览器/人体验、正式根候选与在用部署。没有生产/模型/系统/真实root提交推送合并。
