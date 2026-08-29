/**
 * 工具三件套：棍子/绳子/剪刀（光标即工具）
 * 定案：knot 的操作语言只有三样工具——棍子（对象/结/资产）、绳子（连接：串链/织网/拴项目）、剪刀（断开）
 * 三样对应思考三动作：拿起想法 / 连接想法 / 拆开想法
 * 工具范式=显式三件套，光标即工具，一切操作归入棍/绳/剪
 */

export type ToolType = 'stick' | 'rope' | 'scissors';

let currentTool: ToolType = 'stick';
const listeners: Array<(tool: ToolType) => void> = [];

export const getTool = (): ToolType => currentTool;

export const setTool = (tool: ToolType): void => {
  currentTool = tool;
  listeners.forEach((fn) => fn(tool));
};

export const onToolChange = (fn: (tool: ToolType) => void): (() => void) => {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};

/** 快捷键映射：1=棍子 2=绳子 3=剪刀 */
export const TOOL_HOTKEYS: Record<string, ToolType> = {
  '1': 'stick',
  '2': 'rope',
  '3': 'scissors',
};
