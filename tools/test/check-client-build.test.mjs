import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateClientBuild, runCli } from '../check-client-build.mjs';

const id = '10000000-0000-4000-8000-000000000001';
function fixture(environment = 'demo') {
  const mode = environment === 'demo' ? 'DEMO' : 'LIVE';
  const suffix = environment === 'demo' ? 'demo' : environment === 'homologacao' ? 'hml' : 'loja';
  const defines = {
    LOJA_BACKEND: 'railway', LOJA_API_BASE_URL: 'https://api.example.invalid',
    LOJA_STORE_SLUG: 'loja-exemplo', LOJA_APP_NAME: 'Loja Exemplo',
    LOJA_EXPECTED_STORE_ID: id, LOJA_EXPECTED_STORE_MODE: mode,
    LOJA_ENVIRONMENT: environment, LOJA_PUSH_ENABLED: 'false',
  };
  const plan = {
    store: { slug: defines.LOJA_STORE_SLUG, id, mode, environment },
    android: { applicationId: `br.com.frequencia40.${suffix}`,
      displayName: 'Loja Exemplo', useFirebase: false,
      requireReleaseSigning: environment === 'producao' },
  };
  return { defines, plan };
}
function rejects(mutator, code, environment = 'demo', buildMode = 'debug') {
  const { defines, plan } = fixture(environment);
  mutator(defines, plan);
  assert.ok(validateClientBuild(defines, plan, buildMode).includes(code), code);
}
for (const env of ['demo', 'homologacao', 'producao']) {
  test(`${env} vinculado e consistente passa no modo correto`, () => {
    const {defines, plan} = fixture(env);
    assert.deepEqual(validateClientBuild(defines, plan, env === 'demo' ? 'debug' : 'release'), []);
  });
}
test('produção em debug é bloqueada', () => {
  const {defines, plan} = fixture('producao');
  assert.ok(validateClientBuild(defines, plan, 'debug').includes('PRODUCTION_REQUIRES_RELEASE'));
});
test('backend omitido não passa', () => rejects(d => delete d.LOJA_BACKEND, 'BACKEND_NOT_RAILWAY'));
test('firebase legado é bloqueado no gerador', () => rejects(d => d.LOJA_BACKEND = 'firebase', 'BACKEND_NOT_RAILWAY'));
test('URL http é bloqueada', () => rejects(d => d.LOJA_API_BASE_URL = 'http://api.example.invalid', 'API_URL_INVALID'));
test('URL com credenciais é bloqueada', () => rejects(d => d.LOJA_API_BASE_URL = 'https://u:p@api.example.invalid', 'API_URL_INVALID'));
test('URL com query de token é bloqueada', () => rejects(d => d.LOJA_API_BASE_URL = 'https://api.example.invalid/?token=a', 'API_URL_INVALID'));
test('URL com path inesperado é bloqueada', () => rejects(d => d.LOJA_API_BASE_URL = 'https://api.example.invalid/private', 'API_URL_INVALID'));
test('slug inválido bloqueado', () => rejects(d => d.LOJA_STORE_SLUG = 'Loja 1', 'SLUG_INVALID'));
test('UUID ausente é bloqueado', () => rejects(d => delete d.LOJA_EXPECTED_STORE_ID, 'STORE_ID_INVALID'));
test('loja divergente é bloqueada', () => rejects((d,p) => p.store.id = '20000000-0000-4000-8000-000000000001', 'PLAN_STORE_MISMATCH'));
test('ambiente divergente é bloqueado', () => rejects(d => d.LOJA_EXPECTED_STORE_MODE = 'LIVE', 'STORE_MODE_INVALID'));
test('push divergente entre defines e Android é bloqueado', () => rejects((d,p) => p.android.useFirebase = true, 'FIREBASE_PLAN_MISMATCH'));
test('assinatura de produção não declarada é bloqueada', () => rejects((d,p) => p.android.requireReleaseSigning = false, 'SIGNING_PLAN_INVALID', 'producao', 'release'));
test('pacote demo em produção é bloqueado', () => rejects((d,p) => p.android.applicationId = 'br.com.frequencia40.demo', 'ANDROID_ENVIRONMENT_MISMATCH', 'producao', 'release'));
test('segredo extra não é admitido em dart define', () => rejects(d => d.JWT_SECRET = 'nao-registrar', 'DEFINE_UNAPPROVED'));
test('chave desconhecida não é admitida', () => rejects(d => d.F40_UNEXPECTED = 'valor', 'DEFINE_UNAPPROVED'));
test('entrada não objeto é bloqueada', () => {
  assert.ok(validateClientBuild([], {}, 'debug').includes('ARTIFACT_SHAPE_INVALID'));
});
test('CLI não retorna valores de credenciais em erros', async () => {
  const { defines, plan } = fixture();
  defines.JWT_SECRET = 'nao-expor-esse-segredo';
  const dir = await mkdtemp(join(tmpdir(), 'f40-preflight-'));
  try {
    const defs = join(dir, 'defines.json'); const planFile = join(dir, 'plan.json');
    await writeFile(defs, JSON.stringify(defines)); await writeFile(planFile, JSON.stringify(plan));
    const messages = [];
    const code = await runCli([`--defines=${defs}`, `--plan=${planFile}`, '--mode=release'],
      {log: s => messages.push(s), error: s => messages.push(s)});
    assert.equal(code, 3);
    assert.ok(!messages.join('').includes('nao-expor-esse-segredo'));
  } finally { await rm(dir, {recursive:true, force:true}); }
});
test('CLI informa arquivo inexistente sem imprimir caminho', async () => {
  const lines = [];
  const code = await runCli(['--defines=x', '--plan=y', '--mode=debug'],
    {log: s => lines.push(s), error: s => lines.push(s)});
  assert.equal(code, 2);
  assert.match(lines.join(' '), /FILE_INVALID_OR_UNREADABLE/);
});
test('execução real do CLI usa caminhos nativos Windows/Linux', async () => {
  const { defines, plan } = fixture();
  const dir = await mkdtemp(join(tmpdir(), 'f40-preflight-cli-'));
  try {
    const defs = join(dir, 'defines.json'); const planFile = join(dir, 'plan.json');
    await writeFile(defs, JSON.stringify(defines)); await writeFile(planFile, JSON.stringify(plan));
    const cli = fileURLToPath(new URL('../check-client-build.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [cli, `--defines=${defs}`, `--plan=${planFile}`, '--mode=release'], {encoding:'utf8'});
    assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`);
    assert.match(run.stdout, /PREFLIGHT: OK/);
  } finally { await rm(dir, {recursive:true, force:true}); }
});
