/**
 * 无头容器工厂（form 层已按 HEADLESS_FORM_SETUP.md 官方姿势装载）
 * 用法：import { createHeadlessContainer } from './headless';
 */
import './container';
import { PlaygroundMockTools, EntityManager } from '@flowgram.ai/core';
import {
  FlowDocumentContainerModule,
  FlowDocument,
  FlowNodeTransformData,
  FlowNodeRenderData,
  FlowNodeTransitionData,
} from '@flowgram.ai/document';
import {
  WorkflowDocumentContainerModule,
  WorkflowDocument,
  WorkflowDocumentOptionsDefault,
} from '@flowgram.ai/free-layout-core';
import { createNodeContainerModules, createNodeEntityDatas, FlowNodeFormData } from '@flowgram.ai/form-core';
import { FormModelV2 } from '@flowgram.ai/node';
import { interfaces } from 'inversify';
import { ToolService } from '../src/services/tool-service';
import { ExpandService } from '../src/services/expand-service';

export function createHeadlessContainer(): interfaces.Container {
  const c: interfaces.Container = PlaygroundMockTools.createContainer([
    FlowDocumentContainerModule,
    WorkflowDocumentContainerModule,
    ...createNodeContainerModules(),
  ]);

  // 官方无头 form 层装载（tests/_official/HEADLESS_FORM_SETUP.md）
  const flowDoc = c.get(FlowDocument) as any;
  flowDoc.registerNodeDatas(...createNodeEntityDatas());
  c.get<any>(EntityManager).registerEntityData(
    FlowNodeFormData,
    () => ({ formModelFactory: (entity: any) => new FormModelV2(entity) })
  );

  const doc = c.get(WorkflowDocument) as any;
  doc.registerNodeDatas?.(FlowNodeTransformData, FlowNodeRenderData, FlowNodeTransitionData, FlowNodeFormData);
  doc.registerFlowNodes?.({
    type: 'knot',
    meta: { size: { width: 280, height: 60 } },
    formMeta: { render: () => null, plugins: [] },
  });
  // 引擎默认 WorkflowDocumentOptions 的 fromNodeJSON（= initFormDataFromJSON）
  // 只在注入到 doc 后才生效；此处直接给 doc.options 赋值，避免 rebind 时序问题。
  doc.options = {
    ...WorkflowDocumentOptionsDefault,
  };
  c.bind(ToolService).toSelf().inSingletonScope();
  c.bind(ExpandService).toSelf().inSingletonScope();
  return c;
}
