import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const included = [
  'arch-presentation-state', 'arch-read-cleanup', 'arch-run-epoch',
  'build-core-provenance', 'client-bundle', 'desktop-candidate', 'desktop-candidate-monorepo',
  'folder-protocol', 'http', 'kernel', 'protocol', 'protocol-equivalence',
  'read-audit-config', 'run-contract', 'run-dispatch', 'run-panel-client', 'run-query',
  'run-read', 'run-reconciliation', 'run-reference-domains', 'run-request-gate',
  'run-status-panel', 'run-status-source', 'run-status-view', 'runtime-draft',
  'store-reader-pairing', 'store-recovery-roundtrip', 'store-snapshot-contract',
  'supply-preview-panel', 'work-island-client', 'worksite-folders-client',
  'worksite-folders', 'worksite-hud-client', 'worksite-library-client',
  'worksite-preview-client', 'worksite-preview', 'worksite',
  'workspace-events-client', 'workspace-recovery-client', 'workspace-response-client',
].map(name => `${name}.test.mjs`);
export const external = {
  'desktop-candidate-isolation': 'official Desktop / temporary profile',
  'desktop-compat-renderer-receipt': 'official renderer receipt / historical source',
  'desktop-compat': 'official Desktop runtime',
  'desktop-data-compatibility': 'historical candidates / D-drive temporary paths',
  'desktop-deployment-plan': 'historical deployment selection and candidates',
  'desktop-host-archive': 'legacy D-drive archive fixture',
  'desktop-host-client': 'legacy machine-specific installation spec',
  'desktop-install-execution': 'legacy installation fixtures / D-drive paths',
  'desktop-installed-data-preflight': 'legacy installed-data preflight fixtures',
  'desktop-pnpm-store': 'official runtime and pnpm',
  'desktop-quiescent-install': 'legacy installation evidence fixtures',
  'desktop-reconciled-attempt': 'legacy installation fixtures',
  'desktop-reconciled-official': 'official runtime / historical candidates',
  'desktop-recovery-isolation': 'official runtime / historical recovery candidate',
  'desktop-recovery-preflight': 'historical recovery and selection fixtures',
  'desktop-recovery': 'historical upgrade / rollback candidates',
  'desktop-rollback-isolation': 'official runtime / captured rollback artifact',
  'desktop-rollback': 'captured rollback artifact',
  'desktop-workstation-integration': 'official Desktop isolated integration',
  'plugin-lifecycle': 'installed Cordis runtime',
  'run-execution-guard': 'official Desktop runtime',
  'run-integrated': 'official Desktop runtime',
  'run-observer-binding': 'installed Cordis runtime',
  'run-read-official': 'official Desktop runtime',
  'runtime-launcher': 'external DSH dev runtime installation',
  'run-flash-wire.test.cjs': 'official runtime synthetic wire test; separate entry',
};
const excluded = Object.fromEntries(Object.entries(external).map(([name, reason]) => [name.endsWith('.cjs') ? name : `${name}.test.mjs`, reason]));
const discovered = (await readdir(new URL('../tests/', import.meta.url))).filter(name => /\.test\.(mjs|cjs)$/.test(name));
const classified = [...included, ...Object.keys(excluded)];
if (new Set(classified).size !== classified.length || discovered.some(name => !classified.includes(name)) || classified.some(name => !discovered.includes(name))) {
  throw Error('Test inventory changed: classify every suite explicitly before running');
}
if (process.argv.length > 3 || process.argv[2] && process.argv[2] !== '--list') throw Error('Usage: node scripts/test-portable.mjs [--list]');
if (process.argv[2] === '--list') console.log(JSON.stringify({ included, excluded }, null, 2));
else {
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const tests = spawnSync(process.execPath, ['--test', ...included.map(name => `tests/${name}`)], { cwd: root, stdio: 'inherit', windowsHide: true });
  process.exit(tests.status ?? 1);
}
