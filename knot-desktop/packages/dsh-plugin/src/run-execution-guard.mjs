import { runPromptText, validateRun } from './run.mjs';

export class RunGuardError extends Error {
  constructor(code) { super(`Knot execution guard refused (${code})`); this.code = code; }
}
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, names) => record(value) && Object.keys(value).every(name => names.includes(name));
const text = content => Array.isArray(content) && content.length > 0 && content.every(part => only(part, ['type', 'text'])
  && part.type === 'text' && typeof part.text === 'string');
const fail = code => { throw new RunGuardError(code); };

/** Candidate installed only by an owned Agent's pre-publication setup callback.
 * Local approval is a guard input, NOT a dispatch/cost/context authorization.
 * No host execute entry, model selection, Agent creation or retry is provided.
 */
export function installRunExecutionGuard(agentCtx, agent, { run: input, approval, hostVersion, signal, authorizeStream } = {}) {
  if (hostVersion !== '0.2.1-rc.2') fail('GUARD_VERSION');
  let run;
  try { run = validateRun(input); } catch { fail('GUARD_RUN'); }
  if (!only(approval, ['approved', 'runId', 'requestId', 'sessionId', 'inputSha256', 'provider', 'model', 'maxTokens', 'reasoningEffort'])
    || Object.getPrototypeOf(approval) !== Object.prototype || Object.getOwnPropertySymbols(approval).length
    || Object.values(Object.getOwnPropertyDescriptors(approval)).some(d => !d.enumerable || !Object.hasOwn(d, 'value')))
    fail('GUARD_APPROVAL');
  const permit = Object.freeze(structuredClone(approval));
  if (permit.approved !== true || permit.runId !== run.runId || permit.requestId !== run.requestId
    || permit.sessionId !== run.plannedSessionId || permit.inputSha256 !== run.inputSha256
    || typeof permit.provider !== 'string' || !permit.provider.trim() || permit.provider.length > 200
    || typeof permit.model !== 'string' || !permit.model.trim() || permit.model.length > 200
    || !Number.isSafeInteger(permit.maxTokens) || permit.maxTokens < 1 || run.status !== 'prepared'
    || permit.reasoningEffort !== undefined && permit.reasoningEffort !== 'off'
    || authorizeStream !== undefined && typeof authorizeStream !== 'function') fail('GUARD_APPROVAL');
  if (agent?.id !== permit.sessionId || agent.session?.id !== permit.sessionId
    || agent.session.header?.isSeeded !== false || agent.session.seq !== 0 || typeof agent.cancel !== 'function'
    || typeof agent.whenIdle !== 'function' || typeof agentCtx?.agents?.currentInitiator !== 'function') fail('GUARD_AGENT');
  if (signal?.aborted) fail('GUARD_CANCELLED');
  let closed = false, disposing, denialCode = null, proposals = 0, streams = 0, steps = 0;
  const active = () => { if (closed || signal?.aborted) fail('GUARD_CLOSED'); };
  const revoke = code => {
    closed = true; denialCode ??= code;
    agent.cancel({ kind: 'hook', reason: 'KONT_EXECUTION_GUARD_CLOSED' });
  };
  const deny = code => { revoke(code); fail(code); };
  const route = config => {
    if (config?.provider !== permit.provider || config.model !== permit.model || config.maxTokens !== permit.maxTokens
      || config.reasoningEffort !== permit.reasoningEffort) deny('GUARD_ROUTE');
  };
  const position = payload => { active(); if (payload.turn !== 1 || payload.step !== 1) deny('GUARD_POSITION'); payload.signal?.throwIfAborted(); };
  const onAbort = () => revoke('GUARD_CANCELLED');
  signal?.addEventListener('abort', onAbort, { once: true });
  agentCtx.effect(() => async () => {
    revoke('GUARD_UNLOADED'); signal?.removeEventListener('abort', onAbort); await agent.whenIdle();
  }, 'kont.execution-guard');
  agentCtx.on('system-prompt/assemble', async (_assembly, context, next) => {
    active(); if (context.agent !== agent) deny('GUARD_AGENT');
    const assembled = await next(); active();
    if (!Array.isArray(assembled?.tools) || assembled.tools.length !== 0) deny('GUARD_TOOLS');
    return assembled;
  });
  agentCtx.on('agent/pre-step', async (payload, next) => {
    position(payload); if (++steps !== 1) deny('GUARD_POSITION');
    const messages = payload.messages;
    if (!Array.isArray(messages) || messages.length !== 1 || messages[0].role !== 'user'
      || messages[0].source?.kind !== 'user' || messages[0].source.rpcId !== permit.requestId || !text(messages[0].content)
      || messages[0].content.map(part => part.text).join('') !== runPromptText(run.input)) deny('GUARD_INPUT');
    const result = await next(); active(); return result;
  });
  agentCtx.on('agent/request', async (payload, next) => {
    position(payload); if (++proposals !== 1) deny('GUARD_RETRY');
    const config = await next(); active();
    if (!only(config, ['provider', 'model', 'maxTokens', 'reasoningEffort'])) deny('GUARD_CONTROLS'); route(config); return config;
  });
  agentCtx.on('agent/request-error', () => deny('GUARD_RETRY'));
  // llm/stream uses the LLM service carrier, not an Agent scopeTarget. Filter
  // both its exact session address and the official inherited Agent initiator.
  agentCtx.on('llm/stream', (options, next) => {
    const initiator = agentCtx.agents.currentInitiator();
    if (initiator !== agent && options.sessionId !== agent.id) return next();
    active();
    if (initiator !== agent || options.sessionId !== agent.id) deny('GUARD_AGENT');
    route(options);
    if (proposals !== 1 || steps !== 1 || streams !== 0) deny('GUARD_STREAM_LIMIT');
    if (options.tools !== undefined && (!Array.isArray(options.tools) || options.tools.length)) deny('GUARD_TOOLS');
    if (!Array.isArray(options.messages) || !options.messages.every(message => ['user', 'developer', 'system'].includes(message.role)
      && text(message.content))) deny('GUARD_INPUT');
    streams++;
    return (async function* () {
      // One attempted stream consumes this candidate, success or failure.
      try {
        active();
        let authorization;
        try { authorization = await authorizeStream?.(options); }
        catch { deny('GUARD_REQUEST_DENIED'); }
        active(); options.signal?.throwIfAborted();
        authorization?.verify?.();
        // Approval is awaited inside the generator, preserving the synchronous
        // AsyncIterable API while deferring all downstream adapter dispatch.
        const downstream = next();
        for await (const chunk of downstream) {
          active(); options.signal?.throwIfAborted();
          if (!['block-start', 'text-delta', 'block-end', 'usage', 'finish'].includes(chunk?.type)
            || chunk.type === 'block-start' && chunk.blockType !== 'text'
            || chunk.type === 'block-end' && chunk.block?.type !== 'text') deny('GUARD_TOOL_OUTPUT');
          yield chunk;
        }
      } finally { closed = true; }
    })();
  });
  return Object.freeze({ status: () => Object.freeze({ closed, denialCode, proposals, steps, streams, executionAuthorized: false }),
    dispose() {
      if (!disposing) {
        revoke('GUARD_DISPOSED'); signal?.removeEventListener('abort', onAbort);
        // Fail-closed hooks stay installed until the owning Agent scope ends.
        disposing = Promise.resolve(agent.whenIdle());
      }
      return disposing;
    } });
}
