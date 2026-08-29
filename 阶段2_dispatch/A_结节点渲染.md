# Dispatch A：结节点渲染

> 派发：2026-08-30 · 阶段 2 Maker A
> 依据：`kairos-oracle/knot形式层设计规格_v1.md`（先读该文件二、四、六节）
> 工作目录：`C:/Users/x2270/hermes-sync/kairos-oracle/knot-flowgram/knot-flowgram-app`

## 任务
把 KnotNode 渲染成「结」：折叠=圆点+标签 / 展开=卡片；焦点高亮；勾选 UI 挂点。

## 数据模型（已存在，只读勿改）
`src/knot-model.ts`：KnotNode { id, type:'knot', data:{ title, summary, token, src, chain_id }, meta:{ position } }

## 接口契约（其他 Maker 并行实现中，先按契约 import，合并后统一验证）
- `src/context/selection-context.ts` 导出 `useSelection(): { checkedIds, toggle(id) }`（Maker C 的地盘）
- `src/context/focus-context.ts` 导出 `useFocus(): { focusedId }`（Maker D 的地盘）
- 若 import 时报模块不存在，属正常，保留 import 并在交付说明里注明。

## 规格要点（原文见规格 v1）
- 二.2 点开=看清：结默认折叠为标题（圆点+标签），点击展开全文；折叠=圆点+标签，展开=卡片
- 二.4 焦点=组织中心：焦点结高亮（星标/亮度差），选中即焦点
- 四 视觉语言：远近即权重，疏密+虚实表达，不堆色；焦点只用一种强调色（单色星标/亮度差）；低信息密度、疏离克制
- 六.4 摘要必须可展开：摘要=压缩表示，一键展开回原文

## 实现要求
1. `src/nodes/` 下新建 knot 节点组件，注册进 FlowGram 节点系统（参考 `src/editor.tsx` 现有注册方式，只读）
2. 折叠态：圆点+标签（title）；展开态：卡片（title+summary）；摘要可一键展开回全文（六.4）
3. 焦点结：读 useFocus()，focusedId 匹配时显示单色星标/亮度差高亮
4. 勾选挂点：节点上渲染勾选框，点击调 toggle()（读 useSelection）
5. 样式：疏离/克制/低信息密度，单强调色

## 文件边界（只动这些）
- 可新建：`src/nodes/knot-node/` 下文件
- 可改：`src/context/node-render-context.ts`（仅如需）
- 禁止：knot-model.ts / initial-knot-data.ts / initial-data.ts / editor.tsx / app.tsx / package.json / `src/context/selection-context.ts` / `src/context/focus-context.ts` / 任何 git 操作 / npm install

## 验收
3000 端口画布：结以圆点+标签折叠显示；点击展开卡片；摘要可展开回原文；焦点结有星标高亮。

## 交付
完成后运行 `npx tsc --noEmit` 自查；契约 import 报错属预期，在交付说明中列出即可。
