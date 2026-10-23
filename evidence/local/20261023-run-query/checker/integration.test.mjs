import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { projectRun } from '../../../../packages/dsh-plugin/src/run-query.mjs';
import { createRunStatusView } from '../../../../packages/dsh-plugin/src/run-status-view.mjs';
import { createProtocolHandler } from '../../../../packages/dsh-plugin/src/index.mjs';

test('projectRun DTO integrates with view for every phase and historical output needs no current asset', async () => {
  // Reuse only the saved, previously accepted Run record; no executor or model.
  const state = JSON.parse(await readFile('evidence/local/20261023-run-live/live/workspace.json', 'utf8'));
  const completed = state.runs.find(run => run.status === 'completed');
  assert.ok(completed);
  const prepared = structuredClone(completed);
  prepared.status = 'prepared'; prepared.receipt = null; delete prepared.dispatchClaim;
  const cases = [[prepared, 'prepared'], [completed, 'completed']];
  for (const claimState of ['reserved', 'submitted', 'uncertain']) {
    const value = structuredClone(prepared);
    value.dispatchClaim = { ...structuredClone(completed.dispatchClaim), state: claimState };
    cases.push([value, claimState === 'submitted' ? 'submitted' : 'uncertain']);
  }
  for (const [run, phase] of cases) {
    const dto = projectRun(run), view = createRunStatusView(dto);
    assert.equal(Object.keys(dto).length, 8);
    assert.equal(view.phase, phase);
    assert.equal(view.outputReference?.blockId ?? null, phase === 'completed' ? completed.receipt.blockId : null);
    assert.equal(Object.hasOwn(dto, 'input'), false);
    assert.equal(Object.hasOwn(dto, 'dispatchClaim'), false);
    assert.equal(Object.hasOwn(view, 'action'), false);
  }
  // Only Run receipt enters this projection; current asset presence is not asserted.
  assert.match(createRunStatusView(projectRun(completed)).nextStep, /若已移除/);
  prepared.requestId = 'request\n1';
  assert.equal(createRunStatusView(projectRun(prepared)).phase, 'prepared');
});

test('unauthenticated Run paths reject before any snapshot read', async () => {
  let reads = 0;
  const handler = createProtocolHandler({ read() { reads++; throw new Error('must not read'); } },
    { requestRejection: () => 401 }, { agentToken: 'synthetic-checker-token-012' });
  try {
    for (const url of ['/kont/runs', '/kont/runs/%ZZ', '/kont/runs/private']) {
      let status;
      await handler({ method: 'GET', url, headers: {}, socket: {} },
        { writeHead(code) { status = code; }, end() {} });
      assert.equal(status, 401);
    }
    assert.equal(reads, 0);
  } finally { handler.dispose(); }
});

const files = [];
for (const line of ['maker-a', 'maker-b']) {
  const manifest = JSON.parse(await readFile(`evidence/local/20261023-run-query/${line}/manifest.json`, 'utf8'));
  for (const expected of manifest.files) {
    const bytes = await readFile(expected.path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const match = bytes.length === expected.bytes && sha256 === expected.sha256;
    files.push({ line, path: expected.path, bytes: bytes.length, sha256, match });
    assert.equal(match, true, expected.path);
  }
}
await writeFile('evidence/local/20261023-run-query/checker/hash-check.json', JSON.stringify({ task: 'KONT-RUN-012', checkedAt: new Date().toISOString(), matched: files.length, mismatch: 0, files }, null, 2) + '\n');
