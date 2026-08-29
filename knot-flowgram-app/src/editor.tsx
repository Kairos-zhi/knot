/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { useState } from 'react';
import { DockedPanelLayer } from '@flowgram.ai/panel-manager-plugin';
import { EditorRenderer, FreeLayoutEditorProvider, useService, WorkflowDocument } from '@flowgram.ai/free-layout-editor';

import '@flowgram.ai/free-layout-editor/index.css';
import './styles/index.css';
import { nodeRegistries } from './nodes';
import { useEditorProps } from './hooks';
import { FocusProvider } from './context/focus-context';
import { KnotGeneratePanel } from './components/knot-generate';
import { KnotEmptySlots } from './components/knot-edge';
import { LinearFlowView } from './components/knot-linear/linear-flow';
import { assetsToWorkflowJSON, AssetItem } from './services/asset-sync';
import { loadSnapshotLocal, watchCanvas } from './services/asset-persistence';
import knotAssetsJson from './assets/knot-assets.json';

// 双向同步：localStorage 快照优先（画布即资产本体，刷新不丢），否则资产清单投影
const knotAssets: AssetItem[] = (knotAssetsJson as { assets: AssetItem[] }).assets;
const localSnap = loadSnapshotLocal();
const knotInitialData = localSnap
  ? assetsToWorkflowJSON(localSnap.assets)
  : assetsToWorkflowJSON(knotAssets);

/** 持久化桥：监听画布变更 → 写回（localStorage + 资产文件） */
const PersistenceBridge = () => {
  const document = useService(WorkflowDocument);
  watchCanvas(document);
  return null;
};

type ViewMode = 'linear' | 'space';

export const Editor = () => {
  const editorProps = useEditorProps(knotInitialData, nodeRegistries);
  const [viewMode, setViewMode] = useState<ViewMode>('space');

  /** 从线性流点一个结 → 切到语义空间并聚焦该结 */
  const focusKnotFromLinear = (id: string) => {
    setViewMode('space');
    // 等空间视图渲染后选中该结（焦点）
    setTimeout(() => {
      const el = document.querySelector(`[data-node-id="${id}"]`);
      if (el) {
        (el as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    }, 60);
  };

  return (
    <div className="doc-free-feature-overview">
      <FreeLayoutEditorProvider {...editorProps}>
        <PersistenceBridge />
        <FocusProvider>
          <div className="demo-container">
            <DockedPanelLayer>
              <EditorRenderer className="demo-editor" />
            </DockedPanelLayer>
            {viewMode === 'linear' && <LinearFlowView onFocusKnot={focusKnotFromLinear} />}
            <KnotEmptySlots />
            <KnotGeneratePanel />
            {/* 双模式切换：先线性（源头），后非线性（语义空间） */}
            <div className="knot-view-switch">
              <button
                className={`knot-view-switch__btn ${viewMode === 'linear' ? 'is-active' : ''}`}
                onClick={() => setViewMode('linear')}
                title="线性流：思考的源头（对话/文档的时间顺序）"
              >
                线性流
              </button>
              <button
                className={`knot-view-switch__btn ${viewMode === 'space' ? 'is-active' : ''}`}
                onClick={() => setViewMode('space')}
                title="语义空间：从流长出的网络（结+绳）"
              >
                语义空间
              </button>
            </div>
          </div>
        </FocusProvider>
      </FreeLayoutEditorProvider>
    </div>
  );
};
