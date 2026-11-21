import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {pool} from '../db/pool.js';
import {config} from '../config.js';
import {createAccessToken} from '../security/tokens.js';
import {externalGoLivePreflightRoutes} from '../routes/external_go_live_preflight.js';
import {evaluateGoLivePreflight,type GoLiveInput} from '../services/external_go_live_preflight.js';

const store='11111111-1111-4111-8111-111111111111';
const integration='22222222-2222-4222-8222-222222222222';
const user='33333333-3333-4333-8333-333333333333';
const uri=`/v1/stores/${store}/integrations/${integration}/go-live-preflight`;
const at=Date.parse('2026-11-21T12:00:00Z');
const data=():GoLiveInput=>({
  technical:{provider:'bling',revokedAt:null,scopes:['orders.read','events.read','orders.customer.read','orders.write'],
    deliveryMode:'LEASED',orderAuthority:true,activeVariants:2,mappedVariants:2,deadEvents:0,
    lastResult:'OK',lastReportAt:new Date(at-10_000)},
  deployment:{environment:'HOMOLOGATION',workerAlias:'loja-piloto',revision:1,updatedAt:new Date(at-1000),
    credentialsSecured:true,providerAccessChecked:true,catalogChecked:true,
    ordersChecked:true,reconciliationChecked:true},
});
const rows=(r:object[])=>({rows:r,rowCount:r.length});

test('todos os checks nao habilitam producao nem homologam um fornecedor',()=>{
  const result=evaluateGoLivePreflight(data(),at);
  assert.equal(result.status,'READY_FOR_SUPERVISED_VALIDATION');
  assert.equal(result.summary.pending,0);
  assert.equal(result.homologated,false);
  assert.equal(result.productionApproved,false);
  assert.equal(result.automationEnabledByThisCheck,false);
  assert.equal(result.manualValidationRequired,true);
});

test('sem perfil ficam explicitas as pendencias de implantacao',()=>{
  const input=data();delete input.deployment;
  const result=evaluateGoLivePreflight(input,at);
  assert.equal(result.status,'NEEDS_ACTION');
  assert.ok(result.pendingCodes.includes('DEPLOYMENT_PROFILE'));
  assert.ok(result.pendingCodes.includes('HOMOLOGATION_ENVIRONMENT'));
  assert.ok(result.pendingCodes.includes('CREDENTIALS_PROTECTED'));
});

test('worker atrasado, conta revogada, fila com erros e produtos nao mapeados bloqueiam',()=>{
  const input=data();
  input.technical.revokedAt=new Date(at);
  input.technical.lastReportAt=new Date(at-1_000_000);
  input.technical.mappedVariants=1;
  input.technical.deadEvents=2;
  const result=evaluateGoLivePreflight(input,at);
  for(const code of ['TECH_ACTIVE','TECH_CATALOG_MAPPED','TECH_NO_DEAD_EVENTS','TECH_WORKER_REPORTING'])
    assert.ok(result.pendingCodes.includes(code));
  assert.equal(result.status,'NEEDS_ACTION');
});

test('perfil PRODUCTION nao e usado como comprovante de homologacao',()=>{
  const input=data();input.deployment!.environment='PRODUCTION';
  assert.ok(evaluateGoLivePreflight(input,at).pendingCodes.includes('HOMOLOGATION_ENVIRONMENT'));
});

test('o relatorio nao inclui credenciais nem dados de comprador',()=>{
  const output=JSON.stringify(evaluateGoLivePreflight(data(),at)).toLowerCase();
  for(const term of ['access_token','refresh_token','cpf','email','secret','password'])
    assert.equal(output.includes(term),false,term);
});

async function fixture(t:TestContext, opts:{role?:string;exists?:boolean;profile?:boolean}={}) {
  const old=config.ENABLE_EXTERNAL_INTEGRATIONS;
  config.ENABLE_EXTERNAL_INTEGRATIONS=true;
  t.after(()=>{config.ENABLE_EXTERNAL_INTEGRATIONS=old;});
  const queries:{sql:string;args:unknown[]}[]=[];
  t.mock.method(pool,'query',async (sql:string,args:unknown[]=[])=>{
    queries.push({sql,args});
    if(sql.includes('FROM refresh_sessions'))return rows([{}]);
    if(sql.includes('FROM store_memberships'))return rows([{role:opts.role??'OWNER',status:'ACTIVE'}]);
    if(sql.includes('FROM external_integrations WHERE'))return rows(opts.exists===false?[]:[{
      provider:'bling',revokedAt:null,scopes:data().technical.scopes,
      deliveryMode:'LEASED',orderAuthority:true,
    }]);
    if(sql.includes('FROM product_variants v'))return rows([{activeVariants:2,mappedVariants:2}]);
    if(sql.includes('FROM external_event_deliveries'))return rows([{deadEvents:0}]);
    if(sql.includes('FROM external_connector_health'))return rows([{
      lastResult:'OK',lastReportAt:new Date(),
    }]);
    if(sql.includes('FROM external_integration_deployments'))return rows(opts.profile===false?[]:[data().deployment!]);
    throw new Error(`SQL nao esperado: ${sql.slice(0,80)}`);
  });
  const app=Fastify();t.after(()=>app.close());
  await app.register(externalGoLivePreflightRoutes);
  return {app,queries};
}
const auth=async()=>({authorization:`Bearer ${await createAccessToken(user,randomUUID())}`});

test('GET e somente OWNER, sem credenciais, e sempre filtra loja e integracao',async t=>{
  const {app,queries}=await fixture(t);
  assert.equal((await app.inject({method:'GET',url:uri})).statusCode,401);
  const res=await app.inject({method:'GET',url:uri,headers:await auth()});
  assert.equal(res.statusCode,200,res.body);
  assert.equal(res.json().homologated,false);
  assert.equal(res.json().productionApproved,false);
  const scoped=queries.filter(x=>/FROM external_integrations WHERE|FROM product_variants v|FROM external_event_deliveries|FROM external_connector_health|FROM external_integration_deployments/.test(x.sql));
  assert.equal(scoped.length,5);
  assert.ok(scoped.every(x=>x.args[0]===integration && x.args[1]===store));
  assert.ok(!JSON.stringify(res.json()).includes('tokenPrefix'));
  assert.equal((await app.inject({method:'POST',url:uri,headers:await auth(),payload:{activate:true}})).statusCode,404);
});

test('STAFF nao pode consultar dados de outra integracao',async t=>{
  const {app}=await fixture(t,{role:'STAFF'});
  assert.equal((await app.inject({method:'GET',url:uri,headers:await auth()})).statusCode,403);
});

test('integracao ausente nesta loja retorna 404',async t=>{
  const {app}=await fixture(t,{exists:false});
  assert.equal((await app.inject({method:'GET',url:uri,headers:await auth()})).statusCode,404);
});

test('flag desabilitada retorna 503 sem consultar ERP',async t=>{
  const {app}=await fixture(t);
  config.ENABLE_EXTERNAL_INTEGRATIONS=false;
  assert.equal((await app.inject({method:'GET',url:uri,headers:await auth()})).statusCode,503);
});
