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
