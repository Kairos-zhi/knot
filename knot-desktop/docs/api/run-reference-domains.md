# Run 引用域

KONT-ARCH-042 将 Run 继承的 Core 业务引用与 Run 自有身份分开。业务引用判断为字符串且 trim 后非空；判断不改写字面值，不限200字符。input.worksiteId、assetId、conversationId、agentId、targetId、receipt.blockId 使用该规则；后三个 nullable 输入引用仍允许 null。材料 ID、块 ID、provenance 继续由原 Core normalizer 验证，不递归加载历史引用。

runId、requestId、dispatchClaim.claimId、plannedSessionId 继续要求非空且不超过200字符。claim/receipt 对 Run 的等值绑定、provider/model 上限、digest、序列和状态规则保持。真实 DSH Session 点读与 readAudit 配置仍只接受 `^[a-zA-Z0-9_-]{1,200}$` 安全地址。

长 agentId 或 conversationId 仅为 Core 数据引用，不解析实际 Agent、不授权读取对话或 Session、不触发模型。prepare 仍查找实际现场和目标，return 仍以冻结目标 hash 做 CAS。query/view 原有投影直接保留这些引用，无新增 runtime 模块。

Run.version=1、canonical/hash 算法及全部已有摘要字段不变；不迁移、重算或重写旧 Run。新合法输入不承诺旧 reader 或降级可读。

普通 worksite.create 仍将 ID 作为默认标题，超过200字符会被 Store 标题规则拒绝。本卡只覆盖 full Store snapshot 中具有显式短标题的合法长 Worksite；没有截断 ID/用户标题，也未修改创建适配器。

服务测试使用隔离临时 Store 和 synthetic 事件，不代表生产 Agent 解析、真实模型、真实 Session 读回或产品验收。长 receipt.blockId 的用例只验证数据引用/投影；实际回流仍由原 nextBlockId 生成块 ID。
