# knot — 语义空间的 A2A 工作站

knot 是「语义空间的 A2A 工作站」：结（knot-node）= 对话思考资产化的原子单位，绳（knot-edge）= 结之间的可运行思考路径。**结 = 资产本体（双向同步，非投影）**——画布上的改动会写回资产文件，刷新不丢。

技术底座：FlowGram.AI（@flowgram.ai/core 1.0.14，free-layout）+ React 18 + TypeScript + Rsbuild。

## 快速开始（10 分钟跑起来）

前置：Node 18+、npm。

```bash
# 1. 安装依赖
npm install

# 2. 启动画布 dev server（默认 3002；3000/3001 可能被其他项目占用）
npm run dev

# 3. 启动资产写回服务（结→资产文件 的写回通道，必须一起跑）
node scripts/asset-write-server.mjs

# 4. 浏览器打开
#    http://localhost:3002
```

打开后：画布上是资产清单（`src/assets/knot-assets.json`）投影出的结。点击结 = 选中即焦点（星标 + 近实远虚）；点勾选框 = 加入可见集 V_b；右下角生成面板 = 勾选集 → 生成新结（当前 mock）。

## 资产清单怎么维护

- **加资产**：在 `src/assets/knot-assets.json` 的 `assets` 数组加一条 `{ id, title, summary, src, chain_id }`，刷新页面即长出结。
- **画布改动写回**：拖拽位置/勾选生成/编辑 → 变更监听（1.2s debounce）→ localStorage 即时保存 + POST 写回服务（3101）→ 资产文件更新。启动时 localStorage 快照优先恢复。
- **重置画布**：清浏览器 localStorage（键 `knot:canvas:v1`）后刷新，回到资产清单投影。

## 常用命令

```bash
npx tsc --noEmit        # 类型检查
npm run dev             # 画布 dev server（3002）
node scripts/asset-write-server.mjs   # 写回服务（3101）
```

## 已知问题

- **Test Run 按钮不可用**：`Uncaught Error: No matching bindings found for WorkflowRuntimeService`——FlowGram demo 浏览器模式限制，不影响 knot 核心，Test Run 功能后置。
- dev server 与写回服务是独立进程，重启后都要拉起。

## 目录速览

```
src/
  assets/knot-assets.json     # 资产清单（事实源之一，画布写回目标）
  knot-model.ts               # 数据模型：KnotNode / KnotEdge / KnotFlowDocument
  nodes/knot-node/            # 结渲染（折叠/展开/焦点/勾选/距离三级）
  components/knot-edge/       # 端口、绳线、空白?位、KnotFlowDocument→WorkflowJSON 转换
  components/knot-generate/   # 生成面板（V_b → 生成 → 自动成结）
  context/                    # selection-context（V_b）、focus-context（焦点）
  services/asset-sync.ts      # 资产→结（投影/全量 + diff 增量）
  services/asset-persistence.ts # 结→资产（序列化/localStorage/写回/监听）
  services/generate.ts        # 生成服务（mock，TODO 接 LLM）
scripts/asset-write-server.mjs # 写回服务（浏览器 → 资产文件）
```

详细架构见 `docs/ARCHITECTURE.md`，协作方式见 `docs/COLLABORATION.md`。
