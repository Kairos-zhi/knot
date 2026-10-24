import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runHash, validateRun } from './run.mjs';

export class RunRequestError extends Error {
  constructor(code) { super(`Knot actual request refused (${code})`); this.code = code; }
}
const fail = code => { throw new RunRequestError(code); };
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
function json(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(json);
  if (!plain(value) || Object.getOwnPropertySymbols(value).length) fail('REQUEST_NON_JSON');
  const result = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('REQUEST_NON_JSON');
    Object.defineProperty(result, key, { enumerable: true, value: json(descriptor.value) });
  }
  return result;
}
const freeze = value => {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
};

/** A service-side gate over the actual prepared AgentLoop LLM request. No model
 * invocation, pricing assumption or automatic approval exists in this module. */
export function createActualRequestGate({ run: input, authorizeRequest = () => null,
  auditDirectory, signal, maxInputBytes = 8192, maxOutputTokens = 256 } = {}) {
  const run = validateRun(input), claim = run.dispatchClaim;
  if (!claim || claim.state !== 'reserved' || typeof authorizeRequest !== 'function'
    || !Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1 || maxInputBytes > 32768
    || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 512) fail('REQUEST_CONFIG');
  const binding = { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId,
    inputSha256: run.inputSha256, claimId: claim.claimId, constraintsSha256: claim.constraintsSha256 };
  let attempted = false, audit = null;
  const active = options => { if (signal?.aborted || options?.signal?.aborted) fail('REQUEST_CANCELLED'); };
  const approve = async (options, session) => {
    active(options);
    if (attempted) fail('REQUEST_REPLAY');
    attempted = true;
    if (options.sessionId !== binding.sessionId || session.id !== binding.sessionId
      || options.provider !== claim.constraints.provider || options.model !== claim.constraints.model
      || options.maxTokens !== claim.constraints.maxTokens || options.maxTokens > maxOutputTokens
      || options.reasoningEffort !== 'off') fail('REQUEST_ROUTE');
    if (options.tools !== undefined && (!Array.isArray(options.tools) || options.tools.length)
      || !plain(options.toolHistory) || Object.keys(options.toolHistory).some(k => !['tools', 'updates'].includes(k))
      || !Array.isArray(options.toolHistory.tools) || options.toolHistory.tools.length
      || !Array.isArray(options.toolHistory.updates) || options.toolHistory.updates.length
      || !Array.isArray(options.messages) || !options.messages.length
      || options.messages.some(m => !['system', 'developer', 'user'].includes(m.role)
        || !Array.isArray(m.content) || m.content.some(p => p.type !== 'text' || typeof p.text !== 'string'))) fail('REQUEST_TOOLS_OR_CONTENT');
    const capture = () => {
      const fields = {};
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(options))) {
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('REQUEST_NON_JSON');
        if (key !== 'signal') Object.defineProperty(fields, key, { enumerable: true, value: descriptor.value });
      }
      if (Object.getOwnPropertySymbols(options).length) fail('REQUEST_NON_JSON');
      return json({ version: 1, binding, options: fields, sessionHeader: session.header,
        requestHeader: session.requestHeader(), requestContext: session.requestContext() });
    };
    // Signal is an execution handle, never model input; every other field is
    // retained. Header/context facts are captured from this exact owned Session.
    const request = capture();
    const bytes = Buffer.byteLength(JSON.stringify(request));
    if (bytes > maxInputBytes) fail('REQUEST_BYTES');
    const requestSha256 = runHash(request);
    const verify = () => {
      active(options);
      if (runHash(capture()) !== requestSha256) fail('REQUEST_CHANGED');
    };
    const expected = { approved: true, ...binding, requestSha256, provider: options.provider,
      model: options.model, maxTokens: options.maxTokens, reasoningEffort: 'off' };
    let stop;
    const cancelled = new Promise((_, reject) => {
      stop = () => reject(new RunRequestError('REQUEST_CANCELLED'));
      signal?.addEventListener('abort', stop, { once: true });
      options.signal?.addEventListener('abort', stop, { once: true });
    });
    let receipt;
    try {
      receipt = await Promise.race([Promise.resolve().then(() => authorizeRequest(freeze({ request,
        requestSha256, inputBytes: bytes, limits: { maxInputBytes, maxOutputTokens }, binding: { ...binding } }))), cancelled]);
    } finally {
      signal?.removeEventListener('abort', stop); options.signal?.removeEventListener('abort', stop);
    }
    active(options);
    if (!plain(receipt) || runHash(json(receipt)) !== runHash(expected)) fail('REQUEST_DENIED');
    verify();
    if (typeof auditDirectory !== 'string' || !auditDirectory.trim()) fail('REQUEST_AUDIT_REQUIRED');
    const auditFile = join(auditDirectory, `${claim.claimId}.request.json`);
    await mkdir(auditDirectory, { recursive: true });
    active(options);
    await writeFile(auditFile, JSON.stringify({ kind: 'actual-request-approval', request, requestSha256,
      inputBytes: bytes, receipt, approvedAt: new Date().toISOString(), generationStarted: 'not-attested' }), { flag: 'wx', mode: 0o600 });
    verify();
    audit = Object.freeze({ requestSha256, auditFile, inputBytes: bytes });
    // A final synchronous check is invoked by the guard immediately before next.
    return Object.freeze({ ...audit, verify });
  };
  return Object.freeze({ approve, status: () => audit });
}
