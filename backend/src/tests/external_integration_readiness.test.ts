import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { createAccessToken } from '../security/tokens.js';
import { externalIntegrationReadinessRoutes } from '../routes/external_integration_readiness.js';
import { evaluateIntegrationReadiness, type ReadinessInput } from '../services/external_integration_readiness.js';

const storeId = '11111111-1111-4111-8111-111111111111';
const integrationId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const make = (changes: Partial<ReadinessInput> = {}): ReadinessInput => ({
  provider: 'bling', revokedAt: null, deliveryMode: 'LEASED', orderAuthority: true,
  scopes: ['orders.read','events.read','orders.customer.read','orders.write'],
  activeVariants: 2, mappedVariants: 2, deadEvents: 0,
  lastResult: 'OK', lastReportAt: new Date('2026-11-21T12:00:00Z'), ...changes,
});
const reply = (rows: any[]) => ({rows,rowCount:rows.length});

test('diagnostico tecnicamente completo NUNCA e homologacao de ERP', () => {
  const result = evaluateIntegrationReadiness(make(), Date.parse('2026-11-21T12:01:00Z'));
  assert.equal(result.status, 'CHECKLIST_OK');
  assert.equal(result.homologated, false);
  assert.equal(result.checks.length, 6);
  assert.equal(result.counts.unmappedVariants, 0);
});

test('pendencias sao explicitas e limitadas a dados operacionais', () => {
  const input = make({deliveryMode:'POLL',scopes:['orders.read'],orderAuthority:false,
    activeVariants:3,mappedVariants:1,deadEvents:2,lastResult:'ERROR',
    lastReportAt:new Date('2026-11-21T11:00:00Z')});
  const result = evaluateIntegrationReadiness(input,Date.parse('2026-11-21T12:00:00Z'));
  assert.equal(result.status,'NEEDS_ACTION');
  assert.deepEqual(result.checks.filter(c=>!c.ok).map(c=>c.code),
    ['ORDER_PERMISSIONS','LEASED_QUEUE','CATALOG_MAPPED','NO_DEAD_EVENTS','WORKER_REPORTING']);
  assert.equal(result.counts.unmappedVariants,2);
  assert.equal(JSON.stringify(result).includes('token'),false);
});

test('credencial revogada, catalogo vazio e sem heartbeat sao pendencias distintas', () => {
  const result = evaluateIntegrationReadiness(make({revokedAt:new Date(),activeVariants:0,
    mappedVariants:0,lastResult:null,lastReportAt:null}));
  assert.equal(result.status,'NEEDS_ACTION');
  assert.deepEqual(result.checks.filter(c=>!c.ok).map(c=>c.code),
    ['ACTIVE','CATALOG_MAPPED','WORKER_REPORTING']);
});

async function fixture(t: TestContext, query: (sql:string,args?:unknown[])=>Promise<{rows:any[];rowCount:number}>) {
  const previous = config.ENABLE_EXTERNAL_INTEGRATIONS;
  config.ENABLE_EXTERNAL_INTEGRATIONS = true;
  t.after(() => {config.ENABLE_EXTERNAL_INTEGRATIONS=previous;});
  t.mock.method(pool,'query',query);
  const app = Fastify();
  t.after(()=>app.close());
  await app.register(externalIntegrationReadinessRoutes);
  return app;
}

const endpoint = `/v1/stores/${storeId}/integrations/${integrationId}/readiness`;

function queryResponse(sql:string, args: unknown[] = []) {
  if (sql.includes('FROM refresh_sessions')) return reply([{}]);
  if (sql.includes('FROM store_memberships')) return reply([{role:'OWNER',status:'ACTIVE'}]);
  if (sql.includes('FROM external_integrations WHERE id=$1 AND store_id=$2'))
    return reply([{provider:'bling',revokedAt:null,scopes:make().scopes,
      deliveryMode:'LEASED',orderAuthority:true}]);
  if (sql.includes('FROM product_variants v'))return reply([{activeVariants:2,mappedVariants:2}]);
  if (sql.includes('FROM external_event_deliveries'))return reply([{deadEvents:0}]);
  if (sql.includes('FROM external_connector_health'))return reply([
    {lastResult:'OK',lastReportAt:new Date()}]);
  throw new Error(`Consulta inesperada: ${sql.slice(0,100)}, args=${args.length}`);
}

test('API exige OWNER, filtra por loja e nao vaza dados nem credenciais',async t => {
  const queried: {sql:string;args:unknown[]}[]=[];
  const app=await fixture(t,async(sql,args=[])=>{
    queried.push({sql,args});
    return queryResponse(sql,args);
  });
  assert.equal((await app.inject({method:'GET',url:endpoint})).statusCode,401);
  const access=await createAccessToken(userId,randomUUID());
  const res=await app.inject({method:'GET',url:endpoint,
    headers:{authorization:`Bearer ${access}`}});
  assert.equal(res.statusCode,200,res.body);
  assert.equal(res.json().status,'CHECKLIST_OK');
  assert.equal(res.json().homologated,false);
  assert.ok(queried.filter(x => /FROM external_integrations WHERE id=|FROM product_variants v|FROM external_event_deliveries|FROM external_connector_health/.test(x.sql)).every(x => x.args[0]===integrationId && x.args[1]===storeId));
  for (const term of ['token','prefix','cpf','email','secret'])
    assert.ok(!JSON.stringify(res.json()).toLowerCase().includes(term));
});

test('sem permissao de OWNER bloqueia consulta',async t=>{
  const app=await fixture(t,async(sql,args=[]) => {
    if(sql.includes('FROM refresh_sessions'))return reply([{}]);
    if(sql.includes('FROM store_memberships'))return reply([{role:'STAFF',status:'ACTIVE'}]);
    return queryResponse(sql,args);
  });
  const access=await createAccessToken(userId,randomUUID());
  const res=await app.inject({method:'GET',url:endpoint,
    headers:{authorization:`Bearer ${access}`}});
  assert.equal(res.statusCode,403);
});

test('vinculo de outra loja nao e retornado',async t=>{
  const app=await fixture(t,async(sql,args=[])=>{
    if(sql.includes('FROM external_integrations WHERE id=$1 AND store_id=$2'))return reply([]);
    return queryResponse(sql,args);
  });
  const access=await createAccessToken(userId,randomUUID());
  const res=await app.inject({method:'GET',url:endpoint,
    headers:{authorization:`Bearer ${access}`}});
  assert.equal(res.statusCode,404);
});

test('feature flag desativada bloqueia diagnostico',async t=>{
  const app=await fixture(t,async(sql,args)=>queryResponse(sql,args));
  config.ENABLE_EXTERNAL_INTEGRATIONS=false;
  const access=await createAccessToken(userId,randomUUID());
  assert.equal((await app.inject({method:'GET',url:endpoint,
    headers:{authorization:`Bearer ${access}`}})).statusCode,503);
});
