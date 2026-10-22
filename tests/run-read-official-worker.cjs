// Actual installed Electron RunAsNode + official Session/JSONL libraries.
// Synthetic Session only: no Agent, model, Provider, real profile, or user session.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, rm, readFile, readdir, access } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const anchor = 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json';
const official = createRequire(anchor);
const fileHash = bytes => createHash('sha256').update(bytes).digest('hex');
async function corpus(dir) {
  const result = [];
  async function walk(path, relative = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), name);
      else result.push([name, fileHash(await readFile(join(path, entry.name)))]);
    }
  }
  await walk(dir); return result.sort((a, b) => a[0].localeCompare(b[0]));
}
(async () => {
  const hostVersion = official('@deepseek-ai/dsh/package.json').version;
  assert.equal(hostVersion, '0.2.1-rc.2');
  for (const name of ['dsh-session', 'dsh-session-persistence-jsonl']) assert.equal(official(`@deepseek-ai/${name}/package.json`).version, hostVersion);
  const { Context } = official('@deepseek-ai/cordis');
  const { Session } = official('@deepseek-ai/dsh-session');
  const persistencePlugin = official('@deepseek-ai/dsh-session-persistence-jsonl');
  const importLocal = file => import(pathToFileURL(resolve(file)).href);
  const { runHash, runPromptText } = await importLocal('packages/dsh-plugin/src/run.mjs');
  const { createDshRunObserver } = await importLocal('packages/dsh-plugin/src/dsh-run-read.mjs');
  const { prepareSyntheticReadRun, syntheticReadEntries } = await importLocal('tests/helpers/run-read-fixture.mjs');
  const dir = await mkdtemp('D:/Temp/kont-run-read-official-');
  assert.ok(resolve(dir).startsWith(resolve('D:/Temp/kont-run-read-official-')), 'fixture cleanup must stay in its dedicated Temp prefix');
  const ctx = new Context(); let store, pluginCtx, releaseRead, releaseClose;
  const previousDirectory = process.env.KONT_DATA_DIR, previousToken = process.env.KONT_AGENT_TOKEN;
  try {
    const prepared = await prepareSyntheticReadRun(join(dir, 'knot', 'worksites.json'));
    store = prepared.store; const run = prepared.run;
    const root = join(dir, 'sessions');
    await persistencePlugin.apply(ctx, { root, compression: 'none', listConcurrency: 1 });
    const persistence = ctx.sessionPersistence;
    const generated = Session.create(run.plannedSessionId);
    for (const [type, data, options] of syntheticReadEntries(run, runPromptText(run.input))) {
      if (options) generated.append(type, data, options); else generated.append(type, data);
    }
    const events = generated.snapshotEvents();
    const writer = await persistence.create(generated.header);
    try { await writer.append(events); await writer.flush(); } finally { await writer.close(); }
    const before = await corpus(root);
    const persistedHeader = (await persistence.stat(run.plannedSessionId)).header;
    assert.ok(before.length > 0, 'official JSONL log must physically exist');
    const knotBefore = await readFile(store.file);
    const binding = { runId: run.runId, requestId: run.requestId, sessionId: run.plannedSessionId, inputSha256: run.inputSha256 };
    // Independent expected fingerprint: reconstructed here through official Session,
    // not copied from the observer's first result or auto-added to its grant.
    const cut = events.findIndex(event => event.type === 'assistant/message');
    const prefix = Session.create(run.plannedSessionId, events.slice(0, cut), persistedHeader, 0);
    const boundary = { version: 1, binding, sessionHeader: persistedHeader, requestHeader: prefix.requestHeader(),
      requestContext: prefix.requestContext(), messages: prefix.deriveMessages(),
      permissionFacts: events.slice(0, cut).filter(event => ['sandbox/mode', 'approval/policy', 'permission/preset'].includes(event.type)),
      metadata: [] };
    const expectedRequestSha256 = runHash(boundary);
    let approvedHash; let opens = 0, closes = 0;
    let holdRead = false, readStarted, closeStarted, abortStarted;
    let readGate, closeGate;
    const readOnlyPersistence = {
      stat: (...args) => persistence.stat(...args),
      async open(id, access, options) {
        assert.equal(id, run.plannedSessionId); assert.equal(access, 'read'); opens++;
        const handle = await persistence.open(id, access, options);
        return { id: handle.id, header: handle.header, access: handle.access, inheritedEventCount: handle.inheritedEventCount,
          async read(...args) {
            const value = await handle.read(...args);
            if (holdRead) { args[2].signal.addEventListener('abort', abortStarted, { once: true }); readStarted(); await readGate; }
            return value;
          },
          async close() { closes++; if (holdRead) { closeStarted(); await closeGate; } await handle.close(); } };
      },
    };
    const observer = createDshRunObserver({ hostVersion, persistence: readOnlyPersistence, Session,
      readRun: id => { assert.equal(id, run.runId); return store.read().runs.find(item => item.runId === id); },
      authorizeRead: asked => ({ allowed: true, binding: asked, ...(approvedHash ? { approvedRequestSha256: approvedHash } : {}) }) });
    const missing = await observer.observe(run.runId);
    assert.equal(missing.status, 'needs_request_approval'); assert.equal(missing.executionAuthorized, false);
    approvedHash = '0'.repeat(64);
    const mismatch = await observer.observe(run.runId);
    assert.equal(mismatch.status, 'request_approval_mismatch'); assert.equal(mismatch.requestFingerprintApproved, false);
    approvedHash = expectedRequestSha256;
    const approved = await observer.observe(run.runId);
    assert.equal(approved.status, 'request_fingerprint_approved'); assert.equal(approved.executionAuthorized, false);
    assert.equal(approved.requestSha256, expectedRequestSha256); assert.equal(approved.logSha256, runHash(events));
    assert.equal(approved.modelRunVerified, false); assert.equal(approved.contentIncluded, false);
    assert.equal(opens, 3); assert.equal(closes, 3);
    assert.deepEqual(await corpus(root), before, 'read-only observation must not modify physical Session files');
    assert.deepEqual(await readFile(store.file), knotBefore, 'observation must not import any assets or Run receipt');
    assert.equal(store.read().runs[0].status, 'prepared');
    // RUN-006: load the plugin against this same isolated store. Reuse actual
    // official persistence above; no additional worker or real Session is used.
    await store.close();
    process.env.KONT_DATA_DIR = join(dir, 'knot');
    process.env.KONT_AGENT_TOKEN = 'synthetic-host-binding-token-0000000000000';
    pluginCtx = new Context();
    pluginCtx.provide('connection', { requestRejection: () => undefined });
    pluginCtx.provide('webServer', { register: () => () => {} });
    const { apply: applyKont } = await importLocal('packages/dsh-plugin/src/index.mjs');
    let attemptedOverride = false;
    const opensBeforeApply = opens;
    await applyKont(pluginCtx, { hostVersion, persistence: readOnlyPersistence, Session,
      authorizeRead: asked => ({ allowed: true, binding: asked, approvedRequestSha256: expectedRequestSha256 }),
      readRun() { attemptedOverride = true; throw new Error('host cannot replace plugin store'); } });
    assert.equal(opens, opensBeforeApply, 'registration must not read a Session');
    const registrationReads = opens - opensBeforeApply;
    const bound = pluginCtx.kontRunObserver;
    const boundResult = await bound.observe(run.runId);
    assert.equal(boundResult.requestSha256, expectedRequestSha256); assert.equal(boundResult.executionAuthorized, false);
    assert.equal(attemptedOverride, false);
    assert.deepEqual(await readFile(store.file), knotBefore);
    holdRead = true;
    const startedReading = new Promise(resolve => { readStarted = resolve; });
    readGate = new Promise(resolve => { releaseRead = resolve; });
    const startedClosing = new Promise(resolve => { closeStarted = resolve; });
    const startedAborting = new Promise(resolve => { abortStarted = resolve; });
    closeGate = new Promise(resolve => { releaseClose = resolve; });
    const inFlight = bound.observe(run.runId);
    const cancelled = assert.rejects(inFlight, { code: 'DSH_READ_CANCELLED' });
    await startedReading;
    let disposed = false;
    const disposal = pluginCtx.fiber.dispose().then(() => { disposed = true; });
    await startedAborting;
    await assert.rejects(bound.observe(run.runId), { code: 'DSH_OBSERVER_CLOSED' });
    assert.equal(pluginCtx.get('kontRunObserver'), undefined);
    await access(`${store.file}.lock`); assert.equal(disposed, false);
    releaseRead(); await startedClosing;
    await access(`${store.file}.lock`); assert.equal(disposed, false, 'store lock must outlive in-flight handle close');
    releaseClose(); await cancelled; await disposal;
    await assert.rejects(bound.observe(run.runId), { code: 'DSH_OBSERVER_CLOSED' });
    await assert.rejects(access(`${store.file}.lock`), { code: 'ENOENT' });
    assert.deepEqual(await readFile(store.file), knotBefore); assert.deepEqual(await corpus(root), before);
    const result = { hostVersion, fixture: 'official-library-generated-synthetic-session', source: 'installed-ASAR',
      persistedFiles: before.length, events: events.length, expectedRequestSha256, actualRequestSha256: approved.requestSha256,
      logSha256: approved.logSha256, observeCalls: opens, handlesClosed: closes, physicalBytesUnchanged: true,
      knotBytesUnchanged: true, executionAuthorized: false, modelRequests: 0, realRunCompleted: false,
      bindingChecks: { samePluginStore: true, readRunOverrideIgnored: !attemptedOverride, registrationReads,
        retainedReferenceClosed: true, inFlightCancelled: true, handleCloseBeforeStoreClose: true, serviceRemoved: true },
      statuses: [missing.status, mismatch.status, approved.status] };
    console.log(JSON.stringify(result));
  } finally {
    releaseRead?.(); releaseClose?.();
    await pluginCtx?.fiber.dispose(); await store?.close(); await ctx.fiber.dispose();
    if (previousDirectory === undefined) delete process.env.KONT_DATA_DIR; else process.env.KONT_DATA_DIR = previousDirectory;
    if (previousToken === undefined) delete process.env.KONT_AGENT_TOKEN; else process.env.KONT_AGENT_TOKEN = previousToken;
    await rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
