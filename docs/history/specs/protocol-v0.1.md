> 历史方案归档 · 来源 H16 · 整理入库 2026-10-18。
> 本文保留原论证与原日期；“当前／已完成／待办”指原文时点，不是今天的工程进度或新批准的排期。
> 本机路径和内部链接已归一，图片及内部运行明细未迁入。现行入口：[文档地图](../../README.md)；来源与变换：[登记](../sources.md)。

---

# knot 协议规范 v0.1（RFC · 草案）

> 状态：DRAFT —— 反审查后的承载物，供之拍板后再冻结
> 依据：决策 C（自定轻协议+留接口）+ 反审查报告（2×P0）+ AGENT_FRIENDLY.md（三条硬标准）
> 定位：这是「结」的 agent-agnostic 协议面，宿主=适配器，协议=本文件，二者解耦

---

## 0. 一句话

**「结」对 agent 暴露一个宿主无关的协议面（本 RFC），任何宿主（Hermes/Oracle/未来）通过一个薄适配器把协议映射到自己环境；协议面只依赖「操作内核 + 事件流 + 快照」，不依赖任何宿主的私有 API。**

---

## 1. 事实前提（反审查已钉死，写进 RFC 免得再犯）

| 事实 | 证据 |
|---|---|
| 操作内核**已存在**，不是空白 | `src/services/knot-operation-service.ts` 17 方法（createKnot/updateKnot/deleteKnot/connect/disconnect/disconnectAll/threadChain/getChain/growKnot/generateFromSelection/setTool/getTool/focusKnot/expandKnot/togglePin/getSnapshot/subscribe） |
| 操作内核**只在浏览器 document 内**可执行 | service 依赖 document/linesManager，node 端无 document |
| v2 端点现状 = 单进程、单文件、无锁、无身份、命令面残缺 | `scripts/asset-write-server.mjs` |
| 画布级命令当前返回 CANVAS_OFFLINE | `asset-write-server.mjs:127` |

**核心结论**：协议面 = 操作内核 + 事件流 + 快照。操作内核在浏览器内，所以协议面的执行端必须有一个「浏览器内桥」（Canvas Bridge）把命令送进 document 执行；v2 端点只是「资产文件级」的浅封装，不是完整协议面。

---

## 2. 架构：协议面 = 四层

```
宿主适配器（Hermes/Oracle/...）
        │  宿主无关协议（本 RFC）
        ▼
┌─────────────────────────────┐
│  协议端点（HTTP + SSE）      │  ← 唯一对外口，无宿主概念
│  GET /snapshot              │
│  POST /command              │
│  GET /events                │
│  POST /write（兼容旧）      │
└──────────────┬──────────────┘
               │
      ┌────────┴────────┐
      │  命令路由        │  资产级 → 文件写回
      │                 │  画布级 → Canvas Bridge
      └────────┬────────┘
               │
      ┌────────┴─────────────────┐
      │ 操作内核 OperationService │  ← 唯一写路径（AGENT_FRIENDLY 红线）
      └──────────────────────────┘
```

---

## 3. 命令全集（协议面必须覆盖，不再有 CANVAS_OFFLINE 黑洞）

### 3.1 资产级（服务端可执行，文件=事实源）
- `knot.create` / `knot.update` / `knot.delete` —— 已有
- `ping` —— 已有

### 3.2 画布级（必须经 Canvas Bridge 进浏览器 document 执行）
- `rope.connect` / `rope.disconnect` / `rope.disconnectAll` —— 已有签名，当前 CANVAS_OFFLINE
- `chain.thread` / `chain.get` —— 已有签名
- `generate.grow` / `generate.fromSelection` —— 已有签名
- `tool.set` / `tool.get` / `focus.set` / `expand.set` / `pin.toggle` —— 已有签名

**映射表**（协议命令 → 操作内核方法，一一对应，禁止协议命令绕过内核直连 document）：

| 协议命令 | 内核方法 | 层级 |
|---|---|---|
| knot.create | createKnot | 资产 |
| knot.update | updateKnot | 资产 |
| knot.delete | deleteKnot | 资产 |
| rope.connect | connect | 画布 |
| rope.disconnect | disconnect | 画布 |
| rope.disconnectAll | disconnectAll | 画布 |
| chain.thread | threadChain | 画布 |
| chain.get | getChain | 画布 |
| generate.grow | growKnot | 画布 |
| generate.fromSelection | generateFromSelection | 画布 |
| tool.set/get | setTool/getTool | 画布 |
| focus.set | focusKnot | 画布 |
| expand.set | expandKnot | 画布 |
| pin.toggle | togglePin | 画布 |

---

## 4. 三个硬骨头（反审查 P0，必须进 v0.1 就设计）

### 4.1 并发写原语（多宿主共享事实源）
- **现状**：readAssets → 内存改 → writeFileSync 全量覆盖，无锁。两宿主并发写 = 后写覆盖先写，丢数据。
- **v0.1 要求**：写路径必须有并发保护，三选一（拍板时定）：
  1. **文件锁**（最低成本）：写前 `lockfile`，写完释放；同机多宿主够用
  2. **CAS/版本号**：写带 `baseSeq`，端点比对当前版本，不匹配返回 CONFLICT 让调用方重试
  3. **SQLite 事实源**（治本）：资产进 SQLite（单文件 + 事务 + 并发安全），JSON 文件只做导出快照
- **明确不选**：继续「文件=唯一事实源」且无锁（现状）——反审查已证必烂

### 4.2 seq 持久化 + 事件回放
- **现状**：seq 是内存变量，重启归零；事件缓冲 EVENT_CAP=200，溢出丢；`?since=` 重放跨重启不可靠
- **v0.1 要求**：seq 必须持久化（落到文件/SQLite），事件回放要么「持久事件表」要么明确「回放=全量 snapshot 重置」语义，不能假承诺

### 4.3 宿主身份 + 最小鉴权
- **现状**：CORS 白名单 + 无 Origin 放行，`source` 参数调用方自报可伪造，无审计
- **v0.1 要求**：每个宿主有身份 token，写入事件带 `source`（不可伪造，端点从 token 映射，不信 body 自报）；最小鉴权=共享 token + 白名单宿主，先不做完整 RBAC

---

## 5. Canvas Bridge（画布级命令的执行通道）

**这是协议面完备性的最大未知数，单独一节。**

问题：操作内核在浏览器 document 内，协议端点在 node 服务端，二者之间缺一条「命令送进浏览器执行、结果回传」的通道。

候选路线（拍板前需调研，不在此拍）：
1. **宿主轮询**：浏览器端 Canvas Bridge 定期 `GET /command?since=` 拉待执行命令 → 内核执行 → 结果 `POST /write` 回写。最简，有延迟，适合低频操作。
2. **WebSocket 双向**：浏览器端持长连接，端点下发命令、接收结果。实时，但要管连接生命周期。
3. **postMessage**：宿主（Hermes 预览栏）在 iframe 外 postMessage 注入命令，浏览器内监听。只适合宿主本身就是浏览器的场景，不是通用解。

**v0.1 暂定走路线 1（宿主轮询）**：因为它宿主无关（任何 agent 只要能 HTTP 就能用）、复用现有 /command + /write 端点、不引入新协议。延迟可接受（agent 操作画布是低频事件）。

---

## 6. 清石山顺序（反审查修正：先立规范，再动前端）

反审查抓到顺序陷阱：不能先归档再立规范（归档依赖「选对主开发线」，而选对依赖「协议完备性」）。正确顺序：

1. **本 RFC 冻结**（2026-08-31 拍板）——命令全集 + 并发原语 + 身份模型 + Canvas Bridge 路线
2. **协议端点 v2 → v0.1 升级**——补文件锁/seq 持久化/token 身份（§4 三块，P0 实活）
3. **Canvas Bridge 落地**——画布级命令打通，消灭 CANVAS_OFFLINE 黑洞
4. **归档** infinite-canvas / knot-canvas / knot-lab（留样，确认无未合并协议实验；launcher 指向一并修）
5. **launcher 重写为适配器#1**（Hermes）——此时协议面已固定，适配器才是真「薄」

---

## 7. 冻结决策（2026-08-31 拍板，v0.1）

| # | 决策项 | 定案 | 理由 |
|---|---|---|---|
| 1 | 并发原语 | **文件锁**（写前 O_EXCL 锁文件，拿不到→409 CONFLICT） | 当前单开发者、多宿主真并发未发生（之 8/31：先不管 Oracle）；SQLite 治本但引入新依赖+迁移成本，等 Oracle 真接入再评估升级。预留 CAS 版本号字段 |
| 2 | Canvas Bridge 路线 | **宿主轮询**（浏览器端定期 GET 拉待执行命令→内核执行→POST 回写） | 宿主无关（任何 agent 能 HTTP 即用）、复用 /command+/write、agent 操作画布是低频事件，延迟可接受 |
| 3 | 事件回放语义 | **seq 落盘 + 冷启动全量 snapshot 重置** | seq 持久化（简单可靠）；不做持久事件表（重）。agent 冷启动本就先拉 /snapshot 看全貌，事件流是增量 |
| 4 | 宿主身份 | **共享 token + 端点映射 source** | 初期都是自己人 agent，共享 token 够用；关键修正=source 不信 body 自报，端点从 token 映射（反审查指出的可伪造点）。要审计再拆每宿主 token |
| 5 | launcher 断链 | **归档时一起修**（第 4 步） | launcher 反正要重写为适配器#1，现在单独修指向=白干一次 |
| 6 | 多宿主真并发 | **否（当前）** | 之 8/31 明确先不管 Oracle，Oracle 未接入；当前只有之一个人开发。文件锁足够，真并发等 Oracle 接入再评估 |

**v0.1 冻结后，协议面 = 操作内核 + 事件流 + 快照，承载物是本 RFC，不再是 .mjs 脚本注释。**

---

*本 RFC 是决策 C 的承载物。反审查判定「补不齐 (a)，C 就是口号」——本文件补的正是 (a)。v0.1 已冻结（2026-08-31），后续改动走版本迭代。*
