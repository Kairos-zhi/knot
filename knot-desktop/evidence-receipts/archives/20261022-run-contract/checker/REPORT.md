# KONT-RUN-004 独立复核

结论：`ACCEPT_RUN_CONTRACT_LIMITED`。接受准备记录与固定输入、DSH prompt 的纯形状适配、内部关联投影检查和同事务产物回流的离线服务切片。没有连接 DSH adapter；没有真实 Session 或 Run 完成证据。本结论不接受完整 Run、实际桌面部署、模型上下文安全或产品体验。

## 独立证据

- 重读治理、工程卡、研究、Maker 报告，直接审查 `run.mjs`、`store.mjs` 和两份测试。Maker 4文件 SHA256 与字节数在独立检查前后均一致；Checker 未改产品代码。
- 独立 `npm test` exit0，44/44通过，失败0、跳过0；记录为 `regression.log`。这包含原38项与新增6组，不是对历史桌面 Gate 追溯改数。
- 只读重算官方 ASAR 全档 SHA256=`47874618bf5b3011fcaac10cd4c85f69da333e70d4f99b921207c78d0999512a`；13份提取成员逐一与安装档匹配。直接核对发布 `SessionPromptRequest`、`SessionFollowRequest`、`MessageBase` 声明及 cancel/keepInbox/rpcId 实现。没有安装／修改 ASAR 或 desktop profile。
- 自有检查 `independent-check.mjs` exit0，11项程序化probe通过；结果在 `independent-result.json`。并发同request准备只落一条；回流并发重放只提交一次；调用后篡改传入证据不污染已排队事务；两个完成事件的观察时点均已读到completed状态；完成记录与块冷重开保持，冷游标reset；恢复省略journal保留历史；attempt拒绝。
- 自有合成日志带 `MessageBase.id` 和合法前置metadata，验证关联投影可接受这些字段；两份同step assistant文本按事件顺序以换行连接。全部资产／事件在Checker自有synthetic目录，不接触真实资产。

## 关键判定

`run.prepare` 不执行模型，记录 `plannedSessionId` 而不是宣称已创建／绑定 DSH Session。相同request的准备重放返回旧输入，后续来源／草稿改变不偷偷重编译。显式供给减排除与历史provenance不递归语义保留，现场隔离由同一工作区模型控制。

内部回流要求完整从seq0起的投影、第一且唯一turn、匹配rpcId与准确用户prompt、正确step/turn、单user与completed终态；错误／取消／缺口／旧会话／未知事件／工具／attempt／错身份不能产正式块。目标摘要CAS、原块ID、nextBlockId与provenance保留。落盘、资产和receipt在原writer queue一次事务完成；失败不发事件，重放不增块。普通HTTP和兼容mutate入口均没有伪造completed的命令路由。snapshot导出可读journal，恢复不能导入／清空／改写journal；省略则保留。

## 必须保留的限定

1. `inspectDshRun` 是**关联投影验证器，不是完整DSH schema validator**。Maker夹具省略MessageBase.id，自有检查补id仍通过；代码不会验证全部必需字段、消息语义或外部日志真实性。没有实际Session日志导入验证，不能称“已实际Session兼容”。
2. 固定输入和哈希代表本适配器准备提交的用户prompt，不是完整模型可见上下文。developer/system/header/context事件虽在白名单，内容未全面审计；额外runtime-context user/message会被窄策略拒绝。来源权限、工具权限、模型、成本和执行身份须由后续受信adapter核验，本卡不承担这份证明。
3. 纯函数不创建Session、不发prompt/cancel/follow；取消ack不等于终态，follow实际无afterSeq参数。运行态、取消、断流重连、恢复、多turn、多用户、多模态、工具产物和一般DSH事件均未交付。
4. 只证明完整相同日志回流的本存储幂等；不证明跨进程端到端exactly-once。completed receipt是历史事实引用；人工改资产或恢复资产后，不能由receipt推定当前块仍原样存在。200条和8MB上限尚无生产journal生命周期方案。
5. 原协议覆盖仍5/16；run.prepare为Knot扩展。无UI改动，不重新接受旧9单元或完整产品。无模型调用、凭据读取、桌面启停／安装、push／合并。

上述限定与工程卡、Maker报告一致，不构成本卡离线服务契约范围的阻断。中控可据此Gate限定入档；扩大到实际执行前须另卡补受信日志读取／完整上下文和授权边界。
