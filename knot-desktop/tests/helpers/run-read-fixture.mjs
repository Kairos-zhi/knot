import { KontStore } from '../../packages/dsh-plugin/src/store.mjs';

// SYNTHETIC: helper creates no Agent/Provider/LLM. Session generation uses the
// caller's official installed Session class; ordinary tests also use recorded fixtures.
export async function prepareSyntheticReadRun(file) {
  const store = await new KontStore(file).init();
  await store.command({ type: 'knot.create', id: 'audit-target', data: { title: 'synthetic target', summary: 'synthetic initial content' } });
  await store.command({ type: 'worksite.update', worksiteId: 'legacy', draft: 'synthetic audit prompt' });
  const result = await store.command({ type: 'run.prepare', worksiteId: 'legacy', targetId: 'audit-target',
    requestId: 'synthetic-audit-request', sessionId: 'synthetic-audit-session' });
  if (!result.ok) throw new Error('Synthetic preparation failed');
  return { store, run: result.value };
}

export function syntheticReadEntries(run, promptText) {
  const route = { provider: 'synthetic-provider', model: 'never-called' };
  const message = (id, role, source, text) => ({ id, role, source, content: [{ type: 'text', text }] });
  return [
    ['sandbox/mode', { mode: 'read-only' }],
    ['approval/policy', { policy: 'ask' }],
    ['permission/preset', { preset: 'synthetic-restricted' }],
    ['turn/start', { turn: 1 }],
    ['step/start', { turn: 1, step: 1 }],
    ['system/message', { turn: 1, step: 1, message: message('synthetic-system', 'system', { kind: 'system-prompt' }, 'synthetic system instruction') }, { surfaceOp: 'append' }],
    ['developer/message', { turn: 1, step: 1, message: message('synthetic-developer', 'developer', { kind: 'runtime-context' }, 'synthetic developer instruction') }, { surfaceOp: 'append' }],
    ['user/message', message('synthetic-context', 'user', { kind: 'runtime-context' }, 'synthetic runtime context'), { surfaceOp: 'append' }],
    ['user/message', message('synthetic-prompt', 'user', { kind: 'user', rpcId: run.requestId }, promptText), { surfaceOp: 'append' }],
    ['request/header', { header: { config: { ...route, maxTokens: 64 } }, reason: 'initial', startsSeries: true }],
    ['request/context', { ...route, contextWindow: 8192, systemPromptUpdate: 'in-history' }],
    ['assistant/message', { turn: 1, step: 1, message: message('synthetic-assistant', 'assistant', { kind: 'model', ...route }, 'synthetic-only output'), stream: [] }, { surfaceOp: 'append' }],
    ['step/end', { turn: 1, step: 1 }],
    ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
  ];
}

export function recordedSyntheticEvents(run, promptText) {
  return syntheticReadEntries(run, promptText).map(([type, data, options], seq) => ({ type, seq,
    time: 1792627200000 + seq, data: structuredClone(data), ...options }));
}
