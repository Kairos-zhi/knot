import type { KnotBlock, CompiledWorksiteInput } from '../knot-model';
import type { CheckedKnot, GeneratePayload } from './generate';
import type { KnotOperationService, OpResult } from './knot-operation-service';

export type WorksiteInputCompiler = Pick<KnotOperationService, 'compileWorksiteInput'>;

export interface WorksiteRequestPayload extends GeneratePayload,
  Pick<CompiledWorksiteInput, 'worksiteId' | 'assetId' | 'conversationId' | 'draft' | 'agentId'> {
  checked: Array<CheckedKnot & { blocks: KnotBlock[] }>;
}

const failure = (code: string, error: unknown): OpResult<never> => {
  let message = '请求处理失败';
  try {
    const detail = error instanceof Error ? error.message : String(error);
    if (typeof detail === 'string') message = detail;
  } catch { /* An unprintable thrown value must still produce an OpErr. */ }
  return { ok: false, error: { code, message } };
};

const copyBlocks = (blocks: KnotBlock[]): KnotBlock[] =>
  structuredClone(blocks);

const copyPayload = (payload: WorksiteRequestPayload): WorksiteRequestPayload =>
  structuredClone(payload);

/** Prepare the current explicit worksite for the existing checked-material request shape. */
export function prepareWorksiteRequest(
  compiler: WorksiteInputCompiler, worksiteId: string
): OpResult<WorksiteRequestPayload> {
  try {
    if (!compiler || typeof compiler.compileWorksiteInput !== 'function') {
      return failure('INVALID_COMPILER', '输入编译入口无效');
    }
    const input = compiler.compileWorksiteInput(worksiteId);
    if (!input.ok) return input;
    const value = input.value;
    return { ok: true, value: {
      worksiteId: value.worksiteId, assetId: value.assetId, conversationId: value.conversationId,
      draft: value.draft, agentId: value.agentId,
      checked: value.materials.map(material => ({
        id: material.id, title: material.title, summary: material.summary, blocks: copyBlocks(material.blocks),
      })),
    } };
  } catch (error) { return failure('REQUEST_PREPARATION_FAILED', error); }
}

/** Deliver to an injected receiver only; this adapter owns no transport, state or Run. */
export async function dispatchWorksiteRequest<T>(
  compiler: WorksiteInputCompiler,
  worksiteId: string,
  receiver: (payload: WorksiteRequestPayload) => T | Promise<T>
): Promise<OpResult<{ payload: WorksiteRequestPayload; response: T }>> {
  if (typeof receiver !== 'function') return failure('INVALID_RECEIVER', '请求接收入口无效');
  const prepared = prepareWorksiteRequest(compiler, worksiteId);
  if (!prepared.ok) return prepared;
  try {
    // Compilation and receiver invocation occur before the first await.
    const response = await receiver(copyPayload(prepared.value));
    return { ok: true, value: { payload: prepared.value, response } };
  } catch (error) { return failure('REQUEST_RECEIVER_FAILED', error); }
}

