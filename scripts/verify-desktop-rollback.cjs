// Run only with the installed official Electron in ELECTRON_RUN_AS_NODE mode.
// Installs into a newly created isolated profile, never the running Desktop.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, readFile, writeFile, rm, access, lstat, realpath } = require('node:fs/promises');
const { resolve, join, dirname, relative, isAbsolute } = require('node:path');
const { spawnSync } = require('node:child_process');
const { runInNewContext } = require('node:vm');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const anchor = 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json';
const runtime = 'D:/DSH-Desktop/app/resources/runtime/primary-runtime/dependencies';

async function verifyDesktopRollback(rollbackRoot, expectedManifestSha256) {
  const root = resolve(rollbackRoot);
  const { verifyDesktopRollback: verifyInventory } = await import(pathToFileURL(resolve('scripts/prepare-desktop-rollback.mjs')).href);
  const { manifest } = await verifyInventory(root, expectedManifestSha256);
  assert.equal(manifest.format, 'kont-desktop-directory-rollback/v1');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 200);
  assert.equal(new Set(manifest.files.map(file => file.path)).size, manifest.files.length);
  for (const file of manifest.files) {
    assert.match(file.path, /^packages\/(desktop-bundle|dsh-plugin)\/(?:package\.json|cordis\.patch\.yml|(?:src|lib)\/[a-zA-Z0-9._/-]+)$/);
    assert.ok(!file.path.split('/').some(part => part === '..' || part === '.'));
    const path = join(root, file.path), info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink());
    assert.equal((await realpath(path)).toLowerCase(), resolve(path).toLowerCase());
    const artifact = await readFile(path);
    assert.equal(artifact.length, file.bytes); assert.equal(hash(artifact), file.sha256);
  }
  const bundleDir = join(root, 'packages/desktop-bundle');
  const pluginDir = join(root, 'packages/dsh-plugin');
  const bundle = JSON.parse(await readFile(join(bundleDir, 'package.json'), 'utf8'));
  const plugin = JSON.parse(await readFile(join(pluginDir, 'package.json'), 'utf8'));
  assert.equal(bundle.name, '@kont/desktop-bundle'); assert.equal(plugin.name, '@kont/dsh-plugin');
  assert.equal(bundle.dependencies['@kont/dsh-plugin'], 'file:../dsh-plugin');
  const official = createRequire(anchor);
  assert.equal(official('@deepseek-ai/dsh/package.json').version, '0.2.1-rc.2');
  const { Context } = official('@deepseek-ai/cordis');
  const { PluginManager } = official('@deepseek-ai/dsh-plugin-manager');
  const dir = await mkdtemp('D:/Temp/kont-rollback-manager-');
  const ctx = new Context();
  const configFile = join(dir, 'empty.npmrc');
  try {
    await writeFile(configFile, '');
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'kont-rollback-isolated-profile', private: true,
      dsh: { profile: { bundles: [] } } }));
    await writeFile(join(dir, 'cordis.patch.yml'), '[]\n');
    const environment = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
      TEMP: dir, TMP: dir, USERPROFILE: dir, HOME: dir,
      npm_config_userconfig: configFile, npm_config_globalconfig: configFile };
    ctx.provide('profileContext', { name: 'kont-rollback-isolated', dir, home: dir,
      cwd: root, installAnchor: anchor, startedBundles: [], patchPath: join(dir, 'cordis.patch.yml'), overlays: [],
      packageManager: { command: join(runtime, 'node/bin/node.exe'),
        args: [join(runtime, 'pnpm/bin/pnpm.cjs'), '--offline', '--config.auto-install-peers=false',
          '--ignore-scripts', '--store-dir', join(dir, 'pnpm-store')], env: environment } });
    const manager = new PluginManager(ctx, { outputBytes: 32768, lockWaitMs: 1000, inspectTimeoutMs: 10000,
      githubConnectionTimeoutMs: 1000, idleTimeoutMs: 15000, pnpmCommand: 'pnpm', fallbackRegistries: [] });
    const inspected = await manager.inspect(`file:${bundleDir}`);
    assert.equal(inspected.status, 'accepted', JSON.stringify(inspected));
    const installed = await manager.installBundle(`file:${bundleDir}`, { enabled: false, requestId: 'isolated-rollback-check' });
    assert.equal(installed.application, 'restart-required', JSON.stringify(installed));
    assert.equal(installed.restartReason, 'no-hmr');
    assert.equal(installed.bundle, '@kont/desktop-bundle');
    assert.equal(installed.packageResult.exitCode, 0);
    const profileRequire = createRequire(join(dir, 'package.json'));
    const installedBundle = profileRequire.resolve('@kont/desktop-bundle/package.json');
    const installedPlugin = createRequire(installedBundle).resolve('@kont/dsh-plugin/package.json');
    const pluginPath = dirname(installedPlugin);
    for (const path of [dirname(installedBundle), pluginPath]) {
      const canonical = await realpath(path), inside = relative(await realpath(dir), canonical);
      assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Installed package must be copied inside temporary profile');
    }
    for (const file of manifest.files) {
      const path = file.path.replace(/^packages\/(desktop-bundle|dsh-plugin)\//, '');
      const installedPath = file.path.startsWith('packages/desktop-bundle/') ? dirname(installedBundle) : pluginPath;
      const installedBytes = await readFile(join(installedPath, path));
      assert.equal(installedBytes.length, file.bytes, file.path);
      assert.equal(hash(installedBytes), file.sha256, file.path);
    }
    const application = spawnSync(process.execPath, [resolve('tests/desktop-compat-worker.cjs')], {
      env: { ...environment, ELECTRON_RUN_AS_NODE: '1', KONT_PLUGIN_ENTRY: join(pluginPath, 'src/index.mjs') },
      encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(application.status, 0, application.stderr || application.stdout);
    const applied = JSON.parse(application.stdout.trim());
    const code = await readFile(join(pluginPath, 'lib/client.js'), 'utf8');
    let definition;
    const effects = [], registrations = [], style = { removed: false, remove() { this.removed = true; } };
    const window = { __ModuleLoader__: { load(value) { definition = value; } }, addEventListener() {}, removeEventListener() {} };
    runInNewContext(code, { window, document: { createElement: () => style, head: { appendChild() {} } } });
    assert.equal(definition.id, '@kont/dsh-plugin');
    const entry = definition.factory(name => { assert.equal(name, 'react'); return {}; });
    entry.apply({ effect: fn => effects.push(fn()), slots: { inject: (_name, fn) => fn(),
      register: (spec, component) => { registrations.push({ spec, component }); return () => {}; } } });
    assert.equal(registrations.some(row => row.spec.name === 'main' && row.spec.key === 'kont'), true);
    effects.reverse().forEach(dispose => dispose()); assert.equal(style.removed, true);
    await assert.rejects(access(join(dir, 'compatibility.json')), { code: 'ENOENT' });
    return { version: applied.version, officialManagerInspect: inspected.status,
      officialManagerInstall: 'completed-in-isolated-profile', application: installed.application,
      enabled: false, runtimeApply: applied.checks, rendererModuleAndSlots: true,
      packageCopied: true, installedFilesMatched: manifest.files.length, rollbackManifestSha256: expectedManifestSha256,
      rollbackSourceKind: manifest.sourceKind, originalPackageRecordsValidated: manifest.originalPackages.length,
      peerDependencies: manifest.packages.map(item => ({ name: item.name, peerDependencies: item.peerDependencies })),
      versionExemptions: false, networkPackageResolution: false,
      liveDesktopTouched: false, actualDesktopDeployment: false, modelCalls: 0 };
  } finally {
    await ctx.fiber.dispose();
    const target = resolve(dir), parent = resolve('D:/Temp');
    assert.ok(dirname(target) === parent && target.split(/[\\/]/).at(-1).startsWith('kont-rollback-manager-'));
    await rm(target, { recursive: true, force: true });
  }
}
module.exports = { verifyDesktopRollback };
if (require.main === module || (process.argv[1] && resolve(process.argv[1]) === __filename)) {
  verifyDesktopRollback(process.argv[2], process.argv[3]).then(value => console.log(JSON.stringify(value)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
