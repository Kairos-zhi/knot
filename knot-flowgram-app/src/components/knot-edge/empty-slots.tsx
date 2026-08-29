/**
 * 空白「?」位（规格 v1 二.5）
 * 灵感区/虚线空位：「这里可能有结但还没打」
 * 虚线轮廓 + ?，不可点但可见——低存在感，不吵
 */
import React from 'react';
import './empty-slots.css';

export const KnotEmptySlots: React.FC = () => (
  <div className="knot-empty-slots" aria-hidden="true">
    <div className="knot-empty-slot" style={{ left: 72, top: 96 }}>
      ?
    </div>
    <div className="knot-empty-slot" style={{ right: 140, top: 64 }}>
      ?
    </div>
    <div className="knot-empty-slot" style={{ left: 320, bottom: 48 }}>
      ?
    </div>
  </div>
);
