# 无头容器 form 数据层装载（裸 node 断言用）

> 来源：@flowgram.ai/node-core-plugin `createNodeCorePlugin.onInit` 源码的等价动作。
> 偏离官方+原因：官方测试（vitest+jsdom）经由 plugin 装载 form 层，官方无裸 node 无头路径（form.test.ts 为空壳）；
> 我们在裸 node 断言容器中手动执行 onInit 的注册动作。**自造区，已对齐基础（官方源码逐行对照）。**

```ts
import { EntityManager } from '@flowgram.ai/core';
import { FlowDocument } from '@flowgram.ai/document';
import { FlowNodeFormData, createNodeEntityDatas } from '@flowgram.ai/form-core';
import { FormModelV2 } from '@flowgram.ai/node';

// container = PlaygroundMockTools.createContainer([FlowDocumentContainerModule, WorkflowDocumentContainerModule]) 之后：
const doc = container.get(FlowDocument);
doc.registerNodeDatas(...createNodeEntityDatas());
container.get(EntityManager).registerEntityData(
  FlowNodeFormData,
  () => ({ formModelFactory: (entity: any) => new FormModelV2(entity) }),
);
```

完成标志（三项全过才继续）：
1. 建结后 `node.toJSON().data` 有值
2. `node.getData(FlowNodeFormData)` 不炸
3. `formModel.setValueIn('blocks', x)` 后 `node.toJSON().data.blocks === x`（= P0-3 断言本身）
