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

  // 打结（fixed）小结节：绳与目标结接触点附近的橙色圆点（比端口大）
  const fixed = (line.lineData as { fixed?: boolean } | undefined)?.fixed === true;
  let knotDot: { cx: number; cy: number } | null = null;
  if (fixed) {
    const nums = (bezierPath.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length >= 2) {
      // path 末点=绳与目标结的接触点（相对 bounds 坐标，加 PADDING 对齐 svg 偏移）
      knotDot = { cx: nums[nums.length - 2] + PADDING, cy: nums[nums.length - 1] + PADDING };
    }
  }

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
        {knotDot && (
          <circle
            className="knot-edge__knot"
            cx={knotDot.cx}
            cy={knotDot.cy}
            r={4.5}
            fill="#ff9500"
            stroke="#ffffff"
            strokeWidth={1.2}
          />
        )}
      </svg>
    </div>
  );
};
