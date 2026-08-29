/**
 * 线性流视图（源头层）——先线性后非线性
 * 线性=对话/思考流（一维：来源+时间顺序），非线性=语义空间（投影）
 * 每个结是流上的一个片段：圆点 + 来源 + 标题 + 首块摘要
 */
import React from 'react';
import { useService, WorkflowDocument } from '@flowgram.ai/free-layout-editor';
import { getBlocks } from '../../knot-model';
import './linear-flow.css';

interface LinearItem {
  id: string;
  title: string;
  src: string;
  chain_id: string;
  preview: string;
}

export const LinearFlowView: React.FC<{
  mode: 'space' | 'linear' | 'both';
  onFocusKnot: (id: string) => void;
}> = ({ mode, onFocusKnot }) => {
  const document = useService(WorkflowDocument);

  const items: LinearItem[] = document
    .getAllNodes()
    .filter((n) => (n.toJSON() as { type?: string }).type === 'knot')
    .map((n) => {
      const json = n.toJSON() as {
        id: string;
        data?: { title?: string; summary?: string; src?: string; chain_id?: string; blocks?: unknown[] };
      };
      const data = json.data ?? {};
      const blocks = getBlocks({ title: data.title ?? '', summary: data.summary ?? '', token: 0, src: '', chain_id: '', blocks: data.blocks as never });
      return {
        id: json.id,
        title: data.title ?? '',
        src: data.src ?? '',
        chain_id: data.chain_id ?? '',
        preview: blocks[0]?.content ?? data.summary ?? '',
      };
    })
    // 线性顺序：同链相邻（源内顺序），链间按清单序
    .sort((a, b) => (a.chain_id === b.chain_id ? 0 : a.chain_id < b.chain_id ? -1 : 1));

  return (
    <div className={`knot-linear mode-${mode}`} aria-hidden={mode === 'space' ? 'true' : undefined}>
      <div className="knot-linear__rail" />
      {items.map((it, idx) => {
        const prev = items[idx - 1];
        const newChain = !prev || prev.chain_id !== it.chain_id;
        return (
          <React.Fragment key={it.id}>
            {newChain && (
              <div className="knot-linear__chain-label">{it.chain_id || '未命名链'}</div>
            )}
            <div
              className="knot-linear__item"
              onClick={() => onFocusKnot(it.id)}
              title="点击切到语义空间聚焦此结"
            >
              <div className="knot-linear__dot" />
              <div className="knot-linear__body">
                <div className="knot-linear__title">{it.title}</div>
                <div className="knot-linear__meta">{it.src}</div>
                <div className="knot-linear__preview">{it.preview}</div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div className="knot-linear__tail">↓ 对话继续，流继续长</div>
    </div>
  );
};
