/**
 * Fase 5.21 — pré-validação OFFLINE dos artefatos white-label.
 * Não faz rede, não acessa banco, não imprime valores das configurações.
 * Uso: node tools/check-client-build.mjs --defines=ARQUIVO --plan=ARQUIVO --mode=release
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const allowedDefines = new Set([
  'LOJA_BACKEND', 'LOJA_API_BASE_URL', 'LOJA_STORE_SLUG',
  'LOJA_APP_NAME', 'LOJA_EXPECTED_STORE_ID', 'LOJA_EXPECTED_STORE_MODE',
  'LOJA_ENVIRONMENT', 'LOJA_PUSH_ENABLED', 'LOJA_PUBLIC_STOREFRONT_URL',
]);
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const slug = /^[a-z\d]+(?:-[a-z\d]+)*$/;
const forbiddenKey = /(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|DATABASE_URL|JWT|WEBHOOK_SECRET|CREDENTIAL)/i;

function record(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function cleanHttps(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username &&
      !url.password && !url.search && !url.hash && url.pathname === '/';
  } catch { return false; }
}
/** Returns stable error codes — never includes user-controlled/secret input. */
export function validateClientBuild(defines, plan, mode) {
  const errors = [];
  if (mode !== 'debug' && mode !== 'release') errors.push('MODE_INVALID');
  if (!record(defines) || !record(plan) || !record(plan.store) || !record(plan.android)) {
    return [...errors, 'ARTIFACT_SHAPE_INVALID'];
  }
  for (const key of Object.keys(defines)) {
    if (forbiddenKey.test(key) || !allowedDefines.has(key)) {
      errors.push('DEFINE_UNAPPROVED');
      break;
    }
  }
  if (Object.values(defines).some(value => typeof value !== 'string' || value.length > 2048)) {
    errors.push('DEFINE_VALUE_INVALID');
  }
  if (defines.LOJA_BACKEND !== 'railway') errors.push('BACKEND_NOT_RAILWAY');
  if (!cleanHttps(defines.LOJA_API_BASE_URL)) errors.push('API_URL_INVALID');
  if (typeof defines.LOJA_STORE_SLUG !== 'string' ||
      defines.LOJA_STORE_SLUG.length < 3 || defines.LOJA_STORE_SLUG.length > 48 ||
      !slug.test(defines.LOJA_STORE_SLUG)) errors.push('SLUG_INVALID');
  if (typeof defines.LOJA_EXPECTED_STORE_ID !== 'string' ||
      !uuid.test(defines.LOJA_EXPECTED_STORE_ID)) errors.push('STORE_ID_INVALID');
  const env = defines.LOJA_ENVIRONMENT;
  const expected = env === 'demo' ? 'DEMO' : 'LIVE';
  if (!['demo', 'homologacao', 'producao'].includes(env) ||
      defines.LOJA_EXPECTED_STORE_MODE !== expected) errors.push('STORE_MODE_INVALID');
  if (!['true', 'false'].includes(defines.LOJA_PUSH_ENABLED)) errors.push('PUSH_FLAG_INVALID');
  if (defines.LOJA_PUBLIC_STOREFRONT_URL && !cleanHttps(defines.LOJA_PUBLIC_STOREFRONT_URL)) {
    errors.push('STOREFRONT_URL_INVALID');
  }
  if (typeof defines.LOJA_APP_NAME !== 'string' ||
      defines.LOJA_APP_NAME.trim().length < 2) errors.push('APP_NAME_INVALID');

  if (plan.store.slug !== defines.LOJA_STORE_SLUG ||
      plan.store.id !== defines.LOJA_EXPECTED_STORE_ID ||
      plan.store.mode !== defines.LOJA_EXPECTED_STORE_MODE ||
      plan.store.environment !== defines.LOJA_ENVIRONMENT) errors.push('PLAN_STORE_MISMATCH');
  if (typeof plan.android.applicationId !== 'string' ||
      !/^[a-z][a-z\d_]*(?:\.[a-z][a-z\d_]*){1,}$/.test(plan.android.applicationId) ||
      plan.android.displayName !== defines.LOJA_APP_NAME) errors.push('ANDROID_APP_INVALID');
  if (plan.android.useFirebase !== (defines.LOJA_PUSH_ENABLED === 'true')) {
    errors.push('FIREBASE_PLAN_MISMATCH');
  }
  if (typeof plan.android.requireReleaseSigning !== 'boolean' ||
      plan.android.requireReleaseSigning !== (env === 'producao')) {
    errors.push('SIGNING_PLAN_INVALID');
  }
  if (env === 'producao' && mode !== 'release') errors.push('PRODUCTION_REQUIRES_RELEASE');
  const finalSuffix = plan.android.applicationId?.split('.').at(-1);
  if ((env === 'demo' && finalSuffix !== 'demo') ||
      (env === 'homologacao' && !['hml', 'homologacao'].includes(finalSuffix)) ||
      (env === 'producao' && ['demo', 'hml', 'homologacao'].includes(finalSuffix))) {
    errors.push('ANDROID_ENVIRONMENT_MISMATCH');
  }
  return [...new Set(errors)];
}

async function jsonFile(filename) {
  const contents = await readFile(filename);
  if (contents.byteLength > 65536) throw Error('FILE_TOO_LARGE');
  return JSON.parse(contents.toString('utf8').replace(/^\uFEFF/, ''));
}
export async function runCli(args, io = console) {
  const fields = new Map();
  for (const arg of args) {
    const match = /^--(defines|plan|mode)=(.+)$/.exec(arg);
    if (!match || fields.has(match[1])) {
      io.error('F40 BUILD PREFLIGHT: ARGUMENTS_INVALID');
      return 2;
    }
    fields.set(match[1], match[2]);
  }
  if (fields.size !== 3) {
    io.error('F40 BUILD PREFLIGHT: ARGUMENTS_INVALID');
    return 2;
  }
  try {
    const defines = await jsonFile(fields.get('defines'));
    const plan = await jsonFile(fields.get('plan'));
    const failures = validateClientBuild(defines, plan, fields.get('mode'));
    if (failures.length) {
      io.error('F40 BUILD PREFLIGHT: BLOCKED: ' + failures.join(', '));
      return 3;
    }
    io.log('F40 BUILD PREFLIGHT: OK — loja vinculada, backend explícito e ambiente consistente.');
    return 0;
  } catch {
    io.error('F40 BUILD PREFLIGHT: FILE_INVALID_OR_UNREADABLE');
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
