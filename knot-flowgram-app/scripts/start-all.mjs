/**
 * knot 一键启动：画布 dev server（3002）+ 协议端点（3101）
 * 用法：node scripts/start-all.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');

const children = [
  {
    name: 'dev(3002)',
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
  },
  {
    name: 'protocol(3101)',
    cmd: process.execPath,
    args: ['scripts/asset-write-server.mjs'],
  },
];

for (const { name, cmd, args } of children) {
  const p = spawn(cmd, args, { cwd: appDir, stdio: 'inherit', shell: process.platform === 'win32' });
  console.log(`[start-all] ${name} spawned (pid ${p.pid})`);
  p.on('exit', (code) => console.log(`[start-all] ${name} exited (${code})`));
}
