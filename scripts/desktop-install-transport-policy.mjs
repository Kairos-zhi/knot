import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { managerExpression, INSTALL_SPEC } from './desktop-host-client.mjs';
const upgradeSpec = `file:${resolve(fileURLToPath(new URL('../evidence/local/20261024-desktop-package/candidate/packages/desktop-bundle', import.meta.url))).replaceAll('\\', '/')}`;
const recoverySpec = `file:${resolve(fileURLToPath(new URL('../evidence/local/20261024-desktop-recovery/candidate/packages/desktop-bundle', import.meta.url))).replaceAll('\\', '/')}`;
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const sameKeys = (value, keys) => plain(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const refuse = () => { const error = new Error('Desktop transport refused (UNREVIEWED_EXPRESSION)'); error.code = 'UNREVIEWED_EXPRESSION'; throw error; };

/** Parse no JavaScript. Accept only a byte-exact official fixed-origin template
 * whose sole variable is an allowlisted JSON RPC envelope. No eval is exposed. */
export function validateDesktopInstallExpression(expression) {
  if (typeof expression !== 'string' || expression.length > 16384) refuse();
  const marker = 'const request=', end = ';const response=await fetch';
  const begin = expression.indexOf(marker), stop = expression.indexOf(end, begin + marker.length);
  if (begin < 0 || stop < 0) refuse();
  let request;
  try { request = JSON.parse(expression.slice(begin + marker.length, stop)); } catch { refuse(); }
  if (!sameKeys(request, ['type', 'rpcId', 'method', 'payload']) || request.type !== 'client-request'
    || !/^[a-f0-9-]{36}$/i.test(request.rpcId ?? '') || !sameKeys(request.payload, ['args'])) refuse();
  const args = request.payload.args, method = request.method;
  if (method === 'pluginManager/inspect') {
    if (!sameKeys(args, ['spec']) || ![upgradeSpec, recoverySpec].includes(args.spec)) refuse();
  } else if (method === 'pluginManager/installBundle') {
    if (!sameKeys(args, ['spec', 'options']) || args.spec !== upgradeSpec
      || !sameKeys(args.options, ['enabled', 'saveExact', 'requestId']) || args.options.enabled !== true
      || args.options.saveExact !== true || typeof args.options.requestId !== 'string'
      || !args.options.requestId.trim() || args.options.requestId.length > 200 || /[\u0000-\u001f\u007f]/u.test(args.options.requestId)) refuse();
  } else if (!['pluginManager/listBundles', 'pluginManager/listPlugins'].includes(method) || !sameKeys(args, [])) refuse();
  const templateArgs = method.endsWith('/inspect') || method.endsWith('/installBundle') ? { ...args, spec: INSTALL_SPEC } : args;
  const template = managerExpression(method, templateArgs, { allowInstall: true });
  const start = template.indexOf(marker), finish = template.indexOf(end, start + marker.length);
  const expected = template.slice(0, start + marker.length) + JSON.stringify(request) + template.slice(finish);
  if (expression !== expected) refuse();
  return Object.freeze({ method, args: structuredClone(args) });
}
