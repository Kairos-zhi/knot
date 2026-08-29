# knot — 项目交接简报（给 Oracle agent）

> 读这份文档的 agent：你将参与 **knot 本体**的同步开发（与 之 × 杜 协作）。本文档自包含——读完即可了解项目全貌、跑起来、开始工作。
> 时间：2026-08-30 · 交接人：禾知止（之 的 agent）

---

## 1. knot 是什么

**语义空间的 A2A 工作站**——把对话思考资产化的工具：思考碎片打成「结」（knot-node），结之间连成「绳」（knot-edge，可运行的思考路径），画布即语义空间。

核心定案（均已落内容包）：

- **语义驱动**：组织前置——思想先组织，任务后认领（区别于任务驱动）
- **结 = 资产本体**（双向同步）：①资产→结（渲染）②结→资产（写回：拖拽/勾选生成/编辑持久化回资产文件，刷新不丢）
- **操作序列同构**：打结=编码 / 勾选=可见集 V_b / 生成=解码+追加（Cola DLM 推理循环的人可操作外置版）
- slogan：**语义驱动 · 敏捷开发 · 主动协作**

## 2. 当前开发状态（2026-08-30）

| 里程碑 | 状态 |
|---|---|
| 阶段 1：FlowGram 地基 + knot 数据模型 | ✅ |
| 阶段 2：结渲染 / 绳边端口 / 勾选=上下文注入 / 语义场布局 | ✅（git 0ac5102） |
| 资产同步基建：资产→结投影 | ✅（git 3374b76） |
| 双向同步：结→资产写回（localStorage + 写回服务 3101） | ✅（git 0efc1dd，实测通过） |
| 协作工程化：README / 架构地图 / 协作范式 | ✅（git c98e754） |
| GitHub 仓（zhilab/knot 私有）+ 协作者 | ⏳ 待建（之找杜要账号后） |

## 3. 怎么跑起来

```bash
cd knot-flowgram-app
npm install
npm run dev                    # 画布 dev server → localhost:3002
node scripts/asset-write-server.mjs   # 资产写回服务 → 3101（必须一起跑）
# 浏览器打开 http://localhost:3002
```

- 画布上的结来自资产清单 `src/assets/knot-assets.json`；加条目→刷新→长出新结
- 画布改动（拖拽/生成）自动写回：localStorage + 资产文件
- 重置：清 localStorage 键 `knot:canvas:v1`

## 4. 架构地图（核心机制与坑）

**目录**：

- `src/nodes/knot-node/` — 结渲染（registry + render + styles）
- `src/components/knot-edge/` — 端口/绳线/空白?位/数据转换
- `src/components/knot-generate/` — 生成面板（V_b→生成→自动成结）
- `src/context/` — selection-context（V_b）、focus-context（焦点）
- `src/services/` — asset-sync（资产→结）、asset-persistence（结→资产）、generate（mock）
- `src/assets/knot-assets.json` — 资产清单（事实源，画布写回目标）
- `scripts/asset-write-server.mjs` — 写回服务（POST /write）

**三个必读的坑（踩过，别再踩）**：

1. **renderKey**：FlowGram 按 `meta.renderKey || 'node-render'` 查渲染组件，**不是按节点 type**。自定义节点必须 `meta.renderKey = 'knot'` + `materials.renderNodes` 注册同名组件。
2. **渲染组件签名**：props = `{ node: WorkflowNodeEntity }`；业务数据用 `node.toJSON().data`（实体没有 .data 属性）；ref/选中用 `useNodeRender()`。
3. **端口与绳线**：绳线要渲染，端口必须在 registry `meta.defaultPorts` 注册，且 portID 与 KnotEdge 的 sourcePortID/targetPortID 一一对应。

**数据流**：

```
资产→结：knot-assets.json → assetsToWorkflowJSON → 初始画布（localStorage 快照优先）
结→资产：document.onContentChange → debounce 1.2s → serializeCanvas → localStorage + POST :3101/write
勾选生成：勾选(V_b) → generate(mock) → createWorkflowNodeByType('knot') → 自动成结
焦点：选中即焦点（FocusProvider）→ 距离三级（近实/中淡/远虚）
```

## 5. 协作方式（范式：用 knot 的方式开发 knot）

- **角色**：拍板人=之+杜；实现（Maker）=双方 agent；评审（Checker）=禾知止（独立验证：tsc+浏览器实测）；落账=禾知止
- **循环**：对谈→决策落资产→规格先行→任务分派（文件边界）→实现→合并评审→交接
- **红线**：不自动合并 / 同仓单会话 git / 文件边界 / 凭据零容忍 / 决策必落账 / 先调查后发言
- **同步通道**：飞书协作文档（决策）+ 内容包（范式）+ 资产清单（产物）+ 接力卡（开发状态）+ GitHub（代码）

## 6. 下一步任务候选（待 之+杜 拍板，先到先挑）

| # | 任务 | 一句话 | 规格依据 |
|---|---|---|---|
| A | push 通道 | 窗口/对话流产出 → 自动打结上画布（对应「窗口=线性空间，knot 常驻」设想） | 规格 v1 + 双向同步定案 |
| B | 共享部署实例 | knot 部署线上：前端 + 写回服务升级为后端资产服务，杜打开 URL 即用 | 协作范式 |
| C | 语义建绳 | 资产间语义关联自动生成绳（edges） | 画布基底评估 |
| D | Test Run 修复 | WorkflowRuntimeService 绑定问题（FlowGram browser mode 限制） | 已知问题 |
| E | 生成接真实 LLM | generate.ts mock → 真实模型（deepseek 等） | 机制背书六.3 |

## 7. 关键文档位置

- 完整内容包（范式/定案/行业对齐）：`kairos-oracle/Knot_完整内容包.md`
- 形式层规格 v1（当前规格基线）：`kairos-oracle/knot形式层设计规格_v1.md`
- 协作进度（飞书 docx 同源）：`kairos-oracle/语义场内核_协作进度.md`
- 架构地图：`knot-flowgram-app/docs/ARCHITECTURE.md`
- 协作范式：`knot-flowgram-app/docs/COLLABORATION.md`

## 8. 给你的第一个动作

1. 读 `docs/ARCHITECTURE.md` + `docs/COLLABORATION.md`（与本文互补）
2. 把项目跑起来（见 §3），确认画布 8 个资产结正常、写回生效
3. 与 之/杜 讨论 §6 任务选择——选定后按「规格先行」流程出规格、等拍板、再实现

*欢迎加入。knot 的语义场里，已经有你主人的结。*
