import { createHeadlessContainer } from './headless';
import { WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { FlowNodeFormData } from '@flowgram.ai/form-core';

const c = createHeadlessContainer();
const doc = c.get(WorkflowDocument) as any;
// 手动走一遍 fromNodeJSON 看是否炸（错误被吞在 createForm 的 try/catch）
const node = doc.createWorkflowNodeByType('knot', { x: 0, y: 0 }, {
  id: 'k1', data: { title: 't', summary: 's', blocks: [] }, meta: {},
});
const fd = node.getData(FlowNodeFormData);
try {
  fd.formModel.init({ render: () => null, plugins: [] }, { title: 't', summary: 's', blocks: [] });
  console.log('manual init ok, values:', JSON.stringify(fd.formModel.values));
} catch (e) {
  console.log('manual init threw:', (e as Error).message);
  console.log((e as Error).stack?.split('\n').slice(0, 8).join('\n'));
}
