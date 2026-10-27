// Actual installed official runtime components + SYNTHETIC in-memory provider.
// No model endpoint, network, user profile, credentials or persistent Session.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const official = createRequire('D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
(async () => {
  const hostVersion = official('@deepseek-ai/dsh/package.json').version;
  assert.equal(hostVersion, '0.2.1-rc.2');
  const { Context } = official('@deepseek-ai/cordis');
  const { AgentRegistry } = official('@deepseek-ai/dsh-agent');
  const { SessionStore } = official('@deepseek-ai/dsh-session');
  const { SessionProjectionRegistry } = official('@deepseek-ai/dsh-session-projection');
  const { SystemPrompt } = official('@deepseek-ai/dsh-system-prompt');
  const { ToolRuntime } = official('@deepseek-ai/dsh-tools');
  const { LlmRuntime, createUserMessage } = official('@deepseek-ai/dsh-llm');
  const { AgentLoop } = official('@deepseek-ai/dsh-agent-loop');
  const { installRunExecutionGuard } = await import(pathToFileURL(resolve('packages/dsh-plugin/src/run-execution-guard.mjs')).href);
  const { runHash, runPromptText } = await import(pathToFileURL(resolve('packages/dsh-plugin/src/run.mjs')).href);
  const ctx = new Context(); let providerCalls = 0, mode = 'text', providerStarted;
  try {
    new AgentRegistry(ctx); new SessionStore(ctx); new SessionProjectionRegistry(ctx);
    new SystemPrompt(ctx, { includeHarnessIdentity: false }); new ToolRuntime(ctx, {}); new LlmRuntime(ctx);
    ctx.llm.registerAdapter(['synthetic-only'], {
      providerInfo: id => ({ id, name: 'Synthetic test provider; never a network model' }),
      providerRetryPolicy: () => ({ mode: 'normal', maxRetries: 0 }),
      async prepareCall(provider, model) { return { model: { provider, id: model, name: 'synthetic-model', inputModalities: ['text'] },
        async *stream(options) {
          providerCalls++;
          if (mode === 'error') { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SYNTHETIC_ERROR', message: 'synthetic failure' } } }; return; }
          if (mode === 'tool') { yield { type: 'block-start', index: 0, blockType: 'tool-call' }; return; }
          if (mode === 'wait') { providerStarted(); await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true })); options.signal.throwIfAborted(); }
          yield { type: 'block-start', index: 0, blockType: 'text' };
          yield { type: 'text-delta', index: 0, text: 'synthetic guard result' };
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'synthetic guard result' } };
          yield { type: 'finish', reason: { kind: 'completed' } }; } }; },
    });
    new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 });
    const input = { worksiteId: 'synthetic-site', assetId: null, conversationId: null, agentId: null,
      draft: 'synthetic guard input', materials: [], revision: 0, seq: 0 };
    const run = { version: 1, runId: 'run_synthetic_guard', requestId: 'synthetic-guard-request', plannedSessionId: 'synthetic-guard-session',
      targetId: 'synthetic-target', targetSha256: 'a'.repeat(64), createdAt: '2026-10-22T00:00:00Z', status: 'prepared',
      input, inputSha256: runHash(input), receipt: null };
    const approval = { approved: true, runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId,
      inputSha256: run.inputSha256, provider: 'synthetic-only', model: 'synthetic-model', maxTokens: 64 };
    const prompt = data => createUserMessage({ source: { kind: 'user', rpcId: data.requestId }, content: [{ type: 'text', text: runPromptText(data.input) }] });
    let caseIndex = 0;
    async function candidate({ patchApproval, setup, signal, missing = false } = {}) {
      const number = ++caseIndex;
      const data = { ...run, runId: `run_synthetic_guard_${number}`, requestId: `synthetic-request-${number}`, plannedSessionId: `synthetic-guard-${number}` };
      const permit = { ...approval, runId: data.runId, requestId: data.requestId, sessionId: data.plannedSessionId, ...patchApproval };
      let protection;
      const handle = await ctx.agents.create({ sessionId: data.plannedSessionId,
        agentOptions: { provider: approval.provider, model: approval.model, maxTokens: approval.maxTokens },
        setup(agentCtx, agent) {
          protection = installRunExecutionGuard(agentCtx, agent, { run: data, approval: missing ? undefined : permit, hostVersion, signal });
          setup?.(agentCtx, agent);
        } });
      return { handle, guard: protection, run: data };
    }
    const beforeDenied = providerCalls;
    await assert.rejects(candidate({ missing: true }), { code: 'GUARD_APPROVAL' });
    for (const key of ['runId', 'requestId', 'sessionId', 'inputSha256'])
      await assert.rejects(candidate({ patchApproval: { [key]: 'wrong' } }), { code: 'GUARD_APPROVAL' });
    assert.equal(providerCalls, beforeDenied);
    const direct = await candidate();
    assert.throws(() => ctx.agents.withInitiator(direct.handle.agent, () => ctx.llm.stream({
      provider: approval.provider, model: approval.model, maxTokens: 64, sessionId: direct.run.plannedSessionId, messages: [],
    })), { code: 'GUARD_STREAM_LIMIT' });
    assert.equal(providerCalls, beforeDenied);
    await direct.guard.dispose(); await direct.handle.dispose();
    let guard;
    const handle = await ctx.agents.create({ sessionId: run.plannedSessionId,
      agentOptions: { provider: approval.provider, model: approval.model, maxTokens: approval.maxTokens },
      setup(agentCtx, agent) { guard = installRunExecutionGuard(agentCtx, agent, { run, approval, hostVersion }); } });
    handle.agent.followup(createUserMessage({ source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(input) }] }));
    await handle.agent.whenIdle();
    assert.equal(providerCalls, 1); assert.equal(guard.status().streams, 1);
    handle.agent.followup(prompt(run)); await handle.agent.whenIdle();
    assert.equal(providerCalls, 1, 'second turn must not dispatch');
    await guard.dispose(); await handle.dispose();
    const beforeRetained = providerCalls;
    try {
      handle.agent.followup(createUserMessage({ source: { kind: 'user', rpcId: run.requestId }, content: [{ type: 'text', text: runPromptText(input) }] }));
      await handle.agent.whenIdle();
    } catch { /* A disposed official handle may reject the retained call. */ }
    assert.equal(providerCalls, beforeRetained, 'disposed Agent retained reference must not reach synthetic provider');
    for (const setup of [
      scope => scope.on('system-prompt/assemble', async (_a, _c, next) => ({ ...await next(), tools: [{ name: 'synthetic-not-available' }] })),
      scope => scope.on('agent/request', async (_p, next) => ({ ...await next(), provider: 'wrong-provider' })),
      scope => scope.on('agent/request', async (_p, next) => ({ ...await next(), model: 'wrong-model' })),
      scope => scope.on('agent/request', async (_p, next) => ({ ...await next(), maxTokens: 128 })),
    ]) {
      const denied = await candidate({ setup }); const count = providerCalls;
      denied.handle.agent.followup(prompt(denied.run)); await denied.handle.agent.whenIdle();
      assert.equal(providerCalls, count); assert.equal(denied.guard.status().closed, true);
      await denied.guard.dispose(); await denied.handle.dispose();
    }
    const wrongInput = await candidate(); const beforeWrongInput = providerCalls;
    wrongInput.handle.agent.followup(createUserMessage({ source: { kind: 'user', rpcId: 'wrong' }, content: [{ type: 'text', text: 'wrong' }] }));
    await wrongInput.handle.agent.whenIdle(); assert.equal(providerCalls, beforeWrongInput);
    await wrongInput.guard.dispose(); await wrongInput.handle.dispose();
    // A normal retry requester cannot override the guard by following next().
    const retry = ctx.on('agent/request-error', async (_p, next) => await next() ?? { kind: 'retry' });
    for (const providerMode of ['error', 'tool']) {
      mode = providerMode; const guarded = await candidate(); const before = providerCalls;
      guarded.handle.agent.followup(prompt(guarded.run)); await guarded.handle.agent.whenIdle();
      assert.equal(providerCalls, before + 1); assert.equal(guarded.guard.status().streams, 1);
      assert.equal(guarded.guard.status().denialCode, providerMode === 'error' ? 'GUARD_RETRY' : 'GUARD_TOOL_OUTPUT');
      await guarded.guard.dispose(); await guarded.handle.dispose();
    }
    await retry(); mode = 'text';
    // Sibling Agent is not subject to the retained target's scoped protection.
    const sibling = await ctx.agents.create({ sessionId: 'synthetic-sibling', agentOptions: { provider: approval.provider, model: approval.model, maxTokens: 64 } });
    const beforeSibling = providerCalls;
    sibling.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'synthetic sibling' }] }));
    await sibling.agent.whenIdle(); assert.equal(providerCalls, beforeSibling + 1); await sibling.dispose();
    for (const unload of [false, true]) {
      const abort = new AbortController(); mode = 'wait';
      const started = new Promise(resolve => { providerStarted = resolve; });
      const target = await candidate({ signal: abort.signal });
      target.handle.agent.followup(prompt(target.run)); await started;
      const beforeCancel = providerCalls;
      if (unload) await target.handle.dispose(); else { abort.abort(); await target.guard.dispose(); }
      await target.handle.agent.whenIdle();
      // While the Agent is still owned, even explicit retained LLM references
      // cannot dispatch again through this guard.
      if (!unload) assert.throws(() => ctx.agents.withInitiator(target.handle.agent, () => ctx.llm.stream({
        provider: approval.provider, model: approval.model, maxTokens: 64, sessionId: target.run.plannedSessionId, messages: [],
      })), { code: 'GUARD_CLOSED' });
      try { target.handle.agent.followup(prompt(target.run)); await target.handle.agent.whenIdle(); } catch {}
      assert.equal(providerCalls, beforeCancel); assert.equal(target.guard.status().closed, true);
      await target.guard.dispose(); await target.handle.dispose();
    }
    console.log(JSON.stringify({ hostVersion, fixture: 'official-Agent-loop-synthetic-provider', providerCalls,
      checks: ['default-deny', 'binding', 'one-stream', 'tool-free-assembly', 'route-and-token-bound', 'input', 'no-retry', 'tool-output-rejected', 'sibling-isolation', 'cancel', 'unload', 'retained-reference'],
      realModelCalls: 0, realRunCompleted: false, guard: guard.status() }));
  } finally { await ctx.fiber.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
