/**
 * rope-drag-state.ts —— 拖绳状态机（chain/dwell/knotted）
 *
 * 从 rope-tool-plugin.ts 拆出，行为零变化。
 * 管理拖绳过程中的状态：起点、经过链、停留打结计时器、是否已打结、是否已移动。
 */
import { FreeLayoutPluginContext } from '@flowgram.ai/free-layout-editor';

export interface Pos {
  x: number;
  y: number;
}

export interface DragRope {
  fromId: string;
  chain: string[]; // 经过的结（按序，不含 fromId）
  dwellTimer: ReturnType<typeof setTimeout> | null;
  dwellTargetId: string | null;
  knotted: boolean; // 本次拖拽是否已打结
  moved: boolean;
}

export interface RopeDragStateDeps {
  ctx: FreeLayoutPluginContext;
  pipelineNode: HTMLElement;
  setKnotVisual(nodeId: string, on: boolean): void;
}

export class RopeDragState {
  drag: DragRope | null = null;
  private deps: RopeDragStateDeps;

  constructor(deps: RopeDragStateDeps) {
    this.deps = deps;
  }

  start(fromId: string): void {
    this.drag = {
      fromId,
      chain: [],
      dwellTimer: null,
      dwellTargetId: null,
      knotted: false,
      moved: false,
    };
  }

  clearDwell(): void {
    if (this.drag?.dwellTimer) {
      clearTimeout(this.drag.dwellTimer);
      this.drag.dwellTimer = null;
    }
    if (this.drag?.dwellTargetId) {
      this.deps.setKnotVisual(this.drag.dwellTargetId, false);
      this.drag.dwellTargetId = null;
    }
  }

  end(): DragRope | null {
    const d = this.drag;
    this.clearDwell();
    this.drag = null;
    return d;
  }
}
