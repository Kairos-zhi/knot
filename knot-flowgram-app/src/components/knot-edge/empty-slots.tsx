/**
 * 空白「?」位（规格 v1 二.5）——可点击：点击即在此打一个新结
 * 空白=吸引力从装饰变成操作（红队 P3.5b 最小版：? 位=打结入口）
 * 直觉性：用户看到 ? 就知道"这里可以长一个结"
 */
import React from 'react';
import { useService, WorkflowDocument, WorkflowSelectService } from '@flowgram.ai/free-layout-editor';
import { KnotOperationService } from '../../services/knot-operation-service';
import './empty-slots.css';

export const KnotEmptySlots: React.FC = () => {
  const workflowDocument = useService(WorkflowDocument);
  const selectService = useService(WorkflowSelectService);
  const opService = useService(KnotOperationService);

  const createKnotAt = (x: number, y: number) => {
    const result = opService.createKnot(
      {
        title: '新结',
        summary: '点击展开，写点什么。',
        token: 0,
        src: 'manual',
        chain_id: 'chain_manual',
      },
      { x, y },
      { source: 'human' }
    );
    if (result.ok) {
      const node = workflowDocument.getNode(result.value);
      if (node) {
        // 打结后立即选中（焦点+可展开编辑）
        selectService.selection = [node];
      }
    }
  };

  return (
    <div className="knot-empty-slots" aria-hidden="true">
      {/* 引导文案：一句话教会核心操作（克制风，低存在感） */}
      <div className="knot-empty-hint">点击 ? 打一个结 · 点结聚焦 · 勾选后生成 · 结上 + 续长</div>
      <div
        className="knot-empty-slot"
        style={{ left: 72, top: 96 }}
        onClick={(e) => {
          e.stopPropagation();
          createKnotAt(72, 96);
        }}
      >
        ?
      </div>
      <div
        className="knot-empty-slot"
        style={{ right: 140, top: 64 }}
        onClick={(e) => {
          e.stopPropagation();
          createKnotAt(900, 64);
        }}
      >
        ?
      </div>
      <div
        className="knot-empty-slot"
        style={{ left: 320, bottom: 48 }}
        onClick={(e) => {
          e.stopPropagation();
          createKnotAt(320, 700);
        }}
      >
        ?
      </div>
    </div>
  );
};
