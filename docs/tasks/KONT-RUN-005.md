# KONT-RUN-005 · DSH 单会话只读观察与请求边界审计

2026-10-22；之授权“按照原计划继续开发”。基线 `7f7bc42e3408ce8692aff7520763e0b7c75f1991`，干净。顺序既查→Maker→独立Checker→Gate，不多路扩题。

## 既查、复用与缺口

- RUN-004已独立接受离线关联投影，但不证明日志真实性、完整DSH schema、完整模型上下文或实际运行。读取其回执、`run.mjs` 与官方发布源码后推进本卡，不重写旧冻结清单。
- 官方0.2.1 ASAR：`dsh-session-query` 的 readColdSessionLog 会补 interruptedTurnClosers；observeSession还可prepare detached Session。因此其结果不能冒充原始持久事件。readSession对冷会话还会list全库，不采用。
- `sessionPersistence.open(sessionId,'read')`→handle.read(0,undefined)→close 是已有点读契约，无写所有权；只使用明确许可的单个Session，禁止list／搜索／路径拼接／Agent resolve、follow的隐含激活。历史格式只读可能在内存迁移，后端还会隐藏撕裂物理尾；不能声称原始物理字节完备。本卡限定current v4的有效连续逻辑日志，拒绝迁移/seeded。
- 官方Session.create／deriveMessages／requestHeader／requestContext可在脱离运行器的对象上重放。create会追加内存session/end-seed标记；不能将它加入原始证据。其校验是runtime-required，**本身不是完整schema validator**。
- agent-loop buildRequest在model请求前记录header/context，再用deriveMessages和header.config/tools构造请求。本卡按首turn／单step／纯文本／无工具窄形状，在assistant/message前缀上重建这一请求边界；不宣称Provider转换后的HTTP字节或全DSH插件上下文兼容。
- 已取官方 `dsh-session-query`、query-sqlite、persistence、persistence-jsonl、projection 的package/lib字节，SHA见 `evidence/local/20261022-run-read/research/manifest.json`。此前session/loop源码在RUN-004研究目录；不读取真实用户会话、Provider配置、凭据或私人记忆。
- 竞对依据：重读既有已限定复核研究O4/O5/O8/F4的身份分离、来源定位、精确输入、恢复边界。复用DSH owner与Knot输入/hash，不抄竞品代码、不造另一运行器或资产库。前端沿用Apple基准，本卡不改UI；远端治理表与私有飞书原文未重查。

## 最小工程范围

1. 新薄服务适配器，只依赖宿主注入的DSH persistence与Session重放能力（精确版本闸门）。预先核验服务侧只读授权，绑定runId/requestId/plannedSessionId/inputSha256；默认拒绝。调用体不能通过HTTP任意给日志或路径声明可信。
2. 点读后冻结观察；核验header.id/version/inherited，完整seq与必要字段；无论读/重放/审计失败都关闭handle，不暴露原始异常中的路径／正文。拒绝超限、缺口、错身份、未完成／冷读补尾、旧/多turn、多step、工具、未知surface变换。
3. 利用官方Session在首个assistant记录前重放，提取request header/context和完整派生messages，补本卡窄形状验证。明确区分用户prompt哈希与请求边界哈希；system/developer/context变化必须改变审计指纹并触发重新核准。模型route、maxTokens与显式permission facts进入审计。
4. 服务侧许可与“请求指纹已核准”分开：无许可不得读；缺少或不匹配approvedRequestSha256时不得产生ready/已核准结论。结果可只给hash与脱敏元数据，不将上下文正文写入Knot资产／日志。**所有结果 executionAuthorized=false，不发请求、不自动回流资产**；本卡补只读接缝与审计，不授予模型调用能力。
5. 官方安装Electron以RunAsNode运行隔离测试，直接使用其Session与JSONL持久化服务创建**官方库生成的合成测试Session**，落盘→只读点读→官方重放→请求审计；没有Agent/LLM/Provider，无桌面profile/现有会话接触。必须区分“官方库契约实际运行”与“真实模型Run”。不以fake persistence测试代替这一组实际库测试。

允许：最小新src适配模块，必要Run接缝，相关tests/worker，本卡与研究、README、STATE/QUEUE、证据索引与回执。冻结vendor、已接受桌面安装与原profile不改。受信宿主composition是真实性边界，不把hash当密码学来源认证。

## 验证与收口

Maker自测必须有实际官方库测试与常规负例：读授权前置、版本/身份/seq/字段拒绝、context/header/model/permission变化、旧会话、取消/失败、句柄异常关闭、不可变切片、无资产写入／无模型调用。独立Checker另验来源、负例、落盘读回与副作用边界；不得自验收、部署桌面、push／合并或调用付费模型。可留一次本地提交锚。

完整Provider payload/所有插件重放、多turn／工具／多模态、实际Session绑定/执行、取消/恢复、成本授权和人的体验不在本卡接受范围；失败保留证据，不让合成completed记录变成真实Run成功。

## 制作候选

Maker自测51/51（原44＋新7），5新增文件已冻结，旧RUN-004四文件未变。实际官方Electron/Session/JSONL已在隔离合成会话上生成14事件、持久化、3次只读观察，3句柄关闭；物理Session与Knot字节不变。独立Checker 51/51及5项自有负例通过，结论ACCEPT_DSH_READ_AUDIT_LIMITED，中控据此Gate限定接受。

服务工厂尚未接到在用桌面composition。已核准指纹是该历史请求边界的审计关联，不是预调用授权或实际Run成功凭证；所有结果executionAuthorized/modelRunVerified均false。只读审计可以包含显式runtime-context消息，和RUN-004尚未扩大的一用户回流限制分开，不自动调用returnRun。

收口：目标＝只读接缝／窄请求审计；回收＝run_maker与独立run_checker已回执；证据＝evidence/RUN-005-INDEX.json；验收＝限定Gate，不含真实Run；入档＝本卡与STATE/QUEUE；记录＝一次本地提交，无模型／部署／push／合并；未决＝受信宿主实际绑定与执行、Provider转换、一般多轮／工具／多模态、人的体验。archive_id：kont-run-read-20261022。
