/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

/**
 * 生成服务
 * 接收已勾选结的上下文（可见集 V_b），返回生成的新结内容
 * v1: mock 实现（返回占位文本，延迟 ~800ms）
 * TODO: 后续接 LLM（Cola DLM 或其他生成模型）
 */

export interface CheckedKnot {
  id: string;
  title: string;
  summary: string;
}

export interface GeneratePayload {
  checked: CheckedKnot[];
}

export interface GenerateResult {
  title: string;
  summary: string;
}

/** 续长结果：返回新块（source='generated'，provenance=来源 V_b id 列表） */
export interface GrowResult {
  /** 新块内容（调用方负责接尾到目标结 blocks） */
  content: string;
  source: 'generated';
  timestamp: string;
  /** 来源 V_b id 列表（续长=目标结自身） */
  provenance: string[];
}

/**
 * generate
 * @param payload 已勾选结列表（可见集 V_b）
 * @returns Promise<{ title, summary }> 生成的新结内容
 *
 * v1 mock: 根据勾选结数量返回占位文本，延迟 800ms
 * 示例：勾选 ["knot_1", "knot_2"] 返回
 *   title: "生成结 (基于 2 个勾选结)"
 *   summary: "这是一个生成的结，汇总了勾选结的内容..."
 *
 * TODO: 接入 LLM 时，将 payload.checked 的 title 和 summary 作为上下文，
 *       调用 Cola DLM 或其他生成模型获得实际生成内容
 */
export const generate = async (payload: GeneratePayload): Promise<GenerateResult> => {
  // 模拟网络延迟 ~800ms
  await new Promise((resolve) => setTimeout(resolve, 800));

  const checkedCount = payload.checked.length;
  const checkedTitles = payload.checked.map((k) => k.title).join('、');

  // Mock 返回占位文本
  return {
    title: `生成结 (基于 ${checkedCount} 个勾选结)`,
    summary: `这是一个生成的新结，汇总了以下已勾选结的内容：${checkedTitles}。\n\n[TODO] 后续将接入 LLM（Cola DLM）进行实际内容生成，利用可见集 V_b 作为上下文进行条件生成。当前为 mock 占位符。`,
  };
};

/**
 * grow（续长）
 * 以目标结为 V_b 触发新一轮生成，输出新块接尾（红队 3.3 生长态）。
 * v1 mock：返回基于该结现有内容的占位续写块。
 *
 * @param knotId 目标结 id（V_b）
 * @param blocks 目标结当前块序列（作为上下文）
 * @param onChunk 可选：生成中逐块流入回调（打字机即打结，内容片段追加可见）
 */
export const grow = async (
  knotId: string,
  blocks: { content: string }[],
  onChunk?: (text: string) => void
): Promise<GrowResult> => {
  const full = `续长：基于「${blocks
    .map((b) => b.content)
    .join(' / ')
    .substring(0, 60)}…」的进一步展开。[TODO] 接入 LLM 后此处为真实续写，provenance 记录来源 V_b。`;

  if (onChunk) {
    // 打字机：逐段流入（每段 ~120ms，同构外化：解码即打结）
    const step = 12;
    for (let i = step; i < full.length; i += step) {
      await new Promise((r) => setTimeout(r, 120));
      onChunk(full.substring(0, i));
    }
    await new Promise((r) => setTimeout(r, 120));
    onChunk(full);
  } else {
    await new Promise((r) => setTimeout(r, 800));
  }

  return {
    content: full,
    source: 'generated',
    timestamp: new Date().toISOString(),
    provenance: [knotId],
  };
};
