import './container';
import { Container } from 'inversify';
import { PlaygroundContainerModule } from '@flowgram.ai/core';
import { FlowDocumentContainerModule } from '@flowgram.ai/document';
import { CommandContainerModule } from '@flowgram.ai/command';
import { WorkflowDocumentContainerModule, WorkflowDocument } from '@flowgram.ai/free-layout-core';

const c = new Container({ defaultScope: 'Singleton' });
c.load(PlaygroundContainerModule);
c.load(FlowDocumentContainerModule);
c.load(WorkflowDocumentContainerModule);
c.load(CommandContainerModule);

const doc = c.get(WorkflowDocument) as any;
// 最小 knot registry（不含渲染组件）
doc.registerNodeType?.({
  type: 'knot',
  meta: { size: { width: 280, height: 60 }, defaultPorts: ['in', 'out'] },
});
const node = doc.createWorkflowNodeByType('knot', { x: 0, y: 0 }, {
  id: 'k1',
  data: { title: 't', summary: 's', token: 1, src: '', chain_id: 'c' },
  meta: { defaultPorts: ['in', 'out'] },
});
console.log('node:', !!node, node?.id, node?.flowNodeType);
console.log('json:', JSON.stringify(doc.toJSON()).slice(0, 300));
console.log('nodeJSON:', JSON.stringify(node?.toJSON?.()).slice(0, 300));
