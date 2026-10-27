# KONT-RUN-046 · 显式对账已占位 Run 终态

2026-10-27；MAKER_CANDIDATE_PENDING_CHECKER。根/Checker修订预核后开工，基线d59bcf29de1aeae80528357c0b48e80c62c322f8，codex/run-reconciliation-046，复用controller917 tracked基线；不得自验收。

原observer只有只读摘要，HTTP Run也只有GET。新增显式reconcile与窄POST，在原读许可外要求独立exact写grant，默认deny；旧observe与grants不自动回流。共享一次精确读取/验证，close成功后走原同Store.returnRun，不新增Run权威/终态schema、模型调用或重提。

prepared的三种claim状态均可显式核对；submitted取消残留不被假改uncertain。completed只同许可幂等读原投影，不重新读Session或声称重验。原owner/signal/claim/binding入队前重核，队列后同claim相位变化按受理语义处理；目标CAS/幂等/单产物沿原Store。read-close取消/close失败0return，writer阶段取消0commit（提交前）；已经原子提交不反写撤销。

改动仅4产品源dsh-run-read/run-observer-binding/read-audit-config/index；新增run-reconciliation.test与task/API。明确获准适配旧store-recovery-roundtrip.test的完整d59 A13+3script来源，保全部原assert/017pin，新增真实current源码被旧044工具拒绝的负例。Store/run/executor/query/UI/库存、旧固定pin工具和045正式候选保持。

新测试覆盖三态成功/单块/持久重开、双许可/指纹、submitted未完成与context交集拒绝、入队竞争/目标CAS、abort/dispose/HTTP断连、真实apply默认拒绝与enabled同owner回流。一次build成功，10文件70项focused通过；新测试补强route mismatch/摘要域区分断言后仅复跑新文件12/12（产品未再变）。均为临时Store、synthetic persistence/Session seam和专用Node子进程；未读取真实Session/模型/生产或启动桌面。

已知边界：replay指纹不是executor request摘要，不能证明模型执行授权；仅原observer与returnRun验证交集的completed日志可回流，额外runtime-context user仍拒绝，原claim相位保持；不是全部故障终态闭环。旧044测试现在是显式历史d59回归，新source仍按旧硬pin拒绝；043七数据文件不含四修改源，保留其原契约。

证据在evidence/local/20261027-run-reconciliation/maker。待独立Checker/根Gate；无生产/profile/凭据/Session、模型、在用安装/系统、Git mutation或新正式候选。
