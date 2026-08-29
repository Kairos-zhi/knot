/**
 * knot 画布初始数据
 * 由 initial-knot-data（KnotFlowDocument）转换而来
 * 3 个结 + 2 条绳
 */
import { initialKnotData } from './initial-knot-data';
import { toWorkflowJSON } from './components/knot-edge/convert';

export const knotInitialData = toWorkflowJSON(initialKnotData);
