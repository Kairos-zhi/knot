/**
 * Knot Data Model
 * 核心数据结构：结（knot-node）和绳（knot-edge）
 * knot = 对话节点资产化的创意者工作台
 *
 * 阶段 3 P0：结 = 有序块序列 [b1, b2, ...]
 * 每块 { id, source, timestamp, provenance, content }
 * 追加=尾部增块；续长=以该结为 V_b 触发生成，输出块接尾。
 * title/summary 保持兼容：title=首块摘要或独立标题，summary=首块全文（折叠态用）。
 */

/** 结内块（Knot Block） */
export interface KnotBlock {
  /** 块 id（结内稳定唯一，写回后不变） */
  id: string;
  /** 来源：手写 / 生成 */
  source: 'manual' | 'generated';
  /** 时间戳（ISO 字符串） */
  timestamp: string;
  /** 来源 V_b id 列表（生成块记录由哪些结生成；手写块为空） */
  provenance: string[];
  /** 块内容 */
  content: string;
}

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
    /** 结的摘要/内容（= 首块全文，兼容字段） */
    summary: string;
    /** token 成本或权重 */
    token: number;
    /** 来源窗口/时刻标识 */
    src: string;
    /** 所属链 ID（用于分组相关的结） */
    chain_id: string;
    /** 有序块序列（生长态地基；可选以保持旧数据兼容） */
    blocks?: KnotBlock[];
  };
  meta: {
    /** 画布上的位置 */
    position: {
      x: number;
      y: number;
    };
  };
}

/** 从 data 中取块序列（缺省时由 title/summary 合成 manual 双块，保证渲染恒有块可用） */
export const getBlocks = (data: KnotNode['data']): KnotBlock[] => {
  if (Array.isArray(data.blocks) && data.blocks.length > 0) return data.blocks;
  const ts = '1970-01-01T00:00:00.000Z';
  const blocks: KnotBlock[] = [];
  if (data.title) {
    blocks.push({ id: 'b_title', source: 'manual', timestamp: ts, provenance: [], content: data.title });
  }
  if (data.summary && data.summary !== data.title) {
    blocks.push({ id: 'b_summary', source: 'manual', timestamp: ts, provenance: [], content: data.summary });
  }
  return blocks;
};

/** 生成块 id（结内自增尾号，追加稳定） */
export const nextBlockId = (blocks: KnotBlock[]): string => {
  let max = 0;
  for (const b of blocks) {
    const m = /^b(\d+)$/.exec(b.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `b${max + 1}`;
};

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
