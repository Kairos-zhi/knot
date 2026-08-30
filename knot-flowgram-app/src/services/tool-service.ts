/**
 * ToolService —— 工具三件套状态（③ 统一状态层：tool-store 模块级单例 → FlowGram Service）
 *
 * 行为零变化：只换状态载体（模块级 let+listeners → @injectable 单例）。
 * 注册姿势抄 KnotOperationService：onBind ctx.bind(ToolService).toSelf().inSingletonScope()。
 * 无头断言（tests/knot-operation-service.assert.ts）不跑 setTool，body.dataset 不存在时天然跳过。
 */
import { injectable } from '@flowgram.ai/free-layout-editor';

export type ToolType = 'hand' | 'stick' | 'rope' | 'scissors';

/** 快捷键映射（PS 逻辑：H=手 V=棍子 R=绳子 C=剪刀；数字键 1-4 同样支持；空格=临时手） */
export const TOOL_HOTKEYS: Record<string, ToolType> = {
  '1': 'hand',
  '2': 'stick',
  '3': 'rope',
  '4': 'scissors',
  h: 'hand',
  H: 'hand',
  v: 'stick',
  V: 'stick',
  r: 'rope',
  R: 'rope',
  c: 'scissors',
  C: 'scissors',
};

@injectable()
export class ToolService {
  private currentTool: ToolType = 'stick';

  private listeners: Array<(tool: ToolType) => void> = [];

  getTool(): ToolType {
    return this.currentTool;
  }

  setTool(tool: ToolType): void {
    this.currentTool = tool;
    // 画笔模型：工具切换即改变画布光标与路过呼应（CSS 由 body[data-tool] 驱动）
    if (typeof window !== 'undefined' && window.document?.body) {
      window.document.body.dataset.tool = tool;
    }
    this.listeners.forEach((fn) => fn(tool));
  }

  onToolChange(fn: (tool: ToolType) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}
