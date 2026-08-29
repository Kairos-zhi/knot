/**
 * 三件套工具条：底部中央，棍子/绳子/剪刀
 * 当前工具橙色高亮（#ff9500），快捷键 1/2/3
 * 样式克制：半透明底，与画布融合
 */
import React, { useEffect, useState } from 'react';
import { getTool, setTool, onToolChange, ToolType, TOOL_HOTKEYS } from './tool-store';
import './toolbar.css';

const TOOLS: { type: ToolType; label: string; icon: string; hotkey: string; title: string }[] = [
  { type: 'hand', label: '手', icon: '✋', hotkey: 'H', title: '手：在空间里行走（按住拖=平移视野；空格=临时手）' },
  { type: 'stick', label: '棍子', icon: '●', hotkey: 'V', title: '棍子：移动/选择（PS V：单击选中，按住直接拖，双击展开内容）' },
  { type: 'rope', label: '绳子', icon: '〜', hotkey: 'R', title: '绳子：连接（从结拖出绳头串链）' },
  { type: 'scissors', label: '剪刀', icon: '✂', hotkey: 'C', title: '剪刀：断开（点绳剪断/点结解绳）' },
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
          title={t.title}
        >
          {/* PS 式字母标识：提醒用户快捷键 */}
          <span className="knot-toolbar__hotkey">{t.hotkey}</span>
          <span className="knot-toolbar__icon">{t.icon}</span>
          <span className="knot-toolbar__label">{t.label}</span>
        </button>
      ))}
    </div>
  );
};
