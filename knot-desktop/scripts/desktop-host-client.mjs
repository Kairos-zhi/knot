import { randomUUID } from 'node:crypto';

export const INSTALL_SPEC = 'file:C:/Users/x2270/Documents/ChatGPT/KONT/packages/desktop-bundle';
const READ = new Set(['pluginManager/inspect', 'pluginManager/listBundles', 'pluginManager/listPlugins']);

/** Only constructs the installed 0.2.1 RPC envelope. No credentials or arbitrary endpoints. */
export function managerExpression(method, args = {}, { allowInstall = false } = {}) {
  if (!READ.has(method) && !(method === 'pluginManager/installBundle' && allowInstall)) throw new Error('Method is outside the desktop management allowlist');
  if (method.endsWith('/inspect') || method.endsWith('/installBundle')) {
    if (args.spec !== INSTALL_SPEC) throw new Error('Only the reviewed local desktop bundle is allowed');
    const allowed = method.endsWith('/inspect') ? ['registry'] : ['enabled', 'saveExact', 'requestId', 'approvedBuilds', 'registry'];
    if (Object.keys(args).some(k => !['spec', 'options'].includes(k)) || Object.keys(args.options ?? {}).some(k => !allowed.includes(k))) throw new Error('Unknown management argument');
  } else if (Object.keys(args).length) throw new Error('List methods take no arguments');
  const rpcId = randomUUID();
  const request = { type: 'client-request', rpcId, method, payload: { args } };
  // Fixed origin and the official Electron proxy own authentication. Never read cookies/token.
  return `(async()=>{if(location.protocol!=='dsh-app:'||location.hostname!=='app')throw new Error('Wrong desktop origin');const request=${JSON.stringify(request)};const response=await fetch('/api/'+request.method,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(request)});if(!response.ok)throw new Error('Desktop management HTTP '+response.status);const envelope=await response.json();if(envelope.type!=='server-response'||envelope.rpcId!==request.rpcId||!envelope.result||envelope.result.ok!==true)throw new Error('Desktop management RPC rejected');return envelope.result.value;})()`;
}

/** Explicit projections prevent raw pnpm diagnostics, URLs, or arbitrary metadata escaping. */
export function safeManagerResult(method, value) {
  const pick = (row, keys) => Object.fromEntries(keys.filter(k => typeof row?.[k] === 'boolean' || typeof row?.[k] === 'number' || (typeof row?.[k] === 'string' && !/token|secret|cookie|password|[?&#=]|https?:/i.test(row[k]))).map(k => [k, row[k]]));
  const incompatibility = rows => Array.isArray(rows) ? rows.map(row => ({ ...pick(row, ['name', 'version', 'runtimeVersion']), requirements: Object.fromEntries(Object.entries(row.requirements ?? {}).filter(([key, range]) => (key === 'engines.dsh' || /^@deepseek-ai\/dsh[-\w]*$/.test(key)) && typeof range === 'string' && /^[\dvxX.*^~<>=|+\-\sA-Za-z]+$/.test(range))) })) : undefined;
  const failure = row => ({ ...pick(row, ['code']), ...(Array.isArray(row.incompatible) ? { incompatible: incompatibility(row.incompatible) } : {}) });
  if (method === 'pluginManager/listPlugins') return value.map(row => ({ ...pick(row, ['entryId', 'moduleName', 'enabled']), fiberPhase: ['failed', 'pending', 'active', 'loading', 'unloading'].includes(row.fiberPhase) ? row.fiberPhase : null }));
  if (method === 'pluginManager/listBundles') return value.map(row => ({ ...pick(row, ['name', 'version', 'official', 'availability', 'installed', 'enabled', 'optional', 'removable']), rows: (row.rows ?? []).map(r => pick(r, ['rowId', 'moduleName', 'entryId'])), ...(row.error ? { error: failure(row.error) } : {}) }));
  return { ...pick(value, ['status', 'kind', 'name', 'version', 'bundle', 'problem', 'changed', 'application', 'stage', 'target', 'enabled', 'restartReason']), ...(value.error ? { error: failure(value.error) } : {}), ...(value.packageResult ? { packageResult: { ...pick(value.packageResult, ['exitCode', 'truncated', 'timedOut', 'kind']), ...(Array.isArray(value.packageResult.incompatible) ? { incompatible: incompatibility(value.packageResult.incompatible) } : {}) } } : {}) };
}

export const CLIENT_STATUS_EXPRESSION = `(()=>{if(location.protocol!=='dsh-app:'||location.hostname!=='app')throw new Error('Wrong desktop origin');const row=window[Symbol.for('kont.renderer.receipt.v1')];if(row===undefined)return {present:false};if(row.module!=='@kont/dsh-plugin'||row.version!=='0.1.0'||['active','mainRegistered','sidebarRegistered'].some(key=>typeof row[key]!=='boolean'))throw new Error('Invalid Knot renderer receipt');return {present:true,module:row.module,version:row.version,active:row.active,mainRegistered:row.mainRegistered,sidebarRegistered:row.sidebarRegistered};})()`;

export function createDesktopManager(evaluate, { allowInstall = false } = {}) {
  const invoke = async (method, args) => safeManagerResult(method, await evaluate(managerExpression(method, args, { allowInstall })));
  return Object.freeze({
    inspect: () => invoke('pluginManager/inspect', { spec: INSTALL_SPEC }),
    listBundles: () => invoke('pluginManager/listBundles', {}),
    listPlugins: () => invoke('pluginManager/listPlugins', {}),
    readClientStatus: () => evaluate(CLIENT_STATUS_EXPRESSION),
    installBundle: () => invoke('pluginManager/installBundle', { spec: INSTALL_SPEC, options: { enabled: true, saveExact: true } }),
  });
}
