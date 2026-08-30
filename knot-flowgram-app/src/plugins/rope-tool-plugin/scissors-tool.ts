/**
 * scissors-tool.ts —— 剪刀模式
 *
 * 从 rope-tool-plugin.ts 拆出，行为零变化。
 * C 剪刀模式：点绳剪断该 edge；点结解绳（该结所有 edge 删除，结保留）。
 */
import {
  FreeLayoutPluginContext,
  WorkflowLinesManager,
} from '@flowgram.ai/free-layout-editor';
import { KnotOperationService } from '../../services/knot-operation-service';

export interface Pos {
  x: number;
  y: number;
}

export interface ScissorsToolDeps {
  ctx: FreeLayoutPluginContext;
  pipelineNode: HTMLElement;
  linesManager: WorkflowLinesManager;
  opService: KnotOperationService;
  toPlaygroundPos(e: MouseEvent): Pos;
  isKnotNode(ctx: FreeLayoutPluginContext, nodeId: string): boolean;
}

export interface ScissorsTool {
  /** 点击捕获：剪绳/解绳。返回 true 表示事件已消费。 */
  onClickCapture(e: MouseEvent): boolean;
  dispose(): void;
}

export function createScissorsTool(deps: ScissorsToolDeps): ScissorsTool {
  // ===== 剪断反馈 flash 层 =====
  const flashSvg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  flashSvg.style.cssText =
    'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none;overflow:visible;z-index:6;';
  const flashCircle = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  flashCircle.setAttribute('r', '10');
  flashCircle.setAttribute('fill', 'rgba(0,0,0,0.12)');
  flashSvg.appendChild(flashCircle);
  deps.pipelineNode.appendChild(flashSvg);

  const flashAt = (pos: Pos) => {
    flashCircle.setAttribute('cx', String(pos.x));
    flashCircle.setAttribute('cy', String(pos.y));
    flashSvg.style.display = '';
    setTimeout(() => {
      flashSvg.style.display = 'none';
    }, 260);
  };

  const onClickCapture = (e: MouseEvent): boolean => {
    const pos = deps.toPlaygroundPos(e);
    // 优先：点在绳上 → 剪断该绳
    const line = deps.linesManager.getCloseInLineFromMousePos(pos, 10);
    const target = e.target as HTMLElement | null;
    const nodeEl = target?.closest('[data-node-id]') as HTMLElement | null;

    if (line && line.from && line.to) {
      e.stopPropagation();
      e.preventDefault();
      flashAt(pos);
      deps.opService.disconnect(line.from.id, line.to.id); // 剪断：该 edge 删除，两端独立
      return true;
    }
    // 点在结上 → 解绳：该结所有绳解除（结保留）
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-id');
      if (!nodeId || !deps.isKnotNode(deps.ctx, nodeId)) return false;
      e.stopPropagation();
      e.preventDefault();
      deps.opService.disconnectAll(nodeId);
      flashAt(pos);
      return true;
    }
    return false;
  };

  return {
    onClickCapture,
    dispose: () => flashSvg.remove(),
  };
}
