# CP1-VISUAL-002 · 显式保存与返回恢复

2026-11-14，承接用户“继续”。基线9484045。目标：在本地工作台编辑有序材料与停点，预备后显式确认保存，跨进程读回指定版本；未知结果保留原请求与原key，仅操作者显式恢复。

允许文件：mvp/devtools/workbench.py、workbench.html、新 workbench_write.py、test_workbench_write.py、test_workbench_draft.py、本卡。既有11工具、backend、contract不变。默认工作台仍只读；提供显式 --state-root 后启用本地写桥，凭据仍仅在服务端。

写桥复用normalize_save_v2、exploration_call和原receipt验证，不新造业务状态库。客户端本机journal只保存原请求、摘要、操作ID、绑定和交付状态，含笔记/理由等私有信息，应使用操作者私有目录；不得写入Git。prepare必须先耐久保存完整原请求，再由confirm明确发送。发送前落unknown，落盘失败零上游；失败、超时、丢响应或receipt落盘失败保留unknown。不自动重试、换key或重启发送。恢复只发送已保存、摘要与origin/token绑定一致的原请求。单未决操作阻止新prepare，已保存/明确拒绝后才可开始新操作。

POST只允许有限prepare/confirm/recover动作，要求同源Origin、Host、X-Knot-Action和严格闭合JSON、有界body。GET状态只回摘要/探索ID/预期版本/固定状态/收据，不回存储正文。journal校验与操作通过同一文件锁串行；目录及控制文件拒绝软链/联接点。成功仅据已验证收据表示；500与未知回包保持unknown。

页面：新建草稿、从完整可用停点转为草稿、加入当前阅读材料、调序/排除/移除、编辑停点、预备请求、确认保存、查看本机状态、恢复原保存。v2关系保留，端点删除/排除需先显式清空草稿关系；存在抑制、不可用材料或缺失理由字段的读取投影不能直接变成完整写请求。旧历史允许读；保存期望版本保持精确十进制字符串在Python转换，不静默覆盖当前头。确认前编辑使预备失效，准备后草稿锁定直到明确拒绝或成功；unknown只能先恢复。

程序化验收：真实合成服务保存/返回/新进程状态/同key恢复、提交后丢响应只产生一修订及事件、receipt落盘失败、原请求损坏或绑定变化零上游、旧版本冲突/reader撤权、跨源写拒绝；Node VM验证草稿顺序、抑制投影禁写、64位版本精度、保存确认分步和零自动恢复。独立Checker先复核定义，再复核实现，人的体验单列。

定义澄清：准备成功后草稿锁定。仅新增显式cancel操作可取消尚未发送的prepared请求，再编辑/重新prepare；unknown不可取消或被新请求替换。初次confirm明确收到既有exploration_error识别的非500拒绝时，记rejected；初次结果不明后进入sticky unknown，recover即使收到ACCESS_DENIED、SERVER_READ_ONLY或其他拒绝也仍为unknown，仅记录固定last_error，直到取得原请求成功收据。这类拒绝不能证明先前未提交。cancel与confirm/recover一样要求精确operation_id和digest；取消零上游。初稿“确认前编辑使预备失效”具体由此显式取消实现，不在锁定时继续编辑。

## 运行与使用

在已配置的隔离Python环境、仓库根目录运行。KNOT_WORKBENCH_TOKEN仍在进程环境设置，knotOrigin为隔离后端返回的完整loopback origin；knotPrivateState为操作者选择的仓库外私有目录。

```powershell
& $knotPython -B -m mvp.devtools.workbench --origin $knotOrigin --state-root $knotPrivateState
```

省略state-root即沿用只读模式。新空库可新建空材料草稿保存停点；已有reader授权的材料可加入、调序或排除。页面刷新会丢失未预备草稿，预备后的原请求保存在私有目录，包含停点与理由，摘要页不回显这些私有正文。凭据和原HTTP origin参与本机记录绑定；轮换凭据或更换后端后不会自动采用旧请求，不手改记录重绑。

操作：新建草稿或从完整已加载版本继续 → 组织材料并填写停点 → 预备保存 → 核对操作ID及摘要并确认保存 → 按收据版本加载。尚未发送可显式取消；结果未知时先查看本机状态，再选择恢复原保存。再次confirm已结束的请求会拒绝，可用只读状态取回收据，不增加上游请求。每次prepare只保留本机最新操作，未决prepared/unknown禁止替换；Knot中的历史修订仍由原核心保留。

本卡的用户确认仅指明确发送这次保存请求，不推断材料公开授权、能力标签或平台同步许可。真实资料和人的体验另行验证。

## 实跑记录

Maker组合验证46 passed in 33.42s：既有工作台15、本卡草稿/真实HTTP故障链7、本机journal反例12、插件打包/v2 MCP12。随后界面文案及CLI固定错误处理修订后，两项页面逻辑定向复跑2 passed。未采用截图或模拟点击。

真实故障测试在后端完成提交后关闭HTTP连接，首次请求仅一条，工作台保持unknown；重新构造代理并查看状态不增加请求。撤销当前token后显式恢复得到ACCESS_DENIED，状态仍unknown且不能替换/取消；恢复身份后再次显式恢复取回同一event_id/版本收据，SQLite仅新增一修订。其余反例覆盖：receipt落盘失败、发出前落盘失败零上游、记录/绑定损坏零上游、并发确认仅一发送、原记录硬链接拒绝、新Python进程只读状态不含正文。

独立定义复核先提出unknown不可被后续拒绝清除、预备取消流程两项澄清，修订后PROCEED；初次实现复核发现旧收据误清新草稿和解析错误泄漏，已修并加入回归。最终限定结论在固定候选时绑定，不把技术通过写为人的体验或完整插件阶段接受。

独立Checker（Agent 01a1d9a0-b04b-7ec1-9529-38b0e732ed2f）最终亲自复跑46 passed in 33.02s；核对本卡六文件，完整性、落盘失败、sticky unknown、同源边界及两项界面返修通过，结论PROCEED。允许固定本地候选；人的体验接受另列。
