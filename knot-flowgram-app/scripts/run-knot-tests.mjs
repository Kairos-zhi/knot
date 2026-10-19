import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const tests = readdirSync(new URL('../tests/', import.meta.url))
  .filter((name) => name.startsWith('knot-') && name.endsWith('.assert.ts'))
  .sort();

if (tests.length === 0) {
  console.error('No Knot behavioral assertions found.');
  process.exit(1);
}

for (const name of tests) {
  console.log(`\nRunning ${name}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', `tests/${name}`], {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error || result.signal || result.status !== 0) {
    console.error(`Failed: ${name}`, result.error?.message ?? result.signal ?? '');
    process.exit(result.status || 1);
  }
}
console.log(`\nPassed ${tests.length} Knot behavioral suites.`);
