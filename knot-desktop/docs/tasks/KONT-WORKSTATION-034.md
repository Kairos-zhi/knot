# KONT-WORKSTATION-034 · 同现场HUD连续输入

2026-10-26；Maker候选，独立Checker／根Gate另记。archive_id=`kont-worksite-hud-20261026`；检索键：W5、G3、HUD、三态、连续输入。

目标：窗口收成卡片或图标后，仍能在同一个HUD看清目标现场、选定材料、Agent标识与草稿，继续编辑、保存和查看供给。原来整个compose在window条件分支中，收起就失去输入区；本卡补这一产品缺口。

既查：读当前STATE/QUEUE及033独立回执；锁定路线的W5/G3和design-principles；原包 `docs/product/interaction.md`“输入与多轮连续性”规定HUD显示目标现场、Agent、草稿和实际选材，切换窗口保留状态；同页规定呈现不改变供给和运行事实。设计沿 `docs/design/system.md` 连续性／渐进披露，不全局换肤。源包根为 `C:/Users/x2270/Documents/Codex/2026-10-17/knot-accepted-core-publish`。已核旧app工作站相关文件检索与当前033实现，复用现有Workspace／provider，不另立HUD数据源。

后端依据与复用：沿既有RESEARCH-002稳定对象／身份复用机制和已接受024纯供给投影；本卡不增加后端机制、命令、第三方源码、模型调用或运行入口。供给选择仍是当前现场checked且非excluded的实际资产。

最小实现：提取普通无state纯组件WorksiteHud，固定在kont-columns第二个位置、固定key=`worksite-hud`；三态仅替换第一个材料区。HUD复用唯一draft map、mutate、loadWorksitePreview和SupplyPreviewPanel。目标标题和真实agentId投影，不猜名称／在线／可调用；仅null明确未选择；缺失／空白／非字符串显示选择待核对。材料标题默认details收起；busy/error注明保存快照待核对。

允许修改：src/client.cjs、style.css、生成lib/client.js；新tests/worksite-hud-client.test.mjs、本卡和docs/api/worksite-hud.md；Maker证据仅写evidence/local/20261026-worksite-hud/maker。033冻结证据与根中控文档不改。制作前55路径全部hash记录于baseline.json。

自测：build退出0；新6项真实built factory→临时KontStore，包括三态唯一HUD／稳定树位置key、持久关闭重开、compact输入与共用preview、跨现场草稿／供给／Agent、保存失败屏障、pending较新草稿保留；另8个相关入口共55/55，git diff --check通过。直接调用组件回调验证程序语义，不使用截图／模拟点击；未宣称真实ReactDOM焦点或挂载体验。

限制：不等于完整HUD或W5/G3、G4/G5接受；真实ReactDOM/native EventSource/dsh-app／在用部署／人的体验仍待验。无模型发送、生产profile／用户数据／凭据／Session／系统启停安装／stage commit PR push merge／正式root候选。032旧50/48提交计划仍需重审。

七格：目标为三态连续输入；监听回收沿既有030源无新增机制；证据见Maker manifest及日志；验收交独立Checker／根Gate，不自验收；入档本卡与本地证据；记录仅本地候选；未决为宿主／人的体验及其余W5范围。
