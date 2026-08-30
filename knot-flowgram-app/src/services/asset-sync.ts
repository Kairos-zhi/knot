/**
 * 资产同步（asset-sync）—— 结是资产的投影，同步=投影刷新
 *
 * 事实源：资产清单（src/assets/knot-assets.json，由 kairos-oracle 关键文档生成）
 * 机制：
 *  - assetsToWorkflowJSON：全量——资产 → 初始画布（启动同步）
 *  - applyAssetDiff：增量——与画布现有结 diff，新增/更新/删除
 *
 * v1 落地：启动全量同步（editor 初始数据=资产投影）；增量 diff 供后续
 * 轮询/事件驱动（窗口 push）复用。绳（edges）v1 不自动生成（语义关联
 * 需语义计算，留给勾选/生成链路）。
 */
import { FlowDocumentJSON } from '../typings';
import { KNOT_INPUT_PORT, KNOT_OUTPUT_PORT } from '../components/knot-edge/ports';
import { WorkflowDocument, WorkflowNodeEntity } from '@flowgram.ai/free-layout-editor';
import { KnotBlock } from '../knot-model';

export interface AssetItem {
  id: string;
  title: string;
  summary: string;
  src: string;
  chain_id: string;
  /** 画布位置（写回后保留拖拽布局；缺省用网格排布） */
  position?: { x: number; y: number };
  /** 有序块序列（生长态；id 稳定） */
  blocks?: KnotBlock[];
}

const assetData = (a: AssetItem) => ({
  title: a.title,
  summary: a.summary,
  token: Math.max(64, Math.round(a.summary.length * 2.5)),
  src: a.src,
  chain_id: a.chain_id,
  blocks: a.blocks,
});

/** 资产 → 结的初始画布数据（全量投影）
 *  edges 传入时（localStorage 快照加载）：显式绳优先，fixed 等 data 原样恢复（修三轮 N1）；
 *  edges 缺省时（资产清单投影）：按 chain_id 自动建绳（同链结链式相连）。
 */
export function assetsToWorkflowJSON(
  assets: AssetItem[],
  edges?: {
    sourceNodeID: string;
    targetNodeID: string;
    sourcePortID?: string;
    targetPortID?: string;
    data?: Record<string, unknown>;
  }[]
): FlowDocumentJSON {
  const perRow = 3;
  let edgesOut: FlowDocumentJSON['edges'];
  if (edges) {
    // 显式绳：快照原样恢复（绳+fixed 无损闭环）
    edgesOut = edges.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
      ...(e.data ? { data: e.data } : {}),
    }));
  } else {
    // 绳：同 chain_id 的结按序链式相连（v1 语义建绳最小版——「结+绳」网络形态立起来）
    edgesOut = [];
    const chains = new Map<string, string[]>();
    assets.forEach((a) => {
      const list = chains.get(a.chain_id) ?? [];
      list.push(a.id);
      chains.set(a.chain_id, list);
    });
    chains.forEach((ids) => {
      for (let i = 0; i < ids.length - 1; i++) {
        edgesOut.push({
          sourceNodeID: ids[i],
          targetNodeID: ids[i + 1],
          sourcePortID: 'out',
          targetPortID: 'in',
        });
      }
    });
  }
  // 按源分组排布：同 chain 的结空间相邻（源头感：同源长在一起，不是按列表顺序散开）
  const chainOrder = [...new Set(assets.map((a) => a.chain_id))];
  const grouped: AssetItem[] = [];
  chainOrder.forEach((cid) => {
    assets.filter((a) => a.chain_id === cid).forEach((a) => grouped.push(a));
  });
  return {
    nodes: grouped.map((a, i) => ({
      id: a.id,
      type: 'knot',
      data: {
        title: a.title,
        summary: a.summary,
        token: Math.max(64, Math.round(a.summary.length * 2.5)),
        src: a.src,
        chain_id: a.chain_id,
        blocks: a.blocks,
      },
      meta: {
        // 有写回位置用写回位置，否则简单网格排布（后续语义场布局接管重排）
        position: a.position ?? {
          x: 120 + (i % perRow) * 420,
          y: 120 + Math.floor(i / perRow) * 220,
        },
        defaultPorts: [KNOT_INPUT_PORT, KNOT_OUTPUT_PORT],
      },
    })),
    edges: edgesOut,
  };
}

interface DiffResult {
  added: string[];
  updated: string[];
  removed: string[];
}

/** 增量同步：与画布现有结对比，应用增/改/删 */
export function applyAssetDiff(
  document: WorkflowDocument,
  assets: AssetItem[]
): DiffResult {
  const result: DiffResult = { added: [], updated: [], removed: [] };

  const existing = new Map<string, WorkflowNodeEntity>();
  // 遍历现有画布节点
  document.getAllNodes().forEach((n) => {
    const json = n.toJSON() as { type?: string; id: string };
    if (json.type === 'knot') {
      existing.set(n.id, n);
    }
  });

  const assetIds = new Set(assets.map((a) => a.id));

  // 新增 / 更新（v1：更新=删旧建新，id 沿用资产 id）
  assets.forEach((a) => {
    const node = existing.get(a.id);
    if (!node) {
      // 新增结
      document.createWorkflowNodeByType('knot', {
        x: 120,
        y: 120 + existing.size * 220,
      }, {
        id: a.id,
        data: assetData(a),
        meta: { defaultPorts: [KNOT_INPUT_PORT, KNOT_OUTPUT_PORT] },
      });
      result.added.push(a.id);
    } else {
      const json = node.toJSON() as {
        data?: {
          title?: string;
          summary?: string;
          src?: string;
          chain_id?: string;
          blocks?: KnotBlock[];
        };
      };
      // dirty 判定：title/summary/src 之外，blocks 深比较（长度+逐字段）+ chain_id
      // （修二轮 P0-2：blocks 更新同步画布，chain_id 变化触发重建=重排）
      const oldBlocks = json.data?.blocks;
      const newBlocks = a.blocks;
      const blocksDirty =
        (oldBlocks === undefined) !== (newBlocks === undefined) ||
        (oldBlocks !== undefined &&
          newBlocks !== undefined &&
          (oldBlocks.length !== newBlocks.length ||
            oldBlocks.some((ob, i) => {
              const nb = newBlocks[i];
              return (
                !nb ||
                ob.id !== nb.id ||
                ob.source !== nb.source ||
                ob.timestamp !== nb.timestamp ||
                ob.content !== nb.content ||
                ob.provenance.length !== nb.provenance.length ||
                ob.provenance.some((p, j) => p !== nb.provenance[j])
              );
            })));
      const dirty =
        json.data?.title !== a.title ||
        json.data?.summary !== a.summary ||
        json.data?.src !== a.src ||
        json.data?.chain_id !== a.chain_id ||
        blocksDirty;
      if (dirty) {
        document.removeNode(node);
        document.createWorkflowNodeByType('knot', {
          x: 120,
          y: 120 + existing.size * 220,
        }, {
          id: a.id,
          data: assetData(a),
          meta: { defaultPorts: [KNOT_INPUT_PORT, KNOT_OUTPUT_PORT] },
        });
        result.updated.push(a.id);
      }
    }
  });

  // 删除（资产清单里不再存在的结）
  existing.forEach((node, id) => {
    if (!assetIds.has(id)) {
      document.removeNode(node);
      result.removed.push(id);
    }
  });

  return result;
}
