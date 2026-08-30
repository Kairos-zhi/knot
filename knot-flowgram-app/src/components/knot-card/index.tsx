/**
 * 三原色标签纸卡片（KnotPaperCard）
 * 依据：方案 §一模型/§二视觉/§三动效/§七拍板结论
 *
 * - 三张纸叠成一叠：绿=原始片 / 蓝=发展片 / 红=当前片（z 序叠放）
 * - 右端竖排三条标签纸，固定露出 --knot-paper-tab-expose（~4px）
 * - 点击标签纸 = 抽到最上（z 序切换 + 微位移 smooth 0.5s，--knot-ease-out）
 * - 懒渲染：非激活层只渲染标签条露头，激活层才渲染整纸内容（防 DOM×3 膨胀）
 * - 红标签条深色文字（对比度）；点击区 ≥28×28（--knot-paper-tab-hit）
 * - 深浅切换 P2：本棒只做 CSS 变量留口（--knot-paper-*-dark）
 */
import React, { FC, useMemo, useState } from 'react';

import { KNOT_PAPER_LAYERS, KnotPaper, KnotPaperLayer, KnotPaperStack, makeDefaultPapers } from './model';
import { KNOT_MOTION, KNOT_PAPER_PULL_OFFSET, KNOT_PAPER_STACK_OFFSET } from './motion';

import './card.css';

export interface KnotPaperCardProps {
  /** 结级 id（绳引用端点） */
  knotId: string;
  /** 外部传入纸叠（可选；缺省时由 title/summary 合成默认三层演示纸叠） */
  stack?: KnotPaperStack;
  /** 合成默认纸叠的种子（stack 缺省时使用） */
  title?: string;
  summary?: string;
  blocks?: { id: string; content: string }[];
  /** 层切换回调（P1 接写回/同步用） */
  onActiveLayerChange?: (layer: KnotPaperLayer, paper: KnotPaper) => void;
}

const LAYER_LABEL: Record<KnotPaperLayer, string> = {
  green: '原',
  blue: '展',
  red: '今',
};

export const KnotPaperCard: FC<KnotPaperCardProps> = (props) => {
  const { knotId, title = '', summary = '', blocks, onActiveLayerChange } = props;

  const stack = useMemo<KnotPaperStack>(
    () => props.stack ?? makeDefaultPapers(knotId, { title, summary, blocks }),
    [props.stack, knotId, title, summary, blocks]
  );

  const [activeLayer, setActiveLayer] = useState<KnotPaperLayer>(stack.activeLayer);

  /** 抽纸到顶：z 序切换（其余两张压下） */
  const pullToTop = (layer: KnotPaperLayer) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (layer === activeLayer) return;
    setActiveLayer(layer);
    onActiveLayerChange?.(layer, stack.papers[layer]);
  };

  /** z 序：激活层最上；其余按默认层序 */
  const zOf = (layer: KnotPaperLayer): number => {
    if (layer === activeLayer) return 3;
    const rest = KNOT_PAPER_LAYERS.filter((l) => l !== activeLayer);
    return rest.indexOf(layer) + 1;
  };

  /** 微位移：激活层轻微抽出，其余按 z 序内缩阶梯 */
  const offsetOf = (layer: KnotPaperLayer): { x: number; y: number } => {
    if (layer === activeLayer) return { x: -KNOT_PAPER_PULL_OFFSET, y: 0 };
    const z = zOf(layer);
    return { x: 0, y: (3 - z) * KNOT_PAPER_STACK_OFFSET };
  };

  return (
    <div
      className="knot-paper-card"
      style={
        {
          '--knot-motion-smooth': `${KNOT_MOTION.smooth.cssDuration} ${KNOT_MOTION.smooth.ease}`,
          '--knot-motion-snappy': `${KNOT_MOTION.snappy.cssDuration} ${KNOT_MOTION.snappy.ease}`,
        } as React.CSSProperties
      }
    >
      <div className="knot-paper-card__stack">
        {KNOT_PAPER_LAYERS.map((layer) => {
          const paper = stack.papers[layer];
          const isActive = layer === activeLayer;
          const off = offsetOf(layer);
          return (
            <div
              key={paper.id}
              className={`knot-paper knot-paper--${layer} ${isActive ? 'knot-paper--active' : ''}`}
              style={{
                zIndex: zOf(layer),
                transform: `translate(${off.x}px, ${off.y}px)`,
              }}
              data-layer={layer}
              data-paper-id={paper.id}
            >
              {/* 懒渲染：非激活层不渲染纸内容，只留壳（标签条在壳外右端） */}
              {isActive && (
                <div className="knot-paper__body">
                  <div className="knot-paper__title">{paper.title}</div>
                  {paper.summary && <div className="knot-paper__summary">{paper.summary}</div>}
                  {paper.blocks?.map((b) => (
                    <div key={b.id} className="knot-paper__block">
                      {b.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* 右端竖排三条标签纸（独立于纸壳，保证固定露出 --knot-paper-tab-expose） */}
        <div className="knot-paper-card__tabs">
          {KNOT_PAPER_LAYERS.map((layer) => {
            const paper = stack.papers[layer];
            const isActive = layer === activeLayer;
            return (
              <button
                key={`tab-${paper.id}`}
                type="button"
                className={`knot-paper-tab knot-paper-tab--${layer} ${
                  isActive ? 'knot-paper-tab--active' : ''
                }`}
                style={{ zIndex: zOf(layer) + 10 }}
                onClick={pullToTop(layer)}
                title={`${LAYER_LABEL[layer]} · ${paper.title || paper.summary || paper.id}`}
                aria-pressed={isActive}
              >
                <span className="knot-paper-tab__label">{LAYER_LABEL[layer]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KnotPaperCard;
