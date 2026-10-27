// Verifies this published derivative package, not the unavailable local originals.
import { readFile, lstat, realpath, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

if (process.argv.length !== 2) throw Error('Usage: node knot-desktop/evidence-receipts/verify.mjs');
const requestedRoot = resolve(fileURLToPath(new URL('./', import.meta.url)));
const root = await realpath(requestedRoot);
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
if (!samePath(root, requestedRoot)) throw Error('Redirected publication root');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = file => { const p = relative(root, file); return p && !p.startsWith('..') && !isAbsolute(p); };
async function read(name) {
  if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..') || isAbsolute(name)) throw Error('Unsafe package path');
  const file = resolve(root, name), stat = await lstat(file), actual = await realpath(file);
  if (!inside(file) || !stat.isFile() || stat.isSymbolicLink() || !samePath(actual, file)) throw Error('Non-regular package file');
  return readFile(file);
}
const sums = (await read('SHA256SUMS')).toString('utf8').trim().split('\n');
const entries = new Map();
for (const line of sums) {
  const match = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/.exec(line);
  if (!match || entries.has(match[2]) || match[2] === 'SHA256SUMS') throw Error('Malformed checksum inventory');
  entries.set(match[2], match[1]);
  if (hash(await read(match[2])) !== match[1]) throw Error('Published byte mismatch: ' + match[2]);
}
async function inventory(dir = root, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name), actual = await realpath(file);
    if (!inside(file) || entry.isSymbolicLink() || !samePath(actual, file)) throw Error('Redirected package entry');
    if (entry.isDirectory()) result.push(...await inventory(file, prefix + entry.name + '/'));
    else if (entry.isFile()) result.push(prefix + entry.name);
    else throw Error('Unsupported package entry');
  }
  return result;
}
const found = (await inventory()).filter(p => p !== 'SHA256SUMS').sort();
if (JSON.stringify(found) !== JSON.stringify([...entries.keys()].sort())) throw Error('Unknown or missing package file');
const catalog = JSON.parse(await read('CATALOG.json'));
const scrub = JSON.parse(await read('SCRUB-MANIFEST.json'));
if (catalog.format !== 'knot-evidence-receipts/v1' || scrub.format !== 'knot-evidence-derivations/v1') throw Error('Unknown publication format');
if (catalog.publicationIsNewEngineeringAcceptance !== false) throw Error('Publication scope changed');
function noPrivateOriginals(value) {
  if (Array.isArray(value)) value.forEach(noPrivateOriginals);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (key === 'oldValue') throw Error('Private original value in public diff');
    noPrivateOriginals(child);
  }
}
noPrivateOriginals(scrub);
if (catalog.receipts.length !== catalog.receiptCount || scrub.files.length !== catalog.receiptCount) throw Error('Receipt inventory mismatch');
const paths = new Set();
for (const receipt of catalog.receipts) {
  if (paths.has(receipt.path) || !/^[a-f0-9]{64}$/.test(receipt.sourceSha256) || hash(await read(receipt.path)) !== receipt.publishedSha256) throw Error('Receipt mapping mismatch');
  paths.add(receipt.path);
  const derivation = scrub.files.filter(f => f.path === receipt.path);
  if (derivation.length !== 1 || derivation[0].sourceSha256 !== receipt.sourceSha256 || derivation[0].publishedSha256 !== receipt.publishedSha256) throw Error('Derivative mapping mismatch');
}
const expectedUnits = new Set(catalog.receipts.filter(r => r.role !== 'legacy-gate-index').map(r => r.unit));
const seenUnits = new Set();
if (catalog.historicalIndexCount !== catalog.receipts.filter(r => r.role === 'legacy-gate-index').length
  || catalog.humanDocumentCount !== catalog.receipts.filter(r => r.path.endsWith('.md')).length) throw Error('Catalog count mismatch');
for (const unit of catalog.units) {
  if (seenUnits.has(unit.unit) || !expectedUnits.has(unit.unit)) throw Error('Duplicate or unknown routing unit');
  seenUnits.add(unit.unit);
  const index = JSON.parse(await read(unit.index));
  if (index.kind !== 'publication-routing-only' || index.unit !== unit.unit || index.newEngineeringAcceptance !== false) throw Error('Routing identity mismatch');
  const expectedReceipts = catalog.receipts.filter(r => r.unit === unit.unit);
  if (unit.receiptCount !== expectedReceipts.length || !isDeepStrictEqual(index.receipts, expectedReceipts)
    || !isDeepStrictEqual(unit.humanDocuments, expectedReceipts.filter(r => r.path.endsWith('.md')).map(r => r.path))) throw Error('Routing receipt metadata mismatch');
  const expectedOmissions = expectedReceipts.flatMap(r => scrub.files.find(f => f.path === r.path).operations.filter(o => o.op === 'remove')
    .map(o => ({ source: r.sourcePath, pointer: o.pointer, originalItems: o.originalItems, reason: o.reason })));
  if (!isDeepStrictEqual(index.omittedMetadataCollections, expectedOmissions)) throw Error('Routing projection metadata mismatch');
}
if (seenUnits.size !== expectedUnits.size) throw Error('Missing routing unit');
const roles = unit => new Set(catalog.receipts.filter(r => r.unit === unit).map(r => r.role));
for (const role of ['independent-checker-final', 'independent-execution-final', 'independent-publication-final']) if (!roles('20261027-mainline-integration').has(role)) throw Error('Missing 048 phase');
for (const role of ['independent-source-final-r1', 'path-reference-failure-diagnosis', 'independent-source-final-r2', 'independent-execution-final-r2', 'independent-publication-final-r2']) if (!roles('20261027-local-sync-049').has(role)) throw Error('Missing 049 failure/recovery phase');
if (catalog.currentSoftwareCandidate.sourceCommit !== 'ed54934095a2788405d1c7839067735fe265807f' || catalog.currentSoftwareCandidate.manifestSha256 !== '7ac0e3ab13b680de16403bcf62ff290959bfdf9fa7024f804e6885f2e7308c18') throw Error('Candidate applicability mismatch');
const references = JSON.parse(await read('REFERENCE-MAP.json'));
for (const item of references.references) if (item.resolution === 'published-derivative' && !paths.has(item.publishedPath)) throw Error('Invalid derivative reference');
console.log(JSON.stringify({ publishedFiles: found.length + 1, conclusionDocuments: catalog.receiptCount, archiveUnits: catalog.units.length, historicalIndexes: catalog.historicalIndexCount, internalConsistency: true, originalPrivateSourcesVerified: false, newEngineeringAcceptance: false }));
