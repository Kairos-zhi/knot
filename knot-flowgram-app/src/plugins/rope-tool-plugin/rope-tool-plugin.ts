/**
 * rope-tool-plugin：绳子 + 剪刀 逻辑（阶段 3 P3.5d 工具三件套）
 *
 * 依据：分派规格 P3.5d 三/四节 + 绳范式定案 + 第二弹模式 2/5/7/8
 *
 * 绳子模式：
 *  - 串（thread）：从结 A 按住拖出绳头（不移动结）→ 经过结高亮 → 松手按经过顺序
 *    建绳 A→B→C（edges 按序创建，sourcePortID 'out' / targetPortID 'in'），顺序即思考路径
 *  - 吸附成绳：拖出绳头靠近结 B（距离 <120px）→ B 光晕（.knot-node--attract）+ 虚线预览
 *  - 打结：绳头停留 ≥300ms → edge.data.fixed=true + 小结节视觉（LineRender 读 fixed）
 * 剪刀模式：
 *  - 点绳 → 删除该 edge（断点反馈：断点闪一下浅灰，不弹窗无报错）
 *  - 点结 → 解绳：该结所有 edge 删除（结保留，成孤立点）
 *
 * 错误沉默纪律：不兼容的结不发光、无报错；全程无红色/警告色。
 * 拖绳实现：在节点上 mousedown 捕获并 stopPropagation，让结不被拖动（拖出的是绳头），
 * 虚线预览用挂载在 pipelineNode 上的固定 SVG（playground 坐标系）。
 */
import {
  definePluginCreator,
  PluginCreator,
  FreeLayoutPluginContext,
  TransformData,
  WorkflowDocument,
  WorkflowLinesManager,
  WorkflowLineEntity,
} from '@flowgram.ai/free-layout-editor';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import { getTool, setTool, onToolChange } from '../../components/toolbar/tool-store';
import { setChain } from '../../components/knot-chain-card/chain-store';
import { KnotToolbar } from '../../components/toolbar';

export interface RopeToolPluginOptions {}

/** 吸附距离阈值（px，playground 坐标） */
const ATTRACT_DIST = 120;
/** 打结停留时长（ms） */
const KNOT_DWELL = 300;
/** 经过结高亮检测半径（相对结中心的距离） */
const PASS_RADIUS = 90;

interface Pos {
  x: number;
  y: number;
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

export const createRopeToolPlugin: PluginCreator<RopeToolPluginOptions> =
  definePluginCreator<RopeToolPluginOptions, FreeLayoutPluginContext>({
    onReady(ctx) {
      const pipelineNode = ctx.playground.pipelineNode;
      if (!pipelineNode) return;
      const document = ctx.get(WorkflowDocument);
      const linesManager = ctx.get(WorkflowLinesManager);

      // ===== 三件套工具条挂载（editor.tsx 不可改，插件内挂 React root） =====
      const toolbarHost = window.document.createElement('div');
      const mountParent =
        (window.document.querySelector('.demo-container') as HTMLElement | null) ??
        (pipelineNode.offsetParent as HTMLElement | null) ??
        window.document.body;
      mountParent.appendChild(toolbarHost);
      const toolbarRoot: Root = createRoot(toolbarHost);
      toolbarRoot.render(React.createElement(KnotToolbar));

      // ===== 虚线预览 SVG（屏幕坐标：fixed 挂 body，鼠标 clientX/Y 直出，不随画布滚动缩放偏移） =====
      const previewSvg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      previewSvg.setAttribute('class', 'knot-rope-preview');
      previewSvg.style.cssText =
        'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;display:none;overflow:visible;z-index:9999;';
      const previewPath = window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
      previewPath.setAttribute('fill', 'none');
      previewPath.setAttribute('stroke', '#999999');
      previewPath.setAttribute('stroke-width', '1');
      previewPath.setAttribute('stroke-dasharray', '6 4');
      previewSvg.appendChild(previewPath);
      // 绳头圆点（落脚点：绳拿出来就有，源头去向都可见）
      const previewDot = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      previewDot.setAttribute('r', '4');
      previewDot.setAttribute('fill', '#ff9500');
      previewSvg.appendChild(previewDot);
      window.document.body.appendChild(previewSvg);

      /** 世界坐标 → 屏幕坐标（PlaygroundConfig.toFixedPos：画布位置转 window 位置） */
      const toScreenPos = (p: Pos): Pos => {
        try {
          const f = ctx.playground.config.toFixedPos(p);
          return { x: f.x, y: f.y };
        } catch {
          return p;
        }
      };

      // ===== 剪断反馈 flash 层 =====
      const flashSvg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      flashSvg.style.cssText =
        'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none;overflow:visible;z-index:6;';
      const flashCircle = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      flashCircle.setAttribute('r', '10');
      flashCircle.setAttribute('fill', 'rgba(0,0,0,0.12)');
      flashSvg.appendChild(flashCircle);
      pipelineNode.appendChild(flashSvg);

      const toPlaygroundPos = (e: MouseEvent): Pos => {
        const p = ctx.playground.config.getPosFromMouseEvent(e);
        return { x: p.x, y: p.y };
      };

      // ===== 吸附光晕管理 =====
      let attractEl: HTMLElement | null = null;
      const setAttract = (nodeId: string | null) => {
        if (attractEl) {
          attractEl.classList.remove('knot-node--attract');
          attractEl = null;
        }
        if (!nodeId) return;
        const el = pipelineNode.querySelector(`[data-node-id="${nodeId}"] .knot-node`) as HTMLElement | null;
        if (el) {
          el.classList.add('knot-node--attract');
          attractEl = el;
        }
      };

      // ===== 拖绳状态 =====
      interface DragRope {
        fromId: string;
        chain: string[]; // 经过的结（按序，不含 fromId）
        dwellTimer: ReturnType<typeof setTimeout> | null;
        dwellTargetId: string | null;
        knotted: boolean; // 本次拖拽是否已打结
        moved: boolean;
      }
      let drag: DragRope | null = null;

      const showPreview = (from: Pos, to: Pos) => {
        previewSvg.style.display = '';
        const fs = toScreenPos(from);
        const ts = toScreenPos(to);
        previewPath.setAttribute('d', `M ${fs.x} ${fs.y} L ${ts.x} ${ts.y}`);
        previewDot.setAttribute('cx', String(ts.x));
        previewDot.setAttribute('cy', String(ts.y));
      };
      /** 绳头落脚点：绳子模式光标处始终可见（屏幕坐标直出，永远贴着光标） */
      const showDotOnly = (sx: number, sy: number) => {
        previewSvg.style.display = '';
        previewPath.setAttribute('d', '');
        previewDot.setAttribute('cx', String(sx));
        previewDot.setAttribute('cy', String(sy));
      };
      const hidePreview = () => {
        previewSvg.style.display = 'none';
      };

      const setKnotVisual = (nodeId: string, on: boolean) => {
        const el = pipelineNode.querySelector(`[data-node-id="${nodeId}"] .knot-node`) as HTMLElement | null;
        if (el) el.classList.toggle('knot-node--knot-hover', on);
      };

      const clearDwell = () => {
        if (drag?.dwellTimer) {
          clearTimeout(drag.dwellTimer);
          drag.dwellTimer = null;
        }
        if (drag?.dwellTargetId) {
          setKnotVisual(drag.dwellTargetId, false);
          drag.dwellTargetId = null;
        }
      };

      const createEdge = (fromId: string, toId: string, fixed: boolean): void => {
        try {
          if (!isKnotNode(ctx, toId)) return; // 错误沉默：不兼容的结不成绳
          const existing = linesManager.getLine({ from: fromId, to: toId });
          if (existing) return;
          const line = linesManager.createLine({
            from: fromId,
            to: toId,
            fromPort: 'out',
            toPort: 'in',
            ...(fixed ? { data: { fixed: true } } : {}),
          });
          // 游戏化表现：新绳「画出来」——flowing 虚线流动 600ms 后固定
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
        } catch {
          // 单条绳失败静默（错误沉默原则）
        }
      };

      const setEdgeFixed = (fromId: string, toId: string): void => {
        const line = linesManager.getLine({ from: fromId, to: toId });
        if (!line) return;
        line.lineData = { ...(line.lineData ?? {}), fixed: true };
      };

      // ===== 鼠标事件（PS 逻辑：V=直接拖卡片、H/空格=平移视野、R=拖绳、C=剪） =====
      // PS 状态
      let pan: { sx: number; sy: number; vx: number; vy: number } | null = null;
      let stickDrag: { nodeId: string; startPos: Pos; nodeStart: Pos | null } | null = null;
      let spaceHeld = false;
      let prevToolBeforeSpace: string = 'stick';

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const tool = getTool();

        // H 手：按住拖=平移视野
        if (tool === 'hand') {
          const sd = ctx.playground.config.scrollData;
          pan = { sx: e.clientX, sy: e.clientY, vx: sd.scrollX, vy: sd.scrollY };
          return;
        }

        // V 棍子：按住卡片直接拖（绕开 FlowGram 拖拽手感；双击展开在 render 层）
        if (tool === 'stick') {
          const target = e.target as HTMLElement | null;
          if (target && target.closest('button, input')) return;
          const nodeEl = target?.closest('[data-node-id]') as HTMLElement | null;
          if (!nodeEl) return;
          const nodeId = nodeEl.getAttribute('data-node-id');
          if (!nodeId || !isKnotNode(ctx, nodeId)) return;
          e.stopPropagation();
          e.preventDefault();
          stickDrag = { nodeId, startPos: toPlaygroundPos(e), nodeStart: nodeCenter(ctx, nodeId) };
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
        drag = { fromId: nodeId, chain: [], dwellTimer: null, dwellTargetId: null, knotted: false, moved: false };
        const c = nodeCenter(ctx, nodeId);
        if (c) showPreview(c, toPlaygroundPos(e));
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
        if (stickDrag && stickDrag.nodeStart) {
          const pos = toPlaygroundPos(e);
          const node = ctx.document.getNode(stickDrag.nodeId);
          if (node) {
            const t = node.getData(TransformData);
            t.update({
              position: {
                x: stickDrag.nodeStart.x + (pos.x - stickDrag.startPos.x),
                y: stickDrag.nodeStart.y + (pos.y - stickDrag.startPos.y),
              },
            });
            ctx.document.layout.updateAffectedTransform(node);
          }
          return;
        }
        if (!drag) return;
        drag.moved = true;
        const pos = toPlaygroundPos(e);
        const fromC = nodeCenter(ctx, drag.fromId);
        if (!fromC) return;
        showPreview(fromC, pos);

        // 吸附检测：<120px 的结发光晕（错误沉默：无兼容判断之外的提示）
        const near = nearestKnot(ctx, pos, drag.fromId, ATTRACT_DIST);
        setAttract(near?.id ?? null);

        // 经过结记录（按序，去重；距离 <PASS_RADIUS 视为经过）
        const passed = nearestKnot(ctx, pos, drag.fromId, PASS_RADIUS);
        if (passed && drag.chain[drag.chain.length - 1] !== passed.id && !drag.chain.includes(passed.id)) {
          drag.chain.push(passed.id);
        }

        // 打结停留检测：绳头停在某结上 ≥300ms → 打结
        const dwellNode = nearestKnot(ctx, pos, drag.fromId, PASS_RADIUS);
        const dwellId = dwellNode?.id ?? null;
        if (dwellId !== drag.dwellTargetId) {
          clearDwell();
          if (dwellId) {
            drag.dwellTargetId = dwellId;
            setKnotVisual(dwellId, true);
            const targetId = dwellId;
            drag.dwellTimer = setTimeout(() => {
              if (!drag || drag.dwellTargetId !== targetId) return;
              // 打结：链上最后一条绳（或 from→target）标 fixed
              const prev = drag.chain[drag.chain.length - 1] ?? drag.fromId;
              if (prev === targetId) {
                // 首结：绳还没建，先建再打结
                createEdge(drag.fromId, targetId, true);
                if (!drag.chain.includes(targetId)) drag.chain.push(targetId);
              } else {
                setEdgeFixed(prev, targetId);
              }
              drag.knotted = true;
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
        if (stickDrag) {
          stickDrag = null;
          return;
        }
        if (!drag) return;
        clearDwell();
        setAttract(null);
        hidePreview();
        if (drag.moved && drag.chain.length > 0) {
          // 按经过顺序建绳：from → chain[0] → chain[1] ...（顺序即思考路径）
          let prev = drag.fromId;
          drag.chain.forEach((toId, i) => {
            const isLast = i === drag!.chain.length - 1;
            // 已打结且终点=打结目标时，createEdge 已在 dwell 中建过（带 fixed）
            createEdge(prev, toId, false);
            if (drag!.knotted && isLast) setEdgeFixed(prev, toId);
            prev = toId;
          });
          // 串链完成 → 链卡浮现（之定：绳串联后才出现线性关系卡片）
          setChain([drag.fromId, ...drag.chain]);
        }
        drag = null;
      };

      // ===== 剪刀模式 =====
      const flashAt = (pos: Pos) => {
        flashCircle.setAttribute('cx', String(pos.x));
        flashCircle.setAttribute('cy', String(pos.y));
        flashSvg.style.display = '';
        setTimeout(() => {
          flashSvg.style.display = 'none';
        }, 260);
      };

      const onClickCapture = (e: MouseEvent) => {
        if (getTool() !== 'scissors') return;
        const pos = toPlaygroundPos(e);
        // 优先：点在绳上 → 剪断该绳
        const line = linesManager.getCloseInLineFromMousePos(pos, 10);
        const target = e.target as HTMLElement | null;
        const nodeEl = target?.closest('[data-node-id]') as HTMLElement | null;

        if (line && line.from && line.to) {
          e.stopPropagation();
          e.preventDefault();
          flashAt(pos);
          if (document.linesManager.canRemove(line)) {
            line.dispose(); // 剪断：该 edge 删除，两端独立
          }
          return;
        }
        // 点在结上 → 解绳：该结所有绳解除（结保留）
        if (nodeEl) {
          const nodeId = nodeEl.getAttribute('data-node-id');
          if (!nodeId || !isKnotNode(ctx, nodeId)) return;
          e.stopPropagation();
          e.preventDefault();
          const toRemove: WorkflowLineEntity[] = linesManager
            .getAllLines()
            .filter((l) => l.from?.id === nodeId || l.to?.id === nodeId);
          toRemove.forEach((l) => {
            if (document.linesManager.canRemove(l)) l.dispose();
          });
          flashAt(pos);
        }
      };

      // ===== hover 提示（剪刀模式：绳高亮/结轻提示，纯 CSS class，克制） =====
      const onHoverMove = (e: MouseEvent) => {
        if (getTool() === 'scissors') {
          const pos = toPlaygroundPos(e);
          const line = linesManager.getCloseInLineFromMousePos(pos, 10);
          // FlowGram 自带 line hover 高亮（lineColor.hovered），此处无需额外处理
          void line;
          return;
        }
        // 绳子模式：光标处绳头落脚点常显（屏幕坐标直出，永远贴着光标）
        if (getTool() === 'rope' && !drag) {
          showDotOnly(e.clientX, e.clientY);
        }
      };

      pipelineNode.addEventListener('mousedown', onMouseDown, true);
      window.document.addEventListener('mousemove', onMouseMove);
      window.document.addEventListener('mouseup', onMouseUp);
      pipelineNode.addEventListener('click', onClickCapture, true);
      pipelineNode.addEventListener('mousemove', onHoverMove);

      // PS 空格=临时手：按住空格切手，松开恢复
      const onSpaceDown = (e: KeyboardEvent) => {
        if (e.key !== ' ' || spaceHeld) return;
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        spaceHeld = true;
        prevToolBeforeSpace = getTool();
        setTool('hand');
        e.preventDefault();
      };
      const onSpaceUp = (e: KeyboardEvent) => {
        if (e.key !== ' ' || !spaceHeld) return;
        spaceHeld = false;
        setTool(prevToolBeforeSpace as Parameters<typeof setTool>[0]);
      };
      // 工具光标：手=grab（画笔模型，PS 同款）
      const applyCursor = (tool: string) => {
        const cursor = tool === 'hand' ? 'grab' : tool === 'stick' ? 'default' : 'crosshair';
        ctx.playground.config.updateCursor(cursor);
      };
      const offTool = onToolChange(applyCursor);
      applyCursor(getTool());
      window.document.addEventListener('keydown', onSpaceDown);
      window.document.addEventListener('keyup', onSpaceUp);

      ctx.playground.toDispose.push({
        dispose: () => {
          pipelineNode.removeEventListener('mousedown', onMouseDown, true);
          window.document.removeEventListener('mousemove', onMouseMove);
          window.document.removeEventListener('mouseup', onMouseUp);
          pipelineNode.removeEventListener('click', onClickCapture, true);
          pipelineNode.removeEventListener('mousemove', onHoverMove);
          window.document.removeEventListener('keydown', onSpaceDown);
          window.document.removeEventListener('keyup', onSpaceUp);
          offTool();
          previewSvg.remove();
          flashSvg.remove();
          toolbarRoot.unmount();
          toolbarHost.remove();
          setAttract(null);
          clearDwell();
        },
      });
    },
  });
