# Dispatch C：勾选=上下文注入

> 派发：2026-08-30 · 阶段 2 Maker C
> 依据：`kairos-oracle/knot形式层设计规格_v1.md` 三节 + 六节 + `kairos-oracle/knot调研_技术线_第二弹_Cola深度拆解.md`
> 工作目录：`C:/Users/x2270/hermes-sync/kairos-oracle/knot-flowgram/knot-flowgram-app`

## 任务
勾选态（可见集 V_b）+ 生成链路：勾选 → 注入 → 生成 → 自动成结。

## 依据要点（规格原文见文件）
- 三节 勾选粒度（8/30 机制背书）：勾选=定义可见集 V_b；合法粒度=结内块~语义邻域；**v1 先支持按结勾选**，块级后置
- 六.2 勾选粒度对齐块：结内块~语义邻域都是合法 V_b（v1=按结勾选）
- 六.3 生成自动成结：解码即打结，生成内容免手动收尾
- Cola 拆解：勾选=可见集 V_b（上下文选择机制的外化）

## 对外契约（Maker A 会 import 你，接口必须按此导出）
`src/context/selection-context.ts`（新建）：
- 导出 `useSelection(): { checkedIds: string[], toggle(id: string): void }`
- 实现：勾选状态（以 node id 为 key）+ toggle；建议用 React Context + useState/useMemo

## 实现要求
1. `src/context/selection-context.ts`（新建，契约如上）
2. `src/services/generate.ts`（新建）：
   - `generate(payload: { checked: { id: string; title: string; summary: string }[] }): Promise<{ title: string; summary: string }>`
   - 先实现 mock：返回占位文本（延迟 ~800ms 模拟异步），文件内 TODO 注明「后续接 LLM」
3. 生成面板组件 `src/components/knot-generate/`：显示已勾选结列表 + 生成按钮；点击 → 收集勾选结 title+summary → 调 generate() → 返回内容自动成结（新 KnotNode 追加进画布，免手动收尾）。追加画布用 FlowGram 节点创建 API（参考模板现有 add-node 用法，`src/components/add-node/` 与 `src/editor.tsx` 只读）
4. 节点上的勾选框由 Maker A 渲染（调用你的 toggle），你不用做节点勾选框，只做状态与面板

## 文件边界（只动这些）
- 可新建：`src/context/selection-context.ts`、`src/services/generate.ts`、`src/components/knot-generate/`
- 禁止：`src/nodes/` / knot-model.ts / initial-knot-data.ts / editor.tsx / app.tsx / package.json / 任何 git 操作 / npm install

## 验收
3000 端口画布：勾选面板显示已勾选结列表（V_b）；点生成 → mock 返回 → 新结自动出现在画布上。

## 交付
完成后运行 `npx tsc --noEmit` 自查；如 `src/nodes/` 尚未渲染勾选框导致面板空态，属正常（A 合并后闭环），在交付说明注明。
