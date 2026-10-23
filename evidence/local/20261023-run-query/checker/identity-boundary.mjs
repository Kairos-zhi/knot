import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { projectRun } from '../../../../packages/dsh-plugin/src/run-query.mjs';
import { createRunStatusView } from '../../../../packages/dsh-plugin/src/run-status-view.mjs';
const state = JSON.parse(await readFile('evidence/local/20261023-run-live/live/workspace.json', 'utf8'));
const run = structuredClone(state.runs[0]);
run.status = 'prepared'; run.receipt = null; delete run.dispatchClaim;
run.requestId = 'request\n1';
const dto = projectRun(run);
let error;
try { createRunStatusView(dto); } catch (value) { error = value.message; }
assert.equal(error, 'INVALID_RUN_STATUS_PROJECTION');
await writeFile('evidence/local/20261023-run-query/checker/identity-boundary.json', JSON.stringify({
  validStoredRunProjected: true, requestId: dto.requestId, viewRejected: error,
  finding: 'P2: legitimate Run identity accepted by projectRun cannot be consumed by view'
}, null, 2) + '\n');
