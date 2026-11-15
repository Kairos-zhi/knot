# UX-003｜明确按钮与工作分区

2026-11-15，承接用户“按照旧设计内容去做一些明确的功能按钮，做好分区”，基线2db7657。沿用旧设计原则/设计系统/交互约定、UX-001与已澄清MVP边界。

本卡仅整理既有工作台：稳定侧栏按“回顾与查找 / 思考与整理”分组；回顾页区分个人决定、原话与历史路线背景，提供查看背景、展开/收起全部原话和每条查看/收起原话的真实按钮；加载/失败/空态清空并禁用无对象操作。每条保留原生details和键盘操作，按钮aria-expanded随详情状态同步；不会自动访问来源或写入数据。

用户追加“回溯条、区块、不同栏联动”：回顾采用左侧真实回溯条/右侧决定区块两栏；左条显示已有日期口径与标题，选择后定位、聚焦并突出右区块，两栏当前项同步；右侧“查看原话”同步选中对应回溯条。背景项显式选择才展开，个人决定与方案类型不混淆。窄屏按回溯条、内容顺序上下排列。条目顺序沿真实回顾包，不将归档日期冒充消息日期，不新增推断数据或请求。新测试覆盖双栏选择/背景展开/原话联动/刷新失败清旧索引。

写作页分为写想法、材料与关联、检查与保存三个有标题的区域；搜索区有明确搜索与阅读区域。优先正文，使用中性底色、暖橙主操作、分隔线/间距，避免增加说明长文。高级协作导出保持默认折叠。技术编号继续折叠。四个原导航ID、原请求次数、草稿/准备/未知锁定、来源抑制和明确保存不变。

允许文件：workbench.html、test_workbench_history.py、新test_workbench_sections.py、本卡；旧界面测试仅在必要时适配新增结构，不能削弱断言。HTTP/领域/数据库/来源内容/同步不变。当前4973从磁盘提供HTML与JS，用户手动刷新可见；不强制刷新用户页面。

Maker主Agent；独立Checker复核定义后实施，再以程序化DOM/真实HTTP字节及相关工作台回归核验，最终独立Gate后本地提交。禁止截图/模拟点击；人的体验另由用户判断。此次不需要模型、生产安装、推送或合并。

## 实施回执

Locke独立定义复核PASS。已实现两组侧栏、回顾操作按钮、左回溯条/右决定区块、当前定位/高亮/键盘焦点联动、原话按钮同步选中、背景显式展开以及写作三分区/查找阅读分区；背景收起时不保留指向隐藏区块的当前项。全局“展开决定原话/收起决定原话”仅作用个人决定，背景由独立按钮控制。窄屏回溯条转横向排列，随后呈现正文。

Maker先跑21项定向通过；8个工作台相关文件首轮61 passed/3 failed，失败均为旧DOM模型缺setAttribute。仅在test_workbench.py、test_workbench_draft.py、test_context_workbench.py的E类加入该方法，保留全部原断言。随后完整相关回归64 passed（33.87秒）；补背景收起联动后，history/sections最终6 passed（0.52秒）。未改test_workbench_history.py。

实际4973旧进程已退出，本轮通过仓库外恢复助手读取同一私有原库并重新启动，没有初始化/重导入。真实HTTP仍是4个人记录+1背景，响应哈希与上轮相同，6资产/6事件/6授权前后相同；实际脚本与磁盘一致。用真实响应驱动脚本的DOM模型核5条回溯按钮、唯一current、选中/展开双向联动及单次主动请求。未截图/模拟点击，也未强制刷新人的页面。

用户另要求Seeker专门回溯十月至十一月设计，由独立研究代理核来源并提供报告，不能将历史方案直接写成当前已实现。

## 前端接续记录（2026-11-15，待独立 Gate）

前端负责人 Laplace 接续上述未提交候选，未 reset 或覆盖其他角色改动。后端 Carver 独占 workbench.py、新 capabilities 测试与接口卡；前端消费 [SSR 能力接口](PLUGIN-UX-003-INTERFACE.md)，不改后端。用户随后扩大前端允许文件至必要的四个旧 DOM 夹具，仅为其显式声明合成能力，不削弱原断言。

### Seeker 实际追问与回执

已读 [Seeker 10—11月设计回溯](C:/Users/x2270/Documents/Codex/2026-11-14/knot-continuation-20261114/outputs/Knot-10-11月设计回溯.md)。报告区分8月原设计、10月整理入库与11月追加需求；左回溯条／右决定块双向联动来自11/15 UX003，不能倒填为10月已定布局。

本角色发现工具清单中无 multi_agent.send_input / wait_agent，已通过当前主 Agent 明确请求代传，未改用外部聊天。实际追问分两轮：先问未知日期条目的顺序依据、本轮联动是否止于条—块—原话定位及显式选材；按主 Agent 要求再收敛为以下两问：

1. 旧设计产品级 Focus 与回溯条“当前阅读项”如何区分？拟仅更新阅读状态，不切换草稿目标、不采用材料、不改变授权，是否符合历史依据？
2. 归档日或未知原消息日期能否用于排列“决定发生顺序”？拟沿回顾包原序，标明归档／文档日期和未知消息日期，不自行排序或推断因果，是否需要修正？

**实际答复：Seeker（Raman，01a1df6b-4014-78b2-92e7-93a3563b4525）经主 Agent 代传追问后直接向本角色回复。** 答复逐行复核来源，未扩实现范围：

- 对问题1，明确“产品级Focus、阅读选中和键盘聚焦需区分”，条—块—原话只同步当前阅读项，不应改变写入目标或选材。其依据为 [interaction.md](../../docs/product/interaction.md) L15（预览不自动加入供给或切换工作目标）、L17（显式选入才加入指定现场）、L28（产品级 Focus 与鼠标选中分开，预览不改变发送目标），以及本卡原定义L5／L7。落实于 selectHistoryEntry、toggleHistoryEntry 及原生 summary：只更新阅读呈现与键盘焦点；sections 的阅读/回顾测试对完整 draft、exploration_id、contextAllowed 作前后不变断言。
- 对问题2，明确“不能用归档日或未知原消息日期推断决定发生顺序”。其依据为 [RECALL-002](PLUGIN-MVP1-RECALL-002.md) L15、L19–21：原消息时间不等于心理决定时刻，归档节选 occurred_on=null，文档日期只作背景；[RECALL-001](PLUGIN-MVP1-RECALL-001.md) L27–28：文档日期不等于批准日，11/3归档不证明当天作决定；本卡原定义L7要求沿真实包顺序。落实于 historyDate 的口径标签和 loadDecisionHistory 按 value.items 原序生成回溯条；无日期排序、补日期或自动因果推断，确切先后无证据则保持未知。

问答收敛后未增加接口或功能；现有实现符合两项答复，最终交主 Agent 集成与独立 Checker／Gate。

### 本轮设计落实

- 保留两组导航、写作三分区、搜索与阅读区域、背景显式展开以及双栏当前项同步。左条补充已有 after 的简短摘录，完整内容仍在右区块；右侧把已有 before／after／reason 直接显示为“此前／方向（背景为方案）／依据”，不新增解释或因果数据。Seeker补充的历史依据未冻结2／3／4栏；本轮双栏来自最新UX003，不复活旧固定尺寸或任意扩成多栏。
- “查看原话”按钮与原生 summary 均能同步阅读当前项；左条定位右块并移动键盘焦点。当前项有文字状态、aria-current 和边线，标题键盘焦点可见，长标题允许换行；窄屏条在前、正文在后，禁用写作入口旁仍能看到简短模式说明。
- 回溯选择仅更改 historyEntries 的呈现和键盘焦点，不改 loaded、draft、写入目标、选材或 contextAllowed。未知日期保留未知，条目沿接口包原序；归档日不升级为消息日或决定日。
- 严格以 body.dataset.write/context === 'enabled' 启用对应能力；缺失、未知、大小写不匹配均禁用。用户最后明确撤回旧 fixture 缺失回退建议；生产与静态模板均 fail-closed，四个旧测试夹具改为显式合成 enabled。
- write 禁用时，“留下想法”、接着写、加入草稿、关系编辑、准备／确认／取消／找回／检查保存均禁用；同区简短说明“当前为回顾阅读模式”。函数入口和 POST 分发也在请求前拒绝，避免按钮以外路径发起必败保存。阅读、查找与分页继续可用，空态不再邀请开始写。
- context 禁用时隐藏高级项目包区并阻断导出入口；context 启用不受 write 禁用影响，仍按固定保存来源、默认不选证据、完整预览、明确勾选后本机导出。enabled 仅表示桥已配置，不承诺在线、保存成功、上传或同步。原 prepared／unknown 安全锁及明确确认流程保留。

### 改动与核验

前端写入：`mvp/devtools/workbench.html`、`mvp/tests/test_workbench_sections.py`、`mvp/tests/test_workbench_history.py`、本卡；按用户追加授权适配 `test_workbench_usability.py`、`test_workbench.py`、`test_workbench_draft.py`、`test_context_workbench.py`。后四者只给旧合成 DOM 声明 write/context enabled，保留此前候选的 setAttribute 适配与全部原语义断言。history 夹具只适配新的显式 dataset 入口。

使用指定 SDK Python，九个工作台相关文件（workbench、write、draft、relations、usability、sections、history、context、capabilities）实跑 **90 passed，38.91秒**。随后只调整“方向”措辞、原生 summary 变量及窄屏禁用入口说明显示，sections/history 定向复跑 **19 passed，1.72秒**。新增覆盖两桥四组合、缺失／未知反例、零探测请求、请求前阻断、prepared／unknown 锁、真实阅读保持草稿目标和授权集合、原序与日期口径。后端 capabilities 的真实 HTTP 八组合由 Carver 测试覆盖；本角色联合回归也包含该文件。git diff --check 通过。

历史失败与协调状态保留：上文原候选61 passed／3 failed及后续64 passed不覆盖；Carver在HTML已严格检查能力、旧DOM夹具尚未显式enabled的更新窗口曾报告77 passed／15 failed，失败集中draft／relations／usability／history／context，后续显式合成声明适配后已收敛。本角色此前“等待Seeker实际答复”的协调状态，已由上述直接答复解除；实际4973旧Handler尚无新声明的运行限制仍保留，不以测试通过抹除。主 Agent 最新回传后端独立Gate **26 passed，已接受**，仅记后端范围；本轮前端／联合最终Gate仍交Locke，不自验收。

额外只读 GET 实际4973的根页面和 JS：均200，根 body 当时仅含 data-history=enabled，尚无新 write/context 声明，说明在用进程仍加载旧 Handler；JS已是磁盘候选。按新前端缺失声明即禁用写入／导出，不能据旧进程声称新SSR已在实际入口生效。后续由主 Agent 更新进程并核对声明；本角色未重启进程、未读取或改写业务DB、未重新导入。

### 未实现边界

本轮仅前端整理与已有能力的真实可用性表达。未实现新对话持续采集、通用回顾来源选材、从历史安全分岔、方向比较、页面草稿刷新恢复或团队同步；不以日期条冒充完整因果形成路径。未截图、未模拟点击、未调用模型、未提交、未推送或合并。以上是 Maker 自核，最终实现 Gate 与人的体验仍由主 Agent 安排独立 Checker／用户核定。

## 联合限定 Gate 与实际运行

保留早期独立BLOCK：当时回溯条按个人/背景分组后生成，违背包原序，且完全空态误称存在背景。已改按value.items原序生成左条、右侧按类型归区；空态不再提示不存在的背景，新增交错类型与空态断言，主Agent定向7 passed。后续前端候选维持该修复，不以旧BLOCK冒充最终状态。

最终分工为Seeker Raman核历史、前端Laplace收敛界面并追问来源、后端Carver磨SSR能力、Locke独立验收，主Agent协调与实际运行核验。Locke最终联合Gate PASS、无遗留阻断，独立50 passed；另有后端26 passed限定结果，不重复累加成全库总数。

接受的HTML SHA256为`d060a9108a339f58ae19be077ac30527bd6c37c87c6b845e365080b04c4351b7`，脚本正文为`645ed01ccd868d5dfc8fb3c7b09c593443e78989a56bd9829484b3f55b965fa4`，workbench.py为`340d78af4e329ee08df03656df5d1907fd4a2c851797f06dc1dea733aae7a6a3`。

主Agent按记录的OS进程身份停止旧预览、恢复同一私有库，没有初始化或重导入；4973实际已返回write=disabled/context=disabled/history=enabled。真实响应仍4个人记录+1背景，原6资产/6事件/6授权前后不变，响应SHA256仍`4f7c485aeb767c822fffad1172c97480c7ee79a3809c715c5cf5e765444712ea`。实际脚本与磁盘相同，实际响应驱动DOM模型核双栏定位、原话联动、单次主动读。Locke独立抽核根页面/脚本200、准确且无重复SSR属性、缓存/安全头和候选字节一致，关闭实际SSR待验项。未强制刷新用户页面。

该Gate允许本地固定本轮候选，不代表人的体验接受或完整MVP1交付。Seeker报告保留在任务outputs供用户核对；运行私有数据不进入提交。
