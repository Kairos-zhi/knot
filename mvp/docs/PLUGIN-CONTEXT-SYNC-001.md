# CONTEXT-SYNC-001 · 项目上下文交换契约草案

2026-11-14。承接用户“继续推动”，工程基线6afcb0a。本卡先定义插件与平台之间的可检验数据边界，避免把探索ID冒充业务项目、把保存成功冒充同步成功。现有backend、11个MCP工具、schema1.9均可复用，无需重做来源导入。

## 既查结论

目前已有：token解析actor、reader/hash校验、有版本和event_id的探索停点、显式保存与同key恢复、本地工作台。没有查到业务project_id、task_id、平台账号绑定或接收上下文的端点。项目识别与平台同步尚未实现；按需求先采用操作者明确指定项目/任务，不做跨工作区自动扫描或能力推断。

## 第一版消息

消息为proposal及local_confirmation两部分。proposal含本机namespace、project/task UUID、固定探索修订/event_id、操作者填写的任务状态与摘要、selected资产的ID/hash锚点。确认绑定整个proposal的规范JSON SHA-256，包括项目/任务及目的，防止确认后换目标。local_confirmation只记录明确本机导出操作，不证明平台账号身份、项目成员关系或公开授权。

首版不包含原始正文、停点笔记、选材理由、关系理由、绝对路径、token、推断能力标签。摘要由操作者主动编写，仍需凭据有限规则检查，不宣称自动脱敏绝对可靠。资产锚点也可能敏感；reader读取授权不能推出向平台共享授权。本卡确认范围仅local_export_only，网络发送及目标成员授权应在平台接口确定后另外实现。

## 身份与来源

本机namespace区分同一操作者不同工作区的项目ID；project/task ID当前为操作者指定且unverified，不能称平台已登记或已匹配。平台账号不得从姓名、目录名、当前聊天或本地token文本推断。source的revision为十进制字符串，后续验证器须额外校验1..2^63-1；event_id与指定修订必须由服务读回核定。

导出准备阶段显式读取指定停点，检查当前reader/hash，排除excluded锚点，不回填被抑制字段。未授权、缺失或hash变化时拒绝准备，不能静默删材料后导出。记录来源标签不证明原聊天真实性；content_hash只绑定Knot资产，event_id只绑定Knot探索修订。

## 本地演示与平台边界

预期流程：明确指定项目与任务 → 从指定保存版本准备proposal → 人检查摘要、状态、目标与证据清单 → 输入proposal摘要确认本机导出 → 生成私有JSON包。包内仅有一个明确项目/任务目标，材料是否归属该项目仍由操作者核对；平台绑定未建立前不宣称自动识别或隔离项目材料。未确认不生成可发送包；导出不自动上传，不新增业务写入API或平行资产库。

平台对接前待双方核定：账号认证；namespace/project/task与平台对象的映射和成员权限；接收端点及消息大小；幂等按账号+目标+packet_id+digest；请求结果未知的恢复与查询；任务状态的人工审核及版本冲突；证据授权期限/撤销；接收回执与accepted/needs_review/rejected等状态。技术负责人边界未确认前，不绑定外部平台或自动回写任务状态。

## 本卡交付与Gate

允许先新增本卡和docs/contracts/context-proposal-v0.1.schema.json，二者均标Draft，静态校验后可评审。运行时代码、导出工具和工作台表单按独立定义复核后再实施；人的使用测试与真实材料仍单列。后续最小实现允许新增纯校验模块、合成测试和本地显式导出器，具体文件在定义Gate后固定。

拟固定最小实现文件：mvp/context_sync_policy.py（闭合校验与规范摘要）、mvp/devtools/context_packet.py（显式prepare/export命令）、mvp/tests/test_context_packet.py（合成契约及导出反例）。不更改服务、MCP或工作台。prepare从明确origin读取一次指定修订，核event_id一致及reader/hash，仅include明确--allow-asset指定的selected锚点；必须另行获准把锚点写入本次包，reader本身不是导出授权。

reader/hash校验仅证明prepare发生时的读取条件。离线export不复查后端或重新获取正文，不能据此声称持续访问权限；后续平台接收和证据取件必须各自重新验证权限。local_confirmation记录的是操作者本机导出动作意图，不是可独立核验的身份签名。

完整预览在新私有文件中生成，供操作者逐字检查；export要求原proposal的SHA-256，并用同一proposal生成新JSON包。规范编码为UTF-8、ensure_ascii=false、sort_keys=true、separators=(',',':')、禁止NaN，不做Unicode归一化。摘要覆盖proposal全部字段（含schema版本、项目/任务、摘要、状态、证据）；外层local_confirmation只含固定action/actor_verified和该摘要，不额外加入未经预览的可变元数据。本机确认不是身份认证、签名或平台授权。输入/输出路径拒绝软链/联接点，输出只可新建、不覆盖；用户选择的文件夹可能由第三方同步，工具只能保证自身不上传。

文件隐私补充：Windows通过CreateFileW的SECURITY_ATTRIBUTES在创建瞬间设置受保护DACL，仅授权当前SID；不使用“先创建、再缩小权限”的窗口。输入/输出先拒绝UNC、网络映射盘和无法判明的卷，再访问业务文件；Linux仅允许已识别的本地mount类型，其他系统需补经评审的检测器。第三方同步目录即使位于本地卷仍可能由其他进程同步，不承诺对第三方行为的隔离。

在写入首字节前，还通过实际文件handle查询所在volume的FILE_PERSISTENT_ACLS能力；不支持或无法查询即拒绝，不能把移动盘/固定盘类型等同ACL支持。该标志的语义依据[Windows官方说明](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationbyhandlew)。路径含父级跳转组件会在卷/mount匹配及业务文件访问前拒绝。

## 开发期操作入口

所有文件路径须为本地卷绝对路径，输出目录已存在且目标文件尚不存在。使用已有Python环境；prepare凭据由KNOT_WORKBENCH_TOKEN环境变量提供，目标origin只能是显式127.0.0.1端口。身份与目标变量由操作者明确指定，不从文件夹、聊天或姓名推断。

```powershell
& $knotPython -B -m mvp.devtools.context_packet prepare --origin $knotOrigin --exploration-id $explorationId --revision $revision --event-id $eventId --namespace-id $namespaceId --project-id $projectId --task-id $taskId --instance-id $instanceId --reported-status blocked --summary-file $summaryPath --allow-asset $assetId --output $proposalPath
```

打开proposalPath检查完整JSON内容。每个allow-asset都是本次包的显式锚点导出选择；不加该参数即不包含证据清单。核对后将返回摘要作为reviewedDigest，再显式执行：

```powershell
& $knotPython -B -m mvp.devtools.context_packet export --proposal $proposalPath --ack-sha256 $reviewedDigest --output $packetPath
```

export仅返回exported_locally及uploaded=false，不返回原始摘要/正文，不调用后端。任何proposal字段变化都需要重新核对摘要。工作台项目表单尚未接入本工具，不能声称已交付自动项目识别或平台同步。

## 程序化证据

Maker：新模块21 passed；与工作台、journal、插件打包及v2 MCP组合67 passed in 34.33s。实际合成后端证明prepare仅一次固定修订GET、event_id和授权选择一致；export阶段禁止socket连接且成功完成新私有文件导出。反例覆盖未知字段/类型、版本溢出、重复ID与JSON键、变更目标后摘要失配、不可用/未选证据、敏感标记、现有文件不覆盖、权限设置失败零私有字节、UNC/映射网络盘访问前拒绝。Windows在创建文件后首个检查点即核对受保护的单用户DACL。真实资料、界面体验和平台接收仍各自待验。

独立复核返修后最终结果：新模块24 passed，完整组合70 passed in 33.99s；新增无ACL能力卷零字节拒绝、父级路径跳转在输入/输出访问前拒绝。独立Checker（Agent 01a1d9bd-2b90-7523-bfe8-d71f20108ca2）亲自复跑24 passed in 1.44s，确认所有阻塞关闭，结论PASS，范围仅本卡本机契约/导出候选。保留初次失败与返修过程，不能外推为平台接入、真实项目识别或产品接受。
