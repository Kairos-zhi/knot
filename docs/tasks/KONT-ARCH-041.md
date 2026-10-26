# KONT-ARCH-041 · 登记呈现与主区语义

2026-10-26；Maker候选，独立Checker／根Gate另记。archive_id=`kont-arch-presentation-20261026`；检索键：ARCH-04、first-live、呈现已关闭、尚未唤出。

目标：主区呈现必须来自登记实例，不能在所有实例关闭或从无实例时虚构window。保留有意常驻HUD和独立Run检查，不把关闭实例当停止运行。

既查：历史ARCH-04 finding、当前client、033资源库／选择策略、034HUD、040跨版本定位与当前Gate。原Checker和根先核TASK方向，040 Gate后正式开工保存完整90路径baseline；不是重开新功能或自验收。

实现：当前现场取数组first-live，mode无live为null；仅在columns第一子呈现内容给data-presentation-id，HUD与独立inspector不带。无live显示“尚未唤出”或“呈现已关闭”，材料checkbox／添加表单不显示、三mode pressed全false；库与主区同文案。原短label保留，可访问名称用人类标题说明唤出为窗口／卡片／图标，邻近文字说明显式动作；busy/error标保存快照待核对。

三mode动作复用033 worksitePresentationCommand：首live更新、否则首closed重新打开并保留ID／layout、全无实例stable避碰open。render／mount／标题activate不隐开。多live仍只选数组first-live，不宣称完整多窗Focus系统；没有新增close/delete/widget或后端schema。

HUD仍columns第二子、同key／唯一区，040 Run详情／独立产物inspector不动位置和epoch契约。当前闭合只区分呈现与工作目标，不禁止未唤出时HUD编辑或读历史运行。

允许修改client.cjs／生成bundle，无CSS；新tests/arch-presentation-state.test.mjs及本任务/API。本卡唯一旧fixture为获批workspace-recovery-client base补one现场live window，原窗口操作失败／材料输入断言全部保留；反向仅还原该行后hash等于原baseline，证明无其他改动。其余旧tests／source/helper/backend/039040源与证据不改。

自核验：build0；13个明确相关入口84/84（新6）；git diff --check0；90基线中允许产品／控制／fixture之外85项字节全保持。actual built factory→临时真实Store／重开覆盖无实例／全closed、无隐开、显式三mode复用／stable碰撞、first-live、多对象／供给／Agent／Run守恒、HUD固定位置、无live时同epoch独立inspector、pending／失败快照屏障。

权限：无模型／生产profile用户数据凭据私人Session／系统启停安装／branch stage commit PR push merge或正式候选；不代表ReactDOM／原生宿主／键盘焦点输入法／人的体验或G3/G4/G5完成。

七格：目标为ARCH-04语义闭合；监听回收沿现provider/source；证据见manifest／日志；验收待独立Checker／根Gate；入档本卡和本地证据；记录本地候选；未决为ARCH-05及旧reader／发布债和真实体验。
