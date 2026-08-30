/**
 * Knot 节点渲染组件
 * 折叠=圆点+标签，展开=卡片
 * 焦点高亮（星标），勾选挂点，语义距离（近实/中淡/远虚）
 *
 * 阶段 3 P0 生长态（红队 3.3 + 游戏调研形态）：
 *  - 展开态=有序块列表，块间细分隔（低对比不吵）
 *  - 续长入口=展开卡片底部虚线「+」按钮（与 ? 位视觉同族，星际拓荒显式空白）
 *  - 生成中逐块流入（打字机即打结，Citizen Sleeper 时钟/Disco 思想内阁的渐进生长）
 *  - 折叠=显示首块摘要（背书④可展开）
 *
 * 签名对齐模板 CommentRender：props = { node }（WorkflowNodeEntity），
 * 业务数据经 node.toJSON().data 读取；选中/ref 经 useNodeRender 获取。
 * 注：FlowGram 渲染组件查询 key = meta.renderKey || 'node-render'，
 * 故 knot registry 的 meta.renderKey 必须为 'knot' 才能命中 renderNodes 映射。
 */
import React, { useEffect, useState } from 'react';
import { FC } from 'react';
import {
  useNodeRender,
  useService,
  WorkflowNodeEntity,
} from '@flowgram.ai/free-layout-editor';

import { KnotNode, getBlocks } from '../../knot-model';
import { useSelection } from '../../context/selection-context';
import { getExpandedId, setExpandedId, onExpandedChange } from '../../context/expand-store';
import { useFocus } from '../../context/focus-context';
import { KnotOperationService } from '../../services/knot-operation-service';

import './styles.css';

interface KnotNodeRenderProps {
  node: WorkflowNodeEntity;
}

export const KnotNodeRender: FC<KnotNodeRenderProps> = (props) => {
  const { node } = props;
  const { selected: isFocused, selectNode, nodeRef } = useNodeRender();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGrowing, setIsGrowing] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false); // 黄灯：固定形态（锁定展开，不随移开收起）
  const opService = useService(KnotOperationService);

  const id = node.id;

  // 卡片互斥（之定）：别的卡片展开时自己收起（实体感=同一时间只有一张展开）
  useEffect(() => {
    return onExpandedChange((cur) => {
      if (cur !== id) setIsExpanded(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const json = node.toJSON() as { data?: KnotNode['data'] };
  const data: KnotNode['data'] = json.data ?? {
    title: '',
    summary: '',
    token: 0,
    src: '',
    chain_id: '',
  };
  const blocks = getBlocks(data);

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

  const handleToggleCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    toggleCheck(id);
  };

  /** 续长：以该结为 V_b 触发生成，新块接尾（生成中逐块流入可见） */
  const handleGrow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGrowing) return;
    setIsGrowing(true);
    setStreamingText('');
    try {
      await opService.growKnot(id, (text) => setStreamingText(text));
    } finally {
      setIsGrowing(false);
      setStreamingText(null);
    }
  };

  return (
    <div
      ref={nodeRef}
      className={`knot-node ${isExpanded ? 'knot-node--expanded' : 'knot-node--collapsed'} ${
        isFocused ? 'knot-node--focused' : ''
      } ${isPinned ? 'knot-node--pinned' : ''} ${distanceLevel} ${
        data.src && !data.src.startsWith('generated:') ? 'knot-node--source' : ''
      }`}
      onMouseDown={(e) => {
        selectNode(e);
      }}
      onMouseEnter={() => {
        // 双层漏斗（之定）：鼠标移上自动展开 + 互斥（登记自己为唯一展开者）
        setExpandedId(id);
        setIsExpanded(true);
      }}
      onMouseLeave={() => {
        // 移开自动收回 mini（黄灯固定时例外；互斥登记也清）
        if (!isPinned) setIsExpanded(false);
        if (getExpandedId() === id) setExpandedId(null);
      }}
    >
      {/* 红绿灯状态机（之定案 22）：hover 1→2→3 依次亮（进度条）；第三灯=悬浮；选中=闪灯；三灯三功能 */}
      <div className="knot-node__lights">
        <span
          className={`knot-node__light knot-node__light--red ${isPinned ? 'is-pinned-mark' : ''}`}
          title="红：断开这个结的所有链接"
          onClick={(e) => {
            e.stopPropagation();
            opService.disconnectAll(id);
          }}
        >
          ×
        </span>
        <span
          className="knot-node__light knot-node__light--yellow"
          title="黄：固定形态（锁定展开，不随移开收起）"
          onClick={(e) => {
            e.stopPropagation();
            setIsPinned((p) => !p);
          }}
        >
          −
        </span>
        <span
          className="knot-node__light knot-node__light--green"
          title="绿：展开"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
            setIsPinned(true);
          }}
        >
          ＋
        </span>
      </div>

      {/* 绳孔：从卡面唤起绳子（按住拖出绳头，不切工具） */}
      <div className="knot-node__rope-handle" data-rope-from={id} title="从这里拖出绳子">
        ○
      </div>

      {/* 勾选框 */}
      <div className="knot-node__checkbox">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={handleToggleCheck}
          className="knot-node__checkbox-input"
        />
      </div>

      {/* 折叠态（mini）：圆点+首块摘要——hover 自动展开，无需按钮 */}
      {!isExpanded && (
        <div className="knot-node__collapsed">
          <div className="knot-node__dot" />
          <div className="knot-node__title">{blocks[0]?.content ?? data.title}</div>
          {isFocused && <div className="knot-node__focus-star">★</div>}
        </div>
      )}

      {/* 展开态：浮层卡片（absolute top:100%——引擎尺寸恒定不动，展开不触发引擎重定位，零瞬移） */}
      {isExpanded && (
        <div className="knot-node__expanded knot-node__expanded-pop">
          <div className="knot-node__header">
            <div className="knot-node__title-expanded">{data.title}</div>
            {isFocused && <div className="knot-node__focus-star">★</div>}
          </div>

          {/* 块列表：块间细分隔（低对比不吵） */}
          <div className="knot-node__blocks">
            {blocks.map((b, i) => (
              <div key={b.id} className="knot-node__block">
                {i > 0 && <div className="knot-node__block-divider" />}
                <div className="knot-node__block-content">{b.content}</div>
                <div className="knot-node__block-meta">
                  {b.source === 'generated' ? '生成' : '手写'}
                  {b.provenance.length > 0 && ` ← ${b.provenance.join(', ')}`}
                </div>
              </div>
            ))}
            {/* 生成中：逐块流入（打字机即打结） */}
            {streamingText !== null && (
              <div className="knot-node__block knot-node__block--streaming">
                <div className="knot-node__block-divider" />
                <div className="knot-node__block-content">{streamingText}</div>
                <div className="knot-node__block-meta">生成中…</div>
              </div>
            )}
          </div>

          {/* 续长入口：虚线「+」按钮（与 ? 位视觉同族） */}
          <button
            className="knot-node__grow"
            onClick={handleGrow}
            disabled={isGrowing}
            title="以该结为 V_b 续长（生成新块接尾）"
          >
            {isGrowing ? '生长中…' : '+ 续长'}
          </button>

          <div className="knot-node__meta">
            <span className="knot-node__token">token: {data.token}</span>
            <span className="knot-node__src">来自: {data.src}</span>
          </div>
        </div>
      )}
    </div>
  );
};
