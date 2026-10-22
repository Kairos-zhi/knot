# KONT-DESKTOP-003-A compatibility candidate

Official source tag `dsh-v0.2.1-rc.2` resolves to `687f282e8625c6b8d11ff58211a90524be2e4317` (`git ls-remote --tags`). Installed ASAR public modules were copied read-only by `probe-runtime.cjs`; per-file hashes are in `runtime-manifest.json`, full archive hash in `receipt.json`. Source mechanism references are the already fixed files in `evidence/local/20261021-desktop/maker/source-0.2.1/`.

## Reuse / adaptation

- `connection.requestRejection(req)` remains the public Host/Origin fence plus browser/API authentication admission. Actual 0.2.1 Connection cookie exchange, anonymous 401, malicious Origin 403 and browser-authorized KONT command were exercised with an isolated memory credential provider.
- `WebServer.register({kind:'exact',path,handler})` still returns a route disposer. Actual 0.2.1 service bound an OS-assigned loopback port and served all tested KONT HTTP routes. No Host changes are necessary.
- Cordis 4.0.5 still awaits asynchronous effect disposers. KONT's accepted `ctx.effect(() => async () => ...)` releases the storage lock before disposal resolves. No lifecycle change is necessary.
- Official Desktop host sends authenticated WebHost URL/injections by IPC; Electron's `dsh-app://app/` protocol forwards application HTTP with host authentication. KONT uses a relative URL and same-origin credentials. The actual shipped layout/sidebar still declare keyed `main`, list `sidebar.panellist`, and `layout.selectPanel`; ModuleLoader format is unchanged. These are source-contract checks, not a renderer boot acceptance.
- Keep `dsh.client.platform=web`: official Electron uses the shared Web client. Keep the existing three injection dependencies and wrapper patch; do not add a parallel Desktop kernel.
- Exact peer support extends only to `0.1.7-rc.2 || 0.2.1-rc.2`, preserving the old accepted slice. No wildcard or other version is declared.

## Package integrity

The generated `lib/` directory is excluded by repository `.gitignore`. Explicit `files: ["src/", "lib/"]` now makes the plugin package include `client.js`, `snapshot.js`, `knot-model.js`, and `workspace-state.js`. Official bundled pnpm 11.28.5 `pack` lists all four; the produced tarball is retained here for inspection.

Official PluginManager invokes pnpm `add` with the exact supplied spec. A bare absolute directory is a link under this pnpm version and does not install wrapper dependencies. A fresh isolated install of `file:C:/Users/x2270/Documents/ChatGPT/KONT/packages/desktop-bundle` installs two copied packages and correctly resolves `file:../dsh-plugin` relative to the original wrapper. Tests byte-compare every required copied runtime module, then run that copied plugin with the actual 0.2.1 service libraries. Use the `file:` absolute directory spec for the controller's supported-manager operation. Do not distribute the wrapper as an independent tgz with this sibling dependency.

## Validation / boundary

R1 `npm test`: 22 passed, zero failed/skipped. R1 receipt, log and package are retained under `r1-frozen/`.

R2 adds the specifically authorized renderer inventory getter and two VM lifecycle tests. `npm test`: 33 passed, zero failed/skipped, including other concurrently added runtime tests. Backend, kernel, styles and build script remain unchanged. The prior candidate's source/build hashes are compared in `receipt.json`; differences are plugin manifest, `src/client.cjs` and generated `lib/client.js`.

## R2 read-only renderer inventory

Read expression: `JSON.stringify(window[Symbol.for('kont.renderer.receipt.v1')] ?? null)`.

The non-enumerable getter has no setter and returns a frozen object containing only `{module:'@kont/dsh-plugin', version:'0.1.0', active, mainRegistered, sidebarRegistered}`. Module download creates no receipt. Apply installs it with both registration flags false. Each flag becomes true only after the corresponding real `ctx.slots.register` returns successfully. Declaration collapse clears its flag. Apply/registration failure removes the current receipt. Context disposal marks inactive and removes its own getter. An older instance cannot delete the newer getter; a new instance begins with both flags false, so old ready does not carry over. No asset, draft, HTML, identity or credential is recorded. This is inventory, not product state authority.

VM tests cover deferred declarations, readonly/frozen shape, partial registration failure, collapse, multi-instance replacement, old-instance disposal and late callback after disposal. Actual renderer evidence must still be read by B from the live renderer with the expression above; passing the VM test alone is not a claim of live Desktop apply.

This is a pre-install compatibility candidate. Official pluginManager inspect/install, actual Desktop renderer injection/serving, live authentication forwarding, stop/restart/persistence and independent Checker/Gate remain with the controller and runtime Maker. No profile, credential, signed ASAR, or running Desktop configuration was modified by A.
