/**
 * 三原色卡片 · 数据模型留口（P0 只留结构，写回语义已定案=全量覆盖，P1 接）
 * 依据：方案 §一/§四/§七——每张纸=版本快照独立 id；绳连「结」（结级 id）；层级引用 P1
 */

/** 纸层：绿=原始片 / 蓝=发展片 / 红=当前片 */
export type KnotPaperLayer = 'green' | 'blue' | 'red';

/** 层序常量（z 序默认：绿底 → 蓝中 → 红顶） */
export const KNOT_PAPER_LAYERS: readonly KnotPaperLayer[] = ['green', 'blue', 'red'];

/** 一张纸 = 一个版本快照（独立 id，可被绳引用；写回 P1） */
export interface KnotPaper {
  /** 版本快照独立 id */
  id: string;
  /** 所属层 */
  layer: KnotPaperLayer;
  /** 纸标题 */
  title: string;
  /** 纸摘要（非激活层标签条可展示） */
  summary: string;
  /** 有序块序列（复用结模型块结构；可选，懒渲染时空） */
  blocks?: { id: string; content: string }[];
  /** 快照时间戳 */
  timestamp?: string;
}

/** 一叠纸 = 一个结的三原色版本集合（结级引用，绳连结不连层） */
export interface KnotPaperStack {
  /** 结级 id（绳的引用端点） */
  knotId: string;
  /** 三张纸（按层索引） */
  papers: Record<KnotPaperLayer, KnotPaper>;
  /** 当前激活层（默认 red=当前片） */
  activeLayer: KnotPaperLayer;
}

/** 由结数据合成默认纸叠（P0 演示用：同一份内容灌三层，P1 接真实版本快照） */
export const makeDefaultPapers = (
  knotId: string,
  seed: { title: string; summary: string; blocks?: { id: string; content: string }[] }
): KnotPaperStack => {
  const mk = (layer: KnotPaperLayer, suffix: string): KnotPaper => ({
    id: `${knotId}__paper-${layer}`,
    layer,
    title: seed.title ? `${seed.title}${suffix}` : suffix,
    summary: seed.summary,
    blocks: seed.blocks,
    timestamp: '1970-01-01T00:00:00.000Z',
  });
  return {
    knotId,
    papers: {
      green: mk('green', ' · 原始'),
      blue: mk('blue', ' · 发展'),
      red: mk('red', ''),
    },
    activeLayer: 'red',
  };
};
