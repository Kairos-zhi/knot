import assert from 'node:assert/strict';
import { readFile, writeFile, open, lstat, realpath, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { getInstallationTransportAuthorization, consumeInstallationTransportPermit } from './desktop-install-execution.mjs';
import { validateDesktopInstallExpression } from './desktop-install-transport-policy.mjs';
import { safeManagerResult } from './desktop-host-client.mjs';
import { verifyDesktopCandidate } from './prepare-desktop-candidate.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const anchor = 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json';
const runtime = 'D:/DSH-Desktop/app/resources/runtime/primary-runtime/dependencies';
const fail = code => { const error = new Error(`Quiescent transport refused (${code})`); error.code = code; throw error; };
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
async function absent(path, code) { try { await access(path); fail(code); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()) fail('REDIRECTED_FILE');
  return readFile(path);
}
async function exclusive(path, value) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
}
async function quiescent() {
  await absent('D:/DSH-Desktop/kont-data/worksites.json.lock', 'SOURCE_BUSY');
  // Exclude this RunAsNode helper itself, never start/stop a Desktop process.
  const expression = `@(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${process.pid} }).Count`;
  const count = execFileSync('powershell.exe', ['-NoProfile', '-Command', expression], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
  if (count !== '0') fail('DESKTOP_NOT_QUIESCENT');
}
function factory(isolated) {
  let closed = false, attempted = false, ctx;
  const profile = isolated ? resolve(root, 'profile') : 'D:/DSH-Desktop/home/profiles/desktop';
  return Object.freeze({
    async evaluate(expression, { approval, dispatchPermit } = {}) {
      if (closed || attempted) fail('TRANSPORT_CONSUMED');
      const request = validateDesktopInstallExpression(expression);
      if (request.method !== 'pluginManager/installBundle') fail('INSTALL_ONLY_TRANSPORT');
      const identity = getInstallationTransportAuthorization(approval);
      if (identity.kind !== (isolated ? 'synthetic-test' : 'explicit-user-approval')) fail('EXPLICIT_INSTALL_APPROVAL_REQUIRED');
      if (!isolated && (resolve(root).toLowerCase() !== resolve('C:/Users/x2270/Documents/ChatGPT/KONT').toLowerCase()
        || (await realpath(root)).toLowerCase() !== resolve(root).toLowerCase())) fail('PRODUCTION_MODULE_ROOT_REQUIRED');
      const grant = consumeInstallationTransportPermit(dispatchPermit, approval);
      if (grant.method !== request.method || canonical(grant.args) !== canonical(request.args)) fail('APPROVAL_PAYLOAD_MISMATCH');
      if (isolated) {
        if (dirname(resolve(root)) !== resolve('D:/Temp') || !root.split(/[\\/]/).filter(Boolean).at(-1).startsWith('kont-official-install-test-')) fail('ISOLATED_ROOT_REQUIRED');
      } else await quiescent();
      await verifyDesktopCandidate(resolve(root, 'evidence/local/20261024-desktop-package/candidate'),
        'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8');
      if ((await realpath(profile)).toLowerCase() !== resolve(profile).toLowerCase()) fail('PROFILE_REDIRECTED');
      const ledger = resolve(root, '.runtime/desktop-install', grant.kind);
      if ((await realpath(ledger)).toLowerCase() !== ledger.toLowerCase()) fail('LEDGER_REDIRECTED');
      const claim = JSON.parse(await regular(join(ledger, `${grant.approvalHash}.claim.json`)));
      if (claim.state !== 'reserved' || claim.kind !== grant.kind || claim.approvalHash !== grant.approvalHash
        || claim.requestId !== grant.requestId || claim.descriptorSha256 !== grant.descriptorSha256) fail('DURABLE_APPROVAL_CLAIM_REQUIRED');
      // Separate transport consumption prevents direct callback replay across
      // factory instances. Never delete a crash/uncertainty marker to retry.
      await exclusive(join(ledger, `${grant.approvalHash}.transport.json`), { approvalHash: grant.approvalHash, requestId: grant.requestId, attemptedAt: new Date().toISOString() });
      attempted = true;
      const npmrc = join(ledger, 'empty.npmrc');
      try { await writeFile(npmrc, '', { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; if ((await regular(npmrc)).length) fail('NPM_CONFIG_CHANGED'); }
      const official = createRequire(anchor);
      assert.equal(official('@deepseek-ai/dsh/package.json').version, '0.2.1-rc.2');
      const { Context } = official('@deepseek-ai/cordis');
      const { PluginManager } = official('@deepseek-ai/dsh-plugin-manager');
      if (closed) fail('TRANSPORT_CLOSED');
      ctx = new Context();
      ctx.provide('profileContext', { name: isolated ? 'kont-isolated-upgrade' : 'desktop', dir: profile,
        home: isolated ? root : 'D:/DSH-Desktop/home', cwd: root, installAnchor: anchor,
        startedBundles: [], patchPath: join(profile, 'cordis.patch.yml'), overlays: [],
        packageManager: { command: join(runtime, 'node/bin/node.exe'),
          args: [join(runtime, 'pnpm/bin/pnpm.cjs'), '--offline', '--ignore-scripts', '--config.auto-install-peers=false', '--store-dir', join(ledger, 'pnpm-store')],
          env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP,
            TMP: process.env.TMP, USERPROFILE: root, HOME: root, npm_config_userconfig: npmrc, npm_config_globalconfig: npmrc } } });
      const manager = new PluginManager(ctx, { outputBytes: 32768, lockWaitMs: 1000, inspectTimeoutMs: 10000,
        githubConnectionTimeoutMs: 1000, idleTimeoutMs: 15000, pnpmCommand: 'pnpm', fallbackRegistries: [] });
      if (!isolated) await quiescent();
      if (closed) fail('TRANSPORT_CLOSED');
      getInstallationTransportAuthorization(approval); // Expiry may have elapsed during local preparation.
      // Official manager alone owns profile/package changes. No user plugin
      // loader, HMR, credentials, Session runtime or model is initialized.
      const result = await manager.installBundle(request.args.spec, request.args.options);
      return safeManagerResult(request.method, result);
    },
    async close() { closed = true; await ctx?.fiber.dispose(); },
  });
}
/** Fixed production route, lazy until a privately issued explicit user grant.
 * No profile/source path overrides and no process startup/restart capability. */
export function createQuiescentDesktopInstallTransport() { return factory(false); }
/** Synthetic grants only, module must live in a newly owned D:/Temp test root.
 * Cannot select the real Desktop profile or relabel a synthetic grant as human. */
export function createIsolatedDesktopInstallTransport() { return factory(true); }
