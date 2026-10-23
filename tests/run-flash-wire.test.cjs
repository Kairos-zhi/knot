const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { validateWire, authorization } = require('../scripts/run-flash-verification.cjs');
const endpoint = 'https://api.deepseek.com/anthropic/v1/messages';
function fixture() {
  const request = { options: { model: 'deepseek-flash', maxTokens: 256, reasoningEffort: 'off',
    messages: [{ role: 'system', content: [{ type: 'text', text: 'public system' }] },
      { role: 'user', content: [{ type: 'text', text: 'public prompt' }] }] } };
  const body = { model: 'deepseek-flash', max_tokens: 256, stream: true,
    thinking: { type: 'disabled' }, system: 'public system',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'public prompt' }] }], tools: [] };
  return { request, body, check(bodyValue = body, policy = {}) {
    return validateWire(endpoint, { method: 'POST', body: JSON.stringify(bodyValue) },
      { approval: { request }, prompt: 'public prompt', ...policy });
  } };
}
test('wire content binds complete approved first-turn text and peak cost stays under grant', () => {
  const f = fixture();
  assert.equal(f.check().kind, 'generation');
  assert.equal((authorization.contextTokenCeiling * authorization.peakInputPerMillion
    + authorization.maxTokens * authorization.peakOutputPerMillion) / 1e6, 2.0992);
  for (const change of [b => b.system = 'injected', b => b.messages.push({ role: 'assistant', content: [] }),
    b => b.messages[0].content[0].text = 'changed', b => b.max_tokens = 257,
    b => b.tools = {}, b => b.metadata = {}, b => b.thinking.budget_tokens = 1000]) {
    const body = structuredClone(f.body); change(body); assert.throws(() => f.check(body));
  }
});
test('missing approval, replay, cancelled signal and oversized wire all fail before transport', () => {
  const f = fixture();
  assert.throws(() => f.check(f.body, { approval: null }));
  assert.throws(() => f.check(f.body, { generationPosts: 1 }));
  const cancelled = AbortSignal.abort();
  assert.throws(() => validateWire(endpoint, { method: 'POST', signal: cancelled, body: JSON.stringify(f.body) },
    { approval: { request: f.request }, prompt: 'public prompt' }));
  const large = structuredClone(f.body); large.system = 'x'.repeat(32769);
  assert.throws(() => f.check(large));
});
test('metadata permits only exact account models URL and refuses alternate destinations', () => {
  assert.deepEqual(validateWire('https://api.deepseek.com/models', {}), { kind: 'metadata' });
  for (const url of ['https://api.deepseek.com/models?secret=1', 'https://user:pass@api.deepseek.com/models',
    'https://api.deepseek.com/models#x', 'https://elsewhere.example/models', 'https://api.deepseek.com/balance'])
    assert.throws(() => validateWire(url, {}));
});
test('official 0.2.1 serializer reaches intercepted fetch and passes the same wire policy offline', () => {
  const worker = String.raw`
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const official = createRequire('D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
    const { DeepSeekAdapter } = official('@deepseek-ai/dsh-llm-deepseek');
    const { validateWire } = require('./scripts/run-flash-verification.cjs');
    const options = { provider:'deepseek-account',model:'deepseek-flash',maxTokens:256,reasoningEffort:'off',
      system:'base system', tools:[], messages:[
        {role:'system',content:[{type:'text',text:'public system'}]},
        {role:'user',content:[{type:'text',text:'public prompt'}]},
        {role:'developer',content:[{type:'text',text:'public runtime context'}]}] };
    const connection={baseURL:'https://api.deepseek.com/anthropic',defaults:{thinking:'disabled',reasoningEffort:'off'},models:[{id:'deepseek-flash'}]};
    let calls=0;
    globalThis.fetch=async (url, init)=>{calls++;validateWire(url,init,{approval:{request:{options}},prompt:'public prompt'});throw Error('OFFLINE_INTERCEPTED');};
    const adapter=new DeepSeekAdapter({options:()=>connection,resolveAuth:async()=>({headers:{},dispose(){}}),resolveUserId:()=> 'synthetic-public-user',prepareExtensions:async()=>({fields:{},accept:async()=>{}})});
    (async()=>{try{for await(const chunk of adapter.request(options,connection,new AbortController().signal,()=>{})) {}}catch(error){assert.equal(error.message,'OFFLINE_INTERCEPTED');}assert.equal(calls,1);console.log('official serializer intercepted: network=0 credentials=0');})().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  const result = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['-e', worker],
    { cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /network=0 credentials=0/);
});

