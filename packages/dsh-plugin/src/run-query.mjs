import { validateRun } from './run.mjs';
import { reject } from './kernel.mjs';

/** One public, read-only projection shared by human and Agent callers. Never
 * expose input text, supplied materials, dispatch controls or audit evidence. */
export function projectRun(value) {
  const run = validateRun(value);
  const completed = run.status === 'completed';
  const phase = completed ? 'completed' : run.dispatchClaim
    ? run.dispatchClaim.state === 'submitted' ? 'submitted' : 'uncertain' : 'prepared';
  return { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId,
    targetId: run.targetId, worksiteId: run.input.worksiteId, phase, hasOutput: completed,
    blockId: completed ? run.receipt.blockId : null };
}

export function listRuns(state) {
  return { ok: true, seq: state.seq, runs: (state.runs ?? []).map(projectRun) };
}

export function getRun(state, runId) {
  const run = state.runs?.find(item => item.runId === runId);
  if (!run) reject('NOT_FOUND', 'Run does not exist', 404);
  return { ok: true, seq: state.seq, run: projectRun(run) };
}
