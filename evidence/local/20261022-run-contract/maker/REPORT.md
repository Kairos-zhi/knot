# KONT-RUN-004 Maker 候选

本卡仅服务层契约实现，尚未独立接受。DSH / Provider / 模型 / cancel / follow 网络调用数均为 0；全部运行日志均为临时目录中的 `synthetic-test` 合成测试。

## 改动与复用

- 新 `src/run.mjs` 复用冻结模型的 `getBlocks`、`nextBlockId`，复用 schema 验证与原 `knot.update` 内部入口。`store.mjs` 沿用单一 writer queue、原子保存、提交后事件，未新增资产库或执行引擎。
- `run.prepare` 是本卡 Knot 扩展命令，不计入原协议具名命令覆盖（仍为 5/16）。调用方显式给 requestId / planned sessionId / worksiteId / targetId；runId 由内核产生，状态只有 prepared，绝不调模型。相同 requestId 与同三引用重放返回旧准备，不重新编译；更换引用则冲突。此去重只在当前 Knot 存储中成立。
- prepared 记录固定现场/对话/agent 引用、draft、供给减排除后的材料、块内容与历史 provenance、材料 SHA256、输入 SHA256、当时 revision / seq、目标摘要、创建时刻。历史来源不递归供给；其他现场不入输入。SHA 采用键排序 JSON 的 UTF-8 SHA256；材料顺序及块顺序保留。
- `dshPromptRequest` 仅构造发布版 `SessionPromptRequest` 的 requestId / sessionId / mode=queue / content(text) 形状，不实现不存在的 afterSeq 接口。序列化内容是本适配器提交的用户 prompt，**不是完整模型可见上下文**。计划 sessionId 不证明 DSH 已创建/存在/安全。
- `returnRun` 是内部服务方法，普通 command/HTTP 不分派 run.complete/return/bind/cancel。未来受信 DSH adapter 必须自己读取真实日志并核验真实性、身份/模型/成本/权限；本方法只能验证给定证据关联，不能验证其外部真实性。目前没有连接 adapter。
- 回流仅接受从 seq0 连续的完整日志、首个且唯一 turn=1、单个匹配 user-rpc、正确 role、实际提交文本、step/turn 顺序、model 来源的 assistant/message、completed 的 turn/end。拒绝旧会话、多用户、外来 inbox、tool/attempt/未知事件、缺口、终态失败/取消/未终结。当前只支持纯文本/tool-free 窄形状；常见 runtime-context 的额外 user/message 会被拒绝，不能据此声称一般 DSH 会话已兼容。
- 同 turn 多个 durable assistant/message 按事件顺序取其 text 内容，各消息间插入一个换行，形成一个 generated block；不把流式 delta 当产物。保留旧块 ID，nextBlockId 追加，provenance 为固定输入材料 ID。run receipt 持有 session/turn/seq、blockId、输入/输出/日志哈希关联（输入哈希在 run 主记录）。
- 同事务发 `knot.updated` 再 `run.returned`，只增加一次 revision，两个 seq；保存失败两事件都不发。相同日志/证据种类重回流不增块、不发事件；不同证据冲突。目标内容摘要改变或目标消失时拒绝回流，保留 prepared，须后续显式对账。
- Run 作为 schema4 的带 `version:1` 记录扩展保存在同一文件，启动严格验证哈希/身份/状态，最多200条，沿用8MB全文件上限。snapshot 导出可读 journal；restore 携带 journal 时必须与当前完全一致，不允许导入/删除/篡改；不携带时保留当前 journal。历史引用不因资产恢复而抹除。

## 验证

全量命令 `npm test`：构建＋44/44 tests，0失败、0跳过。原有38项不变，新增 Run 5组及 HTTP 1组；详见 `test-results.tap`。Node 类型擦除仍有原有 ExperimentalWarning。

新增负例覆盖：取消/blocked/error/max-tokens/interrupted/forked/未知终态，错 session/rpc/文本/role/turn/step/source，截断/缺口/attempt/tool/旧turn/外来context与inbox；目标修改/删除；重复/不同回流；snapshot journal伪造/删除；写文件rename失败保留内存/原字节且无事件；输入哈希损坏重启拒绝且保留坏字节。已完成 prepared 和 completed 合成记录的持久重开读回。

早期 focused 测试暴露 Maker 输入校验时误将缺 workspace 的临时材料快照标成 schema4，已改为原编译器使用的兼容规范化入口；删除目标的测试夹具同样纠正为合法无 workspace 旧快照。修复后 focused 和全量均通过。未改冻结 vendor / UI / 已安装插件 / 签名 ASAR，未提交、推送或合并。

## 未覆盖

无真实 Run 成功证据、无已核验模型/成本/执行授权、无实际 DSH Session 绑定、无真实取消/事件消费/失联恢复、无已验证完整模型上下文/工具权限、无一般多turn/多输入/多模态/工具产物、无桌面部署或人的体验验收、无强杀恢复或无限 journal 生命周期。只能交独立 Checker 评估本服务契约切片。
