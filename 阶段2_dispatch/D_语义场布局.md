# Dispatch D：语义场布局

> 派发：2026-08-30 · 阶段 2 Maker D
> 依据：`kairos-oracle/knot形式层设计规格_v1.md` 二节 + `kairos-oracle/画布基底评估_FlowGram_vs_infinite-canvas.md`
> 工作目录：`C:/Users/x2270/hermes-sync/kairos-oracle/knot-flowgram/knot-flowgram-app`

## 任务
free-auto-layout 挂点：焦点感知布局（近密实、远虚疏）+ 空白「?」位。

## 依据要点（规格原文见文件）
- 二.1 近=重要，远=弱化：焦点附近的结自动靠近；无关结远离视心；**距离+透明度+字号三级**（近=实/中=淡/远=虚，不堆色，用疏密表达）
- 二.4 焦点=组织中心：选中即焦点，界面围绕它重排；周边按距离排布
- 二.5 空白=吸引力：灵感区/虚线空位「这里可能有结但还没打」：虚线轮廓+「?」，不可点但可见
- 画布基底评估：FlowGram 的 free-auto-layout = 语义场挂点

## 对外契约（Maker A 会 import 你，接口必须按此导出）
`src/context/focus-context.ts`（新建）：
- 导出 `useFocus(): { focusedId: string | null }`
- 实现：监听 FlowGram 节点选中事件 → focusedId（参考模板现有选择/事件用法，`src/editor.tsx` 等只读）

## 实现要求
1. `src/context/focus-context.ts`（新建，契约如上）
2. `src/plugins/` 下新建语义场布局插件：
   - 以焦点结为中心的重排：焦点处密实，向外疏远（调用 FlowGram 自带 auto-layout / free-layout 能力，参考模板相关代码，只读）
   - 距离权重 → 不透明度 + 字号三级（近实/中淡/远虚），不引入多色
3. 空白「?」位：画布边缘/空隙渲染虚线轮廓 + 「?」占位（不可点但可见）
4. 无焦点时：保持默认布局或静态语义场排布

## 文件边界（只动这些）
- 可新建：`src/context/focus-context.ts`、`src/plugins/` 下新插件目录
- 禁止：`src/nodes/` / `src/components/knot-edge/` / `src/components/knot-generate/` / `src/context/selection-context.ts` / `src/services/` / knot-model.ts / editor.tsx / app.tsx / package.json / 任何 git 操作 / npm install

## 验收
3000 端口画布：点一个结 → 成为焦点，近处结变实、远处结变淡变小；画布上有虚线「?」空位可见。

## 交付
完成后运行 `npx tsc --noEmit` 自查；如无焦点时布局静态，属预期。报错全部修掉再交付。
