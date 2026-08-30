import './container';
import { Container } from 'inversify';
import { PlaygroundContainerModule } from '@flowgram.ai/core';
import { FlowDocumentContainerModule, FlowNodeFormData } from '@flowgram.ai/document';
import { CommandContainerModule } from '@flowgram.ai/command';
import { WorkflowDocumentContainerModule, WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { createForm } from '@flowgram.ai/form';
import { FormModelV2 } from '@flowgram.ai/node';

const c = new Container({ defaultScope: 'Singleton' });
c.load(PlaygroundContainerModule);
c.load(FlowDocumentContainerModule);
c.load(WorkflowDocumentContainerModule);
c.load(CommandContainerModule);

const doc = c.get(WorkflowDocument) as any;
doc.registerNodeType?.({ type: 'knot', meta: { size: { width: 280, height: 60 } } });
const node = doc.createWorkflowNodeByType('knot', { x: 0, y: 0 }, {
  id: 'k1', data: { title: 't', blocks: [] }, meta: {},
});
console.log('node data:', JSON.stringify(node.toJSON()));

// 尝试给 node 挂 formData
const formData = node.getData?.(FlowNodeFormData);
console.log('formData:', !!formData, formData && Object.getOwnPropertyNames(Object.getPrototypeOf(formData)).slice(0,20));
