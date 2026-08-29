/**
 * Knot Data Model
 * 核心数据结构：结（knot-node）和绳（knot-edge）
 * knot = 对话节点资产化的创意者工作台
 */

/**
 * 结（Knot Node）
 * 表示对话思考的原子单位，可资产化、可编排
 */
export interface KnotNode {
  id: string;
  type: 'knot';
  data: {
    /** 结的标题 */
    title: string;
    /** 结的摘要/内容 */
    summary: string;
    /** token 成本或权重 */
    token: number;
    /** 来源窗口/时刻标识 */
    src: string;
    /** 所属链 ID（用于分组相关的结） */
    chain_id: string;
  };
  meta: {
    /** 画布上的位置 */
    position: {
      x: number;
      y: number;
    };
  };
}

/**
 * 绳（Knot Edge）
 * 表示结之间的连接，代表可运行的思考路径
 */
export interface KnotEdge {
  /** 起点节点 ID */
  sourceNodeID: string;
  /** 终点节点 ID */
  targetNodeID: string;
  /** 起点端口 ID */
  sourcePortID: string;
  /** 终点端口 ID */
  targetPortID: string;
}

/**
 * Knot 文档（FlowGram 画布的数据容器）
 */
export interface KnotFlowDocument {
  nodes: KnotNode[];
  edges: KnotEdge[];
}

/**
 * Knot 示例工厂函数
 */
export const createKnotNode = (
  id: string,
  title: string,
  summary: string,
  token: number,
  src: string,
  chain_id: string,
  x: number,
  y: number
): KnotNode => ({
  id,
  type: 'knot',
  data: { title, summary, token, src, chain_id },
  meta: { position: { x, y } },
});

export const createKnotEdge = (
  sourceNodeID: string,
  targetNodeID: string,
  sourcePortID: string = 'out',
  targetPortID: string = 'in'
): KnotEdge => ({
  sourceNodeID,
  targetNodeID,
  sourcePortID,
  targetPortID,
});
