/**
 * knot 绳线渲染：细线 + 克制配色（单强调色原则）
 * 对齐默认 LineSVG 结构（bounds 定位 + svg + bezier path），
 * 去掉渐变与箭头装饰，绳线更细。
 */
import React from 'react';
import { WorkflowLineRenderData } from '@flowgram.ai/free-layout-editor';
import { LineRenderProps } from '@flowgram.ai/free-lines-plugin';

const PADDING = 12;

export const KnotLineRender: React.FC<LineRenderProps> = (props) => {
  const { line, color, selected } = props;
  const renderData = line.getData(WorkflowLineRenderData);
  if (!renderData) return null;

  const { bounds, path: bezierPath } = renderData;

  const strokeWidth = selected ? 1.6 : 1;
  const stroke = selected ? '#ff9500' : color ?? '#b8b8b8';

  return (
    <div
      className="knot-edge"
      style={{
        left: bounds.x - PADDING,
        top: bounds.y - PADDING,
        position: 'absolute',
        pointerEvents: 'none',
      }}
    >
      {props.children}
      <svg width={bounds.width + PADDING * 2} height={bounds.height + PADDING * 2}>
        <path
          d={bezierPath}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={line.processing || line.flowing ? '6 4' : undefined}
        />
      </svg>
    </div>
  );
};
