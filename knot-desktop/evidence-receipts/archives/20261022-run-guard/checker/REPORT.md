# RUN-008 独立复核

结论：`ACCEPT_EXECUTION_GUARD_LIMITED`，无本卡范围阻断。独立构建通过，按Maker同范围聚焦 **5/5通过**，失败0、跳过0；3份冻结候选哈希一致。未跑全量。

直接审查并通过实际官方0.2.1 Electron隔离worker确认：保护安装在Agent setup；默认拒绝，四元身份/input与固定provider/model/maxTokens核对，prepared新Session首turn/step、准确user-rpc、tool-free assembly与输出、最多一次Agent层llm.stream。同步AsyncIterable签名及await next的请求／assemble签名实际运行通过；LLM carrier同时按sessionId和currentInitiator过滤，兄弟Agent不误伤。错误重试、额外turn和直接绕过Agent请求的LLM调用均受拒绝。

取消／显式dispose关闭保护并取消Agent、等待whenIdle；拒绝钩子保留到Agent作用域结束。实际测试确认取消后的留存LLM引用拒绝、取消／卸载后留存Agent引用不再触发synthetic provider，兄弟仍可单独运行。本次worker只有内存synthetic adapter总6次，真实模型0，无持久Session、默认profile或凭据。

限定：这是未接apply／公开dispatch入口的受控Agent保护候选，不是执行授权。仅约束Agent层再次request/stream，**一次llm.stream不证明Provider内部HTTP只请求一次／无重试**；其他受信宿主插件直接调用adapter不在保证内。完整上下文请求指纹、真人身份、金额预算／成本授权、持久dispatch防重与终态资产回流未接；maxTokens只是固定请求参数，不是金额预算。无真实模型Run或在用Desktop部署／产品接受。

证据：build.log、focused.tap、hash-check.json。Checker未改产品代码，未全量／全库重查，未安装、push或合并。
