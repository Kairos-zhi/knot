/**
 * Knot 节点渲染组件
 * 折叠=圆点+标签，展开=卡片
 * 焦点高亮（星标），勾选挂点，语义距离（近实/中淡/远虚）
 *
 * 签名对齐模板 CommentRender：props = { node }（WorkflowNodeEntity），
 * 业务数据经 node.toJSON().data 读取；选中/ref 经 useNodeRender 获取。
 * 注：FlowGram 渲染组件查询 key = meta.renderKey || 'node-render'，
 * 故 knot registry 的 meta.renderKey 必须为 'knot' 才能命中 renderNodes 映射。
 */
import React, { useState } from 'react';
import { FC } from 'react';
import { useNodeRender, WorkflowNodeEntity } from '@flowgram.ai/free-layout-editor';

import { KnotNode } from '../../knot-model';
import { useSelection } from '../../context/selection-context';
import { useFocus } from '../../context/focus-context';

import './styles.css';

interface KnotNodeRenderProps {
  node: WorkflowNodeEntity;
}

export const KnotNodeRender: FC<KnotNodeRenderProps> = (props) => {
  const { node } = props;
  const { selected: isFocused, selectNode, nodeRef } = useNodeRender();
  const [isExpanded, setIsExpanded] = useState(false);

  const id = node.id;
  const json = node.toJSON() as { data?: KnotNode['data'] };
  const data: KnotNode['data'] = json.data ?? {
    title: '',
    summary: '',
    token: 0,
    src: '',
    chain_id: '',
  };

  // 勾选状态（可见集 V_b）
  const selectionCtx = useSelection();
  const isChecked = selectionCtx.checkedIds.includes(id);
  const toggleCheck = selectionCtx.toggle;

  // 语义距离（近=实/中=淡/远=虚，规格 v1 二.1）
  const { focusedId, distanceOf } = useFocus();
  let distanceLevel = '';
  if (focusedId && focusedId !== id) {
    const d = distanceOf(id) ?? Infinity;
    distanceLevel = d < 400 ? 'knot-node--near' : d < 900 ? 'knot-node--mid' : 'knot-node--far';
  }

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleToggleCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    toggleCheck(id);
  };

  return (
    <div
      ref={nodeRef}
      className={`knot-node ${isExpanded ? 'knot-node--expanded' : 'knot-node--collapsed'} ${
        isFocused ? 'knot-node--focused' : ''
      } ${distanceLevel}`}
      onMouseDown={(e) => {
        selectNode(e);
      }}
    >
      {/* 勾选框 */}
      <div className="knot-node__checkbox">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={handleToggleCheck}
          className="knot-node__checkbox-input"
        />
      </div>

      {/* 折叠态：圆点+标签 */}
      {!isExpanded && (
        <div className="knot-node__collapsed" onClick={handleToggleExpand}>
          <div className="knot-node__dot" />
          <div className="knot-node__title">{data.title}</div>
          {isFocused && <div className="knot-node__focus-star">★</div>}
        </div>
      )}

      {/* 展开态：卡片 */}
      {isExpanded && (
        <div className="knot-node__expanded">
          <div className="knot-node__header">
            <div className="knot-node__title-expanded">{data.title}</div>
            {isFocused && <div className="knot-node__focus-star">★</div>}
            <button className="knot-node__close" onClick={handleToggleExpand}>
              ✕
            </button>
          </div>
          <div className="knot-node__summary">{data.summary}</div>
          <div className="knot-node__meta">
            <span className="knot-node__token">token: {data.token}</span>
            <span className="knot-node__src">来自: {data.src}</span>
          </div>
        </div>
      )}
    </div>
  );
};
