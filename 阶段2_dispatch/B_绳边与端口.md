# Dispatch B：绳边与端口

> 派发：2026-08-30 · 阶段 2 Maker B
> 依据：`kairos-oracle/knot形式层设计规格_v1.md` + `kairos-oracle/画布基底评估_FlowGram_vs_infinite-canvas.md`（先读评估文档）
> 工作目录：`C:/Users/x2270/hermes-sync/kairos-oracle/knot-flowgram/knot-flowgram-app`

## 任务
KnotEdge 接入 free-lines 连线系统：端口定义与渲染、绳线渲染。

## 数据模型（已存在，只读勿改）
`src/knot-model.ts`：KnotEdge { sourceNodeID, targetNodeID, sourcePortID, targetPortID }

## 依据要点
- 画布基底评估：FlowGram 的 nodes/edges/ports/blocks = 结绳模型天然对应；绳 = 结之间的数据流/可运行思考路径
- 模板自带 `@flowgram.ai/free-lines-plugin`（package.json 已装），参考模板现有用法（可读 `README.zh_CN.md`、`src/editor.tsx`、现有组件，全部只读）
- 可选参考：`kairos-oracle/coze_工作流节点指南.md` 的端口概念（文件 129K，只看端口相关小节，勿通读）

## 实现要求
1. `src/components/knot-edge/` 下实现端口组件（输入/输出端口，小圆点）与绳线渲染，接入 free-lines 插件
2. 端口与绳的数据从 KnotNode/KnotEdge 读取（勿改模型文件）
3. v1 不做拖拽建绳（连接即重叠=后置项），只渲染已有绳+端口
4. 视觉：克制——端口小圆点、绳线细、不抢节点视觉

## 文件边界（只动这些）
- 可新建：`src/components/knot-edge/` 下文件
- 禁止：`src/nodes/` / `src/context/` / `src/plugins/` / knot-model.ts / initial-knot-data.ts / editor.tsx / app.tsx / package.json / 任何 git 操作 / npm install

## 验收
3000 端口画布：结与结之间有绳线渲染；结上有端口小圆点可见。

## 交付
完成后运行 `npx tsc --noEmit` 自查，报错全部修掉再交付。
