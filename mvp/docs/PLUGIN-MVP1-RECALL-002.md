# MVP1-RECALL-002｜真实来源入库与主动回顾

2026-11-15，基线 `0594c31b58855e57e837deb4c98cb8e38bafb6f1`。承接用户“推进开发”，沿用 RECALL-001 的真实内容、重要决定和精简表达要求。

## 本卡交付

将已回溯核对的有限 Knot 来源保存为内核资产；原话与回溯解释分别保存。工作台可显式配置一个回顾资产，打开时主动读回真实决定，展开原话。没有数据就显示空状态，不填合成历史。本卡不实现持续抓取全聊天、自动判断重要性或团队同步；不得据此声称被动归档已全面接通。

使用现有 SQLite assets/history_events/asset_readers、AssetRepo/EventStore、只读一致快照及 token→actor。无需新表、数据库迁移、平行文件权威或新的项目/任务管理。HTTP只新增向后兼容的GET；不改已有11个MCP工具。

## 数据与操作契约

所有对象闭合字段，规范JSON使用UTF-8、sort_keys、无多余空白、禁止重复键和NaN。原文资产和回顾资产都追加不覆写；再次处理相同内容不新增资产或事件，也不借重复哈希给另一身份增加读取权限。

来源 `knot.decision-source/0.1` 的固定字段：version、kind(user_message|document)、title、text、text_sha256、message_time_ms、document_on、archived_on、locator。locator固定channel(chatgpt|codex|file)、thread_id、message_id、section，缺项值为null；不包含绝对路径。message_time_ms是原聊天时间，不是系统推断的心理决定时刻。text_sha256须与text的UTF-8字节一致。来源正文至多64KiB，其他文字沿既有validate_text规则；凭据标记或当前token出现即拒绝，不静默改原文。

回顾 `knot.decision-archive/0.1` 固定字段：version、title、method(curated_recap)、items（0..20）。条目固定id（ASCII slug）、kind(direct_user_message|archived_user_excerpt|document_plan)、title、before、after、reason、occurred_on、archived_on、document_on、caution、evidence（1..4）。可选语义用null，不用省字段。evidence固定asset_id、content_hash、quote。短标题<=256字节，说明/原因/提醒<=2048字节，单条引文<=4096字节；回顾包<=128KiB，唯一来源<=32，读源累计<=1MiB。

- direct_user_message只引用user_message来源，occurred_on必须等于来源message_time_ms按Asia/Shanghai得到的日期；不将记录时间冒充发生时间。
- archived_user_excerpt只引用document来源，occurred_on/document_on为null，archived_on与来源一致且非null，页面标“归档日，原消息日期未知”。
- document_plan只引用document来源，occurred_on/archived_on为null，document_on与来源一致且非null；放在背景区域，不当作用户确认。
- 引文须为对应来源text的逐字子串；来源kind/时间元数据均与回顾类型一致。title/说明属于curated_recap解释，不变成正式用户确认事件；未知理由用null，冲突写caution。

导入包 `knot.decision-import/0.1` 固定version、sources（source_key→来源对象）、archive（同上，evidence在导入前用source_key/quote代替asset_id/content_hash）。只接受恰好被引用的来源集合，单事务先验证再原子保存原文、读取授权、回顾与import事件。重复资产须已对当前actor可读，内容/哈希/mime不符时拒绝；不能通过导入给自己认领别人资产。不初始化、不迁移已有库。

导入服务接口 `import_decisions(db_path, package, actor, token)`，返回archive_id、archive_hash、sources_created、archive_created；凭据须与配置身份匹配。CLI `python -m mvp.devtools.decision_import --db ABS --package ABS --actor ACTOR`，token仅从进程KNOT_TOKEN读取，不写参数或日志。包在task-owned私有范围，本卡真实导入限此前回溯的两份文档与三条原消息，复制内容/摘要不提交仓库。

读取接口 `read_decision_history(db_path, asset_id, expected_hash, actor, token)`：同一只读快照中验证回顾和全部引用来源的reader、原始blob哈希、mime、闭合结构、原话及日期。拒绝外置file_path，不访问文件系统。某条任何来源不可用/变化时整条抑制（标题、说明、引文都不显示），不退回旧回顾或部分删证据继续声称可用；父回顾不可用时整体拒绝。

返回值闭合：archive_id、archive_hash、title、method、items、has_unavailable。items字段沿上文条目，evidence投影为asset_id、content_hash、title、quote、message_time_ms、source_url（仅chatgpt渠道可生成https://chatgpt.com/c/UUID，其余null）。无原始路径或未授权内容。broker使用 `project_decision_history(envelope, asset_id, expected_hash, token)` 独立校验闭合形状/绑定/敏感标记。

HTTP `GET /decision-history?asset_id=UUID&expected_hash=SHA256`，plain OkEnvelope，response DecisionHistory；configured身份与对应reader必需。固定错误：ACCESS_DENIED→403 FORBIDDEN_VIEW，INVALID_ARGUMENTS/CONTENT_MISMATCH/SENSITIVE_CONTENT→400 BAD_REQUEST，其余固定INTERNAL；不反射原文/异常。参数闭合、拒重复及坏转义，不支持as_of。扩展contract/v1仅增加路由/响应定义，旧字段与含义不改。

该新路由的成功响应连同信封按实际 `json.dumps(body, ensure_ascii=True).encode('utf-8')` 字节计数，硬上限1MiB；超限只返回503 SERVER_BUSY（固定reason=decision_response_limit），不截断、不返回局部响应。core读取函数及broker投影函数也拒绝超出同一1MiB输出预算的值。workbench仅该路由将上游读取额度设为1MiB+1字节探测；其余旧路由维持262144字节额度。还须在broker返回浏览器前按其实际编码再次检查1MiB预算，避免反转义/重编码边界遗漏。输入128KiB与来源1MiB限额不代替输出预算。新增中文和补充平面字符接近输入限额的测试，核实际HTTP编码增长、超过旧262144但未超过新额度时成功，以及超出硬限时固定失败且无原文回显。

## 界面与启动

workbench `create_server(..., history_asset=None, history_hash=None)` 两者一起传入并校验；CLI新增--history-asset/--history-hash。原模式不配置时保持零初始业务请求。显式配置后以“我的重要决定”为首页，主动请求一次 `/api/decisions`，asset/hash由服务端固定，浏览器不能换来源。刷新为人主动操作，不后台轮询或重试。

默认每条只显示日期口径、决定标题和一段解释；原话/来源按需展开，文档方案在背景区。清楚标“回溯整理”，不用批准/验收流水充当个人决定。日期和原因未知就不补写。正在读取、空数据、来源部分不可用、失败均有集中提示；失败先清旧内容。保留现有探索/关系编辑入口与MVP2折叠分支，不把正式保存当成归档前提。

## 允许范围与分工

- 内核/导入Maker：新增mvp/decision_policy.py、mvp/backend/decision_archive.py、mvp/devtools/decision_import.py、mvp/tests/test_decision_archive.py。
- 接入/界面Maker：mvp/backend/http_server.py、mvp/contract/v1/endpoints.json、schema.json、mvp/devtools/workbench.py、workbench.html；新增mvp/tests/test_decision_history_http.py、test_workbench_history.py；本卡。
- 安全补记：允许mvp/backend/asset_access.py仅对新ARCHIVE_MIME拒绝通用原始正文可读性；覆盖复用该检查的asset正文、bundle生成/读取/导出。专用decision-history仍在同快照检查父资产授权与全部来源后返回投影。原资产MIME语义不变；该新派生类型不能凭自身reader绕过来源撤权。补“通用正文始终拒绝、专用入口按依赖显示/抑制、bundle不带出原始回顾”的反例。
- 允许在mvp/tests/test_contract_schema.py、test_http_contract.py补新增路由的样例、鉴权预期与严格路由计数（22→23）、schema定义计数（35→36）、自检通过计数（28→29），保持原路由断言及一一对应含义；mvp/contract/selfcheck.py仅补新增路由的请求参数与固定鉴权拒绝预期，不改已有自检任务。其他旧测试只可适配新增模式/控件。若需超范围改文件先补定义。独立Checker负责定义与最终Gate。任务内真实运行材料和证据只留仓库外。

## 验证与完成界限

临时合成库验证原文/回顾同事务、幂等不重复、无权重复导入不补grant、错引文/日期/身份/哈希/协议拒绝、原文改动/撤权后派生整条抑制、外置文件不读及输入/输出大小边界。真实HTTP验证新增路由、鉴权、响应契约、闭合投影、跨源拒绝及默认模式回归；Node程序化检查真实内容按字面呈现、日期口径、默认模式零请求/显式模式单次主动读、错误不留旧内容。

所有相关检查和独立Gate通过后，使用仓库外全新私有库导入此前已核的有限真实来源，重复导入读回核无重复，再以独立本机端口展示。保持4972旧合成演示不动，不误称已替换它。禁止截图/模拟点击验收；不接真实模型、不安装到在用Codex、不自动推送/合并/对外部署。真实来源已留存、页面主动展示与持续采集新对话分别报告。

定义已由独立Checker复核通过。全量回归补充发现test_bundle_read.py两项、test_bundle_resolvable.py一项仍写死历史23项自检总数；本卡基线已有22路由+6命令（28项），新增路由后为29项。允许仅将这两文件的三个总数断言23→29，保留源库/外置文件不变等全部断言。该范围补记交独立Checker复核，不改bundle实现。

## 实施与验证回执（2026-11-15）

Maker由主Agent接入HTTP/工作台，Lorentz实现协议、原子导入、同快照读回与CLI；Kepler独立复核定义/功能，Averroes独立复核界面。检查中发现并修复：通用资产正文/bundle可能绕过来源依赖（新派生MIME禁止原样导出）；slug与schema不一致；实际Unicode响应超出旧broker额度；资格提醒默认折叠；回顾状态被旧保存状态覆盖。最后两项界面复核限定通过，不替代人的体验接受。

- Lorentz协议/领域定向最终82项通过；接入补合法80字slug的实际HTTP/schema检查及三种非法slug拒绝。
- 全量`pytest mvp/tests -q -p no:cacheprovider`首轮实际为1036 passed、3 skipped、10 failed（1049项，374.48秒），未写成全绿。
- 其中三项是上文历史selfcheck计数；修后对应两个文件完整25 passed（17.02秒），其余原断言保留。
- 另外七项S2真实kill检查误选Windows内置bash，WSL未安装，在启动前解码失败；仅当前测试进程PATH前置已有Git Bash，不改系统配置或测试。首次环境复测6 passed、1次旧Live启动空stdout，未定位根因、不宣称修复。仓库外诊断runner仅在失败时保留子进程stderr，原七项最终7 passed（14.00秒）。不据此声称整体恢复不稳定性已解决，也不声称有单次全量全绿结果。
- 两枚冻结fixture SHA256与CI写死值相同，冻结worktree仍干净且HEAD仍为f907b74596902559c1ebab89389aecedd2ccd679。
- `git diff --check`无错误；旧http_contract测试仅保留实际新增/修改行，避免整文件换行变化。

Kepler最终限定Gate为PASS，无本卡剩余阻断项。独立新功能100 passed（17.04秒）、修订相关三文件56 passed（55.92秒），另核撤权、缓存bundle导出与single-user反例；真实5来源/5条目与此前回溯相符。10个功能/契约文件前后合成指纹为`9fd59c288da228c64edb534b5b5fc8c0f5779fd5b6e8044aa4b0a5f985f95bd0`。Averroes界面限定复核通过，两项P2关闭。

## 有限真实运行

通过限定Gate后，已将此前核对的两文档、三条真实用户消息导入仓库外当前用户私有目录中的全新库。实际6资产（5原文+1回溯）、6条import事件、6条reader授权；同包再次导入archive/hash不变，新增资产/事件为0。没有写user_confirm事件，也没有改旧4972合成演示数据。

独立本机入口为`http://127.0.0.1:4973`，实际服务进程27000（启动器PID不同，停止须按已记录OS进程身份核实）。启动记录留在私有session，凭据仅在服务进程环境，不进入页面/地址/提交。

实际HTTP读回4项个人记录、1份历史文档方案，全部可读；逐字段、原话、日期与此前已核包一致。GET前后只读SQLite快照的资产/事件/授权均未变化。实际返回的workbench.js与当前磁盘脚本一致；用实际HTTP响应驱动同脚本的Node DOM模型，核单次主动读、4+1分区、限定说明默认显示及引文字面呈现。没有截图/模拟点击。

运行响应SHA256为`4f7c485aeb767c822fffad1172c97480c7ee79a3809c715c5cf5e765444712ea`；代码/测试17文件清单留在仓库外。真实原文、导入包、DB、进程身份详情与运行报告不提交仓库。

Kepler随后独立直接GET真实入口，确认HTTP200、4+1分区、has_unavailable=false、响应哈希与运行报告一致、首页启用回顾；真实运行只读抽核通过，无新增阻断。

完成界限：有限真实来源已经保存，页面打开会主动展示；新对话持续采集、自动提取重要决定、完整MVP1与团队同步均未交付。本卡不是生产安装/合并/整体产品接受。
