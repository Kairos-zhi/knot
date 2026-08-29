/**
 * knot 资产写回服务（结 → 资产文件）
 * 浏览器画布变更 → POST localhost:3101/write → 写回 src/assets/knot-assets.json
 * 独立小服务（不侵入 rsbuild dev），带 CORS。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_FILE = path.resolve(__dirname, '../src/assets/knot-assets.json');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/write') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { assets } = JSON.parse(body);
        if (!Array.isArray(assets)) throw new Error('assets must be an array');
        const payload = {
          note: 'knot 资产清单（画布写回 · 双向同步：结=资产本体）',
          assets,
        };
        fs.writeFileSync(ASSET_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: assets.length }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(3101, () => {
  console.log('[asset-write-server] http://localhost:3101/write ->', ASSET_FILE);
});
