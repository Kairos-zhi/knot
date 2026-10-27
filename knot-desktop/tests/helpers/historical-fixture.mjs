import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../fixtures/historical-043-044/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const provenanceBytes = await readFile(new URL('provenance.json', base));
if (hash(provenanceBytes) !== '7092e19c73e5cac61dbe7598cff0a689c9adbb97c49e00679a296cdaf8dc8fa4') throw Error('Fixed fixture provenance changed');
const records = JSON.parse(provenanceBytes).files;
export async function historicalFile(name) {
  const matches = records.filter(record => record.path === name);
  if (matches.length !== 1) throw Error('Unknown fixed fixture');
  const bytes = await readFile(new URL(name, base));
  if (hash(bytes) !== matches[0].sha256) throw Error('Fixed fixture bytes changed: ' + name);
  return bytes;
}
