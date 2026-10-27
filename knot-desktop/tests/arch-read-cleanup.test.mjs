import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createDshRunObserver, DshReadError, isDshReadCleanupFailure } from '../packages/dsh-plugin/src/dsh-run-read.mjs';
import { bindRunObserver } from '../packages/dsh-plugin/src/run-observer-binding.mjs';
import { prepareSyntheticReadRun, recordedSyntheticEvents } from './helpers/run-read-fixture.mjs';
import { runPromptText } from '../packages/dsh-plugin/src/run.mjs';

const execute = promisify(execFile);
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function readFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-cleanup-read-'));
  const { store, run } = await prepareSyntheticReadRun(join(dir, 'state.json'));
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const events = recordedSyntheticEvents(run, runPromptText(run.input));
  const header = { version: 4, id: run.plannedSessionId, createdAt: 1792627200000, isSeeded: false, delegationDepth: 0 };
  const calls = { close: 0, removal: 0 };
  const behavior = { read: async () => ({ events }), close: async () => {}, remove: async () => {} };
  const options = { hostVersion: '0.2.1-rc.2', readRun: async () => run,
    authorizeRead: binding => ({ allowed: true, binding }),
    Session: { create(_id, replay) { return {
      requestHeader: () => replay.findLast(event => event.type === 'request/header')?.data.header,
      requestContext: () => replay.findLast(event => event.type === 'request/context')?.data,
      deriveMessages: () => replay.filter(event => ['system/message', 'developer/message', 'user/message'].includes(event.type))
        .map(event => event.type === 'user/message' ? event.data : event.data.message),
    }; } },
    persistence: { stat: async () => ({ header, formatStatus: 'current', revision: 'synthetic', sizeBytes: 4096 }),
      open: async id => ({ id, header, access: 'read', inheritedEventCount: 0,
        read: (...args) => behavior.read(...args), close: async () => { calls.close++; return behavior.close(calls.close); } }) },
  };
  let service;
  const bind = () => ({ binding: bindRunObserver({ provide(_name, value) {
    service = value; return async () => { calls.removal++; await behavior.remove(); };
  } }, store, options), service });
  return { store, run, options, behavior, calls, bind };
}

test('actual close failure wins over read failure and cancellation without exposing the raw cause', async t => {
  for (const readFails of [false, true]) {
    const { run, options, behavior, calls } = await readFixture(t);
    const abort = new AbortController();
    if (readFails) behavior.read = async () => { throw new Error('synthetic private read path'); };
    behavior.close = async () => { abort.abort(); throw new Error('synthetic private close path'); };
    await assert.rejects(createDshRunObserver(options).observe(run.runId, { signal: abort.signal }), error => {
      assert.equal(error.code, 'DSH_CLOSE_FAILED'); assert.equal(isDshReadCleanupFailure(error), true);
      assert.doesNotMatch(String(error), /private/); return true;
    });
    assert.equal(calls.close, 1);
  }
});

test('business errors, clean cancellations and caller-forged close codes do not become sticky cleanup failure', async t => {
  for (const mode of ['read', 'cancel', 'forged']) {
    const { run, options, behavior, calls, bind } = await readFixture(t);
    const abort = new AbortController();
    if (mode === 'read') behavior.read = async () => { throw new Error('synthetic read failure'); };
    if (mode === 'cancel') behavior.close = async () => { abort.abort(); };
    if (mode === 'forged') options.persistence.stat = async () => { throw new DshReadError('DSH_CLOSE_FAILED'); };
    const { binding, service } = bind();
    await assert.rejects(service.observe(run.runId, { signal: abort.signal }), error => {
      assert.equal(isDshReadCleanupFailure(error), false);
      assert.equal(error.code, mode === 'cancel' ? 'DSH_READ_CANCELLED' : mode === 'forged' ? 'DSH_CLOSE_FAILED' : 'DSH_READ_FAILED');
      return true;
    });
    const first = binding.dispose(); assert.equal(binding.dispose(), first); await first;
    assert.equal(calls.removal, 1); assert.equal(calls.close, mode === 'forged' ? 0 : 1);
  }
});

test('completed close failure stays sticky after its observation has left the pending set', async t => {
  const { run, behavior, calls, bind } = await readFixture(t);
  behavior.close = async () => { throw new Error('synthetic close failure'); };
  const { binding, service } = bind();
  await assert.rejects(service.observe(run.runId), { code: 'DSH_CLOSE_FAILED' });
  await settle();
  const first = binding.dispose(); assert.equal(binding.dispose(), first);
  await assert.rejects(first, { code: 'DSH_OBSERVER_DISPOSE_FAILED' });
  await assert.rejects(binding.dispose(), { code: 'DSH_OBSERVER_DISPOSE_FAILED' });
  await assert.rejects(service.observe(run.runId), { code: 'DSH_OBSERVER_CLOSED' });
  assert.equal(calls.close, 1); assert.equal(calls.removal, 1);
});

test('dispose drains all mixed observations before rejecting and never retries close or removal', async t => {
  const { run, behavior, calls, bind } = await readFixture(t);
  const entered = deferred(), release = deferred();
  behavior.close = async ordinal => {
    if (calls.close === 2) entered.resolve();
    await release.promise;
    if (ordinal === 1) throw new Error('synthetic close failure');
  };
  const { binding, service } = bind();
  const observations = [service.observe(run.runId), service.observe(run.runId)]
    .map(promise => promise.then(() => 'resolved', error => error.code));
  await entered.promise;
  const disposal = binding.dispose(); assert.equal(binding.dispose(), disposal);
  let finished = false; const result = disposal.then(() => 'resolved', error => error.code).finally(() => { finished = true; });
  await settle(); assert.equal(finished, false);
  release.resolve();
  assert.deepEqual(await Promise.all(observations), ['DSH_CLOSE_FAILED', 'DSH_READ_CANCELLED']);
  assert.equal(await result, 'DSH_OBSERVER_DISPOSE_FAILED');
  assert.equal(calls.close, 2); assert.equal(calls.removal, 1);
});

test('failed service removal still waits for an acquired handle to close', async t => {
  const { run, behavior, calls, bind } = await readFixture(t);
  const entered = deferred(), release = deferred();
  behavior.close = async () => { entered.resolve(); await release.promise; };
  behavior.remove = async () => { throw new Error('synthetic private removal'); };
  const { binding, service } = bind();
  const observation = service.observe(run.runId).catch(error => error.code);
  await entered.promise;
  let finished = false;
  const disposal = binding.dispose().then(() => 'resolved', error => error.code).finally(() => { finished = true; });
  await settle(); assert.equal(finished, false);
  release.resolve(); assert.equal(await observation, 'DSH_READ_CANCELLED');
  assert.equal(await disposal, 'DSH_OBSERVER_DISPOSE_FAILED');
  assert.equal(calls.close, 1); assert.equal(calls.removal, 1);
});

// A failed plugin disposal deliberately retains its private Store FileHandle.
// Keep that synthetic fixture in a child process: assertions precede child exit,
// then the OS releases only those test handles before the parent removes its dir.
const pluginProbe = `
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { apply } from ${JSON.stringify(new URL('../packages/dsh-plugin/src/index.mjs', import.meta.url).href)};
import { prepareSyntheticReadRun, recordedSyntheticEvents } from ${JSON.stringify(new URL('./helpers/run-read-fixture.mjs', import.meta.url).href)};
import { runPromptText } from ${JSON.stringify(new URL('../packages/dsh-plugin/src/run.mjs', import.meta.url).href)};
const directory = process.argv[1], mode = process.argv[2];
const file = join(directory, 'worksites.json'), lock = file + '.lock';
const exists = async () => { try { await access(lock); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const fixture = await prepareSyntheticReadRun(file); const run = fixture.run; await fixture.store.close();
const events = recordedSyntheticEvents(run, runPromptText(run.input));
const header = { version: 4, id: run.plannedSessionId, createdAt: 1792627200000, isSeeded: false, delegationDepth: 0 };
const boot = join(directory, 'boot'), session = join(directory, 'session');
await mkdir(boot); await mkdir(session);
await writeFile(join(boot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '0.2.1-rc.2' }));
await writeFile(join(session, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-session', version: '0.2.1-rc.2', main: 'index.cjs' }));
await writeFile(join(session, 'index.cjs'), 'module.exports.Session={create(_id,replay){return {requestHeader:()=>replay.findLast(e=>e.type==="request/header")?.data.header,requestContext:()=>replay.findLast(e=>e.type==="request/context")?.data,deriveMessages:()=>replay.filter(e=>["system/message","developer/message","user/message"].includes(e.type)).map(e=>e.type==="user/message"?e.data:e.data.message)}}}');
const entered = deferred(), release = deferred();
const calls = { close: 0, stat: 0, open: 0, provided: 0, removed: 0 };
const effects = new Map(); let inject;
const closeFailure = mode === 'scope-close-failure' || mode === 'storage-close-failure';
const metadata = { packageOf(name) { const dir = name === '@deepseek-ai/dsh-app-boot' ? boot : session;
  return { name, version: '0.2.1-rc.2', dir, manifestPath: join(dir, 'package.json') }; } };
const persistence = {
  stat: async () => { calls.stat++; return { header, formatStatus: 'current', revision: 'synthetic', sizeBytes: 4096 }; },
  open: async id => { calls.open++; return { id, header, access: 'read', inheritedEventCount: 0,
    read: async () => ({ events }), close: async () => { calls.close++; entered.resolve(); await release.promise;
      if (closeFailure) throw new Error('synthetic close failure'); } }; },
};
const scope = (name, behavior = {}) => {
  const own = { effects: new Map(), service: null, provided: 0, removed: 0,
    get: key => key === 'pluginPackages' ? metadata : key === 'sessionPersistence' ? persistence : undefined,
    provide(_key, value) { if (behavior.collision) throw new Error('synthetic pre-existing owner');
      own.service = value; own.provided++; calls.provided++;
      return async () => { own.removed++; calls.removed++;
        if (behavior.waitRemoval) { entered.resolve(); await release.promise; }
        if (behavior.failRemoval) throw new Error('synthetic unprovide failure'); }; },
    effect(fn, key) { if (behavior.failEffect) throw new Error('synthetic effect registration failure'); own.effects.set(key, fn()); },
  }; return own;
};
const first = scope('first', {
  failRemoval: mode === 'scope-unprovide-failure' || mode === 'init-owned-cleanup-failure',
  failEffect: mode === 'init-owned-cleanup-failure',
  waitRemoval: mode === 'pending-rebind' || mode === 'storage-closing-rebind',
  collision: mode === 'registration-collision',
});
const ctx = { connection: { requestRejection() {} }, webServer: { register: () => () => {} }, get: first.get,
  effect(fn, key) { const cleanup = fn(); if (key) effects.set(key, cleanup); },
  inject(_names, callback) { inject = callback; return { await: () => callback(first) }; },
};
process.env.KONT_DATA_DIR = directory; process.env.KONT_AGENT_TOKEN = 'synthetic-cleanup-test-token-never-a-secret';
const config = { readAudit: { enabled: true, grants: closeFailure ? [{ runId: run.runId, requestId: run.requestId,
  sessionId: run.plannedSessionId, inputSha256: run.inputSha256 }] : [] } };
if (mode === 'init-owned-cleanup-failure' || mode === 'registration-collision') {
  await assert.rejects(apply(ctx, config));
  assert.equal(await exists(), mode === 'init-owned-cleanup-failure');
  if (mode === 'init-owned-cleanup-failure') {
    await assert.rejects(effects.get('kont-worksite.storage')(), { code: 'DSH_OBSERVER_DISPOSE_FAILED' });
    assert.equal(calls.provided, 1); assert.equal(calls.removed, 1);
  } else { assert.equal(calls.provided, 0); assert.equal(calls.removed, 0); }
} else {
  await apply(ctx, config);
  const storage = effects.get('kont-worksite.storage'), releaseScope = first.effects.get('kont-worksite.read-audit');
  if (closeFailure) {
    const observation = first.service.observe(run.runId).catch(error => error.code);
    await entered.promise;
    const failure = mode === 'scope-close-failure' ? releaseScope() : storage();
    const refused = assert.rejects(failure, { code: 'DSH_OBSERVER_DISPOSE_FAILED' });
    release.resolve(); assert.equal(await observation, 'DSH_CLOSE_FAILED'); await refused;
    const one = storage(); assert.equal(storage(), one);
    await assert.rejects(one, { code: 'DSH_OBSERVER_DISPOSE_FAILED' });
    assert.equal(calls.close, 1); assert.equal(calls.removed, 1); assert.equal(await exists(), true);
    await assert.rejects(first.service.observe(run.runId), { code: 'DSH_OBSERVER_CLOSED' });
  } else if (mode === 'scope-unprovide-failure') {
    await assert.rejects(releaseScope(), { code: 'DSH_OBSERVER_DISPOSE_FAILED' });
    const second = scope('second');
    await assert.rejects(inject(second), { code: 'DSH_OBSERVER_OWNER_BUSY' });
    assert.equal(second.provided, 0);
    const one = storage(); assert.equal(storage(), one);
    await assert.rejects(one, { code: 'DSH_OBSERVER_DISPOSE_FAILED' });
    assert.equal(calls.removed, 1); assert.equal(await exists(), true);
  } else {
    const second = scope('second');
    if (mode === 'clean-rebind') { await releaseScope(); await inject(second); }
    else if (mode === 'pending-rebind') {
      const disposing = releaseScope(); await entered.promise;
      await assert.rejects(inject(second), { code: 'DSH_OBSERVER_OWNER_BUSY' }); assert.equal(second.provided, 0);
      release.resolve(); await disposing; await inject(second);
    } else if (mode === 'storage-closing-rebind') {
      const disposing = storage(); await entered.promise;
      await assert.rejects(inject(second), { code: 'DSH_OBSERVER_CLOSED' }); assert.equal(second.provided, 0);
      release.resolve(); await disposing;
      await assert.rejects(inject(second), { code: 'DSH_OBSERVER_CLOSED' });
    }
    await storage(); assert.equal(await exists(), false);
    assert.equal(calls.stat, 0); assert.equal(calls.open, 0);
    assert.equal(calls.provided, mode === 'storage-closing-rebind' ? 1 : 2);
    assert.equal(calls.removed, calls.provided);
  }
}
console.log(JSON.stringify({ mode, calls, lockRemains: await exists(), syntheticOnly: true }));
process.exit(0);
`;

for (const mode of ['scope-close-failure', 'storage-close-failure', 'scope-unprovide-failure',
  'clean-rebind', 'pending-rebind', 'storage-closing-rebind', 'init-owned-cleanup-failure', 'registration-collision']) {
  test(`plugin ownership barrier: ${mode}`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'kont-cleanup-plugin-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', pluginProbe, directory, mode],
      { timeout: 15000, windowsHide: true });
    const result = JSON.parse(stdout.trim());
    assert.equal(result.mode, mode); assert.equal(result.syntheticOnly, true);
  });
}
