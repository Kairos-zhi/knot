# PROJECTS-001｜多项目导入与独立现场

2026-11-15，基线2a377c6。多项目属于最初A2需求；用户要求落实已研发的后端。首页所有项目概览，进入项目后看决定块与材料，点块在侧边读详情，原卡不移动。卡面一句决定+简短原因。禁止合成项目或决定充数。

## 统一内核与范围

沿用assets/history_events/asset_readers、AssetRepo/EventStore事务及配置token→actor，不新增平行文件权威，不迁移现有库。项目是追加的有版本manifest资产；文档作为既有decision-source资产保存，已核回顾作为archive引用。原回顾、探索与11个MCP入口兼容；新业务操作可经同一服务层/HTTP调用。

新增project_policy.py、backend/project_repo.py、tests/test_project_repo.py。manifest MIME为application/vnd.knot.project+json，canonical JSON闭合：version(knot.project/0.1)、project_id(UUID)、title、revision(十进制字符串)、previous_hash(null或SHA)、request_id(UUID)、request_hash(SHA)、materials([{asset_id,content_hash}])、archive_ref(null或{asset_id,content_hash})。保存时间取资产真实created_at，不由导入者回填历史。项目上限100、manifest扫描上限1024，超限整体拒绝，不截断后假称完整。

定义复核修订：manifest另含owner(actor，服务写入，不接收用户指定)。reader只授读取，不推出编辑；更新导入仅owner可做。每项目材料至多128个，读取原文累计最多8MiB，计费在hash/解析前；超限整体拒绝。

ProjectRepo(db_path)导出import_project(actor,token,body)、list_projects(actor,token)、read_project(actor,token,project_id,revision=None)、read_material(actor,token,project_id,revision,asset_id,expected_hash)。配置身份、manifest reader、来源reader/hash/闭合结构都验证；读取同一只读快照，禁止外置文件。项目最新版本不可读时不能退回旧版冒充当前。成员身份以项目manifest授权为准，不能凭猜中project_id认领他人项目。

导入body闭合：project_id、title、expected_revision(0起十进制字符串)、request_id、documents([{title,text}])、archive_ref(null或{asset_id,content_hash})。标题<=256 UTF8字节，每文档<=64KiB，至多20文档、合计<=256KiB；不自动读目录、不解析脚本。新项目至少有文档或已核archive引用。更新保留已有材料、去重追加；archive_ref=null表示保留已有引用，不隐式清空。引用archive须在本事务内通过既有回顾/来源校验，引用源加入本项目材料。纯文档只保存材料，绝不伪造已提炼决定。

同一事务串行检查项目头/预期版本，保存来源+授权+项目manifest+import事件。相同request_id/相同请求返回原回执，改请求内容冲突；失败全回滚，不给重复内容补他人grant。旧资产/事件不覆写。业务错误有限：INVALID_ARGUMENTS、ACCESS_DENIED、REVISION_CONFLICT、IDEMPOTENCY_CONFLICT、NOT_FOUND、CONTENT_MISMATCH、SENSITIVE_CONTENT、RESPONSE_LIMIT、READ_UNAVAILABLE、IMPORT_UNAVAILABLE；无原文/异常回显。

幂等键作用域为owner actor+project_id+request_id；request_hash=SHA256(canonical({actor,body:经闭合校验且保持document顺序和原文的请求体}))。先核当前项目头授权/owner，再查本项目原request_id；相同hash返回原回执（即使头已前进），不同hash拒绝IDEMPOTENCY_CONFLICT，然后才检查expected_revision。不能凭旧回执绕过当前头撤权。

显式绑定archive_ref时要求既有父+全部来源校验通过且has_unavailable=false，任何来源失权/变更即拒绝并整体回滚，不能将部分投影当成功导入。读取已有项目则逐项抑制不可用材料标题/正文和相应决定，标has_unavailable，不返回残留旧内容。导入提交前校验当前scene输出额度，避免落下无法显示的头。

## 接口正本（新增，旧字段不变）

- ProjectImportReceipt：project_id、revision、manifest_hash。
- ProjectList：items:[{project_id,title,revision,manifest_hash,saved_at,material_count,decision_count}]；只列授权项目，计数基于可读有效来源。
- decision_count仅计个人记录(kind非document_plan)，背景方案不算个人决定。ProjectScene仍保留DecisionHistory的类型口径，前端分别呈现背景。
- ProjectScene：project_id、title、revision、manifest_hash、saved_at、snapshots:[{revision,manifest_hash,saved_at}]、materials:[{asset_id,content_hash,title}]、decisions(null或既有DecisionHistory)、has_unavailable。snapshots是实际留存现场，不能按消息日期拼造过去全貌。
- ProjectMaterial：project_id、revision、asset_id、content_hash、title、text；严格验证属于所选项目/修订，不能跨项目借用接口。

各响应由project_policy独立闭合校验/绑定/敏感检查供broker使用，实际ensure_ascii=True响应连信封<=1MiB，超限固定503，不返回部分内容。

核心HTTP新增GET /projects、GET /projects/{project_id}?revision=可选、GET /project-material?project_id&revision&asset_id&expected_hash、POST /project-imports，plain OkEnvelope。配置身份必需，POST拒绝重复/坏Content-Length/Transfer-Encoding/重复JSON键/超限，沿既有server.changed与pending/failed/stopping只读保护。读取参数闭合且严格转义/UTF8。新增4路由23→27，5schema定义36→41（含ProjectImportRequest），自检6命令+27路由=33；仅适配相关旧计数/样例，不弱化原断言。

工作台可显式projects_enabled=False默认，CLI --projects；启用时SSR data-projects=enabled，主页一次GET /api/projects。GET /api/project?project_id[&revision]、GET /api/project-material同四参数、POST /api/project-import转发核心，保留Host/Origin/explicit/CSP等边界。projects导入与writer/context独立，不借开启projects放开旧保存。旧模式零默认请求、旧history单次请求保持不变。新增代理project_transport.py可封装投影/POST，凭据不进浏览器。

启动优先级：data-projects仅服务显式启用时为enabled，缺失/未知一律关闭。projects与history同时启用时只自动加载一次项目清单，不自动读独立history；进入项目、选择留存版本、阅读材料均显式发起。旧history单次规则只适用于projects未启用的旧模式。

## 界面与验收

项目概览显示真实项目卡，“导入项目”选名称与.md/.txt文件，或向已打开项目追加材料；显式确认才发送。重复/未知请求保留同request_id及正文供显式重试，不能暗中换请求。切项目清理选中块、详情与检索/阅读结果，晚到响应不得写入另一现场。项目内检索仅当前项目材料，读取正文仍需显式动作。

决定以真实archive卡面展示，侧边详情按需打开；未留存连接不画推断因果线。时间回溯仅显示实际manifest现场，缺失历史不补画；只有一版时明确说明并禁用无意义滑动。日期未知保持未知。纯材料项目显示“材料已导入，尚未整理决定”，不能从文件名推断决定。没有假项目、自动AI提取、团队同步或全盘扫描。

角色：Carver后端内核Maker；Laplace前端Maker；主Agent核心HTTP/contract/broker及实际运行；Locke独立定义/最终Gate；Seeker仅在需要时核设计。允许新项目模块与上述文件、workbench.html/py、HTTP/contract/schema/selfcheck、必要相关测试/计数、本卡。无截图/模拟点击；临时库证明两项目导入/隔离/重启/幂等/撤权/冲突/原子性，Node证明项目切换晚响应抑制、卡片侧详情与无虚构关系。真实资料仅在Gate后将已核Knot回顾绑定为首个项目，不导入未授权的新真实项目、不编造第二项目；第二项目由用户用真实文件自行导入。实际运行和测试数据分开记录。

本轮必要卫生修正：身份检查发现既有UX-003卡引用了操作者绝对路径，允许仅将该处改为任务输出文件名，保留设计/验证事实，不放宽身份检查。Carver/Locke失联后由Darwin/Kierkegaard分别接续同范围，主Agent保存原定义PASS与新Checker定义PASS，角色替换不改变授权。

## 2026-11-16 实施与测试回执

Darwin接续内核，Laplace实现前端，主Agent完成HTTP/契约/适配器及联合核验，Kierkegaard独立复核。三个定义阻断（幂等顺序、archive完整性、项目模式优先级）先补定义后通过；替补Checker也确认定义PASS。

已实现：同一内核追加项目manifest、UTF-8文档导入、已有回顾显式绑定、owner/reader分层、独立项目清单和版本、当前项目材料读取与名称筛选；项目概览→决定卡→侧详情，背景方案独立，真实留存版本滑动。新旧模式能力独立，默认旧模式不多发请求，projects优先只自动发一次项目清单。追加材料固定原项目名称，不在该操作中隐式改名。文件UTF-8严格解码，BOM/换行原样保留。未留存关系不补线，纯文档不伪造决定。

接口新增4项，原23路由及字段不变；schema增加5定义，自检总数29→33。相关旧计数与结构样例精确适配，旧HTTP测试保持未改行的换行，避免整文件重写。错误仍采用原闭合HTTP代码及有限reason；适配器在核心POST成功后发现回执不可信，一律不报确定拒绝，返回503保留原请求重试。

Maker验证均绑定实际轮次，不累加成虚构总数：

- schema结构119 passed；旧HTTP/bundle连新增接口60 passed；原工作台/决定/权限104 passed；新领域/页面/HTTP早期联合109 passed。
- 全mvp回归实跑1193 passed、3 skipped，378.40秒。测试进程仅将已有Git Bash置于PATH前部，未改变系统配置；该结果是后述P1修补前快照，不覆盖缺失记录反例。
- 前端Maker工作台回归117 passed，追加名称修补后项目28 passed；末次显式上海时区后28 passed（2.67秒）。旧fixture不放宽。
- 后端Maker原domain78 passed；后述P1新增19项修后通过；领域/项目HTTP/身份105 passed。
- P1及broker/前端后续修补后，主Agent最终领域/项目HTTP/项目UI/schema/身份联合252 passed（17.58秒）；此后仅上海时区显示微调以28项定向覆盖。

保留独立Gate BLOCK历史：Checker发现最新/唯一manifest资产缺失但import事件仍保留时，扫描assets可能将旧版冒充当前，或允许他人重建身份。修前18个反例失败；修后先在同一快照检查project import悬空subject，明确CONTENT_MISMATCH，当前/旧版/材料/重放/更新/他人认领均拒绝，拒绝前后零写入。普通材料缺失仍只抑制对应材料，不能误封成所有项目头丢失。主Agent新增真实HTTP缺头反例并保留有限错误原因，不把存储完整性错误说成用户参数错误。

截至本节记录，真实库尚未增加项目manifest；实际启用待独立最终Gate。原6资产/6事件/6授权保留，严禁为演示补第二个假项目。

## 最终限定 Gate 与实际启用

Kierkegaard确认P1已关闭、无新阻断，限定Gate PASS；独立接受的HEAD+工作区清单指纹为`97030f5614bfeb1a6aea5500c667c2ca15991320ba70d2e26871f5dc6127fe86`。签Gate后仅补技术回执/运行证据，16个功能文件的仓库外清单SHA256为`f3094c1baea28f3701a79b273de5eb3685c14ddf07b6e8bf7608993064d9ca2b`，功能字节未再改动。

通过Gate后，主Agent按已记录OS进程身份停止旧预览，先只读备份原库，再在同库显式绑定已核Knot回顾为首项目；不迁移、不重导入原文、不编造其他真实项目。原6资产/6事件/6授权成为7：只增加1个项目manifest及其import/grant。再次执行同请求回执相同、新增0。原5来源和回顾投影内容未改，回顾SHA256仍为`4f7c485aeb767c822fffad1172c97480c7ee79a3809c715c5cf5e765444712ea`。

实际入口`http://127.0.0.1:4973`已为项目模式：write/context关闭，history/projects启用。项目首页真实1个Knot项目、5份材料、4项个人记录；场景中背景方案另1份，未冒充个人决定。当前只有1份实际留存现场，不补画过去完整快照或因果线。真实GET前后assets/history_events/asset_readers一致，正文与已存原文逐字相同；实际脚本与磁盘一致，脚本正文SHA256为`8b4d7338c77fb3643ab04b5ce12c45a97977a1006e3a2ac756cd1a16648ae812`。

用真实HTTP响应驱动同一脚本的DOM模型核主页仅一次projects、进入项目4卡/背景1、侧边详情不改卡片集合、显式读材料、回到概览清正文与筛选；未截图/模拟点击/强制刷新用户。其他项目可由用户在此入口显式导入，纯文档只存真实材料，自动提炼决定、旧历史重建、关系自动生成、团队同步仍未交付。导入结果未知的原请求仅留当前页，不承诺刷新恢复。

Kierkegaard随后独立真实入口只读抽核PASS：4次GET确认SSR、实际脚本、1项目/5材料/4个人记录及Scene背景1/真实快照1/has_unavailable=false；未读材料正文、写库或模拟点击。新增文件进入暂存后，仓库身份检查另2 passed，未放宽guard。冻结候选仍干净、HEAD仍f907b74596902559c1ebab89389aecedd2ccd679。以上为本卡限定交付，不外推完整MVP1或人的体验接受。
