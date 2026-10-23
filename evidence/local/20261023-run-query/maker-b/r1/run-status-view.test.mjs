import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunStatusView } from '../packages/dsh-plugin/src/run-status-view.mjs';
const dto = phase => ({ runId: 'run:private-debug', requestId: 'request:private-debug',
  sessionId: 'session:private-debug', targetId: 'target:1', worksiteId: 'site:1', phase,
  hasOutput: phase === 'completed', blockId: phase === 'completed' ? 'block:output' : null });

test('shared phases communicate evidence honestly without execution or billing affordances', () => {
  const expected = { prepared: '待运行', submitted: '已提交', uncertain: '待核对', completed: '已完成' };
  for (const [phase, label] of Object.entries(expected)) {
    const view = createRunStatusView(dto(phase));
    assert.equal(view.label, label);
    const visible = [view.label, view.detail, view.nextStep].join(' ');
    assert.doesNotMatch(visible, /private-debug|元|费用|重试|重新运行/);
    assert.equal(Object.hasOwn(view, 'action'), false);
    assert.equal(Object.hasOwn(view, 'running'), false);
  }
  assert.match(createRunStatusView(dto('submitted')).detail, /尚未证实正在运行/);
  assert.match(createRunStatusView(dto('uncertain')).nextStep, /请勿重新发送/);
});
test('all phases retain the same target; only completed provides an immutable output location', () => {
  const input = dto('completed'), view = createRunStatusView(input);
  input.targetId = 'changed'; input.blockId = 'changed';
  assert.deepEqual(view.outputReference, { worksiteId: 'site:1', assetId: 'target:1', blockId: 'block:output' });
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.targetReference), true);
  assert.equal(Object.isFrozen(view.outputReference), true);
  for (const phase of ['prepared', 'submitted', 'uncertain']) {
    const other = createRunStatusView(dto(phase));
    assert.deepEqual(other.targetReference, view.targetReference);
    assert.equal(other.outputReference, null);
  }
});
test('invalid and contradictory projections fail closed without evaluating getters', () => {
  const invalid = [null, [], {}, { ...dto('submitted'), phase: 'running' },
    { ...dto('prepared'), phase: 'reserved' }, { ...dto('completed'), hasOutput: false },
    { ...dto('uncertain'), hasOutput: true }, { ...dto('prepared'), blockId: 'fake' },
    { ...dto('completed'), blockId: '' }, { ...dto('prepared'), sessionId: null },
    { ...dto('prepared'), targetId: 'bad\nref' }, { ...dto('prepared'), cost: 0 },
    { ...dto('prepared'), [Symbol('extra')]: 1 }];
  for (const value of invalid) assert.throws(() => createRunStatusView(value), /INVALID_RUN_STATUS_PROJECTION/);
  let evaluated = false;
  const accessor = dto('prepared');
  Object.defineProperty(accessor, 'phase', { enumerable: true, get() { evaluated = true; return 'prepared'; } });
  assert.throws(() => createRunStatusView(accessor), /INVALID_RUN_STATUS_PROJECTION/);
  assert.equal(evaluated, false);
});
