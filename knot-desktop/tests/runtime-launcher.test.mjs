import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDevelopment } from '../scripts/dev.mjs';

const launcher = fileURLToPath(new URL('../scripts/dev.mjs', import.meta.url));
async function deadline(promise, milliseconds, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

test('dedicated profile uses the real web-runtime row and rejects invalid ports before boot', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kont-profile-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const prepared = await prepareDevelopment({ KONT_RUNTIME_DIR: dir, KONT_PORT: '0' });
  const overlay = await readFile(join(prepared.profile, 'cordis.patch.yml'), 'utf8');
  assert.match(overlay, /id: web-runtime\n/);
  assert.doesNotMatch(overlay, /id: web-app\n/);
  assert.match(overlay, /openBrowser: false/);
  assert.equal(prepared.home, join(dir, 'dsh-home'));
  await assert.rejects(prepareDevelopment({ KONT_RUNTIME_DIR: dir, KONT_PORT: '-1' }), /Invalid KONT_PORT/);
});

async function launch(runtime) {
  const testEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)));
  const child = fork(launcher, [], {
    env: { ...testEnv, KONT_RUNTIME_DIR: runtime, KONT_PORT: '0', KONT_DEV_IPC: '1', DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  let output = '';
  let exit;
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit); }));
  const instance = {
    child, exited,
    async stop() {
      if (exit) return exit;
      child.send({ type: 'kont:stop' });
      return deadline(exited, 15000, 'DSH graceful shutdown deadline exceeded');
    },
  };
  try {
    await deadline(new Promise((resolve, reject) => {
      child.on('message', message => { if (message?.type === 'kont:ready') resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`DSH exited before ready: ${code}; ${output.replace(/token=[^\s]+/g, 'token=[redacted]')}`)));
    }), 30000, 'DSH readiness deadline exceeded');
    const url = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/)?.[1];
    assert.ok(url, 'DSH prints its own authenticated launch URL');
    assert.doesNotMatch(output, /opening the default browser/, 'no browser is opened by a test launch');
    const response = await fetch(url, { redirect: 'manual' });
    assert.equal(response.status, 303);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    return { ...instance, endpoint: new URL('/kont/api/workspace', url), cookie };
  } catch (error) {
    // Emergency cleanup is only for this test-owned fork; never a passing
    // shutdown proof and never a user development instance.
    try { await instance.stop(); } catch { child.kill(); await exited; }
    throw error;
  }
}

test('Windows same-process DSH normal shutdown releases the store lock and preserves data on restart', { timeout: 90000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kont-runtime-test-'));
  let running;
  t.after(async () => {
    if (running) await running.stop();
    // This directory was created above for this test only; never touches .runtime.
    await rm(dir, { recursive: true, force: true });
  });
  running = await launch(dir);
  const headers = { cookie: running.cookie, 'content-type': 'application/json' };
  const state = await (await fetch(running.endpoint, { headers })).json();
  const saved = await fetch(running.endpoint, { method: 'POST', headers, body: JSON.stringify({ revision: state.revision, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: 'normal-stop-restart-proof' }] }) });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).workspace.worksites[0].draft, 'normal-stop-restart-proof');
  const lock = join(dir, 'data', 'worksites.json.lock');
  await access(lock);
  assert.deepEqual(await running.stop(), { code: 0, signal: null });
  running = undefined;
  await assert.rejects(access(lock), { code: 'ENOENT' });
  running = await launch(dir);
  const restored = await (await fetch(running.endpoint, { headers: { cookie: running.cookie } })).json();
  assert.equal(restored.workspace.worksites[0].draft, 'normal-stop-restart-proof');
  assert.deepEqual(await running.stop(), { code: 0, signal: null });
  running = undefined;
  await assert.rejects(access(lock), { code: 'ENOENT' });
});
