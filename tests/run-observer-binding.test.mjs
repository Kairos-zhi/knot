import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bindRunObserver } from '../packages/dsh-plugin/src/run-observer-binding.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';
import { apply } from '../packages/dsh-plugin/src/index.mjs';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';

test('host binding registers on real Cordis, defaults to no read, and retained references reject after disposal', async () => {
  const { Context } = await import(pathToFileURL(resolve('D:/dsh-sandbox/node_modules/@deepseek-ai/cordis/lib/index.js')).href);
  const dir = await mkdtemp(join(tmpdir(), 'kont-observer-binding-'));
  const { store, run } = await prepareSyntheticReadRun(join(dir, 'state.json'));
  const ctx = new Context();
  try {
    let io = 0;
    const binding = bindRunObserver(ctx, store, { hostVersion: '0.2.1-rc.2', Session: { create() {} },
      persistence: { async open() { io++; }, async stat() { io++; } } });
    const reference = ctx.kontRunObserver;
    assert.equal(typeof reference.observe, 'function'); assert.equal(io, 0);
    await assert.rejects(reference.observe(run.runId), { code: 'DSH_READ_DENIED' });
    assert.equal(io, 0);
    await binding.dispose(); await binding.dispose();
    assert.equal(ctx.get('kontRunObserver'), undefined);
    await assert.rejects(reference.observe(run.runId), { code: 'DSH_OBSERVER_CLOSED' });
    assert.equal(io, 0);
  } finally { await ctx.fiber.dispose(); await store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('host readRun override cannot replace the plugin store; external cancellation still propagates', async () => {
  const { Context } = await import(pathToFileURL(resolve('D:/dsh-sandbox/node_modules/@deepseek-ai/cordis/lib/index.js')).href);
  const dir = await mkdtemp(join(tmpdir(), 'kont-observer-same-store-'));
  const { store, run } = await prepareSyntheticReadRun(join(dir, 'state.json'));
  const ctx = new Context(); let binding;
  try {
    let overridden = 0, reads = 0, authorized;
    binding = bindRunObserver(ctx, store, { hostVersion: '0.2.1-rc.2', Session: { create() {} },
      readRun: () => { overridden++; throw new Error('must not be used'); },
      authorizeRead: actual => { authorized = actual; return { allowed: true, binding: actual }; },
      persistence: { async open() { reads++; }, async stat() { reads++; throw new Error('synthetic read stops here'); } } });
    await assert.rejects(ctx.kontRunObserver.observe(run.runId), { code: 'DSH_READ_FAILED' });
    assert.equal(overridden, 0); assert.equal(reads, 1);
    assert.deepEqual(authorized, { runId: run.runId, requestId: run.requestId,
      sessionId: run.plannedSessionId, inputSha256: run.inputSha256 });
    const abort = new AbortController(); abort.abort();
    await assert.rejects(ctx.kontRunObserver.observe(run.runId, { signal: abort.signal }), { code: 'DSH_READ_CANCELLED' });
    assert.equal(reads, 1);
  } finally { await binding?.dispose(); await ctx.fiber.dispose(); await store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('async service removal is awaited and rejected removal is sanitized', async () => {
  let finishRemoval, finished = false;
  const gate = new Promise(resolve => { finishRemoval = resolve; });
  const binding = bindRunObserver({ provide: () => async () => { await gate; throw new Error('synthetic private path'); } }, { read() {} });
  const disposed = binding.dispose().finally(() => { finished = true; });
  const refused = assert.rejects(disposed, error => error.code === 'DSH_OBSERVER_DISPOSE_FAILED' && !String(error).includes('private path'));
  await Promise.resolve(); assert.equal(finished, false);
  finishRemoval(); await refused; assert.equal(finished, true);
});

test('real Cordis service collision releases the plugin store lock even when registration fails', async () => {
  const { Context } = await import(pathToFileURL(resolve('D:/dsh-sandbox/node_modules/@deepseek-ai/cordis/lib/index.js')).href);
  const dir = await mkdtemp(join(tmpdir(), 'kont-observer-registration-failure-'));
  const oldDirectory = process.env.KONT_DATA_DIR, oldToken = process.env.KONT_AGENT_TOKEN;
  process.env.KONT_DATA_DIR = dir; process.env.KONT_AGENT_TOKEN = 'synthetic-registration-token-000000000000000';
  const ctx = new Context();
  try {
    ctx.provide('connection', { requestRejection: () => undefined });
    ctx.provide('webServer', { register: () => () => {} });
    const existing = { owner: 'synthetic-existing-owner' };
    ctx.provide('kontRunObserver', existing);
    await assert.rejects(apply(ctx));
    await assert.rejects(access(join(dir, 'worksites.json.lock')), { code: 'ENOENT' });
    assert.equal(ctx.kontRunObserver, existing);
    const reopened = await new KontStore(join(dir, 'worksites.json')).init(); await reopened.close();
  } finally {
    await ctx.fiber.dispose();
    if (oldDirectory === undefined) delete process.env.KONT_DATA_DIR; else process.env.KONT_DATA_DIR = oldDirectory;
    if (oldToken === undefined) delete process.env.KONT_AGENT_TOKEN; else process.env.KONT_AGENT_TOKEN = oldToken;
    await rm(dir, { recursive: true, force: true });
  }
});
