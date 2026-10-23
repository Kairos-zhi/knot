// Official 0.2.1 AgentLoop/Session lifecycle, SYNTHETIC in-memory adapter only.
// No model endpoint, user profile, credentials, persisted DSH session or network.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, rm, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
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
  const { KontStore } = await import(pathToFileURL(resolve('packages/dsh-plugin/src/store.mjs')).href);
  const { createRunExecutor } = await import(pathToFileURL(resolve('packages/dsh-plugin/src/run-executor.mjs')).href);
  const ctx = new Context();
  const dir = await mkdtemp(join(tmpdir(), 'kont-official-integrated-synthetic-'));
  const fixtures = [], checks = [];
  let providerCalls = 0, mode = 'text', providerStarted, beforeOutput;
  const constraints = { provider: 'synthetic-only', model: 'synthetic-model', maxTokens: 64, requestSha256: 'a'.repeat(64) };
  try {
    new AgentRegistry(ctx); new SessionStore(ctx); new SessionProjectionRegistry(ctx);
    new SystemPrompt(ctx, { includeHarnessIdentity: false }); new ToolRuntime(ctx, {}); new LlmRuntime(ctx);
    ctx.llm.registerAdapter(['synthetic-only'], {
      providerInfo: id => ({ id, name: 'Synthetic test provider; never a network model' }),
      providerRetryPolicy: () => ({ mode: 'normal', maxRetries: 0 }),
      async prepareCall(provider, model) { return { model: { provider, id: model, name: 'synthetic-model', inputModalities: ['text'],
        reasoning: { efforts: [{ id: 'off', name: 'Off' }], defaultEffort: 'off' } },
        async *stream(options) {
          const owner = fixtures.find(f => f.run.plannedSessionId === options.sessionId);
          const claim = owner.store.read().runs[0].dispatchClaim;
          const audit = JSON.parse(await readFile(join(owner.config.requestAuditDirectory, `${claim.claimId}.request.json`)));
          assert.equal(audit.receipt.requestSha256, audit.requestSha256);
          assert.deepEqual(audit.request.options.messages, options.messages);
          assert.deepEqual(audit.request.options.toolHistory, options.toolHistory);
          providerCalls++; providerStarted?.();
          if (mode === 'error') { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SYNTHETIC_ERROR', message: 'synthetic failure' } } }; return; }
          if (mode === 'wait') {
            if (!options.signal.aborted) await new Promise(r => options.signal.addEventListener('abort', r, { once: true }));
            options.signal.throwIfAborted();
          }
          await beforeOutput?.();
          yield { type: 'block-start', index: 0, blockType: 'text' };
          yield { type: 'text-delta', index: 0, text: 'synthetic integrated result' };
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'synthetic integrated result' } };
          yield { type: 'finish', reason: { kind: 'completed' } };
        } }; },
    });
    new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 });
    const approveRequest = ({ binding, requestSha256, request, inputBytes }) => {
      assert.equal(request.options.provider, constraints.provider); assert.equal(request.options.model, constraints.model);
      assert.equal(request.options.maxTokens, 64); assert.equal(request.options.reasoningEffort, 'off');
      assert.ok(inputBytes <= 8192);
      return { approved: true, ...binding, requestSha256, provider: constraints.provider, model: constraints.model,
        maxTokens: 64, reasoningEffort: 'off' };
    };
    async function fixture(authorize = ({ binding }) => ({ approved: true, ...binding }), authorizeRequest = approveRequest) {
      const n = fixtures.length + 1, file = join(dir, `state-${n}.json`);
      const store = await new KontStore(file).init();
      const commands = [
        { type: 'knot.create', id: 'target', data: { title: 'synthetic target', summary: 'initial' } },
        { type: 'knot.create', id: 'material', data: { title: 'synthetic source', summary: 'explicit source' } },
        { type: 'worksite.update', worksiteId: 'legacy', draft: 'synthetic integrated prompt' },
        { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'material', mode: 'connect' },
      ];
      for (const command of commands) assert.equal((await store.command(command)).ok, true);
      const { value: run, ok } = await store.command({ type: 'run.prepare', worksiteId: 'legacy', targetId: 'target',
        sessionId: `synthetic-owned-${n}`, requestId: `synthetic-request-${n}` });
      assert.equal(ok, true);
      const config = { ctx, store, hostVersion, createUserMessage, evidenceKind: 'synthetic-test',
        requestAuditDirectory: join(dir, `audit-${n}`), ...(authorize ? { authorize } : {}),
        ...(authorizeRequest ? { authorizeRequest } : {}) };
      const executor = createRunExecutor(config);
      const f = { store, file, run, executor, config, baseline: store.read().assets.find(a => a.id === 'target') };
      fixtures.push(f); return f;
    }
    const call = (f, options = {}) => f.executor.execute({ runId: f.run.runId, constraints, ...options });
    const noOutput = f => {
      assert.equal(f.store.read().runs[0].status, 'prepared');
      assert.deepEqual(f.store.read().assets.find(a => a.id === 'target'), f.baseline);
      assert.equal(ctx.agents.get(f.run.plannedSessionId), undefined, 'owned Agent handle released');
    };
    for (const authorizer of [null, ({ binding }) => ({ approved: true, ...binding, requestId: 'wrong' })]) {
      const f = await fixture(authorizer), count = providerCalls;
      const result = await call(f);
      assert.equal(result.status, 'failed');
      assert.equal(f.store.read().runs[0].dispatchClaim, undefined);
      assert.equal(providerCalls, count); noOutput(f);
    }
    checks.push('default-deny-and-exact-authorization');
    const f = await fixture();
    const observed = [];
    const unobserve = ctx.on('session/event', (session, event) => { if (session.id === f.run.plannedSessionId) observed.push(event); });
    const count = providerCalls;
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => call(f)));
    await unobserve();
    assert.equal(providerCalls, count + 1, JSON.stringify({ concurrent, observed }));
    const returned = concurrent.find(r => r.status === 'returned');
    assert.ok(returned, JSON.stringify({ concurrent, events: observed.map(e => [e.seq, e.type]) }));
    assert.equal(concurrent.filter(r => r.status === 'returned').length, 1);
    assert.equal(returned.run.receipt.evidenceKind, 'synthetic-test');
    assert.equal(returned.executionAuthorized, false);
    const target = f.store.read().assets.find(a => a.id === 'target');
    const generated = target.blocks.filter(b => b.source === 'generated');
    assert.equal(generated.length, 1); assert.deepEqual(generated[0].provenance, ['material']);
    assert.equal(generated[0].content, 'synthetic integrated result');
    assert.equal(ctx.agents.get(f.run.plannedSessionId), undefined);
    await f.executor.dispose(); await f.store.close();
    f.store = await new KontStore(f.file).init();
    f.executor = createRunExecutor({ ...f.config, store: f.store });
    assert.equal((await call(f)).status, 'duplicate');
    assert.equal(providerCalls, count + 1);
    checks.push('actual-terminal-success-atomic-provenance-once', 'concurrent-and-reopen-no-provider-replay');
    mode = 'error';
    const failed = await fixture(), beforeFailure = providerCalls;
    assert.equal((await call(failed)).status, 'failed'); noOutput(failed);
    assert.equal((await call(failed)).status, 'duplicate'); assert.equal(providerCalls, beforeFailure + 1);
    checks.push('official-failed-terminal-no-output-no-retry');
    mode = 'text';
    const cas = await fixture();
    beforeOutput = async () => { assert.equal((await cas.store.command({ type: 'knot.update', id: 'target', patch: { title: 'human change' } })).ok, true); };
    assert.equal((await call(cas)).status, 'failed'); beforeOutput = null;
    assert.equal(cas.store.read().assets.find(a => a.id === 'target').title, 'human change');
    assert.equal(cas.store.read().assets.find(a => a.id === 'target').blocks?.filter(b => b.source === 'generated').length ?? 0, 0);
    checks.push('target-CAS-no-output');
    for (const cancellation of ['external', 'timeout', 'dispose']) {
      mode = 'wait'; const target = await fixture();
      const started = new Promise(r => { providerStarted = r; });
      const abort = new AbortController();
      const pending = call(target, { signal: abort.signal, timeoutMs: cancellation === 'timeout' ? 80 : 3000 });
      await started; const beforeCancel = providerCalls;
      if (cancellation === 'external') abort.abort();
      if (cancellation === 'dispose') await target.executor.dispose();
      const result = await pending;
      assert.equal(result.status, 'cancelled', JSON.stringify(result)); noOutput(target);
      if (cancellation !== 'dispose') assert.equal((await call(target)).status, 'duplicate');
      await target.executor.dispose();
      assert.equal((await call(target)).status, 'closed');
      assert.equal(providerCalls, beforeCancel);
      providerStarted = null;
    }
    checks.push('external-cancel-timeout-dispose-fence', 'retained-executor-reference-closed', 'owned-Agent-handles-released');
    // An unresolved authorizer is bounded by timeout without creating a Session.
    const authWait = await fixture(() => new Promise(() => {}));
    assert.equal((await call(authWait, { timeoutMs: 10 })).status, 'cancelled'); noOutput(authWait);
    assert.equal(authWait.store.read().runs[0].dispatchClaim, undefined);
    checks.push('authorization-timeout-zero-dispatch');
    const requestDenied = await fixture(undefined, null), beforeRequestDeny = providerCalls;
    assert.equal((await call(requestDenied)).status, 'failed');
    assert.equal(providerCalls, beforeRequestDeny); noOutput(requestDenied);
    const requestAbort = new AbortController();
    const delayedApproval = await fixture(undefined, async snapshot => { requestAbort.abort(); return approveRequest(snapshot); });
    assert.equal((await call(delayedApproval, { signal: requestAbort.signal })).status, 'cancelled');
    assert.equal(providerCalls, beforeRequestDeny); noOutput(delayedApproval);
    const requestChanged = await fixture(undefined, snapshot => {
      const agent = ctx.agents.get(snapshot.binding.sessionId);
      agent.session.append('request/header', { header: { config: { ...snapshot.request.requestHeader.config, maxTokens: 63 } }, reason: 'change' });
      return approveRequest(snapshot);
    });
    assert.equal((await call(requestChanged)).status, 'failed');
    assert.equal(providerCalls, beforeRequestDeny); noOutput(requestChanged);
    checks.push('actual-request-default-deny-zero-adapter-stream', 'actual-request-cancelled-approval-zero-adapter-stream');
    checks.push('official-header-change-during-approval-zero-adapter-stream');
    // Fault only the ownership wrapper AFTER the real official disposal. This
    // must not rewrite the already committed business outcome as a failure.
    mode = 'text';
    const cleanup = await fixture(); await cleanup.executor.dispose();
    cleanup.executor = createRunExecutor({ ...cleanup.config, ctx: {
      on: ctx.on.bind(ctx), agents: { create: async options => {
        const owned = await ctx.agents.create(options);
        return { agent: owned.agent, dispose: async () => { await owned.dispose(); throw new Error('synthetic cleanup fault'); } };
      } },
    } });
    const afterCommit = new AbortController();
    cleanup.store.subscribe(event => { if (event.type === 'run.returned') afterCommit.abort(); });
    const cleanupResult = await call(cleanup, { signal: afterCommit.signal });
    assert.equal(cleanupResult.status, 'returned');
    assert.equal(cleanupResult.cleanupFailed, true);
    assert.equal(afterCommit.signal.aborted, true);
    assert.equal(cleanup.store.read().runs[0].status, 'completed');
    assert.equal(ctx.agents.get(cleanup.run.plannedSessionId), undefined);
    cleanup.expectedCleanupFailure = true;
    await assert.rejects(cleanup.executor.dispose(), { code: 'EXECUTOR_CLEANUP' });
    checks.push('cleanup-fault-preserves-committed-return', 'post-commit-abort-preserves-returned');
    // Unlike the case above, this throws BEFORE official release. The executor
    // must not claim its close barrier succeeded. Manually release this isolated
    // fixture only after proving rejection and that the real Agent remains owned.
    const unreleased = await fixture(); await unreleased.executor.dispose();
    let retainedHandle;
    unreleased.executor = createRunExecutor({ ...unreleased.config, ctx: {
      on: ctx.on.bind(ctx), agents: { create: async options => {
        retainedHandle = await ctx.agents.create(options);
        return { agent: retainedHandle.agent, dispose: async () => { throw new Error('synthetic pre-release fault'); } };
      } },
    } });
    const unsafe = await call(unreleased);
    assert.equal(unsafe.status, 'returned'); assert.equal(unsafe.cleanupFailed, true);
    unreleased.expectedCleanupFailure = true;
    await assert.rejects(unreleased.executor.dispose(), { code: 'EXECUTOR_CLEANUP' });
    assert.equal(ctx.agents.get(unreleased.run.plannedSessionId), retainedHandle.agent);
    // The failed barrier did not close storage. No automatic close follows it.
    assert.equal((await unreleased.store.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'fixture remains open' })).ok, true);
    await retainedHandle.dispose();
    assert.equal(ctx.agents.get(unreleased.run.plannedSessionId), undefined);
    await assert.rejects(unreleased.executor.dispose(), { code: 'EXECUTOR_CLEANUP' });
    checks.push('sticky-cleanup-failure-rejects-close-barrier-before-official-release');
    console.log(JSON.stringify({ hostVersion, fixture: 'official-AgentLoop-Session-synthetic-provider', checks,
      providerCalls, realModelCalls: 0, realModelRunCompleted: false, returnedEvidenceKind: returned.run.receipt.evidenceKind,
      completeOwnedEvents: observed.length, fullExecutionAuthorization: false }));
  } finally {
    for (const f of fixtures) {
      if (f.expectedCleanupFailure) await assert.rejects(f.executor.dispose(), { code: 'EXECUTOR_CLEANUP' });
      else await f.executor.dispose();
      // Fault fixtures have been explicitly checked/released above.
      assert.equal(ctx.agents.get(f.run.plannedSessionId), undefined);
      await f.store.close();
    }
    await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
