import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareDesktopCandidate, verifyDesktopCandidate } from '../scripts/prepare-desktop-candidate.mjs';
import { createCandidateFixture } from './helpers/desktop-candidate-fixture.mjs';
import { createHttpEventSource } from './helpers/http-event-source.mjs';

const executable = 'D:/DSH-Desktop/app/DeepSeek Harness.exe';
const invoke = (...args) => spawnSync(executable, args, {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 45000,
});

test('official copied current package integrates workstation service, persistence, preview and real SSE reconciliation', async t => {
  const fixture = await createCandidateFixture(t, 'D:/Temp');
  const candidate = await prepareDesktopCandidate({ sourceRoot: fixture.sourceRoot,
    expectedBaseCommit: fixture.expectedBaseCommit, outputDir: resolve(fixture.root, 'candidate') });
  const result = invoke('scripts/verify-desktop-candidate.cjs', candidate.outputDir, candidate.manifestSha256, '--workstation');
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.installedFilesMatched, 26);
  assert.equal(receipt.installedFilesUnchangedAfterWorkstation, true);
  assert.equal(receipt.officialManagerInstall, 'completed-in-isolated-profile');
  assert.equal(receipt.candidateManifestSha256, candidate.manifestSha256);
  assert.equal(receipt.workstation.subscriptionsAfterCleanup, 0);
  assert.equal(receipt.workstation.syntheticDataOnly, true);
  assert.equal(receipt.workstation.actualDshAppTransport, false);
  assert.equal(receipt.workstation.nativeEventSource, false);
  assert.equal(receipt.workstation.reactDOM, false);
  for (const check of ['copied-service-and-renderer', 'draft-echo-and-durable-file',
    'shared-preview-complete-block-and-history', 'external-byte-stream-invalidates-and-blocks',
    'manual-refresh-only-get', 'explicit-save-after-reconciliation', 'component-plugin-and-stream-disposal']) {
    assert.ok(receipt.workstation.checks.includes(check), check);
  }
  assert.equal(receipt.workstation.loaded.length, 3);
  for (const loaded of receipt.workstation.loaded) {
    assert.ok(loaded.path.toLowerCase().startsWith(receipt.workstation.pluginRoot.toLowerCase()));
    assert.match(loaded.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(receipt.modelCalls, 0); assert.equal(receipt.actualDesktopDeployment, false);
  t.diagnostic(JSON.stringify({ fixtureCommit: fixture.expectedBaseCommit, ...receipt }));
  assert.equal((await verifyDesktopCandidate(candidate.outputDir, candidate.manifestSha256)).manifest.files.length, 26);
});

test('worker refuses missing installed roots and repository paths without loading a fallback package', () => {
  const missing = invoke('tests/desktop-workstation-worker.mjs');
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /Explicit installation roots required/);
  const outside = spawnSync(executable, ['tests/desktop-workstation-worker.mjs'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', KONT_INSTALLED_PLUGIN_ROOT: resolve('packages/dsh-plugin'),
      KONT_ISOLATED_PROFILE_ROOT: resolve('.') },
    encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
  assert.notEqual(outside.status, 0); assert.match(outside.stderr, /AssertionError/);
  const flag = invoke('scripts/verify-desktop-candidate.cjs', 'absent', '0'.repeat(64), '--arbitrary-worker');
  assert.notEqual(flag.status, 0); assert.match(flag.stderr, /Usage:/);
});

test('test-only SSE byte bridge preserves UTF8/chunk boundaries, comments and reset inherited identity', async () => {
  const bytes = new TextEncoder().encode(': connected\r\nid: 7\r\ndata: {"seq":7,"text":"中文"}\r\n\r\nevent: reset\r\ndata: {"seq":7,"snapshotRequired":true}\r\n\r\n');
  let aborted = false;
  const transport = async (_url, options) => {
    options.signal.addEventListener('abort', () => { aborted = true; });
    return new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    } }), { headers: { 'content-type': 'text/event-stream' } });
  };
  const bridge = createHttpEventSource(transport, 2000);
  const stream = new bridge.EventSource('http://127.0.0.1/synthetic');
  const events = [];
  stream.onmessage = event => events.push(['message', event]);
  stream.addEventListener('reset', event => { events.push(['reset', event]); stream.close(); });
  await stream.done; await bridge.dispose();
  assert.equal(events.length, 2);
  assert.equal(JSON.parse(events[0][1].data).text, '中文');
  assert.equal(events[0][1].lastEventId, '7'); assert.equal(events[1][1].lastEventId, '7');
  assert.equal(JSON.parse(events[1][1].data).snapshotRequired, true);
  assert.equal(aborted, true);
});

test('historical v1 remains pinned and optional workstation checking refuses it before installation', async () => {
  const candidate = resolve('evidence/local/20261024-desktop-package/candidate');
  const pin = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
  const bytes = await readFile(resolve(candidate, 'manifest.json'));
  assert.equal((await verifyDesktopCandidate(candidate, pin)).manifest.files.length, 25);
  const result = invoke('scripts/verify-desktop-candidate.cjs', candidate, pin, '--workstation');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Workstation integration requires the current inventory/);
  assert.deepEqual(await readFile(resolve(candidate, 'manifest.json')), bytes);
});
