/**
 * 链卡（之定）：绳子串联成链之后才出现的卡片——展示线性关系的肉身
 * 内容：链上结按序（A → B → C）+ 续长（基于链生成新结接尾）+ 关闭（绳还在，卡可关）
 * 无链时不存在（不是常驻面板）
 */
import React, { useEffect, useState } from 'react';
import { useService, WorkflowDocument, WorkflowLinesManager, TransformData } from '@flowgram.ai/free-layout-editor';

import { getChain, onChainChange, closeChain, ChainState } from './chain-store';
import { generate } from '../../services/generate';
import './chain-card.css';

export const KnotChainCard: React.FC = () => {
  const document = useService(WorkflowDocument);
  const linesManager = useService(WorkflowLinesManager);
  const [chain, setChainState] = useState<ChainState | null>(getChain());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onChainChange(setChainState), []);

  if (!chain) return null;

  const titles = chain.ids
    .map((id) => {
      const node = document.getNode(id);
      const json = node?.toJSON() as { data?: { title?: string } } | undefined;
      return json?.data?.title ?? id;
    })
    .filter(Boolean);

  const handleGrow = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generate({
        checked: chain.ids.map((id) => ({ id, title: '', summary: '' })),
      });
      // 新结接在链尾：位置=链尾结右下方，绳连回链尾
      const lastId = chain.ids[chain.ids.length - 1];
      const lastNode = document.getNode(lastId);
      const lastPos = lastNode
        ? (lastNode.getData(TransformData).position as { x: number; y: number })
        : { x: 400, y: 400 };
      const newNode = document.createWorkflowNodeByType(
        'knot',
        { x: lastPos.x + 180, y: lastPos.y + 100 },
        {
          data: {
            title: result.title,
            summary: result.summary,
            token: 0,
            src: `generated:${chain.ids.join(',')}`,
            chain_id: 'chain_gen',
          },
          meta: { size: { width: 300, height: 120 } },
        },
      );
      if (newNode) {
        try {
          linesManager.createLine({ from: lastId, to: newNode.id, fromPort: 'out', toPort: 'in' });
        } catch {
          // 单条绳失败不影响
        }
        // 链卡更新为含新结的链
        setChainState({ ids: [...chain.ids, newNode.id], epoch: Date.now() });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="knot-chain-card">
      <div className="knot-chain-card__header">
        <span className="knot-chain-card__title">链 · {chain.ids.length} 结</span>
        <button className="knot-chain-card__close" title="关闭链卡（绳保留在画布）" onClick={closeChain}>
          ✕
        </button>
      </div>
      <div className="knot-chain-card__path">
        {titles.map((t, i) => (
          <React.Fragment key={chain.ids[i]}>
            {i > 0 && <span className="knot-chain-card__arrow">→</span>}
            <span className="knot-chain-card__item">{t}</span>
          </React.Fragment>
        ))}
      </div>
      {error && <div className="knot-chain-card__error">{error}</div>}
      <button className="knot-chain-card__grow" disabled={loading} onClick={handleGrow}>
        {loading ? '生长中…' : '+ 续长（基于这条链长出下一个结）'}
      </button>
    </div>
  );
};
