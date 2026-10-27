import { runHash, runPromptText, validateRun } from './run.mjs';

const version = '0.2.1-rc.2';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => object(value) && Object.keys(value).every(key => names.includes(key));
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const freeze = value => { if (object(value) || Array.isArray(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export class DshReadError extends Error {
  constructor(code) { super(`DSH observation refused (${code})`); this.code = code; }
}
// Only this factory's actual handle.close catch can establish a cleanup failure.
// A trusted callback may reject with any public error code; that is not proof
// that this observer failed to release its acquired handle.
const closeFailures = new WeakSet();
export const isDshReadCleanupFailure = error => closeFailures.has(error);
const requireThat = (condition, code = 'DSH_NARROW_SCHEMA') => { if (!condition) throw new DshReadError(code); };
const textParts = content => {
  requireThat(Array.isArray(content) && content.length > 0 && content.length <= 1000);
  for (const part of content) requireThat(keys(part, ['type', 'text']) && part.type === 'text'
    && typeof part.text === 'string' && part.text.length <= 50000);
  return content.map(part => part.text).join('');
};
function message(value, role) {
  requireThat(keys(value, ['id', 'role', 'source', 'content']) && id(value.id) && value.role === role && object(value.source) && id(value.source.kind));
  textParts(value.content);
}
function header(value, sessionId) {
  requireThat(keys(value, ['version', 'id', 'createdAt', 'cwd', 'isSeeded', 'agentPreset', 'delegationDepth'])
    && value.version === 4 && value.id === sessionId && integer(value.createdAt) && value.isSeeded === false
    && (value.cwd === undefined || typeof value.cwd === 'string')
    && (value.agentPreset === undefined || id(value.agentPreset))
    && (value.delegationDepth === undefined || value.delegationDepth === 0), 'DSH_HEADER_REFUSED');
}
function requestHeader(value) {
  requireThat(keys(value, ['config', 'adapterDefaults', 'tools']) && object(value.config));
  const c = value.config;
  requireThat(keys(c, ['provider', 'model', 'maxTokens', 'temperature', 'stop', 'reasoningEffort']) && id(c.provider) && id(c.model)
    && integer(c.maxTokens) && c.maxTokens > 0
    && (c.temperature === undefined || Number.isFinite(c.temperature))
    && (c.reasoningEffort === undefined || id(c.reasoningEffort))
    && (c.stop === undefined || Array.isArray(c.stop) && c.stop.length <= 100 && c.stop.every(item => typeof item === 'string')));
  requireThat(value.tools === undefined || Array.isArray(value.tools) && value.tools.length === 0, 'DSH_TOOLS_UNSUPPORTED');
  requireThat(value.adapterDefaults === undefined || keys(value.adapterDefaults, ['maxTokens', 'reasoningEffort'])
    && Object.values(value.adapterDefaults).every(item => item === true));
}
function requestContext(value) {
  requireThat(keys(value, ['provider', 'model', 'contextWindow', 'systemPromptUpdate']) && id(value.provider) && id(value.model)
    && (value.contextWindow === undefined || integer(value.contextWindow) && value.contextWindow > 0)
    && (value.systemPromptUpdate === undefined || value.systemPromptUpdate === 'in-history'));
}
function streamRecords(records) {
  requireThat(Array.isArray(records) && records.length <= 10000);
  // Compact text stream only; other formats remain unsupported rather than opaque.
  for (const record of records) requireThat(keys(record, ['type', 'time0', 'index', 'dt', 'texts']) && record.type === 'text-chunks'
    && integer(record.time0) && integer(record.index) && Array.isArray(record.dt) && record.dt.every(integer)
    && Array.isArray(record.texts) && record.texts.every(item => typeof item === 'string') && record.dt.length === record.texts.length);
}

/** Supplement official runtime-required replay with an intentionally narrow schema.
 * This is neither a general DSH validator nor a Provider payload verifier. */
function narrowLog(run, events) {
  let turn = false, step = false, ended = false, cut = -1, promptCount = 0, headerCount = 0, contextCount = 0;
  const facts = [];
  const permissionTypes = ['sandbox/mode', 'approval/policy', 'permission/preset'];
  const startTypes = ['working-directory/change', 'agent-preset/selected', 'model/selection'];
  const modelMessages = [];
  for (const [seq, event] of events.entries()) {
    requireThat(keys(event, ['type', 'seq', 'time', 'data', 'surfaceOp']) && event.seq === seq && integer(event.time) && object(event.data), 'DSH_EVENT_ENVELOPE');
    const { type, data: d } = event;
    const surface = ['user/message', 'system/message', 'developer/message', 'assistant/message'].includes(type);
    requireThat(surface ? event.surfaceOp === 'append' : event.surfaceOp === undefined, 'DSH_SURFACE_UNSUPPORTED');
    requireThat(!ended, 'DSH_TRAILING_EVENT');
    if (permissionTypes.includes(type)) {
      requireThat(cut < 0 && headerCount === 0 && facts.every(item => item.type !== type), 'DSH_PERMISSION_ORDER');
      if (type === 'sandbox/mode') requireThat(keys(d, ['mode']) && ['read-only', 'workspace-write', 'danger-full-access'].includes(d.mode));
      if (type === 'approval/policy') requireThat(keys(d, ['policy']) && ['ask', 'never'].includes(d.policy));
      if (type === 'permission/preset') requireThat(keys(d, ['preset']) && id(d.preset));
      facts.push(event);
    } else if (startTypes.includes(type)) {
      requireThat(!turn && cut < 0);
      if (type === 'working-directory/change') requireThat(keys(d, ['cwd']) && typeof d.cwd === 'string');
      if (type === 'agent-preset/selected') requireThat(keys(d, ['agentPreset']) && id(d.agentPreset));
      if (type === 'model/selection') requireThat(keys(d, ['provider', 'model', 'reasoningEffort']) && id(d.provider) && id(d.model)
        && (d.reasoningEffort === undefined || id(d.reasoningEffort)));
    } else if (type === 'turn/start') {
      requireThat(keys(d, ['turn']) && d.turn === 1 && !turn && cut < 0, 'DSH_OLD_TURN'); turn = true;
    } else if (type === 'step/start') {
      requireThat(keys(d, ['turn', 'step']) && d.turn === 1 && d.step === 1 && turn && !step && cut < 0, 'DSH_STEP_REFUSED'); step = true;
    } else if (type === 'user/message') {
      requireThat(turn && step && cut < 0 && headerCount === 0); message(d, 'user');
      if (d.source.kind === 'user') {
        requireThat(d.source.rpcId === run.requestId && ++promptCount === 1 && textParts(d.content) === runPromptText(run.input), 'DSH_PROMPT_MISMATCH');
      } else requireThat(['runtime-context', 'working-directory'].includes(d.source.kind), 'DSH_FOREIGN_INPUT');
    } else if (type === 'system/message' || type === 'developer/message') {
      requireThat(keys(d, ['turn', 'step', 'message']) && d.turn === 1 && d.step === 1 && turn && step && cut < 0 && headerCount === 0);
      message(d.message, type === 'system/message' ? 'system' : 'developer');
      if (type === 'system/message') requireThat(d.message.source.kind === 'system-prompt');
      else requireThat(['runtime-context', 'model-selection', 'working-directory'].includes(d.message.source.kind));
    } else if (type === 'request/header') {
      requireThat(keys(d, ['header', 'reason', 'startsSeries']) && d.reason === 'initial'
        && (d.startsSeries === undefined || d.startsSeries === true) && turn && step && cut < 0 && promptCount === 1 && ++headerCount === 1);
      requestHeader(d.header);
    } else if (type === 'request/context') {
      requireThat(turn && step && cut < 0 && headerCount === 1 && ++contextCount === 1); requestContext(d);
    } else if (type === 'assistant/message') {
      requireThat(keys(d, ['turn', 'step', 'message', 'stream']) && d.turn === 1 && d.step === 1 && turn && step && cut < 0
        && events[seq - 1]?.type === 'request/context', 'DSH_ASSISTANT_REFUSED');
      message(d.message, 'assistant');
      requireThat(keys(d.message.source, ['kind', 'provider', 'model']) && d.message.source.kind === 'model'
        && id(d.message.source.provider) && id(d.message.source.model));
      streamRecords(d.stream); modelMessages.push(d.message); cut = seq;
    } else if (type === 'step/end') {
      requireThat(keys(d, ['turn', 'step']) && d.turn === 1 && d.step === 1 && turn && step && cut >= 0, 'DSH_STEP_REFUSED'); step = false;
    } else if (type === 'turn/end') {
      requireThat(keys(d, ['turn', 'reason']) && d.turn === 1 && turn && !step && cut >= 0
        && keys(d.reason, ['kind']) && d.reason.kind === 'completed', 'DSH_NOT_COMPLETED'); ended = true;
    } else throw new DshReadError('DSH_EVENT_UNSUPPORTED');
  }
  requireThat(ended && promptCount === 1 && headerCount === 1 && contextCount === 1 && cut >= 0, 'DSH_INCOMPLETE');
  requireThat(permissionTypes.every(type => facts.some(item => item.type === type)), 'DSH_PERMISSION_MISSING');
  return { cut, permissionFacts: facts, modelMessage: modelMessages[0] };
}

/** Service factory only. No HTTP route, arbitrary path, session listing, activation,
 * automatic result import, model request, or execution authorization is provided. */
export function createDshRunObserver({ hostVersion, persistence, Session, readRun, authorizeRead, authorizeReconcile, returnRun } = {}) {
  async function inspect(runId, { signal } = {}, reconcile = false) {
    let handle, result, failure, originalRun, observedEvents;
    try {
      requireThat(hostVersion === version && typeof Session?.create === 'function', 'DSH_VERSION_UNSUPPORTED');
      requireThat(typeof readRun === 'function' && typeof authorizeRead === 'function' && typeof persistence?.open === 'function'
        && typeof persistence?.stat === 'function', 'DSH_READ_DENIED');
      signal?.throwIfAborted();
      const run = freeze(validateRun(await readRun(runId)));
      requireThat(run.runId === runId && /^[a-zA-Z0-9_-]{1,200}$/.test(run.plannedSessionId), 'DSH_BINDING_MISMATCH');
      const binding = freeze({ runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId, inputSha256: run.inputSha256 });
      const grant = structuredClone(await authorizeRead(binding));
      requireThat(keys(grant, ['allowed', 'binding', 'approvedRequestSha256']) && grant.allowed === true
        && runHash(grant.binding) === runHash(binding), 'DSH_READ_DENIED');
      requireThat(grant.approvedRequestSha256 === undefined || sha(grant.approvedRequestSha256), 'DSH_APPROVAL_INVALID');
      signal?.throwIfAborted();
      if (reconcile) {
        requireThat(typeof authorizeReconcile === 'function' && typeof returnRun === 'function', 'DSH_RECONCILE_DENIED');
        const permission = structuredClone(await authorizeReconcile(binding));
        requireThat(keys(permission, ['allowed', 'binding']) && permission.allowed === true
          && runHash(permission.binding) === runHash(binding), 'DSH_RECONCILE_DENIED');
        signal?.throwIfAborted();
        // Known completion is an idempotent read, not a new Session attestation.
        if (run.status === 'completed') return { evidenceRevalidated: false };
        requireThat(run.status === 'prepared' && ['reserved', 'submitted', 'uncertain'].includes(run.dispatchClaim?.state), 'DSH_RECONCILE_NOT_CLAIMED');
        originalRun = run;
      }
      const before = structuredClone(await persistence.stat(binding.sessionId, { signal }));
      requireThat(before?.formatStatus === 'current' && typeof before.revision === 'string' && before.revision.length > 0
        && integer(before.sizeBytes) && before.sizeBytes <= 8 * 1024 * 1024, 'DSH_FORMAT_REFUSED');
      header(before.header, binding.sessionId);
      handle = await persistence.open(binding.sessionId, 'read', { signal });
      header(handle.header, binding.sessionId);
      requireThat(handle.id === binding.sessionId && handle.access === 'read' && handle.inheritedEventCount === 0
        && runHash(handle.header) === runHash(before.header), 'DSH_HANDLE_REFUSED');
      const read = await handle.read(0, 1001, { signal });
      const events = freeze(structuredClone(read.events));
      observedEvents = events;
      requireThat(Array.isArray(events) && events.length > 0 && events.length <= 1000
        && Buffer.byteLength(JSON.stringify(events)) <= 8 * 1024 * 1024, 'DSH_LOG_LIMIT');
      const after = await persistence.stat(binding.sessionId, { signal });
      requireThat(after?.formatStatus === 'current' && after.revision === before.revision && runHash(after.header) === runHash(before.header), 'DSH_OBSERVATION_CHANGED');
      const shape = narrowLog(run, events);
      // Full replay validates official runtime-required invariants. The original
      // evidence stays frozen; Session.create's added in-memory marker is excluded.
      Session.create(binding.sessionId, events, before.header, 0);
      const prefix = Session.create(binding.sessionId, events.slice(0, shape.cut), before.header, 0);
      const epoch = structuredClone(prefix.requestHeader());
      const context = structuredClone(prefix.requestContext());
      const messages = structuredClone(prefix.deriveMessages());
      requestHeader(epoch); requestContext(context);
      requireThat(context.provider === epoch.config.provider && context.model === epoch.config.model
        && shape.modelMessage.source.provider === context.provider && shape.modelMessage.source.model === context.model, 'DSH_ROUTE_MISMATCH');
      requireThat(Array.isArray(messages) && messages.length > 0 && messages.every(item => ['user', 'system', 'developer'].includes(item.role)), 'DSH_REPLAY_REFUSED');
      messages.forEach(item => message(item, item.role));
      const boundary = { version: 1, binding, sessionHeader: before.header, requestHeader: epoch,
        requestContext: context, messages, permissionFacts: shape.permissionFacts,
        metadata: events.slice(0, shape.cut).filter(event => ['working-directory/change', 'agent-preset/selected', 'model/selection'].includes(event.type)) };
      const requestSha256 = runHash(boundary);
      const approved = grant.approvedRequestSha256 === requestSha256;
      signal?.throwIfAborted();
      result = freeze({ version: 1, binding, hostVersion: version, source: 'dsh-persistence-current',
        status: approved ? 'request_fingerprint_approved' : grant.approvedRequestSha256 === undefined ? 'needs_request_approval' : 'request_approval_mismatch',
        requestFingerprintApproved: approved, executionAuthorized: false, modelRunVerified: false,
        inputSha256: run.inputSha256, submittedPromptSha256: runHash(runPromptText(run.input)),
        requestSha256, logSha256: runHash(events), headerSha256: runHash(before.header),
        messageCount: messages.length, eventCount: events.length, requestBoundarySeq: shape.cut - 1,
        terminalKind: 'completed', provider: context.provider, model: context.model, maxTokens: epoch.config.maxTokens,
        contentIncluded: false });
      if (reconcile) {
        requireThat(approved, 'DSH_RECONCILE_REQUEST_APPROVAL_REQUIRED');
        const constraints = run.dispatchClaim.constraints;
        requireThat(context.provider === constraints.provider && context.model === constraints.model
          && epoch.config.maxTokens === constraints.maxTokens, 'DSH_RECONCILE_ROUTE_MISMATCH');
      }
    } catch (error) {
      failure = signal?.aborted ? new DshReadError('DSH_READ_CANCELLED')
        : error instanceof DshReadError ? error : new DshReadError('DSH_READ_FAILED');
    } finally {
      if (handle) try { await handle.close(); } catch {
        failure = new DshReadError('DSH_CLOSE_FAILED');
        closeFailures.add(failure);
      }
    }
    if (signal?.aborted && !isDshReadCleanupFailure(failure)) failure = new DshReadError('DSH_READ_CANCELLED');
    if (failure) throw failure;
    if (reconcile) {
      requireThat(!signal?.aborted, 'DSH_READ_CANCELLED');
      const latest = validateRun(await readRun(runId));
      requireThat(!signal?.aborted, 'DSH_READ_CANCELLED');
      requireThat(latest.runId === originalRun.runId && latest.requestId === originalRun.requestId
        && latest.plannedSessionId === originalRun.plannedSessionId && latest.inputSha256 === originalRun.inputSha256
        && latest.dispatchClaim?.claimId === originalRun.dispatchClaim.claimId
        && latest.dispatchClaim.constraintsSha256 === originalRun.dispatchClaim.constraintsSha256
        && runHash(latest.dispatchClaim.constraints) === runHash(originalRun.dispatchClaim.constraints), 'DSH_RECONCILE_BINDING_CHANGED');
      // No phase gate is added to the writer queue. Same-claim phase changes
      // after admission do not invalidate already observed completed evidence.
      await returnRun(runId, { sessionId: originalRun.plannedSessionId, events: observedEvents, kind: 'dsh-session-log' }, { signal, expectedRun: originalRun });
      return { evidenceRevalidated: true };
    }
    return result;
  }
  return Object.freeze({ observe: (runId, options) => inspect(runId, options),
    reconcile: (runId, options) => inspect(runId, options, true) });
}
