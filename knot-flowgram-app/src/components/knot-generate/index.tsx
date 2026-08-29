/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import React, { useState } from 'react';
import { Button, Empty, List, Card } from '@douyinfe/semi-ui';
import { useService, WorkflowDocument, WorkflowLinesManager } from '@flowgram.ai/free-layout-editor';
import { useSelection } from '../../context/selection-context';
import { generate, CheckedKnot } from '../../services/generate';
import styles from './styles.module.css';

/**
 * 生成面板组件
 * 显示已勾选结列表（可见集 V_b）+ 生成按钮
 * 点击生成 → 调用 generate → 返回内容自动成结（追加新节点进画布）
 */
export const KnotGeneratePanel: React.FC = () => {
  const { checkedIds } = useSelection();
  const workflowDocument = useService(WorkflowDocument);
  const linesManager = useService(WorkflowLinesManager);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 从 WorkflowDocument 中根据 checkedIds 读取节点信息
  const checkedKnots: CheckedKnot[] = checkedIds
    .map((id) => {
      const node = workflowDocument.getNode(id);
      if (!node) return null;
      const json = node.toJSON() as {
        data?: { title?: string; summary?: string };
        meta?: { position?: { x: number; y: number } };
      };
      return {
        id: node.id,
        title: json.data?.title || `Node ${id}`,
        summary: json.data?.summary || '',
      };
    })
    .filter((k) => k !== null) as CheckedKnot[];

  // 处理生成按钮点击
  const handleGenerate = async () => {
    if (checkedKnots.length === 0) {
      setError('请先勾选至少一个结');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 调用生成服务
      const result = await generate({ checked: checkedKnots });

      // 计算新节点位置（从源头长出来：勾选结（V_b）的质心附近 + 偏移，不是面板下方）
      const positions = checkedKnots.map((k) => {
        const node = workflowDocument.getNode(k.id);
        const json = node?.toJSON() as
          | { meta?: { position?: { x: number; y: number } } }
          | undefined;
        return json?.meta?.position || { x: 0, y: 0 };
      });

      const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
      const avgY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
      // 从源头质心右下方错位长出（第一性原理：结从来源结长出来，不是丢到空白处）
      const newPosition = {
        x: avgX + 160,
        y: avgY + 120,
      };

      // 创建新节点（knot 类型：生成自动成结，免手动收尾）
      const newNode = workflowDocument.createWorkflowNodeByType('knot', newPosition, {
        data: {
          title: result.title,
          summary: result.summary,
          token: 0,
          src: `generated:${checkedKnots.map((k) => k.id).join(',')}`,
          chain_id: 'chain_gen',
        },
        meta: {
          size: {
            width: 300,
            height: 120,
          },
        },
      });

      if (newNode) {
        setError(null);
        // 绳连回来源（第一性原理：生成结从 V_b 长出，绳=provenance 可视化）
        checkedKnots.forEach((k) => {
          try {
            linesManager.createLine({
              from: k.id,
              to: newNode.id,
              fromPort: 'out',
              toPort: 'in',
            });
          } catch {
            // 单条绳失败不影响生成
          }
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.generatePanel}>
      <Card
        title="生成面板"
        style={{
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div className={styles.content}>
          {/* 已勾选结列表 */}
          <div className={styles.section}>
            <h4>已勾选结（可见集 V_b）</h4>
            {checkedKnots.length === 0 ? (
              <Empty
                description="暂无勾选结"
                style={{ margin: '16px 0' }}
              />
            ) : (
              <List
                dataSource={checkedKnots}
                renderItem={(item) => (
                  <List.Item
                    key={item.id}
                    style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ fontWeight: 500 }}>{item.title}</div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#999',
                          marginTop: '4px',
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.summary.substring(0, 100)}
                        {item.summary.length > 100 ? '...' : ''}
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </div>

          {/* 生成按钮 */}
          <div className={styles.section}>
            <Button
              onClick={handleGenerate}
              loading={loading}
              disabled={checkedKnots.length === 0}
              type="primary"
              style={{ width: '100%' }}
            >
              {loading ? '生成中...' : `生成新结 (${checkedKnots.length} 个勾选结)`}
            </Button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: '#ffe3e3',
                color: '#d32f2f',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              {error}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
