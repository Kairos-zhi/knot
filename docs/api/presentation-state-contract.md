# 主区登记呈现契约

041主区呈现内容只引用当前现场的first-live登记实例，即Workspace.presentations数组中首个worksiteId匹配且closed=false的对象。它的kind决定window/card/icon，且data-presentation-id只标在该呈现内容上。数组顺序不是完整多窗Focus产品实现。

无live时mode为null：从无实例显示“尚未唤出”，仅closed实例显示“呈现已关闭”，资源库采用同一文案。主区不默认window、不显示window材料checkbox／添加表单，三个mode按钮aria-pressed全false。渲染、挂载、标题activate均不自动open或重开实例。

“展开／卡片／图标”保留旧短label，其可访问名称和邻近文字明确是显式唤出动作、使用现场人类标题。调用原worksitePresentationCommand：优先first-live；否则复用first-closed并closed:false；没有任何实例才分配稳定避碰ID open。已有ID／layout、供给／草稿／Agent／Run归属保持。没有新增关闭／删除／widget动作。

HUD继续位于columns第二子且固定worksite-hud key，未唤出或closed状态也能编辑／保存／查看本轮供给。040 Run详情及同epoch产物inspector是独立检查内容，不受window条件控制；它们不带data-presentation-id，不等于重开window，也不取消后台运行。

busy/error显示保存快照待核对；按钮沿现请求屏障。程序化验证包含无隐开、显式复用、数组first-live、持久重开、HUD与独立inspector，但不代替真实ReactDOM／焦点／输入法／宿主或人的体验。
