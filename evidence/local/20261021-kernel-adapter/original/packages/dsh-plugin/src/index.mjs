import { resolve } from 'node:path';
import { KontStore, KontError } from './store.mjs';
export const name = 'kont-worksite';
export const inject = ['webServer', 'connection'];
export function createHandler(store, connection) {
  return async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const refusal = connection.requestRejection(req);
      if (refusal !== undefined) { res.writeHead(refusal); res.end(); return; }
      if (req.method === 'GET') { send(200, store.read()); return; }
      if (req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); send(405, { code: 'METHOD_NOT_ALLOWED' }); return; }
      if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') { send(415, { code: 'JSON_REQUIRED' }); return; }
      let bytes = 0; const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { req.resume(); send(413, { code: 'BODY_LIMIT' }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { send(400, { code: 'INVALID_JSON', message: '请求不是有效 JSON' }); return; }
      send(200, await store.mutate(body));
    } catch (error) {
      send(error instanceof KontError ? error.status : 500, { code: error instanceof KontError ? error.code : 'STORAGE_ERROR', message: error instanceof KontError ? error.message : '现场保存失败，原有数据保留' });
    }
  };
}
export async function apply(ctx) {
  if (!process.env.KONT_DATA_DIR) throw new Error('KONT_DATA_DIR must name an isolated data directory');
  const store = await new KontStore(resolve(process.env.KONT_DATA_DIR, 'worksites.json')).init();
  ctx.on('dispose', () => store.close());
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/kont/api/workspace', handler: createHandler(store, ctx.connection) }));
}
