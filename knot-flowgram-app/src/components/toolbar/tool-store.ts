/**
 * 工具三件套：棍子/绳子/剪刀（光标即工具）
 * 定案：knot 的操作语言只有三样工具——棍子（对象/结/资产）、绳子（连接：串链/织网/拴项目）、剪刀（断开）
 * 三样对应思考三动作：拿起想法 / 连接想法 / 拆开想法
 * 工具范式=显式三件套，光标即工具，一切操作归入棍/绳/剪
 */

export type ToolType = 'hand' | 'stick' | 'rope' | 'scissors';

let currentTool: ToolType = 'stick';
const listeners: Array<(tool: ToolType) => void> = [];

export const getTool = (): ToolType => currentTool;

export const setTool = (tool: ToolType): void => {
  currentTool = tool;
  // 画笔模型：工具切换即改变画布光标与路过呼应（CSS 由 body[data-tool] 驱动）
  window.document.body.dataset.tool = tool;
  listeners.forEach((fn) => fn(tool));
};

export const onToolChange = (fn: (tool: ToolType) => void): (() => void) => {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};

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
