import { createHash, randomUUID } from 'node:crypto';
import { getBlocks, nextBlockId } from '../lib/knot-model.js';
import { isRecord, reject, normalizeSnapshot } from './kernel.mjs';

const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(value, (_, item) => isRecord(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const runHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const identity = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const exact = (value, keys) => isRecord(value) && Object.keys(value).every(key => keys.includes(key));
const check = (condition, message, code = 'INVALID_RUN') => { if (!condition) reject(code, message); };
const nullableIdentity = value => value === null || identity(value);

/** Explicit supply only. Historical provenance never expands this list. */
export function compileRunInput(state, worksiteId) {
  const site = state.workspace.worksites.find(item => item.id === worksiteId);
  check(site, 'Worksite does not exist', 'NOT_FOUND');
  const materials = site.checkedIds.filter(id => !site.excludedIds.includes(id)).map(id => {
    const asset = state.assets.find(item => item.id === id);
    check(asset, 'Supply reference does not exist', 'MISSING_REFERENCE');
    const material = { id, title: asset.title, summary: asset.summary, blocks: clone(getBlocks(asset)) };
    return { ...material, sha256: runHash(material) };
  });
  return { worksiteId: site.id, assetId: site.assetId, conversationId: site.conversationId,
    agentId: site.agentId, draft: site.draft, materials, revision: state.revision, seq: state.seq };
}

/** This text is the submitted user prompt, not the complete model-visible context. */
export const runPromptText = input => canonical({ draft: input.draft,
  checked: input.materials.map(({ sha256, ...material }) => material) });

/** Pure wire adaptation; never invokes DSH, selects a model, or retries. */
export function dshPromptRequest(run) {
  validateRun(run);
  return { requestId: run.requestId, sessionId: run.plannedSessionId, mode: 'queue',
    content: [{ type: 'text', text: runPromptText(run.input) }] };
}

function validateInput(input) {
  check(exact(input, ['worksiteId', 'assetId', 'conversationId', 'agentId', 'draft', 'materials', 'revision', 'seq']), 'Invalid input fields');
  check(identity(input.worksiteId) && nullableIdentity(input.assetId) && nullableIdentity(input.conversationId)
    && nullableIdentity(input.agentId) && typeof input.draft === 'string' && input.draft.length <= 50000, 'Invalid input identity/draft');
  check(Number.isSafeInteger(input.revision) && input.revision >= 0 && Number.isSafeInteger(input.seq) && input.seq >= 0, 'Invalid input revision');
  check(Array.isArray(input.materials) && input.materials.length <= 500, 'Invalid input materials');
  const assets = input.materials.map(material => {
    check(exact(material, ['id', 'title', 'summary', 'blocks', 'sha256']), 'Invalid material fields');
    const { sha256, ...content } = material;
    check(sha256 === runHash(content), 'Material digest mismatch');
    check(Array.isArray(material.blocks), 'Invalid material blocks');
    return { ...content, src: '', chain_id: '' };
  });
  normalizeSnapshot({ assets, edges: [] });
}

export function validateRun(run) {
  check(exact(run, ['version', 'runId', 'requestId', 'plannedSessionId', 'targetId', 'targetSha256', 'createdAt', 'status', 'input', 'inputSha256', 'receipt']), 'Unknown run fields');
  check(run.version === 1 && identity(run.runId) && identity(run.requestId) && identity(run.plannedSessionId)
    && identity(run.targetId) && /^[a-f0-9]{64}$/.test(run.targetSha256) && typeof run.createdAt === 'string'
    && Number.isFinite(Date.parse(run.createdAt)), 'Invalid run identity');
  validateInput(run.input);
  check(run.inputSha256 === runHash(run.input), 'Input digest mismatch');
  check(run.status === 'prepared' || run.status === 'completed', 'Unknown run status');
  if (run.status === 'prepared') check(run.receipt === null, 'Prepared run cannot contain a terminal receipt');
  else {
    const r = run.receipt;
    check(exact(r, ['sessionId', 'turn', 'startSeq', 'promptSeq', 'endSeq', 'logSha256', 'outputSha256', 'blockId', 'evidenceKind'])
      && r.sessionId === run.plannedSessionId && identity(r.blockId)
      && ['dsh-session-log', 'synthetic-test'].includes(r.evidenceKind), 'Invalid run receipt');
    check(Number.isSafeInteger(r.turn) && r.turn > 0 && Number.isSafeInteger(r.startSeq) && r.startSeq >= 0
      && Number.isSafeInteger(r.promptSeq) && r.promptSeq > r.startSeq
      && Number.isSafeInteger(r.endSeq) && r.endSeq > r.promptSeq
      && /^[a-f0-9]{64}$/.test(r.logSha256) && /^[a-f0-9]{64}$/.test(r.outputSha256), 'Invalid receipt sequence/digest');
  }
  return clone(run);
}

export function validateRuns(value) {
  check(Array.isArray(value) && value.length <= 200, 'Invalid runs collection');
  const runs = value.map(validateRun);
  check(new Set(runs.map(run => run.runId)).size === runs.length && new Set(runs.map(run => run.requestId)).size === runs.length,
    'Duplicate run/request identity');
  return runs;
}

export function prepareRun(state, command) {
  check(exact(command, ['type', 'requestId', 'sessionId', 'worksiteId', 'targetId', 'baseSeq']), 'Unknown preparation fields');
  check(identity(command.requestId) && identity(command.sessionId) && identity(command.worksiteId) && identity(command.targetId), 'Explicit request/session/worksite/target identities required');
  const runs = state.runs ?? [];
  const existing = runs.find(run => run.requestId === command.requestId);
  if (existing) {
    check(existing.plannedSessionId === command.sessionId && existing.targetId === command.targetId && existing.input.worksiteId === command.worksiteId,
      'Request identity already names another preparation', 'RUN_REQUEST_CONFLICT');
    return { value: clone(existing) };
  }
  const target = state.assets.find(asset => asset.id === command.targetId);
  check(target, 'Target does not exist', 'NOT_FOUND');
  const input = compileRunInput(state, command.worksiteId);
  const run = { version: 1, runId: `run_${randomUUID()}`, requestId: command.requestId,
    plannedSessionId: command.sessionId, targetId: command.targetId, targetSha256: runHash(target),
    createdAt: new Date().toISOString(), status: 'prepared', input, inputSha256: runHash(input), receipt: null };
  state.runs = [...runs, validateRun(run)];
  return { value: clone(run), event: { type: 'run.prepared', runId: run.runId, requestId: run.requestId } };
}

const textContent = content => {
  check(Array.isArray(content) && content.length > 0 && content.every(part => exact(part, ['type', 'text'])
    && part.type === 'text' && typeof part.text === 'string'), 'Only complete text content is supported', 'RUN_EVIDENCE_UNSUPPORTED');
  return content.map(part => part.text).join('');
};

/** Internal trust boundary: complete contiguous log supplied by an adapter, not HTTP.
 * This validates correlation, not authenticity. No adapter is connected in this card.
 * Only one human message in one completed, text-only, tool-free turn is supported.
 */
export function inspectDshRun(run, evidence) {
  validateRun(run);
  check(exact(evidence, ['sessionId', 'events', 'kind']) && evidence.sessionId === run.plannedSessionId
    && ['dsh-session-log', 'synthetic-test'].includes(evidence.kind), 'Wrong session/evidence kind', 'RUN_EVIDENCE_MISMATCH');
  check(Array.isArray(evidence.events) && evidence.events.length > 0 && evidence.events.length <= 10000, 'Complete log required', 'RUN_EVIDENCE_INVALID');
  let open = null, matched = null, turnCount = 0;
  const supportedEvents = new Set(['turn/start', 'turn/end', 'step/start', 'step/end', 'user/message', 'assistant/message',
    'request/header', 'request/context', 'developer/message', 'system/message', 'agent/inbox/spliced',
    'working-directory/change', 'sandbox/mode', 'approval/policy', 'model/selection', 'permission/preset',
    'agent-preset/selected', 'session/title']);
  for (const [index, event] of evidence.events.entries()) {
    check(isRecord(event) && event.seq === index && Number.isSafeInteger(event.time) && typeof event.type === 'string'
      && isRecord(event.data), 'Noncontiguous or invalid log', 'RUN_EVIDENCE_INVALID');
    const d = event.data;
    check(supportedEvents.has(event.type), 'Unsupported event/context mutation', 'RUN_EVIDENCE_UNSUPPORTED');
    if (event.type === 'turn/start') {
      check(open === null && ++turnCount === 1 && d.turn === 1, 'Only a fresh Session first turn is supported', 'RUN_EVIDENCE_UNSUPPORTED');
      open = { turn: d.turn, startSeq: index, promptSeq: null, users: 0, text: [], unsupported: false, matched: false, step: null, lastStep: 0 };
    } else if (event.type === 'step/start') {
      check(open !== null && open.step === null && d.turn === open.turn && d.step === open.lastStep + 1,
        'Invalid step start', 'RUN_EVIDENCE_INVALID');
      open.step = d.step; open.lastStep = d.step;
    } else if (event.type === 'step/end') {
      check(open !== null && open.step !== null && d.turn === open.turn && d.step === open.step,
        'Invalid step end', 'RUN_EVIDENCE_INVALID');
      open.step = null;
    } else if (event.type === 'user/message') {
      check(open !== null && open.step !== null, 'Message outside step', 'RUN_EVIDENCE_INVALID');
      open.users++;
      check(d.role === 'user', 'Invalid user role', 'RUN_EVIDENCE_MISMATCH');
      if (d.source?.kind === 'user' && d.source.rpcId === run.requestId) {
        check(matched === null && !open.matched && textContent(d.content) === runPromptText(run.input), 'Request/input mismatch or duplicate admission', 'RUN_EVIDENCE_MISMATCH');
        open.matched = true; open.promptSeq = index;
      }
    } else if (event.type === 'assistant/message') {
      check(open !== null && open.step !== null && d.turn === open.turn && d.step === open.step
        && d.message?.role === 'assistant' && d.message.source?.kind === 'model', 'Assistant turn/source mismatch', 'RUN_EVIDENCE_MISMATCH');
      if (d.interrupted || !open.matched) open.unsupported = true;
      open.text.push(textContent(d.message.content));
    } else if (event.type === 'agent/inbox/spliced') {
      check(Array.isArray(d.inserted) && d.inserted.every(message => message.role === 'user'
        && message.source?.kind === 'user' && message.source.rpcId === run.requestId
        && textContent(message.content) === runPromptText(run.input)), 'Foreign queued input is unsupported', 'RUN_EVIDENCE_UNSUPPORTED');
    }
    else if (event.type === 'turn/end') {
      check(open !== null && open.step === null && d.turn === open.turn, 'Mismatched turn end', 'RUN_EVIDENCE_INVALID');
      if (open.matched) {
        check(matched === null && open.users === 1 && !open.unsupported && d.reason?.kind === 'completed'
          && open.text.length > 0 && open.text.join('\n').trim(), 'No complete supported successful output', 'RUN_NOT_COMPLETED');
        matched = { ...open, endSeq: index, content: open.text.join('\n') };
      }
      open = null;
    }
  }
  check(matched !== null && open === null, 'Run has no balanced completed evidence', 'RUN_NOT_COMPLETED');
  check(matched.content.length <= 50000, 'Output exceeds block limit', 'RUN_EVIDENCE_UNSUPPORTED');
  return { sessionId: evidence.sessionId, turn: matched.turn, startSeq: matched.startSeq,
    promptSeq: matched.promptSeq, endSeq: matched.endSeq, logSha256: runHash(evidence.events),
    outputSha256: runHash(matched.content), evidenceKind: evidence.kind, content: matched.content,
    timestamp: new Date(evidence.events[matched.endSeq].time).toISOString() };
}

/** Applied inside the existing store transaction. Does not execute a model. */
export function returnRun(state, runId, evidence, applyCommand) {
  const run = state.runs?.find(item => item.runId === runId);
  check(run, 'Unknown run', 'NOT_FOUND');
  const output = inspectDshRun(run, evidence);
  if (run.status === 'completed') {
    check(run.receipt.logSha256 === output.logSha256 && run.receipt.evidenceKind === output.evidenceKind,
      'Run already returned with different evidence', 'RUN_RETURN_CONFLICT');
    return { value: clone(run) };
  }
  const target = state.assets.find(asset => asset.id === run.targetId);
  check(target && runHash(target) === run.targetSha256, 'Target changed or disappeared; explicit reconciliation required', 'RUN_TARGET_CHANGED');
  const blocks = clone(getBlocks(target));
  const blockId = nextBlockId(blocks);
  blocks.push({ id: blockId, source: 'generated', timestamp: output.timestamp,
    provenance: run.input.materials.map(material => material.id), content: output.content });
  const updated = applyCommand(state, { type: 'knot.update', id: run.targetId, patch: { blocks, summary: blocks[0]?.content ?? target.summary } });
  const { content, timestamp, ...receipt } = output;
  run.status = 'completed'; run.receipt = { ...receipt, blockId };
  return { value: clone(run), events: [updated.event, { type: 'run.returned', runId, targetId: run.targetId, blockId,
    evidenceKind: output.evidenceKind, inputSha256: run.inputSha256, outputSha256: output.outputSha256 }] };
}
