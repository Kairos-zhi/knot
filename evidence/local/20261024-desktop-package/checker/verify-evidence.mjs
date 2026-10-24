import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { verifyDesktopCandidate } from '../../../../scripts/prepare-desktop-candidate.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = 'evidence/local/20261024-desktop-package';
const expected = 'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8';
const entries = [];
for (const line of ['maker-a', 'maker-b']) {
  const manifest = JSON.parse(await readFile(`${root}/${line}/manifest.json`, 'utf8'));
  for (const item of manifest.files) {
    const bytes = await readFile(item.path);
    assert.equal(bytes.length, item.bytes, item.path); assert.equal(hash(bytes), item.sha256, item.path);
    entries.push({ line, path: item.path, bytes: bytes.length, sha256: hash(bytes), match: true });
  }
}
const { manifest } = await verifyDesktopCandidate(`${root}/candidate`, expected);
assert.equal(manifest.sourceBaseCommit, '3ccb26ffb6b1f80e313f0d657924460a6f38f446');
assert.equal(manifest.targetHostVersion, '0.2.1-rc.2');
const files = [];
for (const item of manifest.files) {
  const source = await readFile(item.path), artifact = await readFile(`${root}/candidate/${item.path}`);
  assert.equal(hash(source), item.sourceSha256, item.path);
  if (item.path.endsWith('/package.json')) {
    const value = JSON.parse(source); value.peerDependencies = { '@deepseek-ai/dsh': '0.2.1-rc.2' };
    assert.deepEqual(JSON.parse(artifact), value);
  } else assert.deepEqual(artifact, source, item.path);
  assert.doesNotMatch(item.path, /(?:^|\/)(?:evidence|tests?|node_modules|profiles?|credentials?|userstore)(?:\/|$)/i);
  files.push({ path: item.path, sha256: hash(artifact), sourceSha256: hash(source), match: true });
}
const bundle = JSON.parse(await readFile(`${root}/candidate/packages/desktop-bundle/package.json`));
assert.equal(bundle.dependencies['@kont/dsh-plugin'], 'file:../dsh-plugin');
assert.equal(resolve(root, 'candidate/packages/desktop-bundle', '../dsh-plugin'), resolve(root, 'candidate/packages/dsh-plugin'));
await writeFile(`${root}/checker/hash-check.json`, JSON.stringify({ task: 'KONT-DESKTOP-014',
  manifestEntriesMatched: entries.length, mismatch: 0, candidateManifestSha256: expected,
  candidateFilesMatched: files.length, currentRebuiltClientMatched: true,
  packageTransformation: 'only exact target peer; source package unchanged', entries, files }, null, 2) + '\n');
console.log(JSON.stringify({ manifestEntriesMatched: entries.length, candidateFilesMatched: files.length, candidateManifestSha256: expected, rebuiltClientMatched: true }));
