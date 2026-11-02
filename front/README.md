# Knot F1 · 只读视图

KNOT-F1-READONLY-001。原生 JS 单页与 Python 标准库 GET 反代，无框架、无构建、无第三方运行依赖、契约零改动。

在仓库根目录，使用已有且已完成所需迁移的数据库，分别在两个终端运行（不会自动建库或迁移）：

```powershell
python -m mvp.backend.http_server --db "$HOME/.knot/knot.db" --port 7318
python front/serve.py --backend-port 7318 --port 7319
```

打开 `http://127.0.0.1:7319`。素材查询输入已有 content_hash；续接包输入已有 bundle_id。页面不生成包，不提供登录或用户切换。配置鉴权的后端会照常拒绝未获授权的正文；页面不绕过权限。

## 实际范围与缺口

- 分支 `feat/knot-front-readonly`，开工 HEAD 为用户指定的 `6977bc2`；任务卡原文的 `290e743` 与“尚未创建”已被本轮用户明确提供的基线和工作区信息更新。
- 四区覆盖候选列表／详情、trace、素材正文、续接包清单／正文和完整取件指针。
- 当前 `GET /assets` 强制要求 content_hash，并非无参资产列表。因此提供 hash 查询返回的列表，另从 trace.assets 和 bundle.authorized_assets 进入正文；不宣称支持全部素材浏览。
- 当前 trace 没有 why 字段。页面显示 `—` 并说明缺失，path 原样展示；包中“为什么”段随 context_text 保留。
- candidate_sources 是事件 ID，不能冒充 asset_id；未确认候选 trace.assets 为空时，不猜来源资产。已返回的每个来源资产均展示完整 ID 和可点取件链接。
- 包中没有行号锚点时明确提示核读资产，不生成虚构行号。只复制后端正文已给出的完整 `asset_id:line "anchor"`。
- 本轮是 Maker 自核与附加独立代码复核，不能代替卡指定的小禾 Checker、Gate 或之的视觉验收。没有截图或模拟点击，没有合并或部署。

## 字段 → 接口来源（DC／第六节第一问）

没有补造业务数值、标题或时间，没有客户端计数或日期格式化。固定区名、按钮、字段名与错误说明属于界面文案。输入 hash／bundle_id 来自使用者；请求中的 cursor 原样取自接口，不当业务数据展示。

| 页面字段 | 唯一来源 |
|---|---|
| 候选列表 as_of | `GET /claims` 的 value.as_of |
| 候选按钮 source_label，缺失时完整 claim_id | `GET /claims` 的 value.items[] 对应字段 |
| 列表原始详情 claim_id、claim_type、atom、source_label、user_response、proposed_at、reviewed_at、unverified、candidate_level、atom_level、support_sources、source_members（以实际返回为准） | `GET /claims` 的 value.items[]；嵌套 status、boolean、minimal_roots 均直接来自响应 |
| 选中候选详情，包含同名字段与嵌套对象 | `GET /claims/{claim_id}` 的 value，整体呈现 |
| claim_id、source_label、atom、status、depth、path、candidate_sources、assets | `GET /trace/{claim_id}` 的 value 同名字段；path 的 event_id、event_type、subject、event_time、recorded_at、evidence_refs、depth 原样展示 |
| why | 当前接口缺失，显示 `—`，没有推导 |
| trace 来源资产 asset_id、content_hash、media_type、path 及完整取件 ID | `GET /trace/{claim_id}` 的 value.assets[] |
| 素材查询 items 及 asset_id、content_hash、media_type、path | `GET /assets?content_hash=使用者输入` 的 value.items[] |
| 素材 asset_id、media_type、encoding、content、可选 path | `GET /assets/{asset_id}?view=content` 的 value 同名字段；UTF-8 和 base64 均保持接口原文，不解码伪装正文 |
| 包清单 bundle_id、created_at、exported、authorized_assets、open_questions、context_text、export_path | `GET /bundles/{bundle_id}` 的 value；roots 的空正文显示 `—` |
| 包正文、包内标题、已有／没有条目说明、“为什么”段 | `GET /bundles/{bundle_id}?view=content` 的 value.context_text，按文本原样呈现 |
| 可复制 asset_id、行号和引号内锚点 | 同一 context_text 中后端给出的 `  > asset_id:line "anchor"`，限定资产出现在该响应 authorized_assets 中；只移除展示缩进，不截 ID 或锚点 |
| 取件链接 | 上述接口已返回的完整 asset_id，经 URL 编码拼接固定本页资产入口；对应 GET 正文路径 |

未知标量及嵌套 null 显示 `—`；真实 `0` 和 `false` 保留。字符串（尤其正文）不做替换，保留原文。

## 反例与程序化自核

验证脚本、合成库和原始日志放在 `D:/tmp/knot-f1-check/`，不增加 front 文件或依赖。`check.py` 启动真实既有后端和当前反代，Node 标准库 VM 执行页面原始脚本；DOM 使用内存元素适配器，直接调读取函数并断言内容，没有浏览器或模拟点击。因此证明 HTTP 与页面文本逻辑，不等于浏览器排版验收。

- AC-1：先在内存注入 package.json、CDN 地址、非标准库 import，确认检查拒绝；再检查真实文件。
- AC-2：拒绝接口没有的标题；实际 HTTP 响应进入 DOM，核对详情、path、完整 ID、正文、包正文和行号锚点。
- AC-3：反代接到无服务端口，真实 GET 返回 503；页面原脚本经真实 fetch 呈现“服务未起”与“重试”。
- AC-4：启动真实后端后临时开启 fixture-only token 配置，无 bearer 的正文 GET 得到实际 403；DOM 显示“无权读”，候选列表及包 roots 保留。
- AC-5：把未知值错误显示为 0 的内存反例应拒绝；真实 null／undefined 显示 `—`，0／false 保留。CSS 只有一组彩色强调（链接／焦点），无动画，显式 reduced-motion。静态配色检查不能替代人的视觉判断。
- AC-6：检查 mvp 与 contract 差异为空，执行既有后端全套测试，见下方原始输出。
- 独立复核发现贪婪正则会误吞正文中的 `section:12 text`；修为不含空白／冒号的 ID 匹配。实际 fixture 加入该反例后重跑通过，复核者确认阻塞项关闭。

复跑：从仓库根执行 `python D:/tmp/knot-f1-check/check.py`（依赖已有后端开发环境）；DOM 脚本为同目录 `dom.cjs`。临时库只用于合成验证，前端不读写库，不发 POST。

<!-- RAW-RECEIPT -->

## 原始 HTTP／DOM 输出

执行 `python D:/tmp/knot-f1-check/check.py`，退出码 0。

```text
AC-1 negative controls: package.json / CDN / nonstdlib import rejected; PASS
AC-1 actual: allowed files only; external URLs=0; stdlib imports only; PASS
AC-5 CSS: one chromatic accent (#285eaa), links/focus; no animation; reduced-motion explicit; PASS
AC-3 HTTP offline: [503, {"ok": false, "error": {"message": "服务未起，请启动 Knot 后端后重试"}}]
AC-3 DOM actual fetch: 服务未起 + 重试; nonempty page; PASS
HTTP GET /claims?status=unconfirmed 200
HTTP GET /claims/60581e54-2f6a-51c2-8e30-b98793f62bc4 200
HTTP GET /trace/60581e54-2f6a-51c2-8e30-b98793f62bc4 200
HTTP GET /assets?content_hash=b837f3cd51dcf8b2e5ebfe4843e0bea94cb34aa0b813d7fbb23b74686bed0e1c 200
HTTP GET /assets/ace95dea-5b49-42df-abf9-30abf48b71eb?view=content 200
HTTP GET /bundles/dbe93274-25cf-4485-9ecb-f5f4f0a020eb?view=content 200
AC-2 DOM actual API: claim, trace path, full asset id, content, bundle context and exact asset_id:line anchor preserved; PASS
AC-5 DOM: null/undefined=—; zero=0; false=false; readonly pointer; PASS
AC-2/5 negative controls: invented title and null-as-zero rejected; PASS
GET-only DOM requests: ["/api/claims?status=unconfirmed","/api/assets?content_hash=b837f3cd51dcf8b2e5ebfe4843e0bea94cb34aa0b813d7fbb23b74686bed0e1c","/api/assets/ace95dea-5b49-42df-abf9-30abf48b71eb?view=content","/api/claims/60581e54-2f6a-51c2-8e30-b98793f62bc4","/api/trace/60581e54-2f6a-51c2-8e30-b98793f62bc4","/api/bundles/dbe93274-25cf-4485-9ecb-f5f4f0a020eb","/api/bundles/dbe93274-25cf-4485-9ecb-f5f4f0a020eb?view=content"]
AC-4 HTTP backend: [403, {"contract_version": 1, "ok": false, "error": {"code": "FORBIDDEN_VIEW", "message": "FORBIDDEN_VIEW", "detail": {}}}]
AC-4 DOM actual 403: 无权读 + 重试; claims and bundle roots retained; PASS
Boundary HTTP: non-read routes/static traversal=404; PUT=405; PASS
```

## pytest 原始输出

首轮共享临时目录 `D:/tmp/pytest-of-x2270` 被拒绝访问，尾行为 `88 passed, 403 errors`。指定独立 basetemp 后尾行为 `2 failed, 487 passed, 2 skipped`；两处 export 测试默认写真实 home，沙箱拒绝，原始日志为 `D:/tmp/knot-f1-pytest.txt`、`D:/tmp/knot-f1-auth.txt`。没有修改后端。

最终仅为本次测试进程隔离 home，未修改系统或用户环境配置：

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:USERPROFILE='D:/tmp/knot-f1-test-home'
$env:HOME='D:/tmp/knot-f1-test-home'
python -m pytest mvp/tests/ -q -p no:cacheprovider --basetemp D:/tmp/knot-f1-pytest-isolated
```

```text
........................................................................ [ 14%]
........................................................................ [ 29%]
........................................................................ [ 43%]
........................................................................ [ 58%]
.........ss............................................................. [ 73%]
........................................................................ [ 87%]
...........................................................              [100%]
489 passed, 2 skipped in 226.86s (0:03:46)
```

## 第六节逐条自检

1. 未补造业务数值／标题；逐字段来源见上表。全量素材列表、why 及未确认候选的事件→资产映射属于既有接口缺口，不能记为全部原目标已满足。
2. 后端没起与真实 403 均已实际运行，HTTP／DOM 原始输出见上文。DOM 使用内存适配器执行页面原脚本，不证明浏览器排版。
3. 仓库只新增 front 三文件。`git diff --stat` 原始 stdout 为空，因为 front 尚未暂存，不能据此当作没有新增。`git status --short` 原始输出：

```text
?? front/
```

4. `git diff main -- mvp/contract/` 原始 stdout 为空；`git diff main -- mvp/` 原始 stdout 也为空。后端和契约零改动。

## 交付阻碍

本地 `git add -- front/index.html front/serve.py front/README.md` 原始错误：

```text
fatal: Unable to create 'C:/Users/x2270/Documents/ChatGPT/KONT/.git/worktrees/knot-maker-front/index.lock': Permission denied
```

`gh auth status` 报凭据失效；Git 网络查询报 `SEC_E_NO_CREDENTIALS`。GitHub 连接器可读用户指定基线，搜索目标远端分支为空，尝试创建分支时被审批策略拒绝，原始输出：

```text
MCP tool call requires approval, but approval policy is never
```

未完成本地 commit、推送或 draft PR；未修改身份、凭据或权限，没有合并或部署。指定 handoff 回执路径不在本会话可写范围，未尝试越界写入。

相同回执保留在 `D:/tmp/20261102_Knot_F1_只读视图_回执.md`。中控可取 `D:/tmp/knot-f1-front.patch`（三文件新增补丁）、`D:/tmp/knot-f1-pr-body.md`（具体 PR body），或当前 front 三文件继续交付。仍待指定小禾 Checker、Gate 与之的视觉判断。
