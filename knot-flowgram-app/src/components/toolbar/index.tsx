/**
 * 三件套工具条：底部中央，棍子/绳子/剪刀
 * 当前工具橙色高亮（#ff9500），快捷键 1/2/3
 * 样式克制：半透明底，与画布融合
 */
import React, { useEffect, useState } from 'react';
import { getTool, setTool, onToolChange, ToolType, TOOL_HOTKEYS } from './tool-store';
import './toolbar.css';

const TOOLS: { type: ToolType; label: string; icon: string; title: string }[] = [
  { type: 'stick', label: '棍子', icon: '●', title: '棍子：对象/结/资产（拿起想法）' },
  { type: 'rope', label: '绳子', icon: '〜', title: '绳子：连接（串链/织网/拴项目）' },
  { type: 'scissors', label: '剪刀', icon: '✂', title: '剪刀：断开（剪断绳/剪开结）' },
];

export const KnotToolbar: React.FC = () => {
  const [tool, setToolState] = useState<ToolType>(getTool());

  useEffect(() => {
    const off = onToolChange((t) => setToolState(t));
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const next = TOOL_HOTKEYS[e.key];
      if (next) setTool(next);
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      off();
      window.document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="knot-toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.type}
          className={`knot-toolbar__btn ${tool === t.type ? 'knot-toolbar__btn--active' : ''}`}
          onClick={() => setTool(t.type)}
          title={`${t.title}（快捷键 ${Object.keys(TOOL_HOTKEYS).find((k) => TOOL_HOTKEYS[k] === t.type)}）`}
        >
          <span className="knot-toolbar__icon">{t.icon}</span>
          <span className="knot-toolbar__label">{t.label}</span>
        </button>
      ))}
    </div>
  );
};
