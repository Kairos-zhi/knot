import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { DshReadError } from './dsh-run-read.mjs';

export const readAuditInject = Object.freeze(['pluginPackages', 'sessionPersistence']);
const fail = code => { throw new DshReadError(code); };
const check = (condition, code = 'DSH_CONFIG_INVALID') => { if (!condition) fail(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, names) => record(value) && Object.keys(value).every(name => names.includes(name));
const identity = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

/** Copy plain JSON without invoking getters/toJSON or accepting lossy values. */
function jsonCopy(value, depth = 0) {
  check(depth <= 8);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { check(Number.isFinite(value)); return value; }
  check(typeof value === 'object');
  check(Object.getOwnPropertySymbols(value).length === 0);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    check(value.length <= 200 && Object.keys(descriptors).length === value.length + 1);
    return Array.from({ length: value.length }, (_, index) => {
      const property = descriptors[String(index)];
      check(property && property.enumerable && Object.hasOwn(property, 'value'));
      return jsonCopy(property.value, depth + 1);
    });
  }
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const result = Object.create(null);
  for (const [key, property] of Object.entries(descriptors)) {
    check(property.enumerable && Object.hasOwn(property, 'value'));
    Object.defineProperty(result, key, { value: jsonCopy(property.value, depth + 1), enumerable: true, writable: true, configurable: true });
  }
  return result;
}

export function parseReadAuditConfig(config = {}) {
  const value = jsonCopy(config);
  check(only(value, ['readAudit']));
  const audit = value.readAudit ?? {};
  check(value.readAudit !== null && only(audit, ['enabled', 'grants']));
  const enabled = audit.enabled ?? false, grants = audit.grants ?? [];
  check(typeof enabled === 'boolean' && audit.enabled !== null && audit.grants !== null && Array.isArray(grants) && grants.length <= 200);
  for (const grant of grants) {
    check(only(grant, ['runId', 'requestId', 'sessionId', 'inputSha256', 'approvedRequestSha256'])
      && identity(grant.runId) && identity(grant.requestId)
      && typeof grant.sessionId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(grant.sessionId)
      && digest(grant.inputSha256) && (grant.approvedRequestSha256 === undefined || digest(grant.approvedRequestSha256)));
  }
  check(new Set(grants.map(grant => grant.runId)).size === grants.length);
  return freeze({ enabled, grants });
}

/** Resolve only named host-owned packages; no configuration field names a path,
 * runtime version, class, persistence service or authorization callback. */
export async function resolveReadAudit(ctx, audit) {
  if (!audit.enabled) return {};
  try {
    const packages = ctx.get('pluginPackages'), persistence = ctx.get('sessionPersistence');
    check(typeof packages?.packageOf === 'function' && typeof persistence?.open === 'function'
      && typeof persistence?.stat === 'function', 'DSH_HOST_CAPABILITY_MISSING');
    const metadata = async name => {
      const pkg = packages.packageOf(name, import.meta.url);
      check(pkg?.name === name && pkg.version === '0.2.1-rc.2' && typeof pkg.dir === 'string' && isAbsolute(pkg.dir)
        && typeof pkg.manifestPath === 'string' && resolve(pkg.dir, 'package.json') === resolve(pkg.manifestPath), 'DSH_HOST_PACKAGE_REFUSED');
      const manifest = JSON.parse(await readFile(pkg.manifestPath, 'utf8'));
      check(manifest.name === name && manifest.version === '0.2.1-rc.2', 'DSH_HOST_PACKAGE_REFUSED');
      return pkg;
    };
    const boot = await metadata('@deepseek-ai/dsh-app-boot');
    const session = await metadata('@deepseek-ai/dsh-session');
    const { Session } = createRequire(session.manifestPath)(session.dir);
    check(typeof Session?.create === 'function', 'DSH_HOST_PACKAGE_REFUSED');
    return { hostVersion: boot.version, Session, persistence, authorizeRead(binding) {
      const grant = audit.grants.find(item => item.runId === binding.runId && item.requestId === binding.requestId
        && item.sessionId === binding.sessionId && item.inputSha256 === binding.inputSha256);
      return grant ? { allowed: true, binding, ...(grant.approvedRequestSha256 ? { approvedRequestSha256: grant.approvedRequestSha256 } : {}) }
        : { allowed: false };
    } };
  } catch (error) {
    if (error instanceof DshReadError) throw error;
    throw new DshReadError('DSH_HOST_PACKAGE_REFUSED');
  }
}
