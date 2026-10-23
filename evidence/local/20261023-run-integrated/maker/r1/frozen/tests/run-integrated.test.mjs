import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('official owned AgentLoop/Session integrates guarded synthetic execution and persistent return', t => {
  const child = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['tests/run-integrated-official-worker.cjs'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  const result = JSON.parse(child.stdout.trim());
  t.diagnostic(child.stdout.trim());
  assert.equal(result.realModelCalls, 0);
  assert.equal(result.realModelRunCompleted, false);
  assert.equal(result.fullExecutionAuthorization, false);
  assert.equal(result.returnedEvidenceKind, 'synthetic-test');
  assert.equal(result.providerCalls, 7);
  assert.ok(result.completeOwnedEvents > 6);
  assert.ok(result.checks.includes('external-cancel-timeout-dispose-fence'));
});
