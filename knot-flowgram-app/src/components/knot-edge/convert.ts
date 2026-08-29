/**
 * KnotFlowDocument → FlowDocumentJSON 转换
 * 节点注入端口定义（defaultPorts），KnotEdge → WorkflowEdgeJSON
 * WorkflowEdgeJSON { sourceNodeID, targetNodeID, sourcePortID?, targetPortID?, data? }
 * 与 KnotEdge { sourceNodeID, targetNodeID, sourcePortID, targetPortID } 完全对应
 */
import { KnotFlowDocument } from '../../knot-model';
import { FlowDocumentJSON } from '../../typings';
import { KNOT_INPUT_PORT, KNOT_OUTPUT_PORT } from './ports';

export function toWorkflowJSON(doc: KnotFlowDocument): FlowDocumentJSON {
  return {
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      type: 'knot',
      data: {
        title: n.data.title,
        summary: n.data.summary,
        token: n.data.token,
        src: n.data.src,
        chain_id: n.data.chain_id,
        blocks: n.data.blocks,
      },
      meta: {
        position: n.meta.position,
        defaultPorts: [KNOT_INPUT_PORT, KNOT_OUTPUT_PORT],
      },
    })),
    edges: doc.edges.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
    })),
  };
}
