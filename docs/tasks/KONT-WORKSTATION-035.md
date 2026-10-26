# KONT-WORKSTATION-035 · 工作岛概览与返回现场

2026-10-26；Maker候选，独立Checker／根Gate另记。archive_id=`kont-work-island-20261026`；检索键：W5、G3、工作岛、Run归属、返回现场。

目标：人在当前现场之外也能看清已有运行记录归哪个现场、处于已证实的哪一阶段，并返回同一现场继续工作。不增加运行或取消入口。

既查：上下AGENTS、development-baseline、当前STATE/QUEUE、034独立回执、锁定roadmap／development-plan／design-principles；原包docs/product/interaction.md工作岛段要求活动有Run证据、无百分比不伪进度、点击回原现场。原包根 `C:/Users/x2270/Documents/Codex/2026-10-17/knot-accepted-core-publish`。现有createRunStatusSource已单次GET /kont/runs读取全局DTO；RunStatusPanel只筛当前现场，已有createRunStatusView拥有唯一四phase文案，033已有同对象唤出，034已有唯一HUD。

复用／补缺：WorkIsland为普通纯组件，消费现有runState并按Workspace身份分组；每组阶段文案／数量来自createRunStatusView，未重建phase映射。返回复用033 worksiteRevealCommands+现mutate，先保存dirty再activate+presentation复用window。RunStatusPanel仍负责当前现场细节与产物定位，HUD位置在其原columns内保持。后端沿既有RESEARCH-002稳定身份／已接受运行只读投影，无新协议或第三方代码。前端按既有Apple工作岛、可回现场、渐进披露和连续性，不全局换肤。

事实边界：标明当前核对快照；busy/error、source指针失配／seq落后均中性提示刷新并隐藏分组，不把无数据说成完成。成功空查询显示暂无运行记录；未知归属保留记录并明确待核对、禁止导航，不猜归属。四phase之外的失败／取消未建模，不假装支持。

允许域：client.cjs、style.css、生成lib/client.js，新tests/work-island-client.test.mjs、本卡、docs/api/work-island.md。根明确追加唯一测试seam：tests/helpers/workstation-client-fixture.mjs可选options.runResponse为DTO输入，仍经原renderer realm JSON.parse，旧onRequest优先与默认行为保持。无产品校验放宽。Maker证据仅evidence/local/20261026-work-island/maker；制作前59路径完整hash在baseline.json。033／034原冻结证据不改。

自核验：build退出0；新7项built factory和临时KontStore synthetic准备Run验证，及7个相关入口合计53/53；git diff --check退出0。覆盖同源全局概览／无新增fetch、四phase、跨现场返回／dirty／呈现layout／供给／Run保留及重开、unknown归属、分域key碰撞、busy/error／迟到源、成功空态。无截图或模拟点击。

边界：本卡不证明后台托管可靠性、实时推送、实际ReactDOM/native EventSource/dsh-app或人的体验，不等于G3/G4/G5完成。无模型、生产profile／用户数据／凭据／Session、系统软件启停安装、branch stage commit PR push merge／正式root候选。032旧清单仍须重审。

七格：目标为跨现场运行归属与返回；监听回收沿现source／030无新增监听；证据见manifest／日志；验收待Checker／Gate不自验收；入档本卡及本地证据；记录仅本地候选；未决为真实宿主、人验和其余W5范围。
