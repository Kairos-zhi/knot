import { lstat, realpath, readFile } from 'node:fs/promises';
import { resolve, join, parse, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const anchor = 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json';
const fail = code => { const e = new Error(`Profile pnpm store refused (${code})`); e.code = code; throw e; };
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
async function directoryChain(path) {
  const target = resolve(path), volume = parse(target).root;
  let current = volume;
  for (const part of target.slice(volume.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !same(current, await realpath(current))) fail('STORE_REDIRECTED');
  }
}

/** Official pnpm11 records its resolved (versioned) store in .modules.yaml.
 * Never relocate an existing installation, infer a missing manifest, or scan
 * the store's package contents. Empty profiles retain their private store. */
export async function resolveDesktopProfileStore(profile, privateStore) {
  await directoryChain(profile);
  const modules = join(profile, 'node_modules');
  try { await lstat(modules); }
  catch (e) {
    if (e.code === 'ENOENT') {
      try { await lstat(privateStore); await directoryChain(privateStore); }
      catch (storeError) { if (storeError.code !== 'ENOENT') throw storeError; await directoryChain(dirname(privateStore)); }
      return Object.freeze({ source: 'empty-profile', storeDir: privateStore, manifestSha256: null });
    }
    throw e;
  }
  await directoryChain(modules);
  const path = join(modules, '.modules.yaml');
  let stat;
  try { stat = await lstat(path); } catch { fail('MODULES_MANIFEST_REQUIRED'); }
  if (!stat.isFile() || stat.isSymbolicLink() || !same(path, await realpath(path)) || stat.size > 1024 * 1024) fail('INVALID_MODULES_MANIFEST');
  const bytes = await readFile(path);
  if (bytes.length > 1024 * 1024) fail('INVALID_MODULES_MANIFEST');
  let data;
  try {
    const yaml = createRequire(anchor)('yaml');
    const doc = yaml.parseDocument(bytes.toString('utf8'), { uniqueKeys: true });
    if (doc.errors.length) fail('INVALID_MODULES_MANIFEST');
    data = doc.toJS({ maxAliasCount: 0 });
  } catch { fail('INVALID_MODULES_MANIFEST'); }
  if (!data || Object.getPrototypeOf(data) !== Object.prototype || data.packageManager !== 'pnpm@11.28.5'
    || typeof data.storeDir !== 'string' || !/^[A-Za-z]:[\\/]/.test(data.storeDir)
    || /[\x00-\x1f<>"|?*]/.test(data.storeDir) || data.storeDir.slice(2).includes(':')
    || data.storeDir.split(/[\\/]/).some(p => p === '.' || p === '..')
    || data.storeDir.split(/[\\/]/).some(p => /[. ]$/.test(p))
    || !/[\\/]v11$/.test(data.storeDir)) fail('INCOMPATIBLE_RECORDED_STORE');
  await directoryChain(data.storeDir);
  return Object.freeze({ source: 'recorded-profile', storeDir: resolve(data.storeDir),
    manifestSha256: createHash('sha256').update(bytes).digest('hex') });
}
