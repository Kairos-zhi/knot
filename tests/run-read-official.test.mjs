import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('actual official Electron Session + JSONL synthetic fixture persists, point-reads and replays request audit without model calls', () => {
  const child = spawnSync('D:/DSH-Desktop/app/DeepSeek Harness.exe', ['tests/run-read-official-worker.cjs'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.fixture, 'official-library-generated-synthetic-session');
  assert.equal(result.hostVersion, '0.2.1-rc.2'); assert.equal(result.physicalBytesUnchanged, true);
  assert.equal(result.expectedRequestSha256, result.actualRequestSha256);
  assert.equal(result.handlesClosed, result.observeCalls);
  assert.equal(result.executionAuthorized, false); assert.equal(result.modelRequests, 0);
  assert.equal(result.realRunCompleted, false); assert.equal(result.knotBytesUnchanged, true);
  assert.equal(result.bindingChecks.samePluginStore, true); assert.equal(result.bindingChecks.registrationReads, 0);
  assert.equal(result.bindingChecks.functionConfigRejected, true); assert.equal(result.bindingChecks.serializedConfigLoaded, true);
  assert.equal(result.bindingChecks.configSnapshotDetached, true);
  assert.equal(result.bindingChecks.serviceRemoved, true);
  assert.equal(result.bindingChecks.inFlightCancelled, true); assert.equal(result.bindingChecks.handleCloseBeforeStoreClose, true);
  assert.equal(result.bindingChecks.retainedReferenceClosed, true);
  assert.equal(result.packageResolution.actualDesktopProfileResolution, false);
});
