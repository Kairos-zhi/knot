import { mkdir, readFile, writeFile, lstat, symlink, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));

/** Prepare only this checkout's dedicated profile, or an explicit test runtime. */
export async function prepareDevelopment(env = process.env) {
  const install = resolve(env.DSH_INSTALL || 'D:/dsh-sandbox');
  const runtime = resolve(env.KONT_RUNTIME_DIR || join(root, '.runtime'));
  const home = join(runtime, 'dsh-home');
  const profile = join(home, 'profiles', 'kont');
  const plugin = join(root, 'packages', 'dsh-plugin');
  const cli = join(install, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const installed = JSON.parse(await readFile(join(install, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'));
  if (installed.version !== '0.1.7-rc.2') throw new Error(`Expected DSH 0.1.7-rc.2; found ${installed.version}`);
  const port = env.KONT_PORT || '3081';
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error('Invalid KONT_PORT');
  await mkdir(join(profile, 'node_modules', '@kont'), { recursive: true });
  const linkedPlugin = join(profile, 'node_modules', '@kont', 'dsh-plugin');
  try {
    await lstat(linkedPlugin);
    if (await realpath(linkedPlugin) !== await realpath(plugin)) throw new Error('Plugin link targets another checkout');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await symlink(plugin, linkedPlugin, process.platform === 'win32' ? 'junction' : 'dir');
  }
  const manifest = { name: 'kont-dev-profile', private: true, dependencies: { '@kont/dsh-plugin': `file:${plugin.replaceAll('\\', '/')}` }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } };
  await writeFile(join(profile, 'package.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(profile, 'cordis.patch.yml'), `- insert:\n    - id: kont-worksite\n      name: '@kont/dsh-plugin'\n- id: web-runtime\n  config:\n    openBrowser: false\n    printUrl: true\n    surfaceContext: true\n    trustedHosts: []\n`);
  return { cli, home, profile, runtime, data: join(runtime, 'data'), port };
}

/** Let DSH own this process, including its bounded dispose on Ctrl+C/SIGTERM. */
export async function startDevelopment() {
  const prepared = await prepareDevelopment();
  process.chdir(root);
  process.env.DSH_HOME = prepared.home;
  process.env.KONT_DATA_DIR = prepared.data;
  process.env.DSH_TELEMETRY_DISABLED = '1';
  process.argv = [process.execPath, prepared.cli, '--profile', 'kont', '--host', '127.0.0.1', '--port', prepared.port, '--no-open'];
  const { runCli } = await import(pathToFileURL(prepared.cli).href);
  await runCli();
  // An IPC parent can exercise the same in-process signal path on Windows,
  // where ChildProcess.kill() otherwise terminates without signal handlers.
  // There is no network control route and this bridge exists only for a fork.
  if (process.env.KONT_DEV_IPC === '1' && typeof process.send === 'function') {
    process.on('message', message => {
      if (message?.type === 'kont:stop') process.emit('SIGTERM');
    });
    process.once('disconnect', () => process.emit('SIGTERM'));
    process.send({ type: 'kont:ready' });
  }
}

if (import.meta.main ?? (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) await startDevelopment();
