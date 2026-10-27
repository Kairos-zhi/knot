# KONT-WORKSTATION-033 · 现场资源库唤出与复用

2026-10-26；Maker候选，独立Checker和根Gate另记。archive_id=`kont-worksite-library-20261026`；检索键：W5、G3、现场资源库、唤出、同对象复用。

目标：把已有现场列表变成可辨认、可接续的资源库入口。每条显示标题、保存的呈现状态、该现场实际供给数量和草稿状态；唤出展开原现场，保持身份、布局、供给和运行归属。

既查：锁定的 `evidence/local/20261026-roadmap-handoff/roadmap.md`、development-plan、design-principles，以及源包 `docs/product/interaction.md`、`docs/design/system.md`、`docs/architecture/state-and-persistence.md` 为产品依据。源包路径为 `C:/Users/x2270/Documents/Codex/2026-10-17/knot-accepted-core-publish`。旧app按 workspace/workstation/presentation/launcher/Worksite/Workspace 文件名检索，只命中 `src/services/workspace-state.ts`；当前客户端已有列表、三态切换、供给预览和RunStatusPanel，没有独立资源库组件。未据此声称全域没有设计。

复用／适配：沿用 frozen Workspace reducer、唯一 `KontStore`、客户端provider的 `mutate`、草稿保存和错误屏障；不新增后端命令。后端参照已审 RESEARCH-002 稳定对象／身份复用机制，本卡只复用已存在内核，不引第三方代码或新竞品行为。前端按既有Apple系统组织、资源库、连续性和渐进披露决定，保留原中性色，焦点沿既有 #ff9500 候选；未机械搬旧尺寸或红绿灯。

最小改动：普通具名函数选择同现场首个未关闭呈现，若无则首个已关闭呈现；唤出同批提交 activate + presentation.update(window, closed:false)，无实例才分配全局避碰的稳定ID并open。旧三态按钮复用同一生成函数。标题切换仍只activate。摘要不递归历史来源、不估计running；busy/error时注明已保存快照待核对。本页未保存草稿单独标记。

允许文件：client.cjs、style.css、生成lib/client.js、worksite-library-client.test.mjs、本任务卡及docs/api/worksite-library.md；Maker证据仅写 `evidence/local/20261026-worksite-library/maker`。根STATE/QUEUE由中控维护，旧回执不改。

自核验：`node scripts/build.mjs`；新10项真实built factory→共用store→关闭重开读回，以及 runtime-draft、run-panel-client、worksite-preview-client、supply-preview-panel、workspace-recovery-client、workspace-response-client、workspace-events-client，合计53/53。覆盖window/card/icon/closed、首个live/closed、多实例不变、ID碰撞、重复唤出、草稿保存／失败保留、供给与agentId隔离、布局保持，无Run写入或取消。直接调用组件回调验证语义，不使用截图或模拟点击。

边界：未ReactDOM/native EventSource/dsh-app实测，未在用安装或人的体验验收；本卡不等于G3整体完成。未文件夹/HUD/工作岛整体交付，无模型/系统/生产profile/用户数据/凭据操作，无分支、stage、commit、PR、push、merge、正式候选。原032精确50文件/48稳定hash计划因本卡源码变化失效，需重审，旧冻结证据保留。

七格收口：目标见上；监听回收无新监听机制，沿030订阅；证据见Maker manifest与日志；验收待独立Checker和根Gate，Maker不自验收；入档本卡和本地证据；记录仅本地候选；未决为真实宿主及人的体验和其余G3范围。
