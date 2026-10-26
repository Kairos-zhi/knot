// Run only with the installed official Electron in ELECTRON_RUN_AS_NODE mode.
// Installs into a newly created isolated profile, never the running Desktop.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, readFile, writeFile, rm, access, realpath } = require('node:fs/promises');
const { resolve, join, dirname, relative, isAbsolute } = require('node:path');
const { spawnSync } = require('node:child_process');
const { runInNewContext } = require('node:vm');
const { createHash } = require('node:crypto');
const anchor = 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json';
const runtime = 'D:/DSH-Desktop/app/resources/runtime/primary-runtime/dependencies';

async function verifyDesktopCandidate(candidateRoot, expectedManifestSha256, options = {}) {
  assert.ok(options && typeof options === 'object' && !Array.isArray(options));
  assert.ok(Object.keys(options).every(key => key === 'workstation'));
  assert.ok(options.workstation === undefined || typeof options.workstation === 'boolean');
  const root = resolve(candidateRoot);
  assert.match(expectedManifestSha256 ?? '', /^[a-f0-9]{64}$/);
  // Share the exact versioned inventory, checksum and directory fences with
  // preparation. The official manager adds runtime compatibility, not a second
  // looser definition of what belongs in a reviewed candidate.
  const { verifyDesktopCandidate: verifyInventory } = await import('./prepare-desktop-candidate.mjs');
  const { manifest } = await verifyInventory(root, expectedManifestSha256);
  if (options.workstation) assert.equal(manifest.format, 'kont-desktop-directory-candidate/v2', 'Workstation integration requires the current inventory');
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
  const dir = await mkdtemp('D:/Temp/kont-candidate-manager-');
  const ctx = new Context();
  const configFile = join(dir, 'empty.npmrc');
  try {
    await writeFile(configFile, '');
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'kont-candidate-isolated-profile', private: true,
      dsh: { profile: { bundles: [] } } }));
    await writeFile(join(dir, 'cordis.patch.yml'), '[]\n');
    const environment = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
      TEMP: dir, TMP: dir, USERPROFILE: dir, HOME: dir,
      npm_config_userconfig: configFile, npm_config_globalconfig: configFile };
    ctx.provide('profileContext', { name: 'kont-candidate-isolated', dir, home: dir,
      cwd: root, installAnchor: anchor, startedBundles: [], patchPath: join(dir, 'cordis.patch.yml'), overlays: [],
      packageManager: { command: join(runtime, 'node/bin/node.exe'),
        args: [join(runtime, 'pnpm/bin/pnpm.cjs'), '--offline', '--config.auto-install-peers=false',
          '--ignore-scripts', '--store-dir', join(dir, 'pnpm-store')], env: environment } });
    const manager = new PluginManager(ctx, { outputBytes: 32768, lockWaitMs: 1000, inspectTimeoutMs: 10000,
      githubConnectionTimeoutMs: 1000, idleTimeoutMs: 15000, pnpmCommand: 'pnpm', fallbackRegistries: [] });
    const inspected = await manager.inspect(`file:${bundleDir}`);
    assert.equal(inspected.status, 'accepted', JSON.stringify(inspected));
    const installed = await manager.installBundle(`file:${bundleDir}`, { enabled: false, requestId: 'isolated-candidate-check' });
    assert.equal(installed.application, 'restart-required', JSON.stringify(installed));
    assert.equal(installed.restartReason, 'no-hmr');
    assert.equal(installed.bundle, '@kont/desktop-bundle');
    assert.equal(installed.packageResult.exitCode, 0);
    const profileRequire = createRequire(join(dir, 'package.json'));
    const installedBundle = profileRequire.resolve('@kont/desktop-bundle/package.json');
    const installedPlugin = createRequire(installedBundle).resolve('@kont/dsh-plugin/package.json');
    const pluginPath = dirname(installedPlugin);
    const inside = relative(dir, pluginPath);
    assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Installed plugin must be copied inside temporary profile');
    async function verifyInstalledFiles() {
      for (const file of manifest.files) {
        const path = file.path.replace(/^packages\/(desktop-bundle|dsh-plugin)\//, '');
        const installedPath = file.path.startsWith('packages/desktop-bundle/') ? dirname(installedBundle) : pluginPath;
        const installedFile = join(installedPath, path);
        const actualFile = await realpath(installedFile), withinProfile = relative(await realpath(dir), actualFile);
        assert.ok(withinProfile && !withinProfile.startsWith('..') && !isAbsolute(withinProfile), 'Copied artifact must remain in its temporary profile');
        const bytes = await readFile(installedFile);
        assert.equal(bytes.length, file.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
        assert.deepEqual(bytes, await readFile(join(root, file.path)), file.path);
      }
    }
    await verifyInstalledFiles();
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
    let workstation;
    if (options.workstation) {
      const installedRoot = await realpath(pluginPath), profileRoot = await realpath(dir);
      const withinProfile = relative(profileRoot, installedRoot);
      assert.ok(withinProfile && !withinProfile.startsWith('..') && !isAbsolute(withinProfile));
      const integrated = spawnSync(process.execPath, [resolve(__dirname, '../tests/desktop-workstation-worker.mjs')], {
        env: { ...environment, ELECTRON_RUN_AS_NODE: '1', KONT_INSTALLED_PLUGIN_ROOT: installedRoot,
          KONT_ISOLATED_PROFILE_ROOT: profileRoot },
        encoding: 'utf8', windowsHide: true, timeout: 30000,
      });
      assert.equal(integrated.status, 0, integrated.stderr || integrated.stdout || String(integrated.error));
      workstation = JSON.parse(integrated.stdout.trim());
      await verifyInstalledFiles();
    }
    return { version: applied.version, officialManagerInspect: inspected.status,
      officialManagerInstall: 'completed-in-isolated-profile', application: installed.application,
      enabled: false, runtimeApply: applied.checks, rendererModuleAndSlots: true,
      packageCopied: true, installedFilesMatched: manifest.files.length, candidateManifestSha256: expectedManifestSha256,
      versionExemptions: false, networkPackageResolution: false,
      liveDesktopTouched: false, actualDesktopDeployment: false, modelCalls: 0,
      ...(workstation ? { workstation, installedFilesUnchangedAfterWorkstation: true } : {}) };
  } finally {
    await ctx.fiber.dispose();
    const target = resolve(dir), parent = resolve('D:/Temp');
    assert.ok(dirname(target) === parent && target.split(/[\\/]/).at(-1).startsWith('kont-candidate-manager-'));
    await rm(target, { recursive: true, force: true });
  }
}
module.exports = { verifyDesktopCandidate };
if (require.main === module || (process.argv[1] && resolve(process.argv[1]) === __filename)) {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || args[2] !== undefined && args[2] !== '--workstation') {
    throw new Error('Usage: verify-desktop-candidate.cjs <candidate> <reviewed-manifest-sha256> [--workstation]');
  }
  verifyDesktopCandidate(args[0], args[1], { workstation: args[2] === '--workstation' }).then(value => console.log(JSON.stringify(value)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
