import { createDshRunObserver, DshReadError, isDshReadCleanupFailure } from './dsh-run-read.mjs';
import { runHash } from './run.mjs';
import { getRun } from './run-query.mjs';

/** Host-only composition. The plugin's store supplies every Run; config cannot
 * replace readRun. Registration performs no observation or persistence I/O. */
export function bindRunObserver(ctx, store, config = {}) {
  const { hostVersion, Session, persistence, authorizeRead, authorizeReconcile } = config ?? {};
  const pending = new Set();
  let closed = false, closing, cleanupFailed = false;
  const observer = createDshRunObserver({ hostVersion, Session, persistence, authorizeRead, authorizeReconcile,
    readRun: runId => store.read().runs?.find(run => run.runId === runId),
    returnRun(runId, evidence, { signal, expectedRun }) {
      if (closed || signal?.aborted) throw new DshReadError('DSH_READ_CANCELLED');
      const latest = store.read().runs?.find(run => run.runId === runId);
      if (!latest || latest.requestId !== expectedRun.requestId || latest.plannedSessionId !== expectedRun.plannedSessionId
        || latest.inputSha256 !== expectedRun.inputSha256 || latest.dispatchClaim?.claimId !== expectedRun.dispatchClaim.claimId
        || latest.dispatchClaim.constraintsSha256 !== expectedRun.dispatchClaim.constraintsSha256
        || runHash(latest.dispatchClaim.constraints) !== runHash(expectedRun.dispatchClaim.constraints)
        || !(latest.status === 'completed' || latest.status === 'prepared' && ['reserved', 'submitted', 'uncertain'].includes(latest.dispatchClaim.state)))
        throw new DshReadError('DSH_RECONCILE_BINDING_CHANGED');
      return store.returnRun(runId, evidence, 'runtime:dsh-reconciliation', { signal });
    } });
  function invoke(method, runId, options = {}) {
    if (closed) return Promise.reject(new DshReadError('DSH_OBSERVER_CLOSED'));
    if (method === 'reconcile' && (!options || typeof options !== 'object' || Array.isArray(options)
      || Reflect.ownKeys(options).some(key => key !== 'signal')
      || Object.getOwnPropertyDescriptor(options, 'signal') && !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'signal'), 'value')))
      return Promise.reject(new DshReadError('DSH_RECONCILE_CONFIG'));
    const { signal } = options;
    const controller = new AbortController();
    let combined;
    try { combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal; }
    catch { return Promise.reject(new DshReadError('DSH_READ_FAILED')); }
    const entry = { controller, promise: null };
    entry.promise = observer[method](runId, { signal: combined }).then(result => method === 'reconcile'
      ? { ...getRun(store.read(), runId), ...result, executionAuthorized: false, modelRunVerified: false } : result).catch(error => {
      if (isDshReadCleanupFailure(error)) cleanupFailed = true;
      throw error;
    }).finally(() => pending.delete(entry));
    pending.add(entry);
    return entry.promise;
  }
  const service = Object.freeze({ observe: (runId, options) => invoke('observe', runId, options),
    reconcile: (runId, options) => invoke('reconcile', runId, options) });
  const unprovide = ctx.provide('kontRunObserver', service);
  return Object.freeze({ reconcile: service.reconcile, dispose() {
    if (closing) return closing;
    closed = true;
    // Cordis also owns this disposer. Explicit removal keeps the service scope
    // aligned with this barrier; retained references are independently fenced.
    for (const entry of pending) entry.controller.abort();
    const removal = Promise.resolve().then(() => unprovide());
    closing = Promise.allSettled([removal, ...[...pending].map(entry => entry.promise)]).then(([removed]) => {
      if (removed.status === 'rejected' || cleanupFailed) throw new DshReadError('DSH_OBSERVER_DISPOSE_FAILED');
    });
    return closing;
  } });
}
