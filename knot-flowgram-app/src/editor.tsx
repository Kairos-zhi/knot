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
import { FocusService } from './services/focus-service';
import { useEffect } from 'react';
import { KnotChainCard } from './components/knot-chain-card';
import { KnotEmptySlots } from './components/knot-edge';
import { LinearFlowView } from './components/knot-linear/linear-flow';
import { assetsToWorkflowJSON, AssetItem } from './services/asset-sync';
import { loadSnapshotLocal, watchCanvas } from './services/asset-persistence';
import knotAssetsJson from './assets/knot-assets.json';

// 双向同步：localStorage 快照优先（画布即资产本体，刷新不丢），否则资产清单投影
const knotAssets: AssetItem[] = (knotAssetsJson as { assets: AssetItem[] }).assets;
const localSnap = loadSnapshotLocal();
const knotInitialData = localSnap
  ? assetsToWorkflowJSON(localSnap.assets, localSnap.edges)
  : assetsToWorkflowJSON(knotAssets);

/** 持久化桥：监听画布变更 → 写回（localStorage + 资产文件） */
const PersistenceBridge = () => {
  const document = useService(WorkflowDocument);
  watchCanvas(document);
  return null;
};

/**
 * 焦点桥（③ 统一状态层）：原 FocusProvider 的选中监听平移到 FocusService.init()，
 * 在 provider 内挂载一次即可（service 为容器单例，幂等由 onSelectionChanged 注册一次保证）。
 */
const FocusBridge = () => {
  const focusService = useService(FocusService);
  useEffect(() => {
    focusService.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

type ViewMode = 'space' | 'linear' | 'both';

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
        <FocusBridge />
        <div className={`demo-container mode-${viewMode}`}>
            <DockedPanelLayer>
              <EditorRenderer className="demo-editor" />
            </DockedPanelLayer>
            <LinearFlowView
              mode={viewMode}
              onFocusKnot={focusKnotFromLinear}
            />
            <KnotEmptySlots />
            <KnotChainCard />
            {/* 三态切换：同一平面浮沉（选中浮现/另一个下沉）+ 共存 */}
            <div className="knot-view-switch">
              <button
                className={`knot-view-switch__btn ${viewMode === 'linear' ? 'is-active' : ''}`}
                onClick={() => setViewMode('linear')}
                title="线性流浮现（时间轴），语义空间下沉"
              >
                线性流
              </button>
              <button
                className={`knot-view-switch__btn ${viewMode === 'both' ? 'is-active' : ''}`}
                onClick={() => setViewMode('both')}
                title="两种形态共存（线性流+语义空间同时可见）"
              >
                共存
              </button>
              <button
                className={`knot-view-switch__btn ${viewMode === 'space' ? 'is-active' : ''}`}
                onClick={() => setViewMode('space')}
                title="语义空间浮现（结+绳网络），线性流下沉"
              >
                语义空间
              </button>
            </div>
          </div>
      </FreeLayoutEditorProvider>
    </div>
  );
};
