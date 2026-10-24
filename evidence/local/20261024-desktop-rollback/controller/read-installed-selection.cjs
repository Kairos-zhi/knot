// Fixed, read-only official metadata parser. Never connects to the running Host.
const { createRequire } = require('node:module');
const { readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const anchor = 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json';
const dir = 'D:/DSH-Desktop/home/profiles/desktop';
const official = createRequire(anchor);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
(async () => {
  const before = await readFile(dir + '/package.json');
    const { readProfileManifest } = official('@deepseek-ai/dsh-app-boot');
    const profile = readProfileManifest('dsh', dir);
    const name = '@kont/desktop-bundle', source = profile.dependencies?.[name];
    const installed = createRequire(dir + '/package.json')(name + '/package.json');
    assert.match(source, /^file:[A-Za-z]:[\\/][^?#\r\n]+$/);
    assert.equal(installed.version, '0.1.0');
    assert.ok(Array.isArray(profile.dsh?.profile?.bundles));
    const after = await readFile(dir + '/package.json');
    assert.deepEqual(after, before, 'Profile package metadata changed during read');
    console.log(JSON.stringify({ task: 'KONT-DESKTOP-015',
      method: 'official-dsh-app-boot.readProfileManifest',
      name, version: installed.version, source,
      installed: true, enabled: profile.dsh.profile.bundles.includes(name),
      profilePackageSha256: hash(before), profilePackageStableDuringRead: true,
      runtimeActiveQueried: false, liveManagerQueried: false, profileWrite: false, modelCalls: 0,
      note: 'Standalone PluginManager.listBundles requires a live loader inventory; persistent metadata only.' }));
})().catch(error => { console.error(error); process.exitCode = 1; });
