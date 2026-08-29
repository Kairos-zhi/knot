/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { DockedPanelLayer } from '@flowgram.ai/panel-manager-plugin';
import { EditorRenderer, FreeLayoutEditorProvider } from '@flowgram.ai/free-layout-editor';

import '@flowgram.ai/free-layout-editor/index.css';
import './styles/index.css';
import { nodeRegistries } from './nodes';
import { useEditorProps } from './hooks';
import { FocusProvider } from './context/focus-context';
import { KnotGeneratePanel } from './components/knot-generate';
import { KnotEmptySlots } from './components/knot-edge';
import { assetsToWorkflowJSON, AssetItem } from './services/asset-sync';
import knotAssetsJson from './assets/knot-assets.json';

// 资产 → 结（启动全量同步：画布是资产的投影）
const knotAssets: AssetItem[] = (knotAssetsJson as { assets: AssetItem[] }).assets;
const knotInitialData = assetsToWorkflowJSON(knotAssets);

export const Editor = () => {
  const editorProps = useEditorProps(knotInitialData, nodeRegistries);
  return (
    <div className="doc-free-feature-overview">
      <FreeLayoutEditorProvider {...editorProps}>
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
