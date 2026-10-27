# KONT-DESKTOP-022 · 失败保全后的单次后续执行方案

来源：之2026-10-25要求继续；020已独立关闭为CLOSED_FAILED_INSTALL_PRESERVED，021仅修复store兼容候选。旧descriptor928f...77a9及reserved／transport／uncertain永久保留，初始执行器不因修复自动恢复权限。

目标：制作可独立复核、待新明确人类许可的后续单次执行方案。此卡只开发与synthetic隔离测试，不生产prepare／批准／安装／启停／付费调用。通用“继续”不作为再次生产安装许可。后端复用原官方manager、018预检、019稳定占位／私有permit，前端无变动。

最小范围：live_runner_maker制作scripts中独立后续计划helper及tests，必要适配desktop-install-execution.mjs；021先冻结，避免并改quiescent。固定parent928f、原三记录hash／错误日志hash／020独立复核、021实现与独立复核pin；后续计划须fresh018无原锁、原profile／data／旧12／store映射重新核对。固定parent处先wx并sync唯一child链接，稳定child绑定修复与和解证据，不靠换namespace／随机requestId获得重试。原门保持拒重。

测试：无和解／假记录／文件漂移／非失败／超时未定／未知parent／无新许可／过期／变更spec或修复hash拒绝；并发与跨实例只有一条parent→child／一次dispatch；child失败或不确定仍永久保留；私有permit、synthetic不能进入生产规则保持。只在新建D:/Temp隔离根进行官方离线／禁脚本测试，核25项字节及无生产接触。若不能满足以上条件先报告，不临时删标记或开放通用重试。

分工：Maker与独立run_checker分离；根负责卡／索引／Gate／收口。archive_id=kont-desktop-reconciled-attempt-20261025；证据evidence/local/20261025-desktop-reconciled-attempt。本卡通过只代表已审执行能力，生产授权仍须在具体方案审完后单独取得。

实现：新增prepareReconciledDeploymentApproval，原initial API及928f稳定descriptor继续拒重。固定helper核020三ledger／失败日志／独立失败Review、021实现与独立Review、原profile／data／store映射；022纯源码摘要动态绑定且执行前重核，最终022 Review留在外层，避免循环pin。继承fresh018／016旧12源与数据fence。父固定路径remediation.claim先wx+sync，随后child claim；任一步失败、超时、回执遗失均不清理／续发。私有permit消费及transport最后授权检查同步核父link／子claim字节摘要。

残留操作检查：官方.plugin-manager/run.json存在即拒，package.json.lock仅为额外保守存在拒绝（不宣称官方锁）；只读CIM计数官方bundled node运行官方pnpm路径，枚举失败也拒，原命令行不输出。该计数是瞬时检查，非跨进程事务锁，实际安装继续依赖官方manager自己的操作控制。

Maker核验：A新4＋旧5通过，B真实官方隔离1项通过；B在既存file/link／store profile下6并发仅1实际安装、25文件逐字节一致、原三parent记录及其他依赖／选择保持，重建与新Electron进程拒重。A新测试清理路径已补resolve／dirname／prefix校验再递归删除；A最终manifest5f3a050f...5d89f9，B d308955f...2012cb。018与资格在执行测试中明确mock，不据此宣称生产fresh018成功或已安装。

独立核验：20／20冻结项一致，focused10／10；另helper真实逻辑FS替身基线与11种资格拒绝、实际生成PowerShell谓词5分类均过。分拆实际只读helper核固定失败／修复／profile／store及writer0，旧三ledger保持、生产父successor仍无；没有fresh018／生产完整prepare／human grant／安装／启停。原021两修复源保持，022新增执行源另列hash，不混称旧全体实现未变。

具体方案：AG/controller/reviewed-proposal.json（proposal-only），稳定child SHA=1da1b0dc0adf0a3bac2840113dc9e149e731e9ceac633b26e38757e053ae5df4，独立AG/checker/proposal-review.json另核纯计算算法／字段顺序／当前pins一致。未签grant或落父子占位。新许可后正常退出、fresh018完整prepare须精确生成该hash，任一漂移不得安装。当前无调试普通Desktop仍开着；官方窗口close处理会收至后台，不可把关窗口当退出；执行前应从软件／托盘菜单正常退出，不能强杀或模拟点击代办。未来启动临时调试观察与最终无调试普通打开分别记证据。

七格收口：目标＝固定020失败的唯一已审后续能力；回收＝A／B及独立Checker齐；证据＝evidence/DESKTOP-022-INDEX.json及AG/checker/final-review.json／proposal-review.json；验收＝ACCEPT_FIXED_PARENT_SINGLE_SUCCESSOR_CAPABILITY_LIMITED，无阻断，仅执行能力；入档＝本卡／STATE／QUEUE／AG/controller/receipt.json与具体proposal；记录＝本地提交，无生产新授权／后续安装／模型／push／合并；未决＝新明确人类许可、正常退出、fresh精确child、真实manager／25项已装及重启active／renderer／人的体验。父子不是跨文件原子事务，超时不是取消，不清任何占位，不开放grandchild。
