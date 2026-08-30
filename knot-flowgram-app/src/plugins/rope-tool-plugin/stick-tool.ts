/**
 * stick-tool.ts —— 棍子拖动
 *
 * 从 rope-tool-plugin.ts 拆出，行为零变化。
 * V 棍子模式：按住卡片直接拖（绕开 FlowGram 拖拽手感；双击展开在 render 层）。
 */
import { FreeLayoutPluginContext, TransformData } from '@flowgram.ai/free-layout-editor';

export interface Pos {
  x: number;
  y: number;
}

export interface StickToolDeps {
  ctx: FreeLayoutPluginContext;
  pipelineNode: HTMLElement;
  toPlaygroundPos(e: MouseEvent): Pos;
  nodePositionData(ctx: FreeLayoutPluginContext, nodeId: string): Pos | null;
  isKnotNode(ctx: FreeLayoutPluginContext, nodeId: string): boolean;
}

export interface StickTool {
  /** 返回 true 表示事件已被棍子工具消费 */
  onMouseDown(e: MouseEvent): boolean;
  onMouseMove(e: MouseEvent): boolean;
  onMouseUp(): boolean;
  readonly active: boolean;
}

export function createStickTool(deps: StickToolDeps): StickTool {
  let stickDrag: { nodeId: string; startPos: Pos; nodeStart: Pos | null } | null = null;

  return {
    get active() {
      return stickDrag !== null;
    },

    onMouseDown(e: MouseEvent): boolean {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, input')) return false;
      const nodeEl = target?.closest('[data-node-id]') as HTMLElement | null;
      if (!nodeEl) return false;
      const nodeId = nodeEl.getAttribute('data-node-id');
      if (!nodeId || !deps.isKnotNode(deps.ctx, nodeId)) return false;
      e.stopPropagation();
      e.preventDefault();
      // 拖动基准=引擎 position（左上角）+ 相对位移，完全不碰 bounds（bounds 与视觉尺寸不一致会跳）
      const t0 = deps.nodePositionData(deps.ctx, nodeId);
      stickDrag = { nodeId, startPos: deps.toPlaygroundPos(e), nodeStart: t0 };
      // 拖动中抬起感（卡片被拿起来，操作即反馈）
      const dragEl = nodeEl.querySelector('.knot-node') as HTMLElement | null;
      if (dragEl) dragEl.classList.add('knot-node--lifting');
      return true;
    },

    onMouseMove(e: MouseEvent): boolean {
      if (!stickDrag || !stickDrag.nodeStart) return false;
      const pos = deps.toPlaygroundPos(e);
      const node = deps.ctx.document.getNode(stickDrag.nodeId);
      if (node) {
        const t = node.getData(TransformData);
        t.update({
          position: {
            x: stickDrag.nodeStart.x + (pos.x - stickDrag.startPos.x),
            y: stickDrag.nodeStart.y + (pos.y - stickDrag.startPos.y),
          },
        });
        deps.ctx.document.layout.updateAffectedTransform(node);
      }
      return true;
    },

    onMouseUp(): boolean {
      if (!stickDrag) return false;
      const node = deps.ctx.document.getNode(stickDrag.nodeId);
      const el = node
        ? (deps.pipelineNode.querySelector(
            `[data-node-id="${node.id}"] .knot-node`
          ) as HTMLElement | null)
        : null;
      if (el) {
        el.classList.remove('knot-node--lifting');
        el.classList.add('knot-node--dropped');
        setTimeout(() => el.classList.remove('knot-node--dropped'), 350);
      }
      stickDrag = null;
      return true;
    },
  };
}
