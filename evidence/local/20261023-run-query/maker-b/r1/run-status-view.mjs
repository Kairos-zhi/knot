const keys = ['runId', 'requestId', 'sessionId', 'targetId', 'worksiteId', 'phase', 'hasOutput', 'blockId'];
const copy = Object.freeze({
  prepared: Object.freeze({ label: '待运行', detail: '本轮材料与目标已准备，尚未提交运行。',
    nextStep: '核对本轮材料与目标，等待获准运行。' }),
  submitted: Object.freeze({ label: '已提交', detail: '请求已提交，尚未证实正在运行或已完成。',
    nextStep: '等待结果核对，请勿重复提交。' }),
  uncertain: Object.freeze({ label: '待核对', detail: '本次提交的结果尚不确定，不能据此认定失败或成功。',
    nextStep: '核对原提交的结果；请勿重新发送。' }),
  completed: Object.freeze({ label: '已完成', detail: '本次运行已完成，已记录产物位置。',
    nextStep: '按记录定位产物；若已移除，保留完成记录。' }),
});

/** Presentation only: consumes the shared projectRun DTO, owns no Run state,
 * execution capability, title lookup, timers, model choice or cost estimate.
 * References are navigation data, never user-visible identifier labels. */
export function createRunStatusView(projected) {
  const reject = () => { throw new TypeError('INVALID_RUN_STATUS_PROJECTION'); };
  if (projected === null || typeof projected !== 'object'
    || Object.getPrototypeOf(projected) !== Object.prototype
    || Object.getOwnPropertySymbols(projected).length) reject();
  const descriptors = Object.getOwnPropertyDescriptors(projected);
  if (Object.keys(descriptors).length !== keys.length || keys.some(key =>
    !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))) reject();
  for (const key of ['runId', 'requestId', 'sessionId', 'targetId', 'worksiteId'])
    if (typeof projected[key] !== 'string' || !projected[key].trim()
      || projected[key].length > 512 || /[\u0000-\u001f\u007f]/u.test(projected[key])) reject();
  if (!Object.hasOwn(copy, projected.phase) || typeof projected.hasOutput !== 'boolean') reject();
  const completed = projected.phase === 'completed';
  if (completed !== projected.hasOutput || (completed
    ? typeof projected.blockId !== 'string' || !projected.blockId.trim()
      || projected.blockId.length > 512 || /[\u0000-\u001f\u007f]/u.test(projected.blockId)
    : projected.blockId !== null)) reject();
  return Object.freeze({ phase: projected.phase, ...copy[projected.phase],
    targetReference: Object.freeze({ worksiteId: projected.worksiteId, assetId: projected.targetId }),
    outputReference: completed ? Object.freeze({ worksiteId: projected.worksiteId,
      assetId: projected.targetId, blockId: projected.blockId }) : null });
}
