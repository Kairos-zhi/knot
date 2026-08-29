/**
 * focus-layout 插件：焦点为中心物理重排（阶段 3 P1）
 *
 * 依据：规格 v1 二.1/二.4 + 八节定案 + 红队坑2（位置惯性）
 *  - 焦点出现（选中结）→ 以焦点结为中心物理重排：近密远疏（近处结向焦点靠拢，远处结外推）
 *  - 重排是物理的：程序化移动节点位置（TransformData.update({position})），动画 ≤500ms，无重叠
 *  - 清除焦点 → 冻结：不移动任何节点（零位移），下一个焦点出现才重排
 *  - 空白单击不清除焦点（导航/平移预备动作）；双击空白清除；ESC 清除（取消操作流）
 *  - 权重分层：位置布局权归焦点距离独占（使用计数 P3 只调视觉通道，不碰坐标）
 *
 * 位置更新姿势（读 .d.ts / free-layout-core 源码确认，非猜）：
 *  node.getData(TransformData).update({ position }) — 与 free-layout-core 拖拽服务
 *  （onDragging 分支 transform.update({position: newPosition})）及注释节点
 *  use-size.ts 的 transform.update({position}) 完全一致；
 *  startTween 复用 free-layout-core reset-layout 的 tween 模式（P1 要求 500ms 内完成）。
 */
import {
  definePluginCreator,
  PluginCreator,
  FreeLayoutPluginContext,
  TransformData,
  startTween,
} from '@flowgram.ai/free-layout-editor';
import type { WorkflowNodeEntity } from '@flowgram.ai/free-layout-editor';

import { focusBridge } from '../../context/focus-context';

export interface FocusLayoutPluginOptions {}

/** 重排动画时长（ms），验收要求 ≤500ms */
const DURATION = 400;
/** 目标环半径：近密远疏（对齐 render.tsx 三级距离阈值 400/900） */
const NEAR_RADIUS = 280;
const MID_RADIUS = 520;
const FAR_RADIUS = 860;
/** 每环容量，超过向外推一环 */
const RING_CAPACITY = 6;

interface Pos {
  x: number;
  y: number;
}

/**
 * 计算目标位置：焦点结不动；其余结按到焦点的当前距离排序分环（近密远疏），
 * 环内按原方位角排序后围绕平均角度均匀排布——保持相对方位不迷路
 * （星际拓荒星号背书），且环上节点角距均匀 → 无重叠。
 */
function computeTargets(focus: WorkflowNodeEntity, others: WorkflowNodeEntity[]): Map<string, Pos> {
  const focusPos = focus.getData(TransformData).position;
  const targets = new Map<string, Pos>();

  const items = others.map((node, i) => {
    const p = node.getData(TransformData).position;
    const dx = p.x - focusPos.x;
    const dy = p.y - focusPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 重合结给一个确定性角度（按序散开），避免 atan2(0,0) 不稳定
    const angle = dist < 1 ? (i / Math.max(others.length, 1)) * Math.PI * 2 : Math.atan2(dy, dx);
    return { node, dist, angle };
  });

  // 按距离排序分环：最近的结放最内环（近=重要，规格 #1）
  items.sort((a, b) => a.dist - b.dist);
  const rings: typeof items[] = [];
  for (let i = 0; i < items.length; i += RING_CAPACITY) {
    rings.push(items.slice(i, i + RING_CAPACITY));
  }

  rings.forEach((ringItems, ringIndex) => {
    const radius =
      ringIndex === 0
        ? NEAR_RADIUS
        : ringIndex === 1
          ? MID_RADIUS
          : FAR_RADIUS + (ringIndex - 2) * 260;
    // 环内按原方位角排序，围绕平均角度均匀开槽：位移最小 + 相对方位保持
    ringItems.sort((a, b) => a.angle - b.angle);
    const n = ringItems.length;
    const avgAngle = ringItems.reduce((sum, it) => sum + it.angle, 0) / n;
    const slot = (Math.PI * 2) / Math.max(n, RING_CAPACITY);
    ringItems.forEach((item, i) => {
      const slotAngle = avgAngle + (i - (n - 1) / 2) * slot;
      targets.set(item.node.id, {
        x: focusPos.x + radius * Math.cos(slotAngle),
        y: focusPos.y + radius * Math.sin(slotAngle),
      });
    });
  });

  return targets;
}

/** 物理重排：startTween 插值移动（与 free-layout-core reset-layout 同姿势） */
function relayout(ctx: FreeLayoutPluginContext, focusId: string): void {
  const document = ctx.document;
  const focusNode = document.getNode(focusId);
  if (!focusNode) return;

    // 只重排顶层结：free-layout 下所有节点 parent=root 容器（非空），
    // 所以只按类型排除 comment；v1 无嵌套容器，无需 parent 判断
    const all = document.getAllNodes();
    const others = all.filter((n) => n.id !== focusId && n.flowNodeType !== 'comment');
    if (others.length === 0) return;

  const targets = computeTargets(focusNode, others);

  const starts = new Map<string, Pos>();
  others.forEach((n) => {
    const p = n.getData(TransformData).position;
    starts.set(n.id, { x: p.x, y: p.y });
  });

  startTween<{ d: number }>({
    from: { d: 0 },
    to: { d: 100 },
    duration: DURATION,
    easing: (t) => 1 - (1 - t) * (1 - t), // ease-out，克制不弹跳
    onUpdate: (v) => {
      const k = v.d / 100;
      others.forEach((node) => {
        const s = starts.get(node.id);
        const t = targets.get(node.id);
        if (!s || !t) return;
        const transform = node.getData(TransformData);
        transform.update({
          position: {
            x: s.x + (t.x - s.x) * k,
            y: s.y + (t.y - s.y) * k,
          },
        });
        document.layout.updateAffectedTransform(node);
      });
    },
  });
}

export const createFocusLayoutPlugin: PluginCreator<FocusLayoutPluginOptions> =
  definePluginCreator<FocusLayoutPluginOptions, FreeLayoutPluginContext>({
    onReady(ctx) {
      // 1) 焦点出现/替换 → 物理重排；清除焦点不 fire（位置惯性，天然冻结）
      const disposable = focusBridge.onRelayout((focusId) => {
        if (ctx.playground.disposed) return;
        relayout(ctx, focusId);
      });
      ctx.playground.toDispose.push(disposable);

      // 2) 空白单击不清除焦点（双击才清除）；ESC 清除（取消操作流）
      const pipelineNode = ctx.playground.pipelineNode;
      if (!pipelineNode) return;

      const isBlankTarget = (e: MouseEvent): boolean => {
        // 点击落在节点/端口/连线上不算空白
        const target = e.target as HTMLElement | null;
        if (!target) return false;
        return !target.closest('[data-node-id], [data-port-id], svg path');
      };

      const onClickCapture = (e: MouseEvent) => {
        if (!isBlankTarget(e)) return;
        // 单击空白：阻止 FlowGram 默认清空选中 → 焦点保留（红队坑2 误触保护）
        e.stopPropagation();
      };

      const onDblClick = (e: MouseEvent) => {
        if (!isBlankTarget(e)) return;
        // 双击空白：清除焦点（只清状态，布局冻结零位移）
        ctx.playground.selectionService.selection = [];
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        // 输入态不抢 ESC（输入框内 ESC 是编辑语义）
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
          return;
        }
        // ESC：清除焦点（取消操作流；布局冻结）
        ctx.playground.selectionService.selection = [];
      };

      // 单击用捕获阶段拦在 FlowGram 清空选中之前
      pipelineNode.addEventListener('click', onClickCapture, true);
      pipelineNode.addEventListener('dblclick', onDblClick);
      window.document.addEventListener('keydown', onKeyDown);

      ctx.playground.toDispose.push({
        dispose: () => {
          pipelineNode.removeEventListener('click', onClickCapture, true);
          pipelineNode.removeEventListener('dblclick', onDblClick);
          window.document.removeEventListener('keydown', onKeyDown);
        },
      });
    },
  });
