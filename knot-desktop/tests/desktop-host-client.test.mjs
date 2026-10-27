import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { INSTALL_SPEC, CLIENT_STATUS_EXPRESSION, managerExpression, safeManagerResult, createDesktopManager } from '../scripts/desktop-host-client.mjs';
import { DESKTOP_QUIT_EXPRESSION, connectDesktopManager, requestDesktopQuit } from '../scripts/desktop-host-debug.mjs';

test('installed RPC contract uses exact method, correlated envelope, args and official origin', async () => {
  let request;
  const value = await vm.runInNewContext(managerExpression('pluginManager/inspect', { spec: INSTALL_SPEC }), {
    location: { protocol: 'dsh-app:', hostname: 'app' },
    fetch: async (url, options) => { request = JSON.parse(options.body); assert.equal(url, '/api/pluginManager/inspect'); assert.equal(options.credentials, 'same-origin'); return { ok: true, json: async () => ({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { status: 'accepted' } } }) }; },
  });
  assert.equal(value.status, 'accepted');
  assert.equal(request.type, 'client-request');
  assert.deepEqual(request.payload, { args: { spec: INSTALL_SPEC } });
});

test('denies arbitrary RPC, implicit install, non-reviewed spec, and drifted options', () => {
  assert.throws(() => managerExpression('credentials/describe'));
  assert.throws(() => managerExpression('pluginManager/installBundle', { spec: INSTALL_SPEC }));
  assert.throws(() => managerExpression('pluginManager/inspect', { spec: 'some-other-package' }));
  assert.throws(() => managerExpression('pluginManager/installBundle', { spec: INSTALL_SPEC, options: { replace: true } }, { allowInstall: true }));
  assert.throws(() => managerExpression('pluginManager/listBundles', { extra: true }));
});

test('wrong origin, uncorrelated and rejected response fail without exposing diagnostics', async () => {
  for (const scenario of ['origin', 'rpcId', 'failure']) {
    await assert.rejects(vm.runInNewContext(managerExpression('pluginManager/listPlugins'), {
      location: { protocol: scenario === 'origin' ? 'http:' : 'dsh-app:', hostname: 'app' },
      fetch: async (_url, options) => ({ ok: true, json: async () => ({ type: 'server-response', rpcId: scenario === 'rpcId' ? 'wrong' : JSON.parse(options.body).rpcId, result: { ok: false, error: { message: 'SECRET_SENTINEL' } } }) }),
    }), error => !error.message.includes('SECRET_SENTINEL'));
  }
});

test('safe projection omits pnpm output, paths, registry, error detail and arbitrary metadata', () => {
  const result = safeManagerResult('pluginManager/installBundle', { changed: true, application: 'applied', packageResult: { exitCode: 0, output: 'SECRET_SENTINEL', logPath: 'secret' }, registry: 'https://user:password@example.com', error: { code: 'operation-error', diagnostic: 'SECRET_SENTINEL' } });
  assert.deepEqual(result, { changed: true, application: 'applied', error: { code: 'operation-error' }, packageResult: { exitCode: 0 } });
  assert.equal(JSON.stringify(result).includes('SECRET_SENTINEL'), false);
});

test('install opt-in constructs only reviewed local package with supported options', async () => {
  let expression;
  const manager = createDesktopManager(async e => { expression = e; return { changed: true, application: 'applied' }; }, { allowInstall: true });
  assert.equal((await manager.installBundle()).application, 'applied');
  assert.match(expression, /file:C:\/Users\/x2270/);
  assert.match(expression, /"enabled":true,"saveExact":true/);
  await assert.rejects(createDesktopManager(async () => ({})).installBundle());
});

test('debug clients reject non-loopback and credential-bearing targets before network', async () => {
  for (const endpoint of ['http://localhost:9222', 'http://127.0.0.1:9222/path', 'http://user:pass@127.0.0.1:9222', 'https://127.0.0.1:9222']) await assert.rejects(connectDesktopManager(endpoint));
  for (const endpoint of ['ws://localhost:9229/id', 'ws://127.0.0.1:9229/id?token=sentinel', 'http://127.0.0.1:9229/id']) await assert.rejects(requestDesktopQuit(endpoint));
});

test('renderer receipt reads only fixed registration projection and validates shape', () => {
  const receipt = { module: '@kont/dsh-plugin', version: '0.1.0', active: true, mainRegistered: true, sidebarRegistered: true, secret: 'SECRET_SENTINEL' };
  const context = { location: { protocol: 'dsh-app:', hostname: 'app' }, window: { [Symbol.for('kont.renderer.receipt.v1')]: receipt } };
  const result = vm.runInNewContext(CLIENT_STATUS_EXPRESSION, context);
  assert.equal(result.active, true); assert.equal(result.present, true);
  assert.equal(JSON.stringify(result).includes('SECRET_SENTINEL'), false);
  receipt.mainRegistered = 'true';
  assert.throws(() => vm.runInNewContext(CLIENT_STATUS_EXPRESSION, context), /Invalid Knot/);
});

test('compatibility refusal retains declared DSH requirements without raw diagnostics', () => {
  const result = safeManagerResult('pluginManager/installBundle', { error: { code: 'incompatible-version', diagnostic: 'SECRET_SENTINEL', incompatible: [{ name: '@kont/dsh-plugin', version: '0.1.0', runtimeVersion: '0.2.1-rc.2', requirements: { 'engines.dsh': '>=0.3.0', '@deepseek-ai/dsh-api-remotes': '^0.3.0', arbitrary: 'SECRET_SENTINEL' } }] } });
  assert.deepEqual(result.error.incompatible[0].requirements, { 'engines.dsh': '>=0.3.0', '@deepseek-ai/dsh-api-remotes': '^0.3.0' });
  assert.equal(JSON.stringify(result).includes('SECRET_SENTINEL'), false);
});

test('fixed quit resolves only official Electron path and schedules graceful app.quit', () => {
  let scheduled, calls = 0;
  const result = vm.runInNewContext(DESKTOP_QUIT_EXPRESSION, {
    process: { getBuiltinModule(name) { assert.equal(name, 'module'); return { createRequire(path) { assert.equal(path, 'D:/DSH-Desktop/app/resources/app.asar/lib/main.js'); return spec => { assert.equal(spec, 'electron'); return { app: { quit() { calls++; } } }; }; } }; } },
    setTimeout(callback, delay) { assert.equal(delay, 100); scheduled = callback; },
  });
  assert.equal(result.requested, true); assert.equal(calls, 0);
  scheduled(); assert.equal(calls, 1);
  assert.doesNotMatch(DESKTOP_QUIT_EXPRESSION, /app\.exit|process\.exit|process\.env|import\(/);
});
