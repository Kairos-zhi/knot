import { createDshRunObserver, DshReadError, isDshReadCleanupFailure } from './dsh-run-read.mjs';

/** Host-only composition. The plugin's store supplies every Run; config cannot
 * replace readRun. Registration performs no observation or persistence I/O. */
export function bindRunObserver(ctx, store, config = {}) {
  const { hostVersion, Session, persistence, authorizeRead } = config ?? {};
  const observer = createDshRunObserver({ hostVersion, Session, persistence, authorizeRead,
    readRun: runId => store.read().runs?.find(run => run.runId === runId) });
  const pending = new Set();
  let closed = false, closing, cleanupFailed = false;
  const service = Object.freeze({ observe(runId, { signal } = {}) {
    if (closed) return Promise.reject(new DshReadError('DSH_OBSERVER_CLOSED'));
    const controller = new AbortController();
    let combined;
    try { combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal; }
    catch { return Promise.reject(new DshReadError('DSH_READ_FAILED')); }
    const entry = { controller, promise: null };
    entry.promise = observer.observe(runId, { signal: combined }).catch(error => {
      if (isDshReadCleanupFailure(error)) cleanupFailed = true;
      throw error;
    }).finally(() => pending.delete(entry));
    pending.add(entry);
    return entry.promise;
  } });
  const unprovide = ctx.provide('kontRunObserver', service);
  return Object.freeze({ dispose() {
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
