# RUN-011 runner Maker

范围仅scripts/run-flash-verification.cjs与tests/run-flash-wire.test.cjs。复用官方0.2.1 DeepSeekAdapter，未改核心gate/executor/guard。最终HTTP字节策略逐项绑定已核准的完整system、user与developer文本、model/output限制，禁止未知扩展、非文本、assistant历史、工具、userinfo/query/hash与其他目的地。该窄试跑拒绝晚于user的system snapshot，不声称支持任意对话历史。generationPosts在首个await前同步消耗，第二POST拒绝；审计写入后再核AbortSignal。异常仅输出固定code，不输出HTTP/provider raw异常。凭据桥仅readRecord既有deepseek-account-platform/default，不允许写入、刷新或登录。

离线4/4通过：完整内容与变更、空许可/重放/取消/字节限制、目的地约束、实际官方DeepSeekAdapter.request序列化的拦截fetch。最后一项无网络、无凭据，执行真实serializer而非自制provider。另运行Electron --check只读既有账户本地记录，确有check-only/generationPosts=0输出，保守费用上界2.0992 CNY。修正Electron入口require.main未设置时曾静默不执行的问题；检查入口现在同时核对argv绝对路径。

没有执行--execute-authorized-once，没有真实生成POST，没有修改Desktop/profile/ASAR/凭据，没有账单结算证明。需独立Checker及根Gate通过后由根唯一实际请求。
