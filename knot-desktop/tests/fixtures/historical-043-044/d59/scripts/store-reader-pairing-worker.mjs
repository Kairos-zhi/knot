import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
// Internal fixed worker: no CLI/path/callback reader interface and no state IPC.
process.once('message', async message => {
  if (message?.kind !== 'inspect') return process.exit(2);
  let store, StoreError, initialized = false;
  const result = { readCode: 'NOT_RUN', exportCode: 'NOT_RUN', failures: [] };
  const send = kind => process.send?.({ kind, ...result });
  try {
    let Reader;
    try { ({ KontStore: Reader, KontError: StoreError } = await import(pathToFileURL(resolve('reader/src/store.mjs')).href)); }
    catch { result.failures.push('READER_LOAD_FAILED'); return; }
    store = new Reader(resolve('state.json'));
    try { await store.init(); initialized = true; }
    catch (error) {
      if (typeof StoreError === 'function' && error instanceof StoreError) result.readCode = 'READER_REJECTED';
      else result.failures.push('READER_INIT_FAILED');
      return;
    }
    try {
      const original = JSON.parse(await readFile('state.json', 'utf8'));
      const { format, ...content } = original;
      const expected = { ...content, revision: 0, seq: 0 };
      result.readCode = canonical(store.read()) === canonical(expected) ? 'PRESERVED' : 'LOSSY_READ';
      result.exportCode = canonical(store.snapshot()) === canonical(original) ? 'PRESERVED' : 'LOSSY_EXPORT';
    } catch { result.failures.push('READER_EXECUTION_FAILED'); }
  } catch { result.failures.push('WORKER_EXECUTION_FAILED'); }
  finally {
    send('observed');
    if (store && initialized) {
      try { await store.close(); }
      catch { result.failures.push('CLOSE_FAILED'); }
    }
    send('complete');
    process.disconnect?.();
  }
});
