# RUN-012 独立复核

r2结论：**ACCEPT_RUN_QUERY_VIEW_LIMITED**，无剩余阻断。2026-10-24 复核，沿用 20261023-run-query 证据目录。Checker 未修改产品代码。r1 的 P2 身份兼容拒绝及原日志保存在 r1；identity-boundary.json 为修复前实证，不表示 r2 仍失败。

两线最终 manifest 共 13 项逐字节/hash 匹配。独立 build exit 0；初轮同范围 query 3、原 protocol 4、生命周期 1、view 3，共 **11/11**。B-only r2 后独立重跑 view **4/4**，另有自有集成及认证负例 **2/2**（加入原合法换行身份回归）。A 8 项产品和测试未变，未重复运行。最终不同聚焦项覆盖 A8+B4=12，不是单次全量计数。无跳过，未跑全量。

r1 查到 Run 允许内部 control 身份而 view 另加 grammar 的不兼容；r2 只移除隐藏 opaque 引用的额外 control/长度限制，保留必要非空字符串、精确八字段、状态/hasOutput/blockId 一致性与 getter 拒绝。实际 projectRun→view 合法 control 身份已通过，ID 不进入可见文案，不取得路径或执行权限。

源码和实测共同确认：原 caller 认证先于查询，未认证的 list/detail/畸形编码请求均在 store.read 前拒绝；沿用 Host/Origin/loopback fence。方法只允许 GET，详情单次解码，畸形编码安全 400、未知/多段路径 404，不回显正文。八字段投影不包含 prompt、供料、审计、grants 或 dispatch controls。查询不改持久字节、不新增事件；原路由与 Cordis 生命周期聚焦回归通过。

projectRun→createRunStatusView 实际集成覆盖 prepared、submitted、reserved/uncertain→uncertain、completed；只读取 RUN-011 已保存记录并在内存构造状态，不创建 executor 或模型。submitted 明确未证实 running；uncertain 不建议重发；非法或矛盾 DTO 拒绝。completed/hasOutput 来自成功 receipt，outputReference 只是历史定位，不保证当前资产或块仍在，定位时仍需内核解析。

B 已查现有设计基准与旧 client，给出接入说明；当前交付只有纯 viewmodel，没有 UI/client/CSS 改动，也没有人的工作站体验验收。没有新模型请求、在用 Desktop 部署、真实用户 Session/凭据读取或执行授权。新增查询属于 Knot 扩展，旧冻结协议 5/16 口径不变；不据此接受完整产品。

证据：hash-check.json、build.log、focused.tap、integration.test.mjs、integration.tap、final-review.json。
