import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KontStore } from '../packages/dsh-plugin/src/store.mjs';
import { dispatchOnce } from '../packages/dsh-plugin/src/run-dispatch.mjs';
import { prepareSyntheticReadRun } from './helpers/run-read-fixture.mjs';

// SYNTHETIC callbacks only: no Agent, Provider, model, or user Session.
const constraints = { provider: 'synthetic', model: 'never-called', maxTokens: 32, requestSha256: 'a'.repeat(64) };
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kont-dispatch-synthetic-'));
  const file = join(dir, 'state.json');
  const { store, run } = await prepareSyntheticReadRun(file);
  const f = { store, run, file, dir };
  t.after(async () => { await f.store.close(); await rm(dir, { recursive: true, force: true }); });
  return f;
}
const invoke = (f, submit, options = {}) => dispatchOnce(f.store, { runId: f.run.runId, constraints, submit, ...options });
async function blockWrites(f) {
  const bytes = await readFile(f.file);
  await rename(f.file, `${f.file}.saved`);
  await mkdir(f.file);
  return async () => {
    assert.deepEqual(await readFile(`${f.file}.saved`), bytes);
    await rm(f.file, { recursive: true });
    await rename(`${f.file}.saved`, f.file);
  };
}

test('SYNTHETIC dispatch: concurrent caller owns the sole callback; accepted is only submitted; reopen refuses replay', async t => {
  const f = await fixture(t);
  let calls = 0;
  const events = [];
  f.store.subscribe(event => events.push(event));
  const submit = async payload => {
    calls++;
    const disk = JSON.parse(await readFile(f.file, 'utf8')).runs[0];
    assert.equal(disk.dispatchClaim.state, 'reserved');
    assert.equal(payload.claim.inputSha256, f.run.inputSha256);
    assert.equal(payload.request.requestId, f.run.requestId);
    payload.claim.constraints.model = 'mutated-copy';
    return { accepted: true };
  };
  const results = await Promise.all(Array.from({ length: 12 }, () => invoke(f, submit)));
  assert.equal(calls, 1);
  assert.equal(results.filter(r => r.acquired).length, 1);
  const run = f.store.read().runs[0];
  assert.equal(run.status, 'prepared');
  assert.equal(run.receipt, null);
  assert.equal(run.dispatchClaim.state, 'submitted');
  assert.equal(run.dispatchClaim.constraints.model, constraints.model);
  assert.equal(events.filter(e => e.type === 'run.dispatch-reserved').length, 1);
  assert.equal(events.filter(e => e.type === 'run.dispatch-settled').length, 1);
  await f.store.close();
  f.store = await new KontStore(f.file).init();
  assert.equal((await invoke(f, submit)).acquired, false);
  assert.equal(calls, 1);
  await assert.rejects(invoke(f, submit, { constraints: { ...constraints, maxTokens: 33 } }), { code: 'RUN_DISPATCH_CONFLICT' });
});

test('SYNTHETIC dispatch: claim write failure invokes no callback, emits no events, and preserves bytes', async t => {
  const f = await fixture(t);
  const restore = await blockWrites(f);
  let calls = 0, events = 0;
  f.store.subscribe(() => events++);
  await assert.rejects(invoke(f, () => { calls++; return { accepted: true }; }));
  assert.equal(calls, 0);
  assert.equal(events, 0);
  assert.equal(f.store.read().runs[0].dispatchClaim, undefined);
  await restore();
});

test('SYNTHETIC dispatch: throwing callback stays uncertain and cannot retry even after reopen', async t => {
  const f = await fixture(t);
  let calls = 0;
  const submit = () => { calls++; throw new Error('secret raw adapter error'); };
  const result = await invoke(f, submit);
  assert.equal(result.outcome, 'uncertain');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  await f.store.close();
  f.store = await new KontStore(f.file).init();
  assert.equal((await invoke(f, submit)).acquired, false);
  assert.equal(calls, 1);
});

test('SYNTHETIC dispatch: timeout consumes reservation; late acceptance cannot update it', async t => {
  const f = await fixture(t);
  let resolve, calls = 0;
  const result = await invoke(f, () => { calls++; return new Promise(r => { resolve = r; }); }, { timeoutMs: 5 });
  assert.equal(result.outcome, 'uncertain');
  resolve({ accepted: true });
  await new Promise(r => setImmediate(r));
  assert.equal((await invoke(f, () => { calls++; })).acquired, false);
  assert.equal(f.store.read().runs[0].dispatchClaim.state, 'uncertain');
  assert.equal(calls, 1);
});

test('SYNTHETIC dispatch: receipt save failure leaves reserved bytes and never resubmits', async t => {
  const f = await fixture(t);
  let restore, calls = 0;
  const result = await invoke(f, async () => { calls++; restore = await blockWrites(f); return { accepted: true }; });
  assert.equal(result.outcome, 'uncertain');
  assert.equal(result.receiptSaved, false);
  assert.equal(f.store.read().runs[0].dispatchClaim.state, 'reserved');
  await restore();
  await f.store.close();
  f.store = await new KontStore(f.file).init();
  assert.equal((await invoke(f, () => { calls++; })).acquired, false);
  assert.equal(calls, 1);
});

test('SYNTHETIC dispatch: restore preserves claim, rejects old export/replacement, ordinary commands cannot dispatch', async t => {
  const f = await fixture(t);
  const before = f.store.snapshot();
  await invoke(f, () => ({ accepted: true }));
  const claim = f.store.read().runs[0].dispatchClaim;
  const omitted = structuredClone(before); delete omitted.runs;
  await f.store.restoreSnapshot(omitted);
  assert.deepEqual(f.store.read().runs[0].dispatchClaim, claim);
  await assert.rejects(f.store.restoreSnapshot(before), { code: 'RUN_RESTORE_CONFLICT' });
  const changed = f.store.snapshot(); changed.runs[0].dispatchClaim.constraints.model = 'other';
  await assert.rejects(f.store.restoreSnapshot(changed));
  await f.store.restoreSnapshot(f.store.snapshot());
  for (const type of ['run.dispatch', 'run.claim', 'run.submit', 'run.settle']) {
    assert.equal((await f.store.command({ type, runId: f.run.runId })).ok, false);
  }
  assert.deepEqual(f.store.read().runs[0].dispatchClaim, claim);
});

test('SYNTHETIC dispatch: old prepared record remains byte compatible; constraints freeze before yielding', async t => {
  const f = await fixture(t);
  const bytes = await readFile(f.file);
  await f.store.close();
  f.store = await new KontStore(f.file).init();
  assert.deepEqual(await readFile(f.file), bytes);
  assert.equal(f.store.read().runs[0].dispatchClaim, undefined);
  const mutable = { ...constraints };
  const pending = invoke(f, () => ({ accepted: true }), { constraints: mutable });
  mutable.maxTokens = 999;
  await pending;
  assert.equal(f.store.read().runs[0].dispatchClaim.constraints.maxTokens, 32);
});

test('SYNTHETIC dispatch: invalid constraints reject before callback or mutation', async t => {
  const f = await fixture(t);
  const bytes = await readFile(f.file);
  for (const changed of [{ extra: true }, { requestSha256: 'bad' }, { provider: '' }, { maxTokens: 0 }]) {
    await assert.rejects(invoke(f, () => assert.fail('must not submit'), { constraints: { ...constraints, ...changed } }));
  }
  assert.deepEqual(await readFile(f.file), bytes);
});
