import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openArchive } from '../scripts/desktop-host-archive.mjs';

test('read-only ASAR parser reads bounded packed data and rejects traversal and unpacked entries', async () => {
  const base = process.platform === 'win32' ? 'D:/Temp' : tmpdir();
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'kont-desktop-archive-'));
  try {
    const content = Buffer.from('official static source');
    const json = Buffer.from(JSON.stringify({ files: { 'index.js': { size: content.length, offset: '0' }, native: { size: 10, unpacked: true }, corrupt: { size: 999999, offset: '0' } } }));
    const first = Buffer.alloc(8), header = Buffer.alloc(8 + json.length);
    first.writeUInt32LE(4, 0); first.writeUInt32LE(header.length, 4);
    header.writeUInt32LE(json.length, 4); json.copy(header, 8);
    const path = join(directory, 'fixture.asar');
    await writeFile(path, Buffer.concat([first, header, content]));
    const archive = await openArchive(path);
    try {
      assert.deepEqual(archive.list(), ['index.js', 'native', 'corrupt']);
      assert.equal((await archive.read('index.js')).toString(), content.toString());
      await assert.rejects(archive.read('../index.js'), /traversal/);
      await assert.rejects(archive.read('native'), /packed regular/);
      await assert.rejects(archive.read('corrupt'), /range/);
    } finally { await archive.close(); }
  } finally { await rm(directory, { recursive: true }); }
});
