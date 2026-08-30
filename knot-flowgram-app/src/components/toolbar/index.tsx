/**
 * 三件套工具条：底部中央，棍子/绳子/剪刀
 * 当前工具橙色高亮（#ff9500），快捷键 1/2/3
 * 样式克制：半透明底，与画布融合
 */
import React, { useEffect, useState } from 'react';
import { ToolType, TOOL_HOTKEYS, ToolService } from '../../services/tool-service';
import { useService } from '@flowgram.ai/free-layout-editor';
import './toolbar.css';

const TOOLS: { type: ToolType; label: string; icon: string; hotkey: string; title: string }[] = [
  { type: 'rope', label: '绳子', icon: '〜', hotkey: 'R', title: '绳子：从结拖出绳头串链（串成后出现链卡）' },
  { type: 'scissors', label: '剪刀', icon: '✂', hotkey: 'C', title: '剪刀：点绳剪断/点结解绳' },
];

export const KnotToolbar: React.FC = () => {
  const toolService = useService(ToolService);
  const [tool, setToolState] = useState<ToolType>(toolService.getTool());

  useEffect(() => {
    const off = toolService.onToolChange((t) => setToolState(t));
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const next = TOOL_HOTKEYS[e.key];
      if (next) toolService.setTool(next);
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      off();
      window.document.removeEventListener('keydown', onKeyDown);
    };
  }, [toolService]);

  return (
    <div className="knot-toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.type}
          className={`knot-toolbar__btn ${tool === t.type ? 'knot-toolbar__btn--active' : ''}`}
          onClick={() => toolService.setTool(t.type)}
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
