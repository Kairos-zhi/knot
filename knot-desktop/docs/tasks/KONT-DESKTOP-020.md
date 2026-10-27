# KONT-DESKTOP-020 · 获授权安装与正常打开

授权：根在019收口后明确询问“安装已审升级包，并正常打开桌面验证，不调用模型”，之直接回复“我授权”。本次许可仅用于已审014升级候选、绑定017恢复候选／固定数据hash的初始升级一次，随后正常打开官方Desktop；不自动恢复或重试、不调用模型、不推送／合并。

基线4b818873893ce5d32b2f3d6cd7a88e657c4178fd；稳定descriptor928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9。014 a1f00e43...1755a8、017 774c5c1d...994b42d、现场e0359bb6...c79ac及原profile074125fa...d5283已由run_checker独立只读核对；原installed12源匹配、Desktop进程0、原锁及human claim/transport/result均无。旧证据／签名应用不修改。

执行分工：根为唯一真实approve／execute与软件启停操作者，复用019已审门，不手写生产profile；run_checker只读预检与事后独立复核，不可重装；live_runner_maker仅准备固定只读runtime观察脚本，不安装／启停。maker/checker分离，实际运行证据不等于人的体验接受。

路径：新鲜018私副本预检及descriptor再次精确核对→私有explicit-user-approval声明（保存hash，非身份认证）→wx持久占位／再次fence／单次permit→quiescent官方manager一次安装。正常结果核25已装字节与profile中非Knot依赖／选择保持、现场原hash；若失败／超时／不确定，保留占位和诊断，不删除或重发，先核实际文件状态。只有确认可正常打开时再启动官方Desktop。

运行验证优先服务／程序化：必要时临时loopback调试启动，固定只读manager与renderer注册回执、GET snapshot/runs只输出schema／seq／计数／DTO形状，不输出正文或ID、读取凭据／DSH Session、截图或模拟点击。临时调试验证后用官方正常退出，再普通无调试打开，分别登记正常进程／端口／数据持久证据，不能把临时调试当普通启动。

后端复用官方manager／现有Knot数据内核；无新UI，保留既有Apple方向。全产品／人的体验、真实Run／再次付费请求不在本授权。archive_id=kont-desktop-installed-20261024；证据根evidence/local/20261024-desktop-installed。

执行结果：根只调用一次，官方manager changed:false/application:failed，packageExitCode=1，operation-error；持久result为uncertain，claim=reserved及transport标记保留。官方pnpm日志定位ERR_PNPM_UNEXPECTED_STORE：固定私store与既有node_modules记录store冲突。无重试／标记清除／强杀，后续由021独立修复候选。

事后独立复核：run_checker确认旧安装全库存12／12无extra、无候选部分文件更新，profile074125fa...d5283及datae0359bb6...c79ac保持。非Knot依赖声明与持久选择仅由profile整字节保持支持，不外推所有node_modules/cache无副作用。2026-10-25根正常打开未升级官方Desktop，独立读回5官方进程均无debug标志、原数据锁出现；根补普通窗口存在且responding。未连接renderer，未验证新插件active或人的体验。

七格收口：目标＝获授权的一次安装与正常打开；回收＝唯一实际调用、独立预检／失败读回／普通启动读回完整；证据＝evidence/DESKTOP-020-INDEX.json及AE/checker/final-review.json；验收＝CLOSED_FAILED_INSTALL_PRESERVED，任务关闭但升级未接受；入档＝本卡／STATE／QUEUE／AE/controller/receipt.json；记录＝仅本地提交，无模型／push／合并；未决＝021修复及后续已审单独执行路径、25新文件安装与active/renderer验证。原reservation永久保留，不用重建plan或换id绕过。
