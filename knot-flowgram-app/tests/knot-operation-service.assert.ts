/**
 * KnotOperationService 无头断言（四组：全链路 / P0-3 / round-trip / N1）
 * 跑法：npx tsx tests/knot-operation-service.assert.ts
 */
import { createHeadlessContainer } from './headless';
import { WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { FlowNodeFormData } from '@flowgram.ai/form-core';
import { FormModelV2 } from '@flowgram.ai/node';
import { KnotOperationService } from '../src/services/knot-operation-service';
import { serializeCanvas } from '../src/services/asset-persistence';
import { toWorkflowJSON } from '../src/components/knot-edge/convert';

let passCount = 0;
let failCount = 0;

function assert(cond: boolean, label: string, detail?: string): boolean {
  if (cond) {
    console.log(`  PASS ${label}`);
    return true;
  }
  console.log(`  FAIL ${label}${detail ? ` —— ${detail}` : ''}`);
  return false;
}

function group(name: string, ok: boolean) {
  if (ok) {
    passCount += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failCount += 1;
    console.log(`[FAIL] ${name}`);
  }
}

function freshService(): { c: any; svc: KnotOperationService; doc: any } {
  const c = createHeadlessContainer();
  c.bind(KnotOperationService).toSelf();
  const svc = c.get(KnotOperationService) as KnotOperationService;
  const doc = c.get(WorkflowDocument) as any;
  return { c, svc, doc };
}

const dataOf = (doc: any, id: string) =>
  (doc.getNode(id)?.toJSON() as any)?.data;

async function group1(): Promise<boolean> {
  const { svc, doc } = freshService();
  // createKnot ×3
  const a = svc.createKnot({ title: 'A', summary: 'sa' }, { x: 0, y: 0 });
  const b = svc.createKnot({ title: 'B', summary: 'sb' }, { x: 300, y: 0 });
  const d = svc.createKnot({ title: 'C', summary: 'sc' }, { x: 600, y: 0 });
  if (!a.ok || !b.ok || !d.ok) return assert(false, 'createKnot×3', JSON.stringify({ a, b, d }));
  const ids = [a.value, b.value, d.value];
  let okAll = assert(doc.getAllNodes().length === 3, '建结后结点数=3');

  // threadChain 三结成链
  const chain = svc.threadChain(ids);
  okAll = assert(chain.ok && chain.value.length === 2, 'threadChain 建成 2 段绳') && okAll;
  okAll =
    assert(
      (doc.toJSON() as any).edges?.length === 2,
      '链结构边数=2',
      `实际 ${(doc.toJSON() as any).edges?.length}`
    ) && okAll;
  const gotChain = svc.getChain(ids[0]);
  okAll =
    assert(
      gotChain.ok && gotChain.value.join('>') === ids.join('>'),
      'getChain 链序 A>B>C',
      gotChain.ok ? gotChain.value.join('>') : JSON.stringify(gotChain)
    ) && okAll;

  // growKnot 续长一块（getBlocks 缺省时由 title/summary 合成 manual 双块，before 按同一规则算）
  const { getBlocks } = require('../src/knot-model');
  const blocksBefore = getBlocks(dataOf(doc, ids[0]) ?? { title: '', summary: '' }).length;
  const grow = await svc.growKnot(ids[0]);
  okAll = assert(grow.ok, 'growKnot 返回 ok', JSON.stringify(grow)) && okAll;
  const blocksAfter = dataOf(doc, ids[0])?.blocks;
  okAll =
    assert(
      Array.isArray(blocksAfter) && blocksAfter.length === blocksBefore + 1,
      '续长后块数 +1',
      `before=${blocksBefore} after=${blocksAfter?.length}`
    ) && okAll;

  // disconnectAll 真断
  const dis = svc.disconnectAll(ids[1]);
  okAll = assert(dis.ok && dis.value === 2, 'disconnectAll(B) 删除 2 条绳', `value=${dis.ok ? dis.value : JSON.stringify(dis)}`) && okAll;
  okAll = assert((doc.toJSON() as any).edges?.length === 0, '断链后边数=0') && okAll;
  okAll = assert(doc.getAllNodes().length === 3, '断链后结点数仍=3') && okAll;
  return okAll;
}

function group2(): boolean {
  const { svc, doc } = freshService();
  const r = svc.createKnot({ title: 'P', summary: 'sp' }, { x: 0, y: 0 });
  if (!r.ok) return assert(false, 'createKnot', JSON.stringify(r));
  const node = doc.getNode(r.value);
  const formModel = node.getData(FlowNodeFormData).getFormModel<FormModelV2>();
  const x = [
    { id: 'b1', source: 'generated' as const, timestamp: '2026-08-30T00:00:00.000Z', provenance: [r.value], content: '块X' },
  ];
  formModel.setValueIn('blocks', x);
  const json = node.toJSON() as any;
  return assert(
    Array.isArray(json.data?.blocks) && json.data.blocks.length === 1 && json.data.blocks[0].content === '块X',
    "setValueIn('blocks',x) 后 toJSON().data.blocks===x",
    `实际 ${JSON.stringify(json.data?.blocks)}`
  );
}

function group3(): boolean {
  const { svc, doc } = freshService();
  svc.createKnot({ title: 'R1', summary: 'r1', chain_id: 'c1' }, { x: 0, y: 0 }, { source: 't' });
  svc.createKnot({ title: 'R2', summary: 'r2', chain_id: 'c1' }, { x: 300, y: 0 }, { source: 't' });
  const ids = doc.getAllNodes().map((n: any) => n.id);
  svc.connect(ids[0], ids[1], { fixed: true });
  const snap = serializeCanvas(doc);
  const wfjson = toWorkflowJSON({ nodes: snap.assets.map((a: any) => ({
    id: a.id, type: 'knot',
    data: { title: a.title, summary: a.summary, token: a.token ?? 0, src: a.src ?? '', chain_id: a.chain_id ?? '', blocks: a.blocks },
    meta: { position: a.position ?? { x: 0, y: 0 } },
  })), edges: snap.edges.map((e: any) => ({
    sourceNodeID: e.sourceNodeID, targetNodeID: e.targetNodeID,
    sourcePortID: e.sourcePortID ?? 'out', targetPortID: e.targetPortID ?? 'in',
    ...(e.data ? { data: e.data } : {}),
  })) } as any);
  let okAll = assert(wfjson.nodes.length === 2, 'round-trip 结数无损=2', `实际 ${wfjson.nodes.length}`);
  okAll = assert(wfjson.edges.length === 1, 'round-trip 绳数无损=1', `实际 ${wfjson.edges.length}`) && okAll;
  okAll = assert((wfjson.edges[0] as any).data?.fixed === true, 'round-trip fixed 标记在') && okAll;
  const titles = wfjson.nodes.map((n: any) => n.data.title).sort().join(',');
  okAll = assert(titles === 'R1,R2', 'round-trip 结内容在', titles) && okAll;
  return okAll;
}

function group4(): boolean {
  // N1：串一条非 chain_id 绳 + fixed 绳 → serializeCanvas → 产物重建 → 绳和 fixed 都在
  const { svc, doc } = freshService();
  svc.createKnot({ title: 'N1a', summary: 'x', chain_id: 'chainA' }, { x: 0, y: 0 });
  svc.createKnot({ title: 'N1b', summary: 'y', chain_id: 'chainB' }, { x: 300, y: 0 });
  svc.createKnot({ title: 'N1c', summary: 'z', chain_id: 'chainC' }, { x: 600, y: 0 });
  const ids = doc.getAllNodes().map((n: any) => n.id);
  svc.connect(ids[0], ids[1]); // 非 chain_id 普通绳
  svc.connect(ids[1], ids[2], { fixed: true }); // fixed 绳
  const snap = serializeCanvas(doc);
  let okAll = assert(snap.edges.length === 2, 'N1 serializeCanvas 边数=2', `实际 ${snap.edges.length}`);
  const fixedEdge = snap.edges.find((e: any) => e.data?.fixed === true);
  okAll = assert(!!fixedEdge, 'N1 fixed 绳在快照中') && okAll;
  okAll =
    assert(
      snap.assets.every((a: any) => a.chain_id && a.chain_id.length > 0),
      'N1 chain_id 在快照中'
    ) && okAll;

  // 产物重建：用快照 toWorkflowJSON → 新容器 fromJSON → 绳和 fixed 都在
  const wfjson = toWorkflowJSON({ nodes: snap.assets.map((a: any) => ({
    id: a.id, type: 'knot',
    data: { title: a.title, summary: a.summary, token: 0, src: a.src ?? '', chain_id: a.chain_id, blocks: a.blocks },
    meta: { position: a.position ?? { x: 0, y: 0 } },
  })), edges: snap.edges.map((e: any) => ({
    sourceNodeID: e.sourceNodeID, targetNodeID: e.targetNodeID,
    sourcePortID: e.sourcePortID ?? 'out', targetPortID: e.targetPortID ?? 'in',
    ...(e.data ? { data: e.data } : {}),
  })) } as any);

  const { doc: doc2 } = freshService();
  doc2.fromJSON(wfjson);
  const json2 = doc2.toJSON() as any;
  okAll = assert(json2.nodes?.length === 3, 'N1 重建后结数=3', `实际 ${json2.nodes?.length}`) && okAll;
  okAll = assert(json2.edges?.length === 2, 'N1 重建后绳数=2', `实际 ${json2.edges?.length}`) && okAll;
  okAll = assert(json2.edges?.some((e: any) => e.data?.fixed === true), 'N1 重建后 fixed 仍在') && okAll;
  return okAll;
}

(async () => {
  console.log('== 组1 全链路 ==');
  group('组1 全链路 createKnot→threadChain→growKnot→disconnectAll', await group1());
  console.log('== 组2 P0-3 ==');
  group('组2 P0-3 setValueIn→toJSON 直通', group2());
  console.log('== 组3 round-trip ==');
  group('组3 round-trip serializeCanvas→toWorkflowJSON 无损', group3());
  console.log('== 组4 N1 ==');
  group('组4 N1 非chain绳+fixed 序列化→重建', group4());

  console.log(`\n汇总: ${passCount} PASS / ${failCount} FAIL（共 4 组）`);
  if (failCount > 0) process.exit(1);
  process.exit(0);
})();
