import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { KontStore } from '../../../../packages/dsh-plugin/src/store.mjs';

// A one-card real Desktop verifier. No provider credentials, model calls, DOM,
// screenshots or UI actions; the only renderer operation is a fixed GET pair.
const port = Number(process.argv[2]);
assert(Number.isInteger(port) && port > 1024 && port < 65536);
const base = `http://127.0.0.1:${port}`;
const token = (await readFile('D:/DSH-Desktop/kont-data/agent-token', 'utf8')).trim();
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const stateFile = 'D:/DSH-Desktop/kont-data/worksites.json';
const resultFile = new URL('./real-desktop-verification.json', import.meta.url);
const output = { startedAt: new Date().toISOString(), hostPort: port, fixture: true, modelCalls: 0, checks: [] };
const snapshot = async () => {
  const response = await fetch(`${base}/kont/snapshot`, { headers });
  assert.equal(response.status, 200); return response.json();
};
const command = async body => {
  const response = await fetch(`${base}/kont/command`, { method: 'POST', headers, body: JSON.stringify(body) });
  const value = await response.json(); assert.equal(response.status, 200); assert.equal(value.ok, true); return value;
};

async function fixedRendererRead() {
  const targets = await (await fetch('http://127.0.0.1:19221/json/list')).json();
  const pages = targets.filter(t => t.type === 'page' && t.url.startsWith('dsh-app://app/'));
  assert.equal(pages.length, 1);
  const url = new URL(pages[0].webSocketDebuggerUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '19221');
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  try {
    const expression = `(async()=>{if(location.protocol!=='dsh-app:'||location.hostname!=='app')throw new Error('Wrong origin');const read=async path=>{const r=await fetch(path,{credentials:'same-origin',redirect:'error'});if(!r.ok)throw new Error('Knot read rejected');return r.json()};return {legacy:await read('/kont/api/workspace'),protocol:await read('/kont/snapshot')}})()`;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Renderer read timed out')), 10000);
      socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id !== 1) return; clearTimeout(timer); message.error || message.result.exceptionDetails ? reject(new Error('Renderer read failed')) : resolve(message.result.result.value); });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    return await promise;
  } finally { socket.close(); }
}

const abort = new AbortController();
let reader;
try {
  const initial = await snapshot();
  assert.equal(initial.snapshot.schemaVersion, 4);
  assert.equal(initial.seq, 0); assert.equal(initial.snapshot.assets.length, 0);
  assert.equal((await fetch(`${base}/kont/snapshot`)).status, 401);
  assert.equal((await fetch(`${base}/kont/snapshot`, { headers: { ...headers, authorization: 'Bearer invalid' } })).status, 401);
  assert.equal((await fetch(`${base}/kont/snapshot`, { headers: { ...headers, origin: 'https://invalid.example' } })).status, 403);
  output.checks.push('real Host authentication and Origin negative cases');
  const response = await fetch(`${base}/kont/events?since=0`, { headers, signal: abort.signal });
  assert.equal(response.status, 200); reader = response.body.getReader(); await reader.read();
  const timestamp = new Date().toISOString();
  const block1 = { id: 'desktop-check-block-1', source: 'manual', timestamp, provenance: [], content: '桌面接入验证材料；非模型运行。' };
  const block2 = { id: 'desktop-check-block-2', source: 'manual', timestamp, provenance: ['desktop-check-B'], content: '程序化追加验证；仅验证同内核持久化。' };
  await command({ type: 'knot.create', id: 'desktop-check-A', data: { title: '桌面接入验证 A', summary: block1.content, src: 'local:desktop-verification', chain_id: '', blocks: [block1] }, source: 'forged' });
  await command({ type: 'knot.create', id: 'desktop-check-B', data: { title: '桌面接入验证 B', summary: '连接与断开测试材料；非模型产物。', src: 'local:desktop-verification', chain_id: '' } });
  await command({ type: 'rope.connect', fromId: 'desktop-check-A', toId: 'desktop-check-B', fixed: true });
  assert.equal((await snapshot()).snapshot.edges[0].data.fixed, true);
  await command({ type: 'knot.update', id: 'desktop-check-A', patch: { blocks: [block1, block2] } });
  await command({ type: 'rope.disconnect', fromId: 'desktop-check-A', toId: 'desktop-check-B' });
  await command({ type: 'worksite.update', worksiteId: 'legacy', draft: '桌面接入核验现场（非模型运行）' });
  await command({ type: 'worksite.supply', worksiteId: 'legacy', assetId: 'desktop-check-A', mode: 'connect' });
  await command({ type: 'worksite.supply', worksiteId: 'legacy', assetId: 'desktop-check-B', mode: 'exclude' });
  output.checks.push('real Desktop Host create/connect/append/disconnect and worksite supply/exclusion');
  const final = await snapshot();
  assert.equal(final.seq, 8); assert.equal(final.snapshot.edges.length, 0);
  assert.deepEqual(final.snapshot.assets.find(a => a.id === 'desktop-check-A').blocks, [block1, block2]);
  const site = final.snapshot.workspace.worksites.find(site => site.id === 'legacy');
  assert.equal(final.snapshot.workspace.activeWorksiteId, 'legacy');
  assert.equal(site.draft, '桌面接入核验现场（非模型运行）');
  assert.deepEqual(site.checkedIds, ['desktop-check-A']);
  assert.deepEqual(site.excludedIds, ['desktop-check-B']);
  const before = await readFile(stateFile);
  const stale = await fetch(`${base}/kont/command`, { method: 'POST', headers, body: JSON.stringify({ type: 'knot.update', id: 'desktop-check-A', patch: { title: 'must-not-write' }, baseSeq: 0 }) });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'STALE_REVISION');
  assert.deepEqual(await readFile(stateFile), before);
  output.checks.push('stale write rejected without changing persisted bytes');
  let stream = '';
  while (!stream.includes('"seq":8')) {
    const chunk = await Promise.race([reader.read(), new Promise((_, reject) => setTimeout(() => reject(new Error('SSE timed out')), 10000).unref())]);
    assert.equal(chunk.done, false); stream += new TextDecoder().decode(chunk.value);
  }
  const events = stream.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  assert.deepEqual(events.map(e => e.seq), [1,2,3,4,5,6,7,8]);
  assert(events.every(e => e.source === 'agent:local'));
  output.checks.push('real Host ordered SSE and non-forgeable configured caller source');
  const browser = await fixedRendererRead();
  assert.deepEqual(browser.protocol, final);
  assert.deepEqual(browser.legacy.assets, final.snapshot.assets);
  assert.deepEqual(browser.legacy.workspace, final.snapshot.workspace);
  assert.deepEqual(JSON.parse(before).workspace, final.snapshot.workspace);
  // Reuse the frozen kernel's preview function on the actual same-origin state;
  // do not open another store or infer selection from successful writes alone.
  const preview = KontStore.prototype.preview.call({ read: () => browser.legacy }, 'legacy');
  assert.equal(preview.draft, site.draft);
  assert.deepEqual(preview.materials.map(item => item.id), ['desktop-check-A']);
  assert.deepEqual(preview.materials[0].blocks, [block1, block2]);
  output.checks.push('explicit persisted worksite selection/exclusion and original preview omit excluded B');
  output.checks.push('actual Electron same-origin legacy/protocol reads match Bearer and disk state');
  Object.assign(output, { passed: true, seq: final.seq, fixtureAssetIds: final.snapshot.assets.map(a => a.id), stateSha256: createHash('sha256').update(before).digest('hex'), events: events.map(({ seq, type, source }) => ({ seq, type, source })), finishedAt: new Date().toISOString() });
} catch (error) {
  output.passed = false; output.error = { name: error.name, message: error.message }; process.exitCode = 1;
} finally {
  await reader?.cancel().catch(() => {}); abort.abort();
  await writeFile(resultFile, JSON.stringify(output, null, 2));
}
console.log(JSON.stringify(output));
