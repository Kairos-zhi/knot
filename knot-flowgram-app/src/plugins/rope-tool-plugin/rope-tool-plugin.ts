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
 *
 * 结构（OPERATION-20260830-01 step2 拆分，行为零变化）：
 *  onReady 只做组装——各模块职责见对应文件：
 *   - rope-preview.ts      SVG 预览层（虚线/绳头/徽章/诞生闪光）
 *   - rope-drag-state.ts   拖绳状态机（chain/dwell/knotted）
 *   - rope-tool-events.ts  鼠标/键盘事件分发
 *   - scissors-tool.ts     剪刀模式
 *   - stick-tool.ts        棍子拖动
 *   - attract-manager.ts   吸附光晕管理
 */
import {
  definePluginCreator,
  PluginCreator,
  FreeLayoutPluginContext,
  TransformData,
  WorkflowLinesManager,
} from '@flowgram.ai/free-layout-editor';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import { KnotOperationService } from '../../services/knot-operation-service';
import { KnotToolbar } from '../../components/toolbar';
import { createRopePreview } from './rope-preview';
import { RopeDragState } from './rope-drag-state';
import { createAttractManager } from './attract-manager';
import { createStickTool } from './stick-tool';
import { createScissorsTool } from './scissors-tool';
import { createRopeToolEvents } from './rope-tool-events';
import { getTool } from '../../components/toolbar/tool-store';

export interface RopeToolPluginOptions {}

interface Pos {
  x: number;
  y: number;
}

/** 引擎 position（左上角，纯位置不碰 bounds——拖动用，bounds 与视觉尺寸不一致会跳） */
function nodePositionData(ctx: FreeLayoutPluginContext, nodeId: string): Pos | null {
  const node = ctx.document.getNode(nodeId);
  if (!node) return null;
  const t = node.getData(TransformData);
  return { x: t.position.x, y: t.position.y };
}

function isKnotNode(ctx: FreeLayoutPluginContext, nodeId: string): boolean {
  const node = ctx.document.getNode(nodeId);
  return !!node && node.flowNodeType === 'knot';
}

export const createRopeToolPlugin: PluginCreator<RopeToolPluginOptions> =
  definePluginCreator<RopeToolPluginOptions, FreeLayoutPluginContext>({
    onReady(ctx) {
      const pipelineNode = ctx.playground.pipelineNode;
      if (!pipelineNode) return;
      const linesManager = ctx.get(WorkflowLinesManager);
      const opService = ctx.get(KnotOperationService);

      // ===== 三件套工具条挂载（editor.tsx 不可改，插件内挂 React root） =====
      const toolbarHost = window.document.createElement('div');
      const mountParent =
        (window.document.querySelector('.demo-container') as HTMLElement | null) ??
        (pipelineNode.offsetParent as HTMLElement | null) ??
        window.document.body;
      mountParent.appendChild(toolbarHost);
      const toolbarRoot: Root = createRoot(toolbarHost);
      toolbarRoot.render(React.createElement(KnotToolbar));

      const toPlaygroundPos = (e: MouseEvent): Pos => {
        const p = ctx.playground.config.getPosFromMouseEvent(e);
        return { x: p.x, y: p.y };
      };

      // ===== 模块组装 =====
      const preview = createRopePreview(ctx, pipelineNode);
      const attract = createAttractManager(pipelineNode);
      const dragState = new RopeDragState({
        ctx,
        pipelineNode,
        setKnotVisual: (nodeId, on) => {
          const el = pipelineNode.querySelector(
            `[data-node-id="${nodeId}"] .knot-node`
          ) as HTMLElement | null;
          if (el) el.classList.toggle('knot-node--knot-hover', on);
        },
      });
      const stickTool = createStickTool({
        ctx,
        pipelineNode,
        toPlaygroundPos,
        nodePositionData,
        isKnotNode,
      });
      const scissorsTool = createScissorsTool({
        ctx,
        pipelineNode,
        linesManager,
        opService,
        toPlaygroundPos,
        isKnotNode,
      });
      const events = createRopeToolEvents({
        ctx,
        pipelineNode,
        linesManager,
        opService,
        preview,
        dragState,
        attract,
        stickTool,
      });

      // 剪刀点击捕获（剪刀模式才生效）
      const onClickCapture = (e: MouseEvent) => {
        if (getTool() !== 'scissors') return;
        scissorsTool.onClickCapture(e);
      };
      pipelineNode.addEventListener('click', onClickCapture, true);

      ctx.playground.toDispose.push({
        dispose: () => {
          pipelineNode.removeEventListener('click', onClickCapture, true);
          events.dispose();
          preview.dispose();
          scissorsTool.dispose();
          attract.dispose();
          dragState.clearDwell();
          toolbarRoot.unmount();
          toolbarHost.remove();
        },
      });
    },
  });
