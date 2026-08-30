/**
 * rope-tool-events.ts —— 鼠标/键盘事件分发
 *
 * 从 rope-tool-plugin.ts 拆出，行为零变化。
 * 管理：H 手平移 / 绳孔唤起拖绳 / rope 工具拖绳 / 打结停留检测 / PS 空格临时手 / 工具光标。
 */
import {
  FreeLayoutPluginContext,
  TransformData,
  WorkflowLinesManager,
} from '@flowgram.ai/free-layout-editor';
import { ToolType, ToolService } from '../../services/tool-service';
import { KnotOperationService } from '../../services/knot-operation-service';
import { ChainService } from '../../services/chain-service';
import { RopePreview } from './rope-preview';
import { RopeDragState } from './rope-drag-state';
import { AttractManager } from './attract-manager';
import { StickTool } from './stick-tool';

export interface Pos {
  x: number;
  y: number;
}

/** 吸附距离阈值（px，playground 坐标） */
const ATTRACT_DIST = 120;
/** 打结停留时长（ms） */
const KNOT_DWELL = 300;
/** 经过结高亮检测半径（相对结中心的距离） */
const PASS_RADIUS = 90;

export interface RopeToolEventsDeps {
  ctx: FreeLayoutPluginContext;
  pipelineNode: HTMLElement;
  linesManager: WorkflowLinesManager;
  opService: KnotOperationService;
  toolService: ToolService;
  chainService: ChainService;
  preview: RopePreview;
  dragState: RopeDragState;
  attract: AttractManager;
  stickTool: StickTool;
}

export interface RopeToolEvents {
  dispose(): void;
}

function nodeCenter(ctx: FreeLayoutPluginContext, nodeId: string): Pos | null {
  const node = ctx.document.getNode(nodeId);
  if (!node) return null;
  const t = node.getData(TransformData);
  return { x: t.position.x + t.bounds.width / 2, y: t.position.y + t.bounds.height / 2 };
}

function isKnotNode(ctx: FreeLayoutPluginContext, nodeId: string): boolean {
  const node = ctx.document.getNode(nodeId);
  return !!node && node.flowNodeType === 'knot';
}

/** 找离某点最近的 knot 结（排除自身），返回 { id, dist } 或 null */
function nearestKnot(
  ctx: FreeLayoutPluginContext,
  pos: Pos,
  excludeId: string,
  maxDist: number
): { id: string; dist: number } | null {
  let best: { id: string; dist: number } | null = null;
  ctx.document.getAllNodes().forEach((n) => {
    if (n.id === excludeId || n.flowNodeType !== 'knot') return;
    const c = nodeCenter(ctx, n.id);
    if (!c) return;
    const d = Math.hypot(c.x - pos.x, c.y - pos.y);
    if (d < maxDist && (!best || d < best.dist)) {
      best = { id: n.id, dist: d };
    }
  });
  return best;
}

export function createRopeToolEvents(deps: RopeToolEventsDeps): RopeToolEvents {
  const { ctx, pipelineNode, linesManager, opService, toolService, chainService, preview, dragState, attract, stickTool } =
    deps;

  const toPlaygroundPos = (e: MouseEvent): Pos => {
    const p = ctx.playground.config.getPosFromMouseEvent(e);
    return { x: p.x, y: p.y };
  };

  const setKnotVisual = (nodeId: string, on: boolean) => {
    const el = pipelineNode.querySelector(
      `[data-node-id="${nodeId}"] .knot-node`
    ) as HTMLElement | null;
    if (el) el.classList.toggle('knot-node--knot-hover', on);
  };

  const createEdge = (fromId: string, toId: string, fixed: boolean): void => {
    try {
      if (!isKnotNode(ctx, toId)) return; // 错误沉默：不兼容的结不成绳
      const existed = !!linesManager.getLine({ from: fromId, to: toId });
      const r = opService.connect(fromId, toId, { fixed });
      // 游戏化表现：新绳「画出来」——flowing 虚线流动 600ms 后固定
      if (r.ok && !existed) {
        const line = linesManager.getLine({ from: fromId, to: toId });
        if (line) {
          line.flowing = true;
          setTimeout(() => {
            try {
              line.flowing = false;
            } catch {
              // 绳已删除则忽略
            }
          }, 600);
        }
      }
    } catch {
      // 单条绳失败静默（错误沉默原则）
    }
  };

  const setEdgeFixed = (fromId: string, toId: string): void => {
    opService.connect(fromId, toId, { fixed: true }); // 幂等：已存在只补 fixed
  };

  // ===== 鼠标事件（PS 逻辑：V=直接拖卡片、H/空格=平移视野、R=拖绳、C=剪） =====
  // PS 状态
  let pan: { sx: number; sy: number; vx: number; vy: number } | null = null;
  let spaceHeld = false;
  let prevToolBeforeSpace: string = 'stick';

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const tool = toolService.getTool();

    // H 手：按住拖=平移视野
    if (tool === 'hand') {
      const sd = ctx.playground.config.scrollData;
      pan = { sx: e.clientX, sy: e.clientY, vx: sd.scrollX, vy: sd.scrollY };
      return;
    }

    // V 棍子：按住卡片直接拖（绕开 FlowGram 拖拽手感；双击展开在 render 层）
    if (tool === 'stick') {
      if (stickTool.onMouseDown(e)) return;
      return; // stick 工具未命中 knot 节点时不消费，放行
    }

    // 绳孔唤起（之定：绳子从卡面唤起，不切工具直接拖绳）
    const ropeFromEl = (e.target as HTMLElement | null)?.closest?.('[data-rope-from]') as HTMLElement | null;
    if (ropeFromEl && tool !== 'scissors') {
      const nodeId = ropeFromEl.getAttribute('data-rope-from');
      if (!nodeId || !isKnotNode(ctx, nodeId)) return;
      e.stopPropagation();
      e.preventDefault();
      dragState.start(nodeId);
      preview.showPreview(nodeId, { x: e.clientX, y: e.clientY });
      preview.syncBadges([], nodeId);
      return;
    }

    if (tool !== 'rope') return;
    const target = e.target as HTMLElement | null;
    const nodeEl = target?.closest('[data-node-id]') as HTMLElement | null;
    if (!nodeEl) return;
    const nodeId = nodeEl.getAttribute('data-node-id');
    if (!nodeId || !isKnotNode(ctx, nodeId)) return;
    // 拦下：拖出的是绳头，结不移动
    e.stopPropagation();
    e.preventDefault();
    dragState.start(nodeId);
    preview.showPreview(nodeId, { x: e.clientX, y: e.clientY });
    preview.syncBadges([], nodeId); // 拖出瞬间：起点 0 号徽章立刻出现（绳的源头可见）
    // 拖出瞬间源结轻弹（操作即反馈：绳头在手）
    const srcEl = pipelineNode.querySelector(
      `[data-node-id="${nodeId}"] .knot-node`
    ) as HTMLElement | null;
    if (srcEl) {
      srcEl.classList.add('knot-node--rope-source');
      setTimeout(() => srcEl.classList.remove('knot-node--rope-source'), 700);
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    // H 手平移：delta 驱动滚动（PS 抓手）
    if (pan) {
      const zoom = ctx.playground.config.zoom;
      const dx = (e.clientX - pan.sx) / zoom;
      const dy = (e.clientY - pan.sy) / zoom;
      void ctx.playground.config.scrollToView({
        scrollDelta: { x: -dx, y: -dy },
        easing: false,
      });
      return;
    }
    // V 棍子拖动：跟手移动结
    if (stickTool.onMouseMove(e)) return;

    const drag = dragState.drag;
    if (!drag) return;
    drag.moved = true;
    const pos = toPlaygroundPos(e);
    const fromC = nodeCenter(ctx, drag.fromId);
    if (!fromC) return;
    preview.showPreview(drag.fromId, { x: e.clientX, y: e.clientY });
    // 每帧重画徽章：视角平移/缩放时结 DOM 位置实时更新，标记点永不漂移
    preview.syncBadges(drag.chain, drag.fromId);

    // 吸附检测：<120px 的结发光晕（错误沉默：无兼容判断之外的提示）
    const near = nearestKnot(ctx, pos, drag.fromId, ATTRACT_DIST);
    attract.setAttract(near?.id ?? null);

    // 经过结记录（按序，去重；距离 <PASS_RADIUS 视为经过）——串中强反馈：
    // 脉冲形变 + 序号徽章弹出 + 徽章全程挂住（解决「完全感知不到有没有串到」）
    const passed = nearestKnot(ctx, pos, drag.fromId, PASS_RADIUS);
    if (passed && drag.chain[drag.chain.length - 1] !== passed.id && !drag.chain.includes(passed.id)) {
      drag.chain.push(passed.id);
      preview.syncBadges(drag.chain, drag.fromId);
      const passEl = pipelineNode.querySelector(
        `[data-node-id="${passed.id}"] .knot-node`
      ) as HTMLElement | null;
      if (passEl) {
        passEl.classList.add('knot-node--strung');
        setTimeout(() => passEl.classList.remove('knot-node--strung'), 600);
      }
    }

    // 打结停留检测：绳头停在某结上 ≥300ms → 打结
    const dwellNode = nearestKnot(ctx, pos, drag.fromId, PASS_RADIUS);
    const dwellId = dwellNode?.id ?? null;
    if (dwellId !== drag.dwellTargetId) {
      dragState.clearDwell();
      if (dwellId) {
        drag.dwellTargetId = dwellId;
        setKnotVisual(dwellId, true);
        const targetId = dwellId;
        drag.dwellTimer = setTimeout(() => {
          const d = dragState.drag;
          if (!d || d.dwellTargetId !== targetId) return;
          // 打结：链上最后一条绳（或 from→target）标 fixed
          const prev = d.chain[d.chain.length - 1] ?? d.fromId;
          if (prev === targetId) {
            // 首结：绳还没建，先建再打结
            createEdge(d.fromId, targetId, true);
            if (!d.chain.includes(targetId)) d.chain.push(targetId);
          } else {
            setEdgeFixed(prev, targetId);
          }
          d.knotted = true;
          setKnotVisual(targetId, false);
        }, KNOT_DWELL);
      }
    }
  };

  const onMouseUp = () => {
    if (pan) {
      pan = null;
      return;
    }
    if (stickTool.onMouseUp()) return;

    const drag = dragState.end();
    if (!drag) return;
    attract.setAttract(null);
    preview.hidePreview();
    if (drag.moved && drag.chain.length > 0) {
      // 按经过顺序建绳：from → chain[0] → chain[1] ...（顺序即思考路径）
      let prev = drag.fromId;
      drag.chain.forEach((toId, i) => {
        const isLast = i === drag.chain.length - 1;
        // 已打结且终点=打结目标时，createEdge 已在 dwell 中建过（带 fixed）
        createEdge(prev, toId, false);
        if (drag.knotted && isLast) setEdgeFixed(prev, toId);
        prev = toId;
      });
      // 松手诞生反馈：链上结依次金圈扩散+金框闪（链的诞生一眼可见）
      preview.chainBorn([drag.fromId, ...drag.chain]);
      // 串链完成 → 链卡浮现（之定：绳串联后才出现线性关系卡片）
      chainService.setChain([drag.fromId, ...drag.chain]);
    }
  };

  // ===== hover 提示（剪刀模式：绳高亮/结轻提示，纯 CSS class，克制） =====
  const onHoverMove = (e: MouseEvent) => {
    if (toolService.getTool() === 'scissors') {
      const pos = toPlaygroundPos(e);
      const line = linesManager.getCloseInLineFromMousePos(pos, 10);
      // FlowGram 自带 line hover 高亮（lineColor.hovered），此处无需额外处理
      void line;
      return;
    }
    // 绳子模式：光标处绳头落脚点常显（屏幕坐标直出，永远贴着光标）
    if (toolService.getTool() === 'rope' && !dragState.drag) {
      preview.showDotOnly(e.clientX, e.clientY);
    }
  };

  // PS 空格=临时手：按住空格切手，松开恢复
  const onSpaceDown = (e: KeyboardEvent) => {
    if (e.key !== ' ' || spaceHeld) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    spaceHeld = true;
    prevToolBeforeSpace = toolService.getTool();
    toolService.setTool('hand');
    e.preventDefault();
  };
  const onSpaceUp = (e: KeyboardEvent) => {
    if (e.key !== ' ' || !spaceHeld) return;
    spaceHeld = false;
    toolService.setTool(prevToolBeforeSpace as ToolType);
  };
  // 工具光标：手=grab（画笔模型，PS 同款）
  const applyCursor = (tool: string) => {
    const cursor = tool === 'hand' ? 'grab' : tool === 'stick' ? 'default' : 'crosshair';
    ctx.playground.config.updateCursor(cursor);
  };
  const offTool = toolService.onToolChange(applyCursor);
  applyCursor(toolService.getTool());

  pipelineNode.addEventListener('mousedown', onMouseDown, true);
  window.document.addEventListener('mousemove', onMouseMove);
  window.document.addEventListener('mouseup', onMouseUp);
  pipelineNode.addEventListener('mousemove', onHoverMove);
  window.document.addEventListener('keydown', onSpaceDown);
  window.document.addEventListener('keyup', onSpaceUp);

  return {
    dispose: () => {
      pipelineNode.removeEventListener('mousedown', onMouseDown, true);
      window.document.removeEventListener('mousemove', onMouseMove);
      window.document.removeEventListener('mouseup', onMouseUp);
      pipelineNode.removeEventListener('mousemove', onHoverMove);
      window.document.removeEventListener('keydown', onSpaceDown);
      window.document.removeEventListener('keyup', onSpaceUp);
      offTool();
    },
  };
}
