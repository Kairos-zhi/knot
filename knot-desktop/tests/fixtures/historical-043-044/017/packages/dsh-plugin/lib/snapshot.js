import {createDefaultWorkspace,validateWorkspace} from './workspace-state.js';
const failure=(code,message)=>({ok:false,error:{code,message}});
const KNOT_INPUT_PORT={portID:'in'},KNOT_OUTPUT_PORT={portID:'out'};
const WorkflowLineEntity={portInfoToLineId:({from,to,fromPort,toPort})=>`${from}_${fromPort||''}-${to||''}_${toPort||''}`};
export function assetsToWorkflowJSON(
  assets             ,
  edges    
                         
                         
                          
                          
                                   
     
)                   {
  const perRow = 3;
  let edgesOut                           ;
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
    const chains = new Map                  ();
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
  const grouped              = [];
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


const isRecord = (value         )                               =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value         )                  => typeof value === 'number' && Number.isFinite(value);
const id = (value         )                  => typeof value === 'string' && value.trim().length > 0;

/** Detach plain input before validation. Accessors, sparse arrays and toJSON hooks are
 * not snapshot data, and must not change values between validation and import. */
function readData(value         , seen = new Set        ())      {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new Error('Snapshot must contain finite, acyclic plain data');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new Error('Non-plain snapshot object');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol snapshot fields are unsupported');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(descriptors).some(key => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) throw new Error('Invalid array fields');
      return Array.from({ length: value.length }, (_, index) => {
        const item = descriptors[index];
        if (!item || !('value' in item)) throw new Error('Sparse or accessor array');
        return readData(item.value, seen);
      });
    }
    const result = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!('value' in descriptor)) throw new Error('Accessor snapshot fields are unsupported');
      result[key] = readData(descriptor.value, seen);
    }
    return result;
  } finally { seen.delete(value); }
}

export function serializeCanvas(document                  , workspace                 )                 {
  const assets                      = [];
  document.getAllNodes().forEach(node => {
    const json = node.toJSON()                                                                                                ;
    if (json.type !== 'knot') return;
    assets.push({ id: node.id, title: json.data?.title ?? '', summary: json.data?.summary ?? '',
      src: json.data?.src ?? '', chain_id: json.data?.chain_id ?? '',
      position: json.meta?.position, blocks: json.data?.blocks });
  });
  const json = document.toJSON()                                       ;
  return JSON.parse(JSON.stringify({ assets, edges: json.edges ?? [],
    ...(workspace ? { schemaVersion: 4, workspace } : {}) }));
}

/** The engine's root and line entities share the asset identity namespace. */
export function normalizeCanvasSnapshot(input         )                           {
  try {
    const value = readData(input);
    if (!isRecord(value) || !Array.isArray(value.assets)) return failure('INVALID_SNAPSHOT', 'Snapshot needs an assets array');
    if (value.schemaVersion !== undefined && value.schemaVersion !== 3 && value.schemaVersion !== 4) {
      return failure('UNSUPPORTED_VERSION', 'Unsupported snapshot schemaVersion');
    }
    if (value.schemaVersion !== 4 && value.workspace !== undefined) return failure('INVALID_SNAPSHOT', 'workspace needs schemaVersion 4');
    const assets = new Set        ();
    for (const asset of value.assets) {
      if (!isRecord(asset) || !id(asset.id) || !['title', 'summary', 'src', 'chain_id'].every(key => typeof asset[key] === 'string')) {
        return failure('INVALID_SNAPSHOT', 'Invalid asset fields');
      }
      if (asset.id === 'root') return failure('RESERVED_ID', 'root belongs to the engine, not an asset');
      if (assets.has(asset.id)) return failure('DUPLICATE_ID', 'Duplicate asset identity');
      assets.add(asset.id);
      if (asset.position !== undefined && (!isRecord(asset.position) || !finite(asset.position.x) || !finite(asset.position.y))) {
        return failure('INVALID_SNAPSHOT', 'Invalid asset position');
      }
      if (asset.blocks !== undefined) {
        if (!Array.isArray(asset.blocks)) return failure('INVALID_SNAPSHOT', 'blocks must be an array');
        const blockIds = new Set        ();
        for (const block of asset.blocks) {
          if (!isRecord(block) || !id(block.id) || blockIds.has(block.id)
            || !['manual', 'generated'].includes(block.source) || typeof block.timestamp !== 'string'
            || typeof block.content !== 'string' || !Array.isArray(block.provenance) || !block.provenance.every(id)) {
            return failure('INVALID_SNAPSHOT', 'Invalid or duplicate block');
          }
          blockIds.add(block.id);
        }
      }
    }
    const edges = value.edges === undefined && value.schemaVersion !== 4 ? assetsToWorkflowJSON(value.assets).edges : value.edges;
    if (!Array.isArray(edges)) return failure('INVALID_SNAPSHOT', 'edges must be an array');
    const identities = new Set        ();
    const engineIds = new Set        ();
    for (const edge of edges) {
      if (!isRecord(edge) || !id(edge.sourceNodeID) || !id(edge.targetNodeID)
        || (edge.sourcePortID !== undefined && edge.sourcePortID !== KNOT_OUTPUT_PORT.portID)
        || (edge.targetPortID !== undefined && edge.targetPortID !== KNOT_INPUT_PORT.portID)
        || (edge.data !== undefined && (!isRecord(edge.data)
          || (edge.data.fixed !== undefined && typeof edge.data.fixed !== 'boolean')))) {
        return failure('INVALID_SNAPSHOT', 'Invalid edge fields or unsupported ports');
      }
      if (!assets.has(edge.sourceNodeID) || !assets.has(edge.targetNodeID)) return failure('MISSING_REFERENCE', 'Edge references a missing asset');
      const key = JSON.stringify([edge.sourceNodeID, edge.sourcePortID ?? 'out', edge.targetNodeID, edge.targetPortID ?? 'in']);
      const engineId = WorkflowLineEntity.portInfoToLineId({ from: edge.sourceNodeID, to: edge.targetNodeID,
        fromPort: edge.sourcePortID, toPort: edge.targetPortID });
      if (identities.has(key) || engineIds.has(engineId) || assets.has(engineId) || engineId === 'root') {
        return failure('DUPLICATE_ID', 'Colliding node or edge identity');
      }
      identities.add(key); engineIds.add(engineId);
    }
    const workspace = validateWorkspace(value.schemaVersion === 4 ? value.workspace : createDefaultWorkspace(), assets);
    if (!workspace.ok) return workspace;
    return { ok: true, value: JSON.parse(JSON.stringify({ schemaVersion: 4, assets: value.assets, edges, workspace: workspace.value })) };
  } catch (error) { return failure('INVALID_SNAPSHOT', error instanceof Error ? error.message : String(error)); }
}

