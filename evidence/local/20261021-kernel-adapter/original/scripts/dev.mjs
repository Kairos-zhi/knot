import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat, symlink, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const install = resolve(process.env.DSH_INSTALL || 'D:/dsh-sandbox');
const runtime = join(root, '.runtime');
const home = join(runtime, 'dsh-home');
const profile = join(home, 'profiles', 'kont');
const plugin = join(root, 'packages', 'dsh-plugin');
const cli = join(install, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const installed = JSON.parse(await readFile(join(install, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'));
if (installed.version !== '0.1.7-rc.2') throw new Error(`Expected DSH 0.1.7-rc.2; found ${installed.version}`);
await mkdir(join(profile, 'node_modules', '@kont'), { recursive: true });
const linkedPlugin = join(profile, 'node_modules', '@kont', 'dsh-plugin');
try {
  await lstat(linkedPlugin);
  if (await realpath(linkedPlugin) !== await realpath(plugin)) throw new Error('Plugin link targets another checkout');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await symlink(plugin, linkedPlugin, process.platform === 'win32' ? 'junction' : 'dir');
}
const packageFile = join(profile, 'package.json');
const manifest = { name: 'kont-dev-profile', private: true, dependencies: { '@kont/dsh-plugin': `file:${plugin.replaceAll('\\', '/')}` }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } };
// Dedicated generated profile only. User's original web profile is never edited.
await writeFile(packageFile, JSON.stringify(manifest, null, 2));
await writeFile(join(profile, 'cordis.patch.yml'), `- insert:\n    - id: kont-worksite\n      name: '@kont/dsh-plugin'\n- id: web-app\n  config:\n    openBrowser: false\n    printUrl: true\n    surfaceContext: true\n    trustedHosts: []\n`);
const port = process.env.KONT_PORT || '3081';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid KONT_PORT');
const child = spawn(process.execPath, [cli, '--profile', 'kont', '--host', '127.0.0.1', '--port', port], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, DSH_HOME: home, KONT_DATA_DIR: join(runtime, 'data') },
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
