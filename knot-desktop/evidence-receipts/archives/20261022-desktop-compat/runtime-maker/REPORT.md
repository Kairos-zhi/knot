# KONT-DESKTOP-003 B — official Host integration preflight

2026-10-22. Maker only. No install, restart, profile edit, credential read, screenshot, click or model call performed by B. Initial r1 was transport preparation only; controller subsequently authorized B's narrowly scoped r2 normal-quit diagnosis and actual quit, recorded below. The r1 debug source, freeze hashes, report and test log are retained in `r1/`.

## Actual Host

Controller launched the official signed `<desktop-app>/DeepSeek Harness.exe` 0.2.1-rc.2 with existing `scripts/start-desktop.ps1`. Read-only process/socket inspection found main PID 55612 and Host PID 56440 listening on 127.0.0.1:14029. No debugging endpoint was enabled by B. These PIDs/port are a point-in-time observation, not persistent discovery configuration.

The installed ASAR was opened read-only. Static source excerpts are in `source/`; the initial 11-member manifest records exact archive paths and SHA-256. Additional source files were extracted only from the same installed ASAR. No runtime tokens/cookies/provider settings were read or copied.

## Source-confirmed contracts

- `source/dsh_node_modules_@deepseek-ai_dsh-plugin-manager_lib_typert.remote-client.js:479`: `pluginManager/inspect`, named JSON arguments `{spec, options?}`, options only `registry`.
- Same file:529: `pluginManager/installBundle`, named JSON arguments `{spec, options?}`. Options are `enabled`, `saveExact`, `requestId`, `approvedBuilds`, `registry`. No `replace`/`exact` field. Default activation true. The candidate tool uses only `{enabled:true,saveExact:true}` and the controller-approved `file:<user-home>/Documents/ChatGPT/KONT/packages/desktop-bundle` spec.
- Same file:580 and :595: `listBundles()` and `listPlugins()` take no arguments. Bundles describe installation/selection; plugin `fiberPhase: active` describes actual Host runtime.
- `source/lib_main.js:8882`: official unary transport POST `/api/<namespace>/<method>`, envelope `{type:'client-request',rpcId,method,payload:{args}}`; response `server-response` must correlate rpcId and `result.ok:true`.
- `source/lib_main.js:12410`: official `dsh-app://app` proxy attaches Host authentication. The tool uses same-origin fetch within this owned main frame; it never extracts authentication.
- The new `/connect?token=...` operator-cookie exchange exists but is not used: the launch token lives in private Host→Electron IPC/memory. No disk credential scraping or unsigned cookie fabrication is appropriate.

## Temporary transport tools and exact exports

`scripts/desktop-host-client.mjs`: `INSTALL_SPEC`, `managerExpression`, `safeManagerResult`, `createDesktopManager`, `CLIENT_STATUS_EXPRESSION`. Only three management reads plus explicitly enabled `installBundle` and the separately scoped fixed `readClientStatus()` Knot receipt read. All output is projected, excluding raw package-manager output, log paths, metadata, diagnostics, registry URLs and authentication. Official `incompatible-version` package name/version/runtimeVersion/DSH requirement ranges are retained from management errors and package results; compatibility is not silently dropped.

`scripts/desktop-host-debug.mjs`: `connectDesktopManager(origin,{allowInstall:false})`, `requestDesktopQuit(webSocketEndpoint)`. Endpoint host must be literal 127.0.0.1, no credentials/query/fragment. CDP discovery selects exactly one `page` target with `dsh-app://app/` origin. Each expression verifies origin again. No public arbitrary evaluation/command API is exported. Debugging ports must be controller-owned, loopback-bound, temporary, verified and closed afterward; no tool starts Desktop or enables a port.

Controller read-only command after approved temporary launch:

```powershell
node --input-type=module -e "import {connectDesktopManager} from './scripts/desktop-host-debug.mjs'; const client=await connectDesktopManager('http://127.0.0.1:RENDERER_PORT'); try { console.log(JSON.stringify({inspection:await client.inspect(),bundles:await client.listBundles(),plugins:await client.listPlugins()})); } finally {client.close();}"
```

Installation after Checker/controller gate requires the explicit option `{allowInstall:true}` then `await client.installBundle()`. No install is done implicitly by connection or inspection. This uses the official Host plugin manager and its bundled package manager. The existing desktop profile is never edited by our code.

Normal quit, only through the controller's approved temporary main-process inspector endpoint:

```powershell
node --input-type=module -e "import {requestDesktopQuit} from './scripts/desktop-host-debug.mjs'; console.log(await requestDesktopQuit('ws://127.0.0.1:MAIN_INSPECT_PORT/SESSION_ID'));"
```

The only main-process expression resolves Electron with `process.getBuiltinModule('module').createRequire('<desktop-app>/resources/app.asar/lib/main.js')('electron')` and schedules `app.quit()`. It does not read environment, credentials, cookies, arbitrary process fields or return module objects. A successful requested response explicitly does **not** prove process exit. Controller must wait for the app/Host to exit, confirm the KONT store lock disappears naturally after installation, then reopen normally and read persistent state.

### R2 actual quit diagnosis and correction

The controller's first real r1 quit call failed. A fixed-expression catch returned only a fixed category and a whitelisted error code: `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` (`fixed-import-diagnosis.json`). This proves inspector evaluation cannot use the earlier dynamic `import('electron')`; retrying dynamic import for node:module would have the same callback limitation. The installed official `lib/main.js` line 1 itself imports createRequire from node:module and line 5 imports Electron's app. The fixed Node builtin loader path avoids dynamic import while retaining that exact official module anchor.

`diagnose-fixed-require.mjs` returned only `{classification:'fixed-require-checked',quitAvailable:true}`; no module/process data were exposed. With controller's explicit authorization, `run-fixed-quit.mjs` invoked the repaired fixed quit function on the already running temporary main inspector. `fixed-quit-request.json` records `requested:true,provesProcessExit:false`. Independent shell readback in `fixed-quit-exit-check.json` found main PID60204 and its previously recorded children64268/51476/55072/56648 all absent, with no19221/19222 listeners. Thus real official normal quit succeeded before installation. No forced process termination, app.exit/process.exit, native confirmation automation, installer, profile mutation or model call occurred. Controller was notified to reopen; B did not reopen. This pre-install test has no KONT lock to verify; post-install lock/persistence remains controller Gate work.

## Lifecycle and data path

`source/lib_main.js:12894`: closing the main window prevents close and hides it. CloseMainWindow is **not** a shutdown proof.

`source/lib_preload-app.cjs:789`: product bridge exports browser/deviceInfo/keyboard/shortcuts/updates; no supported renderer quit/restart method. `source/lib_main.js:12772` native restart menu uses app.relaunch and coordinated quit. `:13094` before-quit performs Host task inspection and calls finishQuit→backend.close. `source/dsh_node_modules_@deepseek-ai_dsh-desktop-host_lib_index.js` awaits the profile application's shutdown after private `shutdown` IPC and replies shutdown-complete. Existing tasks can produce a native confirmation; the tool never answers that confirmation.

Existing `scripts/start-desktop.ps1` sets process-scoped DSH_HOME and KONT_DATA_DIR. Installed `lib_main.js:3776-3810` forwards the environment into the Host process; `packages/dsh-plugin/src/index.mjs:120` consumes KONT_DATA_DIR and opens its store there. Confirm inheritance by actual post-install persistent artifacts/state, without enumerating or dumping environment variables. Packaged mode ignores the development-only DSH_DESKTOP_HOST_INSPECT_PORT (`lib_main.js:11905`), so it is not a route for enabling a packaged Host inspector.

## Renderer proof limit

Installed `dsh-client-modules` publishes `window.__DSH_BOOT__` and a module-registration facade. Live module tables and the Loader are held by the local frontend WebApp instance; the facade exposes registration, not a read-only inventory. The dynamic Cordis UI inventory is a different domain and does not prove an installed plugin's slots. Host active fiber, boot-graph membership, successful bundle download and actual renderer apply/slot registration are separate claims. B found no existing supported read API that proves the last claim; no hook, inspector plugin or forged UI action was introduced.

Controller consequently authorized A's narrow receipt: `window[Symbol.for('kont.renderer.receipt.v1')]`, getter returns fixed module/version and booleans `active`, `mainRegistered`, `sidebarRegistered`. B's `readClientStatus()` reads only those fields with type/identity validation. Absence returns `{present:false}`; receipt validity does not claim broader UI/business acceptance. A owns receipt lifecycle implementation and tests. This bridge makes no attempt to inspect arbitrary client context, slots, cookie jar or app memory.

## Self-verification

`node --test tests/desktop-host-client.test.mjs tests/desktop-host-archive.test.mjs` — exit 0, 10/10 passed. Tests execute generated RPC expressions in an isolated VM with a transport stub, reject wrong origin/uncorrelated responses/unknown methods/implicit mutation/unreviewed spec/drifted options/non-loopback targets, check secret sentinel omission and compatibility projections, validate fixed receipt projection and exact graceful-quit module/path/scheduling, and validate bounded read-only ASAR traversal handling. The ASAR fixture lives under &lt;temporary-root&gt; on Windows and its resolved fixture directory is removed afterward. No full project build run, no concurrent build, no claim of installed Knot Desktop integration success.
