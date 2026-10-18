# 协议与操作入口

更新：2026-10-18。继承业务协议 v0.1；[原 RFC 全文](../history/specs/protocol-v0.1.md)保留草案到 §7 冻结的过程。当前实现仍需以源码与明确测试范围核对。

## 四种接口分开看

人的 UI、Knot 业务命令、资产数据接口、外部 Agent／工具运输不是同一层。MCP、A2A、A2UI、MCP Apps 等可以成为适配方向；仅有开放 HTTP 不等于这些标准已经全部兼容。

原则是共用模型、操作内核与业务语义，外部宿主做薄适配。遇到缺口先查已有命令，不另起 QueryScene／ApplyCommand 或通用任务总线。

## 当前 HTTP 面

实现：[asset-write-server.mjs](../../knot-flowgram-app/scripts/asset-write-server.mjs)，兼容桥：[KnotCanvasBridgeService](../../knot-flowgram-app/src/services/knot-canvas-bridge-service.ts)。

| 路由 | 当前用途 |
|---|---|
| GET /snapshot | 服务侧资产／关系快照及 seq |
| GET /events | SSE 增量事件与有限内存缓冲 |
| POST /command | 接收现有命令信封；资产级执行，需浏览器内核的动作进入桥队列 |
| POST /write | 兼容资产／关系写回 |
| POST /command/poll | 桥接宿主拉取待执行命令 |
| POST /command/ack | 桥接宿主回传执行结果 |

**poll 和 ack 当前均为 POST。** 历史 RFC 的概念写法与早期交接不能替代实际路由。

保留 `knot.*`、`rope.*`、`chain.*`、`generate.*`、`tool.*`、`focus.set`、`expand.set`、`pin.toggle` 等已有操作语义。当前 `focus.set` 是节点焦点，不等于产品级工作现场 Focus。

## 新现场能力：当前是本地 API

`executeWorksiteCommand(command, { source })` 支持：

| 类型 | 主要参数 |
|---|---|
| worksite.create | id、可选 assetId／conversationId |
| worksite.activate | worksiteId |
| worksite.update | worksiteId、draft／agentId |
| worksite.supply | worksiteId、assetId、mode=connect／exclude／suggest |
| presentation.open | id、worksiteId、kind／layout |
| presentation.update | presentationId、kind／closed／layout |

`getSnapshot`、`restoreSnapshot`、`compileWorksiteInput` 和 `subscribe` 是操作服务入口。`prepareWorksiteRequest`／`dispatchWorksiteRequest` 是本地请求适配，receiver 由调用者注入。

这些 API 有服务层测试；本 PR 没有把它们全部注册成新的 HTTP 命令，也没有增加远端 Workspace 存储。调用方传入的 source 是操作来源描述，不是独立凭据或细粒度身份认证。

## 冻结约束与真实限制

### 关系语义与授权边界

结型和绳的关系只表达路径、关联、供给或待拆问题等业务语义，不直接授予读、写或 Agent 使用权限。每次读取、写入或提交给 Agent 的动作，都必须分别核对供给范围、目标操作、调用者身份和授权策略；选中、展开、画布相邻或存在一条绳，均不能替代授权检查。当前文档描述的是边界原则，不把它误写成仓库已经具备完整的细粒度鉴权实现。

| 事项 | 已有选择 | 不能扩大成什么承诺 |
|---|---|---|
| 并发写 | 写路径文件锁，冲突返回 409 | 完整 CAS、跨记录事务或分布式一致性 |
| seq／事件 | seq 落盘；事件为有限内存缓冲；冷启动读 snapshot | 无限历史重放、跨重启保留全部待执行队列 |
| 鉴权与来源 | 写类路由 token；宿主配置来源映射 | 每个 Agent 都有独立不可伪造身份 |
| 兼容写回 | assets／edges | 已实现 Workspace 远端同步 |

当前服务有本地开发默认配置，读端点也不能据此宣称满足对外部署要求。局域网／NAS／多宿主接入前必须明确监听范围、读写鉴权、凭据与冲突语义；这些属于实际接入工作，不在文档里宣布已加固。

## 扩展方式

新增能力带上版本、旧调用方行为、命令／快照／事件映射与故障测试。业务层不持有宿主秘密；实际请求和工具读写授权分开。Bridge 的模拟 fetch／同进程双实例断言不证明生产 HTTP、跨进程恰好执行一次或真实模型已经接通。

验收见[服务层与真实链路分层](../development/acceptance.md)。
