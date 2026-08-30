# knot 架构地图

> 目的：让新协作者（人 or agent）不猜——每个机制在哪、怎么接、踩过的坑。
> 更新：有新机制/新坑必须补进来。

## 技术栈

- React 18 + TypeScript，Rsbuild（`rsbuild.config.ts`），入口 `src/app.tsx`
- FlowGram.AI `@flowgram.ai/core` 1.0.14（free-layout-editor / free-lines-plugin / materials-plugin）
- 状态：React Context（勾选/焦点）+ FlowGram 文档模型（WorkflowDocument）

## 目录地图

| 路径 | 职责 |
|---|---|
| `src/knot-model.ts` | 数据模型：`KnotNode`（id/type/data{title,summary,token,src,chain_id}/meta{position}）、`KnotEdge`（sourceNodeID/targetNodeID/sourcePortID/targetPortID）、`KnotFlowDocument` |
| `src/nodes/knot-node/` | 结节点：`index.tsx`=registry（type='knot'，meta.renderKey='knot'，defaultPorts）；`render.tsx`=渲染组件；`styles.css`=样式（疏离/克制/单强调色 #ff9500） |
| `src/components/knot-edge/` | 绳边与端口：`ports.ts`（in/out 端口常量）、`LineRender.tsx`（细绳线 SVG）、`empty-slots.tsx`（空白 ? 位）、`convert.ts`（KnotFlowDocument→WorkflowJSON） |
| `src/components/knot-generate/` | 生成面板：勾选集列表 + 生成按钮 → `generate()` → 新结自动上画布 |
| `src/context/selection-context.tsx` | 可见集 V_b：`useSelection()` → { checkedIds, toggle }；`SelectionProvider` 包在 `app.tsx` |
| `src/context/focus-context.tsx` | 焦点：`useFocus()` → { focusedId, distanceOf, resetFocus }；监听 `WorkflowSelectService.onSelectionChanged`（选中即焦点）；`FocusProvider` 在 `editor.tsx` 内 |
| `src/services/asset-sync.ts` | 资产→结：`assetsToWorkflowJSON`（全量投影，支持 position 恢复）、`applyAssetDiff`（增量增改删，预留） |
| `src/services/asset-persistence.ts` | 结→资产：`serializeCanvas` / localStorage / `pushSnapshotToAssetFile`（POST 3101）/ `watchCanvas`（onContentChange 监听） |
| `src/services/generate.ts` | 生成服务：`generate({checked})` → mock（800ms 占位）；TODO 接 LLM |
| `scripts/asset-write-server.mjs` | 协议端点（3101）：`GET /snapshot` 全量快照 / `POST /command` 命令信封 / `GET /events` SSE / `POST /write` 画布写回兼容；CORS 白名单 localhost:3002 |
| `scripts/start-all.mjs` | 一键启动：dev(3002) + 协议端点(3101) |
| `src/assets/knot-assets.json` | 资产清单：kairos-oracle 关键文档的索引，画布写回目标 |

## 核心机制（含踩坑）

### 1. renderKey 机制（必读，第一个坑）
FlowGram 渲染节点时按 **`meta.renderKey || 'node-render'`** 查渲染组件——**不是按节点 type**。
自定义节点必须在 registry 的 `meta` 里设 `renderKey`（`src/nodes/knot-node/index.tsx`：`meta.renderKey = 'knot'`），
并在 `use-editor-props.tsx` 的 `materials.renderNodes` 注册同名组件。
坑：只设 type + renderNodes 不生效，节点会渲染成默认 BaseNode（3px 横条）。

### 2. 渲染组件签名（第二个坑）
渲染组件 props = `{ node: WorkflowNodeEntity }`（不是 NodeRenderReturnType）。
- 业务数据：`node.toJSON().data`（实体没有 .data/.meta 属性）
- ref/选中：`useNodeRender()` → { nodeRef, selected, selectNode }
- 端口渲染：registry `meta.defaultPorts`（WorkflowPort[]），绳线端点经 `getPortEntityByKey('output'/'input', portID)` 解析——**绳线要渲染，端口必须在 defaultPorts 注册且 portID 与 KnotEdge 一一对应**

### 3. 双向同步（结=资产本体）
```
资产→结：knot-assets.json → assetsToWorkflowJSON → 初始画布（启动时 localStorage 快照优先）
结→资产：document.onContentChange → debounce 1.2s → serializeCanvas
          → localStorage（即时）+ POST localhost:3101/write（写回资产文件）
```
- 写回服务必须和 dev server 一起跑（`node scripts/asset-write-server.mjs`，或一键 `node scripts/start-all.mjs`）
- 协议端点（3101）：`GET /snapshot`（全量快照+seq）/ `POST /command`（OpResult 信封，v1 支持 knot.create/update/delete/ping；画布级命令在桥接接入前返回 CANVAS_OFFLINE）/ `GET /events`（SSE，?since=seq 重放历史）
- 基线同步：PersistenceBridge 挂载 1.5s 后自动对齐一次
- 重置：清 localStorage `knot:canvas:v3`

### 4. 勾选 → 生成链路（Cola 操作序列同构）
勾选（V_b）→ 生成面板 → `generate({checked})`（mock）→ `createWorkflowNodeByType('knot', pos, {data})` → 自动成结。
对应：勾选=可见集 V_b，生成=解码+追加（机制背书见规格 v1 六节）。

### 5. 焦点与语义场
- 焦点 = 选中即焦点（FocusProvider 监听选中事件）
- 距离三级：`distanceOf(id)` 算到焦点结的欧氏距离 → near(<400)/mid(<900)/far → opacity/字号
- 空白 ? 位：`KnotEmptySlots`（虚线框，不可点）

## 开发纪律

- 文件边界：一个任务只动自己的目录（见 `阶段2_dispatch/` 模式）
- 同仓库同时仅一个会话操作 git；合并用单次提交
- 改完必跑 `npx tsc --noEmit`；交互改动必开浏览器实测（localhost:3002）
- 新坑/新机制：补进本文档 + 接力卡
