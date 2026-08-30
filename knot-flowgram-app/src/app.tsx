/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { createRoot } from 'react-dom/client';
import { unstableSetCreateRoot } from '@flowgram.ai/form-materials';

import { Editor } from './editor';

/**
 * React 18/19 polyfill for form-materials
 */
unstableSetCreateRoot(createRoot);

const app = createRoot(document.getElementById('root')!);

// ③ 统一状态层：勾选集已迁入 KnotSelectionService（容器单例），SelectionProvider 退役
app.render(<Editor />);
