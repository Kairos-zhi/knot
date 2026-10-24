import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, access, rm, symlink } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

// All grants and management callbacks are SYNTHETIC, against isolated module
// roots/ledgers. These tests never invoke a production grant or live manager.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kont-install-execution-'));
  t.after(async () => { const target = resolve(root); assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('kont-install-execution-')); await rm(target, { recursive: true, force: true }); });
  await mkdir(join(root, 'scripts'));
  for (const name of ['desktop-install-execution.mjs', 'desktop-host-client.mjs']) await copyFile(`scripts/${name}`, join(root, 'scripts', name));
  await writeFile(join(root, 'source.marker'), 'UNCHANGED');
  await writeFile(join(root, 'scripts/desktop-recovery-preflight.mjs'), `
    import{readFile,readdir}from'node:fs/promises';import{resolve}from'node:path';import{fileURLToPath}from'node:url';
    const root=fileURLToPath(new URL('../',import.meta.url)),issued=new WeakSet();
    async function fence(){const marker=await readFile(resolve(root,'source.marker'),'utf8');const reserved=marker==='DRIFT_AFTER_RESERVATION'&&(await readdir(resolve(root,'.runtime/desktop-install/synthetic-test')).catch(()=>[])).some(n=>n.endsWith('.claim.json'));if((marker!=='UNCHANGED'&&marker!=='DRIFT_AFTER_RESERVATION')||reserved){const e=new Error('Synthetic source drift');e.code='SOURCE_CHANGED';throw e;}}
    export async function prepareDesktopRecoveryPreflight(){await fence();const p=Object.freeze({id:Math.random(),expiresAt:Date.now()+600000,upgrade:{spec:'file:'+resolve(root,'evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle').replaceAll('\\\\','/'),manifestSha256:'a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8'},recovery:{manifestSha256:'774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d'},data:{sourceSha256:'a'.repeat(64),productionDeploymentAccepted:false},deploymentReady:false});issued.add(p);return p;}
    export function createRecoveryPreflightManager(evaluate,{plan}){if(!issued.has(plan))throw Error('Synthetic unissued plan');return{async inspectUpgrade(){await fence();return evaluate('synthetic local preflight bridge only');}};}
  `);
  const moduleUrl = pathToFileURL(join(root, 'scripts/desktop-install-execution.mjs')).href;
  const api = await import(moduleUrl);
  const prepare = async () => {
    const plan = await api.prepareDeploymentApproval();
    const declaration = { approved: true, kind: 'synthetic-test', action: 'upgrade', descriptorSha256: plan.descriptorSha256,
      expiresAt: plan.expiresAt, statement: 'SYNTHETIC_AUTHORIZATION_SENTINEL; no human production authorization' };
    return { plan, declaration, approval: api.approveDeployment(plan, declaration) };
  };
  return { root, api, moduleUrl, prepare };
}
const accepted = { changed: true, application: 'restart-required', restartReason: 'no-hmr', packageResult: { exitCode: 0, output: 'PRIVATE_RAW_DIAGNOSTIC' } };
const namespace = root => join(root, '.runtime/desktop-install/synthetic-test');

test('SYNTHETIC grant: persistent reservation precedes exact RPC; concurrent/rebuilt/process-reopened approvals cannot replay', async t => {
  const f = await fixture(t), { plan, approval } = await f.prepare();
  let calls = 0, resolve, started;
  const ready = new Promise(r => { started = r; });
  const evaluate = async (expression, metadata) => {
    calls++; assert.equal(metadata.approval, approval);
    assert.equal(f.api.getInstallationTransportAuthorization(metadata.approval).args, undefined);
    assert.throws(() => f.api.consumeInstallationTransportPermit(structuredClone(metadata.dispatchPermit), approval), { code: 'UNISSUED_DISPATCH_PERMIT' });
    const auth = f.api.consumeInstallationTransportPermit(metadata.dispatchPermit, metadata.approval);
    assert.throws(() => f.api.consumeInstallationTransportPermit(metadata.dispatchPermit, approval), { code: 'DISPATCH_PERMIT_CONSUMED' });
    assert.equal(auth.kind, 'synthetic-test'); assert.equal(auth.args.options.requestId, plan.descriptor.options.requestId);
    const claim = JSON.parse(await readFile(join(namespace(f.root), `${approval.approvalHash}.claim.json`)));
    assert.equal(claim.state, 'reserved'); assert.equal(claim.statementSha256.length, 64);
    await vm.runInNewContext(expression, { location: { protocol: 'dsh-app:', hostname: 'app' }, fetch: async (url, options) => {
      const envelope = JSON.parse(options.body);
      assert.equal(url, '/api/pluginManager/installBundle'); assert.equal(envelope.method, auth.method);
      assert.deepEqual(envelope.payload.args, auth.args);
      assert.equal(options.credentials, 'same-origin');
      return { ok: true, json: async () => ({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: accepted } }) };
    } });
    started(); return new Promise(r => { resolve = () => r(accepted); });
  };
  const pending = Promise.all(Array.from({ length: 8 }, () => f.api.executeApprovedUpgrade(approval, { evaluate })));
  await ready; resolve(); const results = await pending;
  assert.equal(calls, 1); assert.equal(results.filter(r => r.acquired).length, 1);
  assert.equal(results.find(r => r.acquired).state, 'submitted');
  assert.equal(results.find(r => r.acquired).runtimeActiveProven, false);
  const again = await f.prepare();
  assert.equal(again.plan.descriptorSha256, plan.descriptorSha256);
  assert.equal((await f.api.executeApprovedUpgrade(again.approval, { evaluate })).acquired, false);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import{prepareDeploymentApproval,approveDeployment,executeApprovedUpgrade}from ${JSON.stringify(f.moduleUrl)};
    const p=await prepareDeploymentApproval();const a=approveDeployment(p,{approved:true,kind:'synthetic-test',action:'upgrade',descriptorSha256:p.descriptorSha256,expiresAt:p.expiresAt,statement:'SYNTHETIC reopened grant'});
    let calls=0;const r=await executeApprovedUpgrade(a,{evaluate(){calls++;throw Error('must not install');}});console.log(JSON.stringify({acquired:r.acquired,calls}));
  `], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { acquired: false, calls: 0 });
  const files = await readdir(namespace(f.root));
  for (const name of files) {
    const text = await readFile(join(namespace(f.root), name), 'utf8');
    assert.equal(text.includes('SYNTHETIC_AUTHORIZATION_SENTINEL'), false); assert.equal(text.includes('PRIVATE_RAW_DIAGNOSTIC'), false);
  }
  await assert.rejects(access(join(f.root, '.runtime/desktop-install/explicit-user-approval')), { code: 'ENOENT' });
});

test('SYNTHETIC absent/forged/cloned/expired or drifted approval cannot call install or transport authorization', async t => {
  const f = await fixture(t), { plan, declaration, approval } = await f.prepare(); let calls = 0;
  const evaluate = () => { calls++; };
  for (const permit of [undefined, {}, Object.freeze({})])
    assert.throws(() => f.api.consumeInstallationTransportPermit(permit, approval), { code: 'UNISSUED_DISPATCH_PERMIT' });
  for (const bad of [undefined, {}, structuredClone(approval)]) {
    await assert.rejects(f.api.executeApprovedUpgrade(bad, { evaluate }), { code: 'UNISSUED_APPROVAL' });
    assert.throws(() => f.api.getInstallationTransportAuthorization(bad), { code: 'UNISSUED_APPROVAL' });
  }
  assert.throws(() => f.api.approveDeployment(structuredClone(plan), declaration), { code: 'UNISSUED_PLAN' });
  for (const patch of [{ descriptorSha256: '0'.repeat(64) }, { action: 'recovery' }, { kind: 'arbitrary' }, { approved: false }])
    assert.throws(() => f.api.approveDeployment(plan, { ...declaration, ...patch }), { code: 'APPROVAL_BINDING' });
  assert.throws(() => f.api.approveDeployment(plan, { ...declaration, spec: 'file:arbitrary' }), { code: 'UNKNOWN_OPTIONS' });
  await assert.rejects(f.api.prepareDeploymentApproval({ dataReport: {} }), { code: 'UNKNOWN_OPTIONS' });
  await assert.rejects(f.api.executeApprovedUpgrade(approval, { evaluate, registry: 'bad' }), { code: 'UNKNOWN_OPTIONS' });
  t.mock.method(Date, 'now', () => approval.expiresAt + 1);
  await assert.rejects(f.api.executeApprovedUpgrade(approval, { evaluate }), { code: 'EXPIRED_APPROVAL' });
  assert.throws(() => f.api.getInstallationTransportAuthorization(approval), { code: 'EXPIRED_APPROVAL' });
  assert.equal(calls, 0);
});

test('SYNTHETIC error/timeout/result-save failure retain reservation and never retry; late receipt cannot overwrite uncertainty', async t => {
  for (const mode of ['throw', 'timeout', 'result-save']) {
    const f = await fixture(t), { approval } = await f.prepare(); let calls = 0, late;
    const evaluate = async (_expression, { approval: bound, dispatchPermit }) => {
      calls++;
      f.api.consumeInstallationTransportPermit(dispatchPermit, bound);
      if (mode === 'throw') throw new Error('PRIVATE_TRANSPORT_EXCEPTION');
      if (mode === 'timeout') return new Promise(resolve => { late = () => resolve(accepted); });
      await mkdir(join(namespace(f.root), `${approval.approvalHash}.result.json`));
      return accepted;
    };
    const result = await f.api.executeApprovedUpgrade(approval, { evaluate, timeoutMs: 10 });
    assert.equal(result.acquired, true); assert.equal(result.state, 'uncertain');
    if (mode === 'result-save') assert.equal(result.receiptSaved, false);
    if (late) { late(); await new Promise(r => setImmediate(r));
      assert.equal(JSON.parse(await readFile(join(namespace(f.root), `${approval.approvalHash}.result.json`))).state, 'uncertain'); }
    assert.equal((await f.api.executeApprovedUpgrade(approval, { evaluate })).acquired, false);
    assert.equal(calls, 1);
  }
});

test('SYNTHETIC source drift and redirected/unwritable ledger reject before callback', async t => {
  for (const mode of ['source', 'file', 'junction']) {
    const f = await fixture(t), { approval } = await f.prepare(); let calls = 0;
    if (mode === 'source') await writeFile(join(f.root, 'source.marker'), 'CHANGED');
    if (mode === 'file') await writeFile(join(f.root, '.runtime'), 'not a directory');
    if (mode === 'junction') {
      const redirected = join(f.root, 'redirected'); await mkdir(redirected);
      await symlink(redirected, join(f.root, '.runtime'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    await assert.rejects(f.api.executeApprovedUpgrade(approval, { evaluate() { calls++; } }));
    assert.equal(calls, 0);
  }
});

test('SYNTHETIC post-reservation drift and unconsumed late permit fail closed with permanent reservation', async t => {
  const f = await fixture(t), { approval } = await f.prepare(); let calls = 0;
  await writeFile(join(f.root, 'source.marker'), 'DRIFT_AFTER_RESERVATION');
  const result = await f.api.executeApprovedUpgrade(approval, { evaluate() { calls++; } });
  assert.equal(result.acquired, true); assert.equal(result.state, 'uncertain'); assert.equal(calls, 0);
  await writeFile(join(f.root, 'source.marker'), 'UNCHANGED');
  assert.equal((await f.api.executeApprovedUpgrade(approval, { evaluate() { calls++; } })).acquired, false);
  const late = await fixture(t), { approval: lateApproval } = await late.prepare(); let permit;
  const timeout = await late.api.executeApprovedUpgrade(lateApproval, { timeoutMs: 5,
    evaluate(_expression, metadata) { permit = metadata.dispatchPermit; return new Promise(() => {}); } });
  assert.equal(timeout.state, 'uncertain');
  assert.throws(() => late.api.consumeInstallationTransportPermit(permit, lateApproval), { code: 'EXPIRED_DISPATCH_PERMIT' });
});
