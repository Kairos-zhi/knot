// Independent negative probes. Recorded synthetic events and injected seams only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareSyntheticReadRun, recordedSyntheticEvents } from '../../../../tests/helpers/run-read-fixture.mjs';
import { createDshRunObserver } from '../../../../packages/dsh-plugin/src/dsh-run-read.mjs';
import { runPromptText } from '../../../../packages/dsh-plugin/src/run.mjs';

const runtime = new URL(`synthetic-${Date.now()}/`, import.meta.url); await mkdir(runtime);
const { store, run } = await prepareSyntheticReadRun(fileURLToPath(new URL('state.json', runtime)));
const probes = [];
try {
  const header = { version: 4, id: run.plannedSessionId, isSeeded: false, createdAt: 1792627200000 };
  const events = recordedSyntheticEvents(run, runPromptText(run.input));
  const binding = { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId, inputSha256: run.inputSha256 };
  const calls = { stat: 0, open: 0, read: 0, close: 0 };
  const persistence = {
    async stat() { calls.stat++; return { formatStatus: 'current', header, revision: 'checker-stable', sizeBytes: 4096 }; },
    async open(id, access) {
      calls.open++;
      return { id, access, header, inheritedEventCount: 0,
        async read() { calls.read++; return { events }; }, async close() { calls.close++; } };
    },
  };
  const Session = { create(_id, log) { return {
    requestHeader: () => log.find(event => event.type === 'request/header')?.data.header,
    requestContext: () => log.find(event => event.type === 'request/context')?.data,
    deriveMessages: () => log.filter(event => ['user/message', 'system/message', 'developer/message'].includes(event.type))
      .map(event => event.type === 'user/message' ? event.data : event.data.message),
  }; } };
  const options = { hostVersion: '0.2.1-rc.2', Session, persistence, readRun: () => run,
    authorizeRead: () => ({ allowed: true, binding }) };
  const deny = createDshRunObserver({ ...options, authorizeRead: () => ({ allowed: true, binding: { ...binding, runId: 'foreign' } }) });
  await assert.rejects(deny.observe(run.runId), { code: 'DSH_READ_DENIED' });
  assert.deepEqual(calls, { stat: 0, open: 0, read: 0, close: 0 });
  probes.push('wrong Run binding refuses before persistence');
  const abort = new AbortController();
  await assert.rejects(createDshRunObserver({ ...options, authorizeRead: () => {
    abort.abort(); return { allowed: true, binding };
  } }).observe(run.runId, { signal: abort.signal }), { code: 'DSH_READ_CANCELLED' });
  assert.equal(calls.stat, 0); probes.push('abort during authorization refuses before persistence');
  const opening = persistence.open;
  persistence.open = async (...args) => ({ ...await opening(...args), access: 'write' });
  await assert.rejects(createDshRunObserver(options).observe(run.runId), { code: 'DSH_HANDLE_REFUSED' });
  assert.equal(calls.read, 0); assert.equal(calls.close, 1);
  probes.push('wrong-access acquired handle closes without reading');
  persistence.open = async (...args) => ({ ...await opening(...args), async read() {
    calls.read++; throw new Error('D:/synthetic-private-location/private-body');
  } });
  await assert.rejects(createDshRunObserver(options).observe(run.runId), error =>
    error.code === 'DSH_READ_FAILED' && !String(error).includes('private-body') && !String(error).includes('private-location'));
  assert.equal(calls.close, 2); probes.push('read exception sanitizes body and path while closing');
  persistence.open = opening;
  const first = await createDshRunObserver(options).observe(run.runId);
  assert.equal(first.executionAuthorized, false); assert.equal(first.modelRunVerified, false);
  const approved = createDshRunObserver({ ...options, authorizeRead: () => ({ allowed: true, binding, approvedRequestSha256: first.requestSha256 }) });
  events[6].data.message.content[0].text += ' checker changed developer instruction';
  const changed = await approved.observe(run.runId);
  assert.equal(changed.status, 'request_approval_mismatch'); assert.equal(changed.executionAuthorized, false);
  assert.equal(calls.close, 4);
  assert.equal(JSON.stringify(changed).includes('checker changed developer instruction'), false);
  probes.push('changed developer instruction invalidates prior approval without body output or execution');
} finally { await store.close(); }
const result = { task: 'KONT-RUN-005', role: 'independent Checker', at: new Date().toISOString(),
  verdict: 'PASS', probes, groups: probes.length, syntheticOnly: true, modelRequests: 0,
  officialLibraryProof: 'official-library-result.json (separate actual-library run)' };
await writeFile(new URL('independent-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
