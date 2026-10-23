# RUN-012 独立复核

r1结论：**REJECT_P2_IDENTITY_CONTRACT_PENDING_R2**。先前暂定通过已撤回：合法 requestId 内部换行可经 projectRun，但 view 拒绝；见 identity-boundary.json。等待 B 窄修，原独立测试通过记录仍有效。2026-10-24 复核，沿用 20261023-run-query 证据目录。Checker 未修改产品代码。

两线 manifest 共 13 项逐字节/hash 匹配。独立 build exit 0；同范围 query 3、原 protocol 4、生命周期 1、view 3，共 **11/11**，无跳过；另有自有集成及认证负例 **2/2**。未跑全量，不增加全量测试总数。

源码和实测共同确认：原 caller 认证先于查询，未认证的 list/detail/畸形编码请求均在 store.read 前拒绝；沿用 Host/Origin/loopback fence。方法只允许 GET，详情单次解码，畸形编码安全 400、未知/多段路径 404，不回显正文。八字段投影不包含 prompt、供料、审计、grants 或 dispatch controls。查询不改持久字节、不新增事件；原路由与 Cordis 生命周期聚焦回归通过。

projectRun→createRunStatusView 实际集成覆盖 prepared、submitted、reserved/uncertain→uncertain、completed；只读取 RUN-011 已保存记录并在内存构造状态，不创建 executor 或模型。submitted 明确未证实 running；uncertain 不建议重发；非法或矛盾 DTO 拒绝。completed/hasOutput 来自成功 receipt，outputReference 只是历史定位，不保证当前资产或块仍在，定位时仍需内核解析。

B 已查现有设计基准与旧 client，给出接入说明；当前交付只有纯 viewmodel，没有 UI/client/CSS 改动，也没有人的工作站体验验收。没有新模型请求、在用 Desktop 部署、真实用户 Session/凭据读取或执行授权。新增查询属于 Knot 扩展，旧冻结协议 5/16 口径不变；不据此接受完整产品。

证据：hash-check.json、build.log、focused.tap、integration.test.mjs、integration.tap、final-review.json。
