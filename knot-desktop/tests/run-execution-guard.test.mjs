import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('official Agent setup and scoped runtime hooks constrain a synthetic provider', () => {
  const child = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['tests/run-guard-official-worker.cjs'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.providerCalls, 6); assert.equal(result.guard.executionAuthorized, false);
  assert.equal(result.realModelCalls, 0); assert.equal(result.realRunCompleted, false);
});
