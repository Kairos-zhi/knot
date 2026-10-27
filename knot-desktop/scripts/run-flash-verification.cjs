// Explicitly authorized RUN-011 operation. Default/check mode never generates.
const { createRequire } = require('node:module');
const { readFile, writeFile, mkdir } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const sha = value => createHash('sha256').update(value).digest('hex');
const root = resolve('evidence/local/20261023-run-live/live');
const credentialFile = 'D:/DSH-Desktop/home/.credentials.yaml';
const authorization = Object.freeze({ model: 'deepseek-flash', provider: 'deepseek-account',
  currency: 'CNY', budget: 3, maxTokens: 256, maxInputBytes: 8192, maxWireBytes: 32768,
  maxGenerationPosts: 1, thinking: 'disabled', peakInputPerMillion: 2, peakOutputPerMillion: 8,
  contextTokenCeiling: 1048576, source: 'user: ds flash 费用上限3元',
  pricingSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/' });
// Pure fail-closed policy over the official adapter's final serialized bytes.
// This intentionally supports only this first-turn text-only verification.
function validateWire(url, options, { approval, prompt, generationPosts = 0 } = {}) {
  const target = new URL(String(url));
  assert.equal(target.origin, 'https://api.deepseek.com');
  assert.equal(target.username + target.password + target.search + target.hash, '');
  const method = options.method ?? 'GET';
  if (method === 'GET' && target.pathname === '/models') return { kind: 'metadata' };
  assert.equal(method, 'POST'); assert.equal(target.pathname, '/anthropic/v1/messages');
  assert.equal(generationPosts, 0, 'Second generation request refused');
  assert.ok(approval?.request?.options, 'Actual complete request must already be approved');
  options.signal?.throwIfAborted();
  assert.equal(typeof options.body, 'string');
  const wireBytes = Buffer.byteLength(options.body);
  assert.ok(wireBytes <= authorization.maxWireBytes);
  const body = JSON.parse(options.body);
  const allowed = ['model', 'stream', 'messages', 'max_tokens', 'thinking', 'system', 'temperature', 'stop_sequences', 'tools'];
  assert.ok(Object.keys(body).every(key => allowed.includes(key)), 'Unknown wire extension refused');
  assert.equal(body.model, authorization.model); assert.equal(body.max_tokens, authorization.maxTokens);
  assert.equal(body.stream, true); assert.deepEqual(body.thinking, { type: 'disabled' });
  if (body.tools !== undefined) assert.deepEqual(body.tools, []);
  assert.ok(Array.isArray(body.messages) && body.messages.length > 0);
  for (const message of body.messages) {
    assert.deepEqual(Object.keys(message).sort(), ['content', 'role']);
    assert.ok(['user', 'system'].includes(message.role));
    assert.ok(Array.isArray(message.content) && message.content.length > 0);
    for (const part of message.content) {
      assert.deepEqual(Object.keys(part).sort(), ['text', 'type']);
      assert.equal(part.type, 'text'); assert.equal(typeof part.text, 'string');
    }
  }
  const actual = approval.request.options;
  assert.equal(actual.model, body.model); assert.equal(actual.maxTokens, body.max_tokens);
  // DSH's first-turn serializer uses the last system snapshot for `system`,
  // concatenates nonempty user blocks, and projects developer text as updates.
  let historySystem;
  const expectedMessages = [];
  for (const message of actual.messages) {
    assert.ok(['system', 'developer', 'user'].includes(message.role));
    const text = message.content.map(part => { assert.equal(part.type, 'text'); return part.text; });
    if (message.role === 'system') {
      assert.equal(expectedMessages.length, 0, 'Later system snapshots are outside this trial');
      historySystem = text.join(''); continue;
    }
    const content = text.filter(Boolean).map(text => ({ type: 'text', text }));
    if (!content.length) continue;
    const role = message.role === 'developer' ? 'system' : 'user';
    if (role === 'system') assert.equal(expectedMessages.at(-1)?.role, 'user');
    if (role === 'user' && expectedMessages.at(-1)?.role === role) expectedMessages.at(-1).content.push(...content);
    else expectedMessages.push({ role, content });
  }
  assert.deepEqual(body.messages, expectedMessages);
  assert.equal(body.system ?? '', [actual.system, historySystem].filter(Boolean).join('\n\n'));
  assert.deepEqual(body.temperature, actual.temperature);
  assert.deepEqual(body.stop_sequences, actual.stop);
  assert.deepEqual(body.messages.filter(message => message.role === 'user')
    .flatMap(message => message.content.map(part => part.text)), [prompt]);
  return { kind: 'generation', wireBytes, wireHash: sha(options.body), body };
}
async function main() {
  const official = createRequire('D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
  const execute = process.argv[2] === '--execute-authorized-once';
  if (!execute && process.argv[2] !== '--check') throw Error('Use --check or --execute-authorized-once');
  assert.equal(official('@deepseek-ai/dsh/package.json').version, '0.2.1-rc.2');
  const { parseCredentialsDocument } = official('@deepseek-ai/dsh-credentials-local');
  const credentialBytes = await readFile(credentialFile);
  const parsed = parseCredentialsDocument(credentialBytes.toString('utf8'), '[Desktop credential store]');
  assert.ok(parsed.records.has('deepseek-account-platform/default'), 'Existing Desktop account required');
  const costCeiling = (authorization.contextTokenCeiling * 2 + authorization.maxTokens * 8) / 1e6;
  assert.ok(costCeiling < authorization.budget);
  if (!execute) { console.log(JSON.stringify({ mode: 'check-only', generationPosts: 0,
    authorization, conservativeModelCostCeilingCny: costCeiling, existingAccountAvailable: true })); return; }
  await mkdir(root, { recursive: true });
  // A crash or uncertain response never grants another attempt. Never delete this marker to retry.
  await writeFile(join(root, 'attempt.json'), JSON.stringify({ authorization, startedAt: new Date().toISOString() }),
    { flag: 'wx', mode: 0o600 });
  const { Context } = official('@deepseek-ai/cordis');
  const { AgentRegistry } = official('@deepseek-ai/dsh-agent');
  const { SessionStore } = official('@deepseek-ai/dsh-session');
  const { SessionProjectionRegistry } = official('@deepseek-ai/dsh-session-projection');
  const { SystemPrompt } = official('@deepseek-ai/dsh-system-prompt');
  const { ToolRuntime } = official('@deepseek-ai/dsh-tools');
  const { LlmRuntime, createUserMessage } = official('@deepseek-ai/dsh-llm');
  const { AgentLoop } = official('@deepseek-ai/dsh-agent-loop');
  const { PlatformAccount } = official('@deepseek-ai/dsh-deepseek-account-platform');
  const providerPlugin = official('@deepseek-ai/dsh-llm-deepseek-account');
  const local = path => import(pathToFileURL(resolve(path)).href);
  const { KontStore } = await local('packages/dsh-plugin/src/store.mjs');
  const { runHash, runPromptText } = await local('packages/dsh-plugin/src/run.mjs');
  const { createRunExecutor } = await local('packages/dsh-plugin/src/run-executor.mjs');
  const ctx = new Context(); let store, executor, run, actualApproval, wireHash, wireBytes;
  let metadataCalls = 0, generationPosts = 0, usage = [], terminal = null, events = [];
  let result, disposalError;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const checked = validateWire(url, options, { approval: actualApproval, prompt: run && runPromptText(run.input), generationPosts });
    if (checked.kind === 'metadata') {
      metadataCalls++; return nativeFetch(url, { ...options, redirect: 'error' });
    }
    const { body } = checked;
    wireBytes = checked.wireBytes; wireHash = checked.wireHash;
    generationPosts++; // Consume synchronously before any await or transport uncertainty.
    await writeFile(join(root, 'wire-request.json'), options.body, { flag: 'wx', mode: 0o600 });
    await writeFile(join(root, 'generation-attempt.json'), JSON.stringify({ generationPosts, wireHash,
      wireBytes, model: body.model, maxTokens: body.max_tokens, conservativeModelCostCeilingCny: costCeiling }), { flag: 'wx' });
    options.signal?.throwIfAborted();
    return nativeFetch(url, { ...options, redirect: 'error' });
  };
  try {
    // Read-only bridge to this same existing account. No login, refresh, grant write or secret output.
    ctx.provide('credentials', { readRecord: async key => key === 'deepseek-account-platform/default'
      ? structuredClone(parsed.records.get(key)) : undefined,
      resolve: async () => undefined, deleteRecord: async () => { throw Error('READ_ONLY_CREDENTIALS'); } });
    ctx.provide('authorization', { registerFlow: () => () => {} }); // No interactive authorization flow is run.
    new PlatformAccount(ctx, { desktopPlatform: 'win32' });
    new AgentRegistry(ctx); new SessionStore(ctx); new SessionProjectionRegistry(ctx);
    new SystemPrompt(ctx, { includeHarnessIdentity: false }); new ToolRuntime(ctx, {}); new LlmRuntime(ctx);
    await providerPlugin.apply(ctx, providerPlugin.Config({ baseURL: 'https://api.deepseek.com/anthropic',
      thinking: 'disabled', reasoningEffort: 'off', maxTokens: 256, retryPolicy: { mode: 'normal', maxRetries: 0 } }));
    const models = await ctx.llm.listModels(authorization.provider);
    assert.ok(models.some(model => model.id === authorization.model));
    new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 });
    store = await new KontStore(join(root, 'workspace.json')).init();
    for (const command of [
      { type: 'knot.create', id: 'flash-target', data: { title: 'Flash真实试跑', summary: '等待单次验证' } },
      { type: 'knot.create', id: 'public-material', data: { title: '公开测试材料', summary: 'Knot把材料、对话和产物关联到同一个工作现场。' } },
      { type: 'worksite.update', worksiteId: 'legacy', draft: '仅根据给定材料，用一句简体中文概括Knot的用途。不使用工具，不扩展事实。' },
      { type: 'worksite.supply', worksiteId: 'legacy', assetId: 'public-material', mode: 'connect' },
    ]) assert.equal((await store.command(command)).ok, true);
    const prepared = await store.command({ type: 'run.prepare', worksiteId: 'legacy', targetId: 'flash-target',
      requestId: 'kont-flash-live-20261023-request-1', sessionId: 'kont-flash-live-20261023-session-1' });
    assert.equal(prepared.ok, true); run = prepared.value;
    ctx.on('session/event', (session, event) => {
      if (session.id !== run.plannedSessionId) return;
      events.push(event); if (event.type === 'turn/end') terminal = event.data.reason?.kind;
    });
    ctx.on('llm/stream', (_options, next) => (async function* () {
      for await (const chunk of next()) { if (chunk.type === 'usage') usage.push(chunk); yield chunk; }
    })());
    executor = createRunExecutor({ ctx, store, hostVersion: '0.2.1-rc.2', createUserMessage,
      evidenceKind: 'dsh-session-log', requestAuditDirectory: join(root, 'request-audits'),
      maxInputBytes: authorization.maxInputBytes, maxOutputTokens: authorization.maxTokens,
      authorize: ({ binding }) => ({ approved: true, ...binding }),
      authorizeRequest: ({ request, requestSha256, binding, inputBytes }) => {
        assert.equal(request.options.provider, authorization.provider); assert.equal(request.options.model, authorization.model);
        assert.equal(request.options.maxTokens, authorization.maxTokens); assert.equal(request.options.reasoningEffort, 'off');
        assert.ok(inputBytes <= authorization.maxInputBytes); assert.equal(requestSha256, runHash(request));
        assert.deepEqual(request.options.messages.filter(message => message.role === 'user')
          .map(message => message.content.map(part => part.text).join('')), [runPromptText(run.input)]);
        actualApproval = { request, requestSha256, binding, inputBytes, authorization, conservativeModelCostCeilingCny: costCeiling };
        return { approved: true, ...binding, requestSha256, provider: authorization.provider,
          model: authorization.model, maxTokens: authorization.maxTokens, reasoningEffort: 'off' };
      } });
    result = await executor.execute({ runId: run.runId, constraints: { provider: authorization.provider,
      model: authorization.model, maxTokens: authorization.maxTokens,
      requestSha256: runHash({ authorization, runId: run.runId, inputSha256: run.inputSha256 }) }, timeoutMs: 60000 });
    await executor.dispose(); executor = null;
    await store.close(); store = await new KontStore(join(root, 'workspace.json')).init();
    const persisted = store.read().runs.find(item => item.runId === run.runId);
    const target = store.read().assets.find(item => item.id === run.targetId);
    const generated = (target.blocks ?? []).filter(block => block.source === 'generated');
    const summary = { result, generationPosts, metadataCalls, wireHash, wireBytes, actualApproval, usage,
      terminal, eventCount: events.length, persistedStatus: persisted.status, generated,
      credentialsUnchanged: sha(await readFile(credentialFile)) === sha(credentialBytes),
      billing: { currency: 'CNY', budget: 3, conservativeModelCostCeilingCny: costCeiling,
        rates: { peakInputPerMillion: 2, peakOutputPerMillion: 8 }, settledInvoiceVerified: false } };
    await writeFile(join(root, 'session-events.json'), JSON.stringify(events, null, 2), { flag: 'wx' });
    await writeFile(join(root, 'result.json'), JSON.stringify(summary, null, 2), { flag: 'wx' });
    assert.equal(summary.credentialsUnchanged, true);
    assert.equal(result.status, 'returned'); assert.equal(generationPosts, 1); assert.equal(terminal, 'completed');
    assert.equal(persisted.status, 'completed'); assert.equal(generated.length, 1);
    assert.deepEqual(generated[0].provenance, ['public-material']);
    console.log(JSON.stringify({ status: 'returned', generationPosts, terminal, output: generated[0].content,
      usage, conservativeModelCostCeilingCny: costCeiling, settledInvoiceVerified: false, reopened: true }));
  } finally {
    if (executor) try { await executor.dispose(); } catch { disposalError = true; }
    if (!disposalError) { await store?.close(); await ctx.fiber.dispose(); }
    globalThis.fetch = nativeFetch;
    if (disposalError) throw Error('UNSAFE_CLEANUP_STORE_RETAINED');
  }
}
module.exports = { validateWire, authorization };
// Electron's run-as-node entry does not consistently set require.main.
if (require.main === module || (process.argv[1] && resolve(process.argv[1]) === __filename)) main().catch(error => {
  // Provider/HTTP errors may include echoed account headers or bearer values.
  // Keep raw exceptions private rather than guessing all credential formats.
  console.error(JSON.stringify({ status: 'failed', code: /^[A-Z_]+$/.test(error.code ?? '') ? error.code : 'RUN_FAILED' }));
  process.exitCode = 1;
});
