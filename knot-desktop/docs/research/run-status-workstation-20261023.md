# RUN-012 工作站状态接入点

本轮只交付共享 Run 查询之上的纯展示模型，尚未接入或验收 UI。既查已读本仓 `docs/development-baseline.md`、`packages/dsh-plugin/src/client.cjs`，并沿登记路径读取 accepted-core 的 `docs/design/principles.md`、`docs/design/system.md`、`docs/research/apple/README.md` 与 `docs/history/2026-09-28/ipados-direction.md`。读取范围为这些现行设计基准与 Apple 索引／定调，未重新阅读九篇历史全文，无需采用具体视觉参数。

现 client 已有现场、材料供给、草稿和 window/card/icon 连续呈现，但没有 Run 状态消费；继续扩写旧表单不能解决真实活动可读性。复用现行“工作在前，工具在后”“同一对象，多种呈现”“状态先可靠，动画再增强”；不新增色彩、尺寸、布局或运行动画。Apple 对标落实到同一现场／目标／产物可定位和渐进披露，不以模糊材质或装饰模拟运行。

`createRunStatusView(projectRun(dto))` 消费共享查询的八字段 DTO：runId、requestId、sessionId、targetId、worksiteId、phase、hasOutput、blockId。四状态为待运行、已提交、待核对、已完成。已提交不证明正在运行；待核对明确不可重发；已完成仅在 hasOutput=true 且存在 blockId 时给出产物引用。非法或矛盾 DTO 直接拒绝，调用方应保留原错误状态并请求只读刷新，不能降级成“待运行”。

后续工作站在当前现场的工作内容旁显示 label/detail/nextStep；targetReference 与 outputReference 交给既有对象定位能力，标题经已有资产读取解析，不把调试 ID 当标签。completed.hasOutput 仅表示持久回执记录曾生成产物，不证明当前目标或块仍存在；现内核定位时再次解析，若被人工编辑或删除，应保留完成记录并说明位置已失效，不能自动重建资产或重发模型。window/card/icon 使用同一投影，不建立第二份运行 store。查询错误、目标缺失或切换现场时不得凭旧画面宣称正在执行；详情可按需披露协议证据。nextStep 仅为阅读说明，不构成执行按钮、重试许可或付费授权。模块不推算费用、不增加权限、不读取历史正文。

本轮以新模块程序化单测核验文案事实边界、目标连续性和矛盾拒绝；未修改 client/CSS、未截图或模拟点击、未调用模型、未部署。完整工作站的尺度、焦点、键盘、真实体验仍需后续独立任务与之过手。
