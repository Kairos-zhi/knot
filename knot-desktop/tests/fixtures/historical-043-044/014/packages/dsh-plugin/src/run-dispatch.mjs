import { dshPromptRequest, validateDispatchConstraints } from './run.mjs';

/** Internal at-most-once callback attempt after persisted reservation. This is
 * neither execution authorization nor proof of remote execution. No retries. */
export async function dispatchOnce(store, { runId, constraints, submit, timeoutMs = 30000 }) {
  if (typeof submit !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw new TypeError('Invalid dispatch callback/timeout');
  constraints = validateDispatchConstraints(constraints);
  const reservation = await store.claimRunDispatch(runId, constraints);
  const claim = reservation.run.dispatchClaim;
  if (!reservation.acquired) return { acquired: false, claim, executionAuthorized: false };
  let timer, outcome = 'uncertain';
  try {
    // The invocation uses only the persisted snapshot. A late callback result
    // after timeout cannot settle or reopen the reservation.
    const receipt = await Promise.race([
      Promise.resolve().then(() => submit(structuredClone({ claim, request: dshPromptRequest(reservation.run) }))),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (receipt?.accepted === true && Object.keys(receipt).length === 1) outcome = 'submitted';
  } catch { /* Raw adapter exceptions never become evidence or user output. */ }
  finally { clearTimeout(timer); }
  try {
    const saved = await store.settleRunDispatch(runId, claim.claimId, outcome);
    return { acquired: true, claim: saved, outcome, receiptSaved: true, executionAuthorized: false };
  } catch {
    return { acquired: true, claim, outcome: 'uncertain', receiptSaved: false, executionAuthorized: false };
  }
}
