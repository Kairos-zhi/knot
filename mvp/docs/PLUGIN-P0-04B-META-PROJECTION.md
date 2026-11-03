# P0-04B：模型侧资产元数据最小投影

2026-11-03。用户要求继续开发；GPT-6 中控、GPT-6.1 Maker、独立 Checker、之 Human Gate。P0-04A 已核本机 CLI/工具及源码，未发现可验证的 Knot 宿主，实际输入时点仍未知。本卡推进不依赖安装的离线组件，不能据此宣称插件已接入或正文授权已闭环。

## 基线与范围

固定远端 main `5a731a0e4509350ad0bc4e258cf903ffc83a81c5`，独立分支 `codex/p0-04b-meta-projection`。#51/#52 均为未合并草稿，本卡不依赖 #52 的 claim 写修复。只新增 `mvp/plugin_projection.py`、`mvp/tests/test_plugin_projection.py` 与本卡；不改 HTTP/schema/reader/数据库或其他入口。

允许实现纯内存资产 meta 投影，供未来薄适配调用；只处理调用方已取得的单资产或资产列表 HTTP JSON 成功/失败信封。没有网络、文件、数据库、日志、授权配置和持久化选择状态，不安装插件，不触达在用服务、不调用模型业务。只本地候选提交，不自动推送、合并或部署。

## 数据契约

1. 输入复用 contract_version=1 的 HTTP 信封，单资产必须 view=meta；列表允许现有无 view 形状或显式 meta。content/其他 view、错误版本、错误形状失败封闭。
2. 成功输出仅包含 items，每项仅保留规范化 UUID asset_id 与有限 kind 分类。kind 从固定 MIME 表映射 text/image/document/archive/binary，其他类型为 unknown；不透传原 MIME 字符串。空列表合法。该投影保留可关联对象的 ID，不声称匿名化或无信息泄露。
3. content_hash、path、source_uri、size、正文/编码、附带未知字段、查询回显、as_of 及上游错误 message/detail 都不透传。上游失败和无效输入仅返回固定错误码，不回显输入或异常正文。输出有独立的投影结构，不能冒充原 HTTP 契约。
4. 单项无效不能造成部分成功。输入不变；不存在路径解引用、预取正文、actor 参数或 grant/revoke 行为。上游鉴权与 reader 保持权威；本组件不授予访问权，也不保证元数据无敏感信息。

## Maker 与 Checker

先固定失败反例，再完成实现；用真实现有 transport_views.metadata 的合成结果核单项/列表投影。测试覆盖嵌套正文/路径/来源/指纹/凭据哨兵、未知字段、错误 detail、恶意 MIME、非法 ID、错误版本/view/形状和输入不变；不得把这些结果称作宿主输入时点或撤选验证。只用合成数据，进程 HOME/USERPROFILE/TEMP/TMP/basetemp 隔离，禁用缓存和字节码。运行与改动相称的测试，独立 Checker 直接复核并绑定候选。

## 状态

GPT-6.1 已实现候选，独立 Checker 限定通过；可固定本地提交。真实宿主、正文提交/撤选、reader 生命周期和产品接受仍开放；本卡只证明离线投影边界。

### Maker 自核

实现 `project_asset_meta`，处理已解码的 HTTP JSON。UUID 接受带连字符的大小写拼写并规范为小写；列表保留输入顺序及重复 ID。MIME 使用精确表匹配，未收录值统一为 unknown。版本仅接受整数 1，拒绝布尔值；单资产须显式 meta。仅校验投影所需的形状，丢弃未知字段不代表通过上游完整 JSON Schema。坏形状返回 `INVALID_INPUT`，上游错误仅返回 `UPSTREAM_ERROR`；无效项使整批拒绝。

新测试使用现有 `metadata(row)` 的合成输出及恶意哨兵。红测为模块尚未存在时的 28 个 setup error；实现后 28 passed in 0.06s，退出码 0。两次分别隔离 HOME、USERPROFILE、TEMP、TMP 与 basetemp，使用现有 Python 的 `-B`、`PYTHONDONTWRITEBYTECODE=1` 和 `-p no:cacheprovider`。原始输出见私有交接目录 `20261103_Knot_P0-04B_meta_projection/` 内的 `red.log` 与 `green.log`。本次只跑新增模块测试，三份新增文件单独核本机身份路径；主线旧 README 的身份问题仍由 #52 候选处理。独立 Checker 与 Human Gate 待定。

### 独立复核

Checker 亲写直接回执并独立运行 28 项（0.06s）通过，另验重复 ID 顺序、输入/输出独立、异常信封和 UUID 边界；确认仅三个新增文件、无 I/O 或授权操作。红测只证明模块缺失，不冒称旧行为已复现。提交后另核 commit/tree/原始 blob，Human Gate、推送、合并及部署未执行。
