import { runHash, runPromptText, validateDispatchConstraints, validateRun } from './run.mjs';
import { installRunExecutionGuard } from './run-execution-guard.mjs';
import { createActualRequestGate } from './run-request-gate.mjs';

export class RunExecutorError extends Error {
  constructor(code) { super(`Knot internal execution refused (${code})`); this.code = code; }
}
const fail = code => { throw new RunExecutorError(code); };

/** Internal candidate only. Trusted host dependencies, no apply/HTTP entry.
 * Approval binds this slice, not complete model context, human identity or cost.
 * The caller owns the store: await dispose() BEFORE store.close(). A rejected
 * dispose is unsafe to close: reconcile/release the owned resources first. */
export function createRunExecutor({ ctx, store, hostVersion, createUserMessage,
  authorize = () => null, authorizeRequest = () => null, requestAuditDirectory,
  maxInputBytes = 8192, maxOutputTokens = 256, evidenceKind } = {}) {
  if (hostVersion !== '0.2.1-rc.2' || typeof ctx?.agents?.create !== 'function'
    || typeof createUserMessage !== 'function' || typeof authorize !== 'function'
    || !['synthetic-test', 'dsh-session-log'].includes(evidenceKind)) fail('EXECUTOR_CONFIG');
  let closed = false, disposal, cleanupFailed = false;
  const jobs = new Set();
  async function work(job, { runId, constraints, timeoutMs = 30000 }) {
    let handle, guard, claim, requestGate, timer, unobserve, observedSession, result, invalidEvents = false;
    const events = [];
    const signal = job.abort.signal;
    const active = () => { if (closed || signal.aborted) fail('EXECUTOR_CANCELLED'); };
    try {
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail('EXECUTOR_TIMEOUT');
      timer = setTimeout(() => job.abort.abort(), timeoutMs);
      constraints = validateDispatchConstraints(constraints);
      active();
      const run = validateRun(store.read().runs?.find(item => item.runId === runId));
      // Repeat observations cannot obtain a new submission capability.
      if (run.dispatchClaim) return result = { status: 'duplicate', claim: run.dispatchClaim, executionAuthorized: false };
      if (run.status !== 'prepared') fail('EXECUTOR_RUN');
      const binding = { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId,
        inputSha256: run.inputSha256, constraintsSha256: runHash(constraints) };
      let stop;
      const cancelled = new Promise((_, reject) => {
        stop = () => reject(new RunExecutorError('EXECUTOR_CANCELLED'));
        signal.addEventListener('abort', stop, { once: true });
      });
      let permit;
      try { permit = await Promise.race([Promise.resolve().then(() => authorize(structuredClone({ run, constraints, binding }))), cancelled]); }
      finally { signal.removeEventListener('abort', stop); }
      active();
      if (runHash(permit) !== runHash({ approved: true, ...binding })) fail('EXECUTOR_DENIED');
      const reserved = await store.claimRunDispatch(runId, constraints);
      claim = reserved.run.dispatchClaim;
      if (!reserved.acquired) return result = { status: 'duplicate', claim, executionAuthorized: false };
      active();
      requestGate = createActualRequestGate({ run: reserved.run, authorizeRequest, auditDirectory: requestAuditDirectory,
        signal, maxInputBytes, maxOutputTokens });
      const approval = { approved: true, runId: run.runId, requestId: run.requestId,
        sessionId: run.plannedSessionId, inputSha256: run.inputSha256,
        provider: constraints.provider, model: constraints.model, maxTokens: constraints.maxTokens, reasoningEffort: 'off' };
      handle = await ctx.agents.create({ sessionId: run.plannedSessionId, signal,
        agentOptions: { provider: constraints.provider, model: constraints.model, maxTokens: constraints.maxTokens, reasoningEffort: 'off' },
        setup(agentCtx, agent) {
          active();
          guard = installRunExecutionGuard(agentCtx, agent, { run: reserved.run, approval, hostVersion, signal,
            authorizeStream: options => requestGate.approve(options, agent.session) });
          observedSession = agent.session;
          // Public committed event notifications, installed before publication.
          // Exact object identity excludes all sibling Session activity.
          unobserve = ctx.on('session/event', (session, event) => {
            if (session !== observedSession) return;
            if (event.seq !== events.length || events.length >= 10000) { invalidEvents = true; return; }
            events.push(event);
          });
        } });
      active();
      handle.agent.followup(createUserMessage({ source: { kind: 'user', rpcId: run.requestId },
        content: [{ type: 'text', text: runPromptText(run.input) }] }));
      await store.settleRunDispatch(runId, claim.claimId, 'submitted');
      await handle.agent.whenIdle(); // A drain barrier, NEVER proof of success.
      active();
      if (guard.status().denialCode) fail('EXECUTOR_GUARD');
      if (invalidEvents || events.length !== observedSession.seq) fail('EXECUTOR_EVENTS');
      if (events.at(-1)?.type !== 'turn/end' || events.at(-1)?.data.reason?.kind !== 'completed') fail('EXECUTOR_TERMINAL');
      const completed = await store.returnRun(runId, { sessionId: handle.agent.session.id, events, kind: evidenceKind },
        'runtime:owned-dsh', { signal });
      return result = { status: 'returned', run: completed, requestAudit: requestGate.status(), executionAuthorized: false };
    } catch (error) {
      if (claim) {
        // Failure cannot release a reservation or turn submitted into success.
        try { await store.settleRunDispatch(runId, claim.claimId, 'uncertain'); } catch {}
      }
      return result = { status: signal.aborted || closed ? 'cancelled' : 'failed',
        code: error instanceof RunExecutorError ? error.code : 'EXECUTOR_FAILED', requestAudit: requestGate?.status(), executionAuthorized: false };
    } finally {
      clearTimeout(timer);
      // Keep fail-closed hooks until the exact owned Agent has drained and its
      // official ownership handle is disposed. No retained reference is exposed.
      try {
        if (handle) {
          handle.agent.cancel({ kind: 'hook', reason: 'KONT_EXECUTOR_CLOSED' });
          try { await guard?.dispose(); } finally { await handle.dispose(); }
        } else await guard?.dispose();
      } catch { cleanupFailed = true; result.cleanupFailed = true; }
      finally {
        try { await unobserve?.(); }
        catch { cleanupFailed = true; result.cleanupFailed = true; }
      }
    }
  }
  return Object.freeze({
    execute(options = {}) {
      if (closed) return Promise.resolve({ status: 'closed', executionAuthorized: false });
      if (!options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some(key => !['runId', 'constraints', 'signal', 'timeoutMs'].includes(key)))
        return Promise.resolve({ status: 'failed', code: 'EXECUTOR_CONFIG', executionAuthorized: false });
      const abort = new AbortController();
      const outer = options.signal;
      const stop = () => abort.abort();
      outer?.addEventListener('abort', stop, { once: true });
      if (outer?.aborted) abort.abort();
      const job = { abort, done: null };
      // Clone constraints before yielding; callback/signal never enter storage.
      let frozen;
      try { frozen = { runId: options.runId, constraints: structuredClone(options.constraints), timeoutMs: options.timeoutMs }; }
      catch { outer?.removeEventListener('abort', stop); return Promise.resolve({ status: 'failed', code: 'EXECUTOR_CONFIG', executionAuthorized: false }); }
      jobs.add(job);
      job.done = work(job, frozen).finally(() => { jobs.delete(job); outer?.removeEventListener('abort', stop); });
      return job.done;
    },
    dispose() {
      if (!disposal) {
        closed = true;
        for (const job of jobs) job.abort.abort();
        disposal = Promise.allSettled([...jobs].map(job => job.done)).then(() => {
          if (cleanupFailed) fail('EXECUTOR_CLEANUP');
        });
      }
      return disposal;
    },
  });
}
