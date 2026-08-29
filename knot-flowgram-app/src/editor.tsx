/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { DockedPanelLayer } from '@flowgram.ai/panel-manager-plugin';
import { EditorRenderer, FreeLayoutEditorProvider, useService, WorkflowDocument } from '@flowgram.ai/free-layout-editor';

import '@flowgram.ai/free-layout-editor/index.css';
import './styles/index.css';
import { nodeRegistries } from './nodes';
import { useEditorProps } from './hooks';
import { FocusProvider } from './context/focus-context';
import { KnotGeneratePanel } from './components/knot-generate';
import { KnotEmptySlots } from './components/knot-edge';
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

export const Editor = () => {
  const editorProps = useEditorProps(knotInitialData, nodeRegistries);
  return (
    <div className="doc-free-feature-overview">
      <FreeLayoutEditorProvider {...editorProps}>
        <PersistenceBridge />
        <FocusProvider>
          <div className="demo-container">
            <DockedPanelLayer>
              <EditorRenderer className="demo-editor" />
            </DockedPanelLayer>
            <KnotEmptySlots />
            <KnotGeneratePanel />
          </div>
        </FocusProvider>
      </FreeLayoutEditorProvider>
    </div>
  );
};
