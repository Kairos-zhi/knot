import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const files = ['services/workspace-state.ts', 'services/asset-persistence.ts', 'services/asset-sync.ts', 'knot-model.ts'];
test('canonical core equals the four exact frozen sources after line-ending normalization', async () => {
  for (const file of files) {
    const frozen = await readFile(new URL('../vendor/knot/src/' + file, import.meta.url), 'utf8');
    const canonical = await readFile(new URL('../../knot-flowgram-app/src/' + file, import.meta.url), 'utf8');
    assert.equal(canonical.replaceAll('\r\n', '\n'), frozen.replaceAll('\r\n', '\n'));
  }
});
test('build fails closed for canonical content drift and for raw frozen byte drift', async t => {
  const root = await mkdtemp(join(tmpdir(), 'knot-core-provenance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, bytes) => { const target = join(root, name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); };
  await put('knot-desktop/scripts/build.mjs', await readFile(new URL('../scripts/build.mjs', import.meta.url)));
  const first = files[0], original = await readFile(new URL('../vendor/knot/src/' + first, import.meta.url));
  await put('knot-desktop/vendor/knot/src/' + first, original);
  await put('knot-flowgram-app/src/' + first, 'changed core');
  const run = () => spawnSync(process.execPath, [join(root, 'knot-desktop/scripts/build.mjs')], { encoding: 'utf8', windowsHide: true });
  const canonical = run(); assert.notEqual(canonical.status, 0); assert.match(canonical.stderr, /Canonical Knot core differs/);
  await put('knot-desktop/vendor/knot/src/' + first, original.toString('utf8').replaceAll('\r\n', '\n'));
  const frozen = run(); assert.notEqual(frozen.status, 0); assert.match(frozen.stderr, /Frozen Knot source changed/);
});
