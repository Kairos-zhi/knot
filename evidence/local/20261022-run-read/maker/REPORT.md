# KONT-RUN-005 Maker 候选

本卡尚待独立 Checker。只读服务与请求边界审计，所有结果 `executionAuthorized=false`、`modelRunVerified=false`。实际 DSH Agent／Provider／模型调用为 0；官方库合成 Session 不是实际模型 Run。

## 复用与接口

- 新 `src/dsh-run-read.mjs` 复用现有 Run 验证、输入哈希与 prompt 文本，宿主注入 `hostVersion`、`persistence`、官方 `Session`、`readRun` 和 `authorizeRead`。不修改 RUN-004 的 4 份已冻结源／测试、不改 UI/vendor/profile/签名安装，不引入资产库或运行引擎。该工厂未接入在用桌面 composition，也未添加 HTTP 命令。
- 服务调用仅接收 `runId` 与取消 signal；不能从调用体提供 Session 路径、日志、读许可或核准哈希。服务侧 `readRun` 获取既有 Run，`authorizeRead` 默认缺省拒绝；明确许可必须绑定 runId、requestId、plannedSessionId、inputSha256 四元组。版本精确为 0.2.1-rc.2；拒绝带路径字符的 sessionId。
- 许可后只使用 `stat(id)`、`open(id,'read')`、`handle.read(0,1001)`、`stat(id)`、`close()`。要求 current format、v4 header、非 seeded/非继承、同一逻辑身份、前后 revision/header 一致。物理 sizeBytes 与逻辑 JSON 均上限8MB，事件上限1000；获取句柄后任何路径均关闭，原始读／重放／close异常不返回正文或路径。
- 官方 JSONL 首次 ensureRootEncoding 可能扫描根目录的文件名／目录元数据；本实现不调用公共 list/search/query 或 Agent resolve，不能声称物理层零扫描。bounded read 底层仍会解析完整物理 artifact，不是严格流式内存上限。持久层隐藏 torn physical tail，因此这里观察的是 current-format **有效连续逻辑日志**，不是物理原字节完整取证；stat 稳定也不证明不存在隐藏物理尾。

## 请求边界

- `Session.create` 全日志重放验证官方 runtime-required 不变量，再对首个 assistant/message 前的前缀重放，调用官方 `requestHeader`、`requestContext`、完整 `deriveMessages`。create 新添的内存 end-seed 标记不加入观察源事件哈希，不写回持久层。
- 官方 runtime-required replay 不是完整schema校验，额外补本卡窄字段检查：首turn=1、唯一step=1、一次纯文本 model assistant、单个准确 user-rpc prompt、可审计的 system/developer/runtime-context 消息，空工具，显式 sandbox/mode、approval/policy、permission/preset，完整 step/turn 与 completed 终态。只允许 append surface；拒绝工具、旧会话、多turn/step、未知事件/字段、替换、取消/失败/补interrupted尾、缺口/未闭合。assistant stream仅支持空数组或已校验的 compact text-chunks；其他stream形状尚未支持。
- 为贴合 `buildRequest`，所有消息与permission facts必须在唯一 initial request/header前；request/context必须在header后且紧邻assistant记录前。禁止事后新增消息被误当为已提交模型输入。route/maxTokens是显式config字段，context与输出source route必须相符。toolHistory在本切片因禁止任何工具历史而恒空，不泛化到有工具请求。
- requestSha256 对 version、四元绑定、Session header、完整 request header/config/adapterDefaults、request context、全部派生messages（含内容/source/id）、三项permission事实和显式初始metadata做稳定排序JSON哈希。submittedPromptSha256 与 inputSha256 各自保留；不混称完整 Provider HTTP payload。上下文、模型/maxTokens、权限事实变化都会改 request 指纹。
- 读许可与请求指纹核准分开：无预先核准哈希返回 needs_request_approval，错哈希返回 request_approval_mismatch，恰好匹配才是 request_fingerprint_approved；三者全都不授予执行。输出仅哈希、绑定、route/maxTokens、计数等元数据，不含消息正文、资产产物或原始异常。hash是关联/审计标识，来源真实性仍依赖受信宿主composition，不是签名认证。

## 实际验证与失败纠正

- `npm test`：构建＋51/51通过、0失败、0跳过，见 `test-results.tap`。原44项保留，新增6组fake seam负例和1组实际官方库测试。Node 类型擦除仍有既有 ExperimentalWarning。
- `run-read-official-worker.cjs` 用已安装官方Electron RunAsNode，直接加载ASAR中的0.2.1 Session/JSONL服务，在独立 `D:/Temp/kont-run-read-official-*` 建14条官方Session.append生成的合成事件，官方JSONL create/append/flush/close后再读。没有Agent/Provider/真实用户会话、没有默认profile或凭据。
- 独立expected请求指纹由worker自己用实际持久化header与官方Session前缀重放计算，未从observer首次输出复制、未自动回写许可。3次观察分别缺核准/错核准/正确核准，3句柄全关闭；物理Session文件逐文件SHA与Knot文件字节前后完全相同，Run仍prepared。实际库结果独立保存 `official-library-result.json`（再跑一组新的隔离合成Session以留独立可读结果，仍0模型调用）。
- 首轮实际库测试发现JSONL规范化会补 `delegationDepth:0`，初始窄header白名单误拒绝。已按实际发布契约允许非继承depth0；expected边界采用实际持久化规范header，避免拿创建前的header与持久化header混比。临时synthetic诊断输出已经移除。
- 新增负例：默认拒绝/版本/四元绑定/无效批准哈希；缺批准与错批准；system/developer/runtime-context/config/route/contextWindow/permission变动；迁移/旧版/seeded/错身份/超限/前后revision变化；错role/id/rpc/文本/step/surface/stream/工具/未知事件/隐藏字段/终态取消/中断/截断/缺permission；header/context逆序和request/header后插消息；读/重放/关闭异常sanitize，读/关闭时取消，以及所有已获得句柄均关闭。fixture与结果均明确合成，fake测试不代替实际库测试。

## 未覆盖

没有真实Session绑定、实际模型请求/成本授权、真实取消/恢复、桌面部署或人的体验；没有完整DSH schema/所有插件投影/Provider HTTP转换字节、一般多turn/工具/多模态/完整stream语义。只读观察不自动调用 RUN-004 returnRun，也不授予任何模型调用权限。待独立Checker后由中控决定限定Gate，Maker未提交／push／合并。
