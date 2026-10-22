import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { apply } from '../packages/dsh-plugin/src/index.mjs';

test('real Cordis awaits KONT asynchronous disposal and permits immediate storage reopen', async t => {
  const install = resolve(process.env.DSH_INSTALL || 'D:/dsh-sandbox');
  const { Context } = await import(pathToFileURL(join(install, 'node_modules/@deepseek-ai/cordis/lib/index.js')).href);
  const dir = await mkdtemp(join(tmpdir(), 'kont-cordis-'));
  const oldDirectory = process.env.KONT_DATA_DIR, oldToken = process.env.KONT_AGENT_TOKEN;
  process.env.KONT_DATA_DIR = dir;
  process.env.KONT_AGENT_TOKEN = 'test-only-cordis-token-000000000000000000';
  t.after(async () => {
    if (oldDirectory === undefined) delete process.env.KONT_DATA_DIR; else process.env.KONT_DATA_DIR = oldDirectory;
    if (oldToken === undefined) delete process.env.KONT_AGENT_TOKEN; else process.env.KONT_AGENT_TOKEN = oldToken;
    await rm(dir, { recursive: true, force: true });
  });
  const routes = new Map();
  const context = () => {
    const ctx = new Context();
    ctx.provide('connection', { requestRejection: () => undefined });
    ctx.provide('webServer', { register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path); } });
    return ctx;
  };
  const first = context();
  await apply(first);
  await access(join(dir, 'worksites.json.lock'));
  const req = Readable.from([Buffer.from(JSON.stringify({ revision: 0, commands: [{ type: 'worksite.update', worksiteId: 'legacy', draft: 'survives Cordis disposal' }] }))]);
  req.method = 'POST'; req.headers = { 'content-type': 'application/json' };
  let status;
  await routes.get('/kont/api/workspace')(req, { writeHead(code) { status = code; }, end() {} });
  assert.equal(status, 200);
  await first.fiber.dispose();
  await assert.rejects(access(join(dir, 'worksites.json.lock')), { code: 'ENOENT' });
  assert.equal(routes.size, 0);
  const second = context();
  await apply(second);
  try { assert.equal(JSON.parse(await readFile(join(dir, 'worksites.json'), 'utf8')).workspace.worksites[0].draft, 'survives Cordis disposal'); }
  finally { await second.fiber.dispose(); }
  await assert.rejects(access(join(dir, 'worksites.json.lock')), { code: 'ENOENT' });
});
