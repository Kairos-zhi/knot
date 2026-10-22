import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseReadAuditConfig, resolveReadAudit, readAuditInject } from '../packages/dsh-plugin/src/read-audit-config.mjs';
import { apply } from '../packages/dsh-plugin/src/index.mjs';

const grant = () => ({ runId: 'run_synthetic', requestId: 'synthetic-request', sessionId: 'synthetic-session', inputSha256: 'a'.repeat(64) });
const binding = item => ({ runId: item.runId, requestId: item.requestId, sessionId: item.sessionId, inputSha256: item.inputSha256 });

test('readAudit accepts only JSON data, freezes a detached permission snapshot and rejects function/Class/path/schema extensions', async () => {
  const raw = JSON.parse(JSON.stringify({ readAudit: { enabled: true, grants: [grant()] } }));
  const parsed = parseReadAuditConfig(raw);
  assert.equal(parsed.enabled, true); assert.equal(Object.isFrozen(parsed.grants[0]), true);
  raw.readAudit.grants[0].runId = 'changed'; raw.readAudit.grants.push(grant());
  assert.equal(parsed.grants.length, 1); assert.equal(parsed.grants[0].runId, 'run_synthetic');
  let getterCalls = 0;
  const getter = {}; Object.defineProperty(getter, 'readAudit', { enumerable: true, get() { getterCalls++; return {}; } });
  const invalid = [null, getter, { readAudit: new (class Audit {})() }, { readAudit: { enabled: 'true' } },
    { readAudit: { enabled: null } }, { readAudit: { grants: null } }, { readAudit: { grants: [grant(), grant()] } },
    { readAudit: { enabled: true, authorizeRead() {} } }, { hostVersion: '0.2.1-rc.2' }, { Session: class Session {} },
    { persistence: {} }, { readRun() {} }, { readAudit: { path: 'D:/private' } },
    { readAudit: { grants: [{ ...grant(), inputSha256: 'bad' }] } }, { readAudit: { grants: [{ ...grant(), sessionId: '../session' }] } },
    { readAudit: { grants: [{ ...grant(), approvedRequestSha256: 'bad' }] } }, { readAudit: { grants: [{ ...grant(), extra: 1 }] } },
    { readAudit: { grants: new Array(1) } }, { readAudit: { grants: [undefined] } },
    { [Symbol('hidden')]: true }, { readAudit: { enabled: true, extra: NaN } },
  ];
  for (const config of invalid) {
    assert.throws(() => parseReadAuditConfig(config), { code: 'DSH_CONFIG_INVALID' });
    await assert.rejects(apply({}, config), { code: 'DSH_CONFIG_INVALID' });
  }
  assert.equal(getterCalls, 0);
});

test('disabled readAudit checks no host packages or services; enabled dependencies are explicit and missing capability fails fast', async () => {
  const closed = parseReadAuditConfig({});
  assert.deepEqual(await resolveReadAudit({ get() { throw new Error('must not query host on disabled path'); } }, closed), {});
  assert.deepEqual(readAuditInject, ['pluginPackages', 'sessionPersistence']);
  await assert.rejects(resolveReadAudit({ get() {} }, parseReadAuditConfig({ readAudit: { enabled: true } })), { code: 'DSH_HOST_CAPABILITY_MISSING' });
});

test('host metadata versions/names/paths are refused without session I/O; grants require all four exact fields', async () => {
  // Synthetic package metadata/module fixture for composition failure/permission
  // tests only. Actual installed packageOf + Session are covered by the worker.
  const dir = await mkdtemp(join(tmpdir(), 'kont-read-audit-packages-'));
  try {
    const packages = {};
    for (const name of ['dsh-app-boot', 'dsh-session']) {
      const packageDir = join(dir, name); await mkdir(packageDir);
      const manifest = { name: `@deepseek-ai/${name}`, version: '0.2.1-rc.2', main: 'index.cjs' };
      const manifestPath = join(packageDir, 'package.json'); await writeFile(manifestPath, JSON.stringify(manifest));
      if (name === 'dsh-session') await writeFile(join(packageDir, 'index.cjs'), 'module.exports={Session:{create(){}}};');
      packages[manifest.name] = { ...manifest, dir: packageDir, manifestPath };
    }
    let io = 0, lookup = name => packages[name];
    const persistence = { async open() { io++; }, async stat() { io++; } };
    const ctx = { get(name) { return name === 'pluginPackages' ? { packageOf: (...args) => lookup(...args) } : persistence; } };
    const raw = { readAudit: { enabled: true, grants: [{ ...grant(), approvedRequestSha256: 'b'.repeat(64) }] } };
    const audit = parseReadAuditConfig(raw);
    const capabilities = await resolveReadAudit(ctx, audit);
    assert.equal(capabilities.hostVersion, '0.2.1-rc.2'); assert.equal(capabilities.persistence, persistence);
    assert.equal(typeof capabilities.Session.create, 'function');
    const allowed = capabilities.authorizeRead(binding(grant()));
    assert.equal(allowed.allowed, true); assert.equal(allowed.approvedRequestSha256, 'b'.repeat(64));
    for (const key of ['runId', 'requestId', 'sessionId', 'inputSha256']) {
      const asked = binding(grant()); asked[key] = 'wrong';
      assert.equal(capabilities.authorizeRead(asked).allowed, false);
    }
    raw.readAudit.grants.length = 0;
    assert.equal(capabilities.authorizeRead(binding(grant())).allowed, true);
    const empty = await resolveReadAudit(ctx, parseReadAuditConfig({ readAudit: { enabled: true, grants: [] } }));
    assert.equal(empty.authorizeRead(binding(grant())).allowed, false);
    for (const bad of [pkg => ({ ...pkg, version: '0.1.7-rc.2' }), pkg => ({ ...pkg, name: 'wrong' }),
      pkg => ({ ...pkg, dir: 'relative' }), pkg => ({ ...pkg, manifestPath: join(dir, 'outside.json') })]) {
      lookup = name => bad(packages[name]);
      await assert.rejects(resolveReadAudit(ctx, audit), { code: 'DSH_HOST_PACKAGE_REFUSED' });
    }
    assert.equal(io, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
