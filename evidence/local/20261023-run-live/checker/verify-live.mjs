// Read-only review of the already-completed single attempt. No executor/model imports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, stat, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { KontStore } from '../../../../packages/dsh-plugin/src/store.mjs';
import { runHash, runPromptText, validateRun, inspectDshRun } from '../../../../packages/dsh-plugin/src/run.mjs';

const root = new URL('../../../../', import.meta.url);
const live = new URL('../live/', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, live), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(import.meta.url);
const { validateWire, authorization } = require('../../../../scripts/run-flash-verification.cjs');
for (const role of ['maker', 'runner-maker']) {
  const manifest = JSON.parse(await readFile(new URL(`../${role}/manifest.json`, import.meta.url)));
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(file.path, root));
    assert.equal(bytes.length, file.bytes, file.path); assert.equal(sha(bytes), file.sha256, file.path);
  }
}
const runnerHash = sha(await readFile(new URL('scripts/run-flash-verification.cjs', root)));
assert.equal(runnerHash, 'a97ce9e8113cfeef5f24f444203c8b5ee4f92f05deab7a2dc501b31689b14485');
const process = await readJson('process-receipt.json');
assert.equal(process.exitCode, 0); assert.equal(process.signal, null); assert.equal(process.runnerSha256, runnerHash);
const result = await readJson('result.json');
const attempt = await readJson('attempt.json');
const generation = await readJson('generation-attempt.json');
const events = await readJson('session-events.json');
const stateBytes = await readFile(new URL('workspace.json', live));
const state = JSON.parse(stateBytes);
assert.equal(state.runs.length, 1);
const run = validateRun(state.runs[0]);
assert.deepEqual(result.result.run, run); assert.equal(result.result.status, 'returned');
assert.equal(result.result.cleanupFailed, undefined); assert.equal(run.status, 'completed');
assert.equal(run.dispatchClaim.state, 'submitted'); assert.equal(run.receipt.evidenceKind, 'dsh-session-log');
assert.equal(run.inputSha256, runHash(run.input));
assert.deepEqual(run.input.materials.map(item => item.id), ['public-material']);
assert.equal(events.length, 11); assert.equal(result.eventCount, events.length);
events.forEach((event, seq) => assert.equal(event.seq, seq));
assert.equal(run.receipt.logSha256, runHash(events));
assert.equal(events[run.receipt.startSeq].type, 'turn/start');
assert.equal(events[run.receipt.promptSeq].type, 'user/message');
assert.equal(events[run.receipt.endSeq].type, 'turn/end');
assert.equal(events[run.receipt.endSeq].data.reason.kind, 'completed');
assert.equal(events.at(-1).seq, run.receipt.endSeq);
const user = events.find(event => event.type === 'user/message').data;
assert.equal(user.source.rpcId, run.requestId);
assert.equal(user.content.map(part => part.text).join(''), runPromptText(run.input));
assert.equal(events.some(event => event.type.startsWith('tool/')), false);
const assistant = events.find(event => event.type === 'assistant/message').data;
assert.equal(assistant.turn, 1); assert.equal(assistant.step, 1);
assert.equal(assistant.message.source.kind, 'model');
assert.equal(assistant.message.source.provider, 'deepseek-account');
assert.equal(assistant.message.source.model, 'deepseek-flash');
assert.equal(assistant.message.source.replayState.response.kind, 'deepseek-messages');
const expectedUsage = { inputTokens: 158, outputTokens: 18, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 176 };
assert.deepEqual(assistant.usage, expectedUsage);
assert.equal(result.usage.length, 1); assert.deepEqual(result.usage[0].usage, expectedUsage);
const checked = inspectDshRun(run, { sessionId: run.plannedSessionId, events, kind: 'dsh-session-log' });
assert.equal(checked.outputSha256, run.receipt.outputSha256);
const generated = state.assets.find(asset => asset.id === run.targetId).blocks.filter(block => block.source === 'generated');
assert.equal(generated.length, 1); assert.equal(generated[0].id, run.receipt.blockId);
assert.deepEqual(generated[0].provenance, ['public-material']);
assert.equal(generated[0].content, checked.content); assert.deepEqual(result.generated, generated);

const names = (await readdir(new URL('request-audits/', live))).filter(name => name.endsWith('.request.json'));
assert.equal(names.length, 1); assert.equal(names[0], `${run.dispatchClaim.claimId}.request.json`);
const auditPath = `request-audits/${names[0]}`;
const audit = await readJson(auditPath);
assert.equal(audit.requestSha256, runHash(audit.request));
assert.equal(audit.requestSha256, result.actualApproval.requestSha256);
assert.equal(audit.requestSha256, result.result.requestAudit.requestSha256);
assert.deepEqual(audit.request, result.actualApproval.request);
const binding = { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId,
  inputSha256: run.inputSha256, claimId: run.dispatchClaim.claimId, constraintsSha256: run.dispatchClaim.constraintsSha256 };
assert.deepEqual(audit.request.binding, binding);
assert.deepEqual(audit.receipt, { approved: true, ...binding, requestSha256: audit.requestSha256,
  provider: 'deepseek-account', model: 'deepseek-flash', maxTokens: 256, reasoningEffort: 'off' });
assert.equal(audit.inputBytes, Buffer.byteLength(JSON.stringify(audit.request))); assert.ok(audit.inputBytes <= 8192);
assert.deepEqual(audit.request.requestHeader, events.find(event => event.type === 'request/header').data.header);
assert.deepEqual(audit.request.requestContext, events.find(event => event.type === 'request/context').data);
assert.equal(audit.request.sessionHeader.id, run.plannedSessionId);
assert.ok(Date.parse(audit.approvedAt) <= events.find(event => event.type === 'assistant/message').time);
assert.ok((await stat(new URL(auditPath, live))).mtimeMs <= (await stat(new URL('generation-attempt.json', live))).mtimeMs);
const wire = await readFile(new URL('wire-request.json', live), 'utf8');
const wireCheck = validateWire('https://api.deepseek.com/anthropic/v1/messages', { method: 'POST', body: wire },
  { approval: result.actualApproval, prompt: runPromptText(run.input), generationPosts: 0 });
assert.equal(wireCheck.wireHash, sha(wire)); assert.equal(sha(wire), generation.wireHash);
assert.equal(sha(wire), result.wireHash); assert.equal(Buffer.byteLength(wire), 781);
assert.equal(generation.generationPosts, 1); assert.equal(result.generationPosts, 1);
assert.deepEqual(attempt.authorization, authorization);
assert.equal(result.credentialsUnchanged, true); // Frozen runner's in-memory before/after byte hash assertion; no credential read here.
assert.equal(result.billing.settledInvoiceVerified, false);
assert.equal((1048576 * 2 + 256 * 8) / 1e6, 2.0992); assert.ok(2.0992 < 3);
const peakUsageEstimateCny = (expectedUsage.inputTokens * 2 + expectedUsage.outputTokens * 8) / 1e6;
assert.equal(peakUsageEstimateCny, 0.00046);

const reopened = await new KontStore(fileURLToPath(new URL('workspace.json', live))).init();
try {
  assert.deepEqual(reopened.read(), state);
  assert.equal(reopened.read().runs[0].status, 'completed');
  assert.equal(reopened.read().runs[0].receipt.logSha256, runHash(events));
  assert.equal(reopened.eventsSince(0).reset, true);
} finally { await reopened.close(); }
assert.deepEqual(await readFile(new URL('workspace.json', live)), stateBytes);
await assert.rejects(access(fileURLToPath(new URL('workspace.json.lock', live))), { code: 'ENOENT' });
const review = { task: 'KONT-RUN-011', role: 'independent Checker actual-result verification', at: new Date().toISOString(),
  verdict: 'LIVE_EVIDENCE_PASS', runnerHash, generationPosts: 1, metadataCalls: result.metadataCalls,
  terminal: 'completed', ownedEventCount: events.length, inputTokens: 158, outputTokens: 18,
  cacheReadTokens: 0, totalTokens: 176, generatedBlocks: 1, provenance: generated[0].provenance,
  output: generated[0].content, requestSha256: audit.requestSha256, eventSha256: runHash(events), wireSha256: sha(wire), wireBytes: 781,
  requestApprovedBeforeTransportEvidence: true, observedRoute: { provider: 'deepseek-account', model: 'deepseek-flash' },
  conservativeCostCeilingCny: 2.0992, budgetCny: 3, peakUsageEstimateCny, settledInvoiceVerified: false,
  normalReopenReadback: true, workspaceSha256: sha(stateBytes), workspaceBytesUnchangedByChecker: true, lockNaturallyReleased: true,
  credentialUnchangedBasis: 'Frozen runner result=true from in-memory before/after hash assertion; no credential values read/copied by Checker',
  checkerModelRequests: 0, runningDesktopDeployed: false, dshSessionPersistenceUsed: false };
await writeFile(new URL('live-verification.json', import.meta.url), JSON.stringify(review, null, 2));
console.log(JSON.stringify(review, null, 2));
