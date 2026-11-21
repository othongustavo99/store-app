import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {pool} from '../db/pool.js';
import {config} from '../config.js';
import {externalConnectorHealthRoutes} from '../routes/external_connector_health.js';
import {createAccessToken} from '../security/tokens.js';
import {createIntegrationKey} from '../integrations/core.js';
import {connectorStatus, CONNECTOR_STALE_MS} from '../services/external_connector_health.js';

const storeId='11111111-1111-4111-8111-111111111111';
const integrationId='22222222-2222-4222-8222-222222222222';
const userId='33333333-3333-4333-8333-333333333333';
const key=createIntegrationKey().key;
const auth={authorization:`Bearer ${key}`};
const reply=(rows:object[])=>({rows,rowCount:rows.length});

async function fixture(t:TestContext,query:(sql:string,args?:unknown[])=>Promise<{rows:any[],rowCount:number}>) {
  const prev=config.ENABLE_EXTERNAL_INTEGRATIONS;
  config.ENABLE_EXTERNAL_INTEGRATIONS=true;
  t.after(()=>{config.ENABLE_EXTERNAL_INTEGRATIONS=prev;});
  t.mock.method(pool,'query',query);
  const app=Fastify();
  t.after(()=>app.close());
  await app.register(externalConnectorHealthRoutes);
  return app;
}

test('status do heartbeat nao e status do ERP e envelhece com o tempo',()=>{
  const now=Date.parse('2026-11-21T12:00:00Z');
  assert.equal(connectorStatus(null,false,now),'NO_REPORT');
  assert.equal(connectorStatus(null,true,now),'REVOKED');
  assert.equal(connectorStatus({lastResult:'OK',lastReportAt:new Date(now-5000)},false,now),'REPORTING');
  assert.equal(connectorStatus({lastResult:'WARNING',lastReportAt:new Date(now-5000)},false,now),'ATTENTION');
  assert.equal(connectorStatus({lastResult:'ERROR',lastReportAt:new Date(now-5000)},false,now),'ATTENTION');
  assert.equal(connectorStatus({lastResult:'OK',lastReportAt:new Date(now-CONNECTOR_STALE_MS-1)},false,now),'STALE');
  assert.equal(connectorStatus({lastResult:'OK',lastReportAt:new Date(now+31000)},false,now),'STALE');
});

test('report exige token dedicado e nunca aceita URL, PII ou erro livre',async t=>{
  const calls:unknown[][]=[];
  const app=await fixture(t,async (sql,args=[])=>{
    calls.push(args);
    if(sql.includes('FROM external_integrations i JOIN stores'))return reply([{
      id:integrationId,store_id:storeId,provider:'bling',stock_authority:false,
      delivery_mode:'LEASED',scopes:['events.read'],
    }]);
    if(sql.includes('INSERT INTO external_connector_health'))return reply([{reportedAt:new Date()}]);
    return reply([]);
  });
  const endpoint='/v1/external/health/report';
  const report={component:'ORDERS',result:'OK',summary:{claimed:1,acknowledged:1,review:0,retry:0,ackErrors:0}};
  assert.equal((await app.inject({method:'POST',url:endpoint,payload:report})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:endpoint,headers:auth,payload:{...report,email:'cliente@example.com'}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:endpoint,headers:auth,payload:{...report,summary:{...report.summary,token:'abc'}}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:endpoint,headers:auth,payload:{...report,result:'ERROR',errorCode:'Erro no CPF 999'}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:endpoint,headers:auth,payload:{...report,result:'ERROR'}})).statusCode,400);
  const res=await app.inject({method:'POST',url:endpoint,headers:auth,payload:report});
  assert.equal(res.statusCode,200,res.body);
  assert.equal(res.json().recorded,true);
  assert.ok(calls.some(args=>args[0]===integrationId && args[1]===storeId));
});

test('token revogado depois da validacao nao registra atividade',async t=>{
  const app=await fixture(t,async sql=>{
    if(sql.includes('FROM external_integrations i JOIN stores'))return reply([{
      id:integrationId,store_id:storeId,provider:'omie',stock_authority:false,
      delivery_mode:'LEASED',scopes:['events.read'],
    }]);
    return reply([]);
  });
  const res=await app.inject({method:'POST',url:'/v1/external/health/report',headers:auth,
    payload:{component:'ORDERS',result:'ERROR',errorCode:'QUEUE_NETWORK_ERROR'}});
  assert.equal(res.statusCode,403);
});

test('leitura de saude e limitada a OWNER e a propria loja',async t=>{
  const inputs:unknown[][]=[];
  const app=await fixture(t,async(sql,args=[])=>{
    inputs.push(args);
    if(sql.includes('FROM refresh_sessions'))return reply([{}]);
    if(sql.includes('FROM store_memberships'))return reply([{role:'OWNER',status:'ACTIVE'}]);
    if(sql.includes('FROM external_integrations i LEFT JOIN external_connector_health'))return reply([{
      revokedAt:null,lastResult:'OK',lastReportAt:new Date(),lastOkAt:new Date(),lastErrorCode:null,
      lastSummary:{claimed:0,acknowledged:0,review:0,retry:0,ackErrors:0},
    }]);
    return reply([]);
  });
  const token=await createAccessToken(userId,randomUUID());
  const url=`/v1/stores/${storeId}/integrations/${integrationId}/health`;
  assert.equal((await app.inject({method:'GET',url})).statusCode,401);
  const r=await app.inject({method:'GET',url,headers:{authorization:`Bearer ${token}`}});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().status,'REPORTING');
  assert.ok(inputs.some(args=>args[0]===integrationId&&args[1]===storeId));
});

test('revogado, sem relatorio e inexistente sao situacoes distintas',async t=>{
  let exists=true;
  const app=await fixture(t,async(sql)=>{
    if(sql.includes('FROM refresh_sessions'))return reply([{}]);
    if(sql.includes('FROM store_memberships'))return reply([{role:'OWNER',status:'ACTIVE'}]);
    if(sql.includes('FROM external_integrations i LEFT JOIN external_connector_health'))
      return reply(exists?[{revokedAt:null,lastResult:null,lastReportAt:null,lastOkAt:null,lastErrorCode:null,lastSummary:null}]:[]);
    return reply([]);
  });
  const jwt=await createAccessToken(userId,randomUUID());
  const url=`/v1/stores/${storeId}/integrations/${integrationId}/health`;
  const r=await app.inject({method:'GET',url,headers:{authorization:`Bearer ${jwt}`}});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().status,'NO_REPORT');
  exists=false;
  const missing=await app.inject({method:'GET',url,headers:{authorization:`Bearer ${jwt}`}});
  assert.equal(missing.statusCode,404);
});
