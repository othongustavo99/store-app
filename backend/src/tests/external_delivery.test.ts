import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { createIntegrationKey, hashValue } from '../integrations/core.js';
import { externalDeliveryRoutes } from '../routes/external_delivery.js';
import { externalIntegrationRoutes } from '../routes/external_integrations.js';
import { leaseSecret, retryDelaySeconds, MAX_DELIVERY_ATTEMPTS } from '../services/external_delivery_rules.js';
import { createAccessToken } from '../security/tokens.js';

const storeId='11111111-1111-4111-8111-111111111111';
const integrationId='44444444-4444-4444-8444-444444444444';
const eventId='123';
const resourceId='33333333-3333-4333-8333-333333333333';
const userId='55555555-5555-4555-8555-555555555555';
const token=createIntegrationKey().key;
const auth={authorization:`Bearer ${token}`};
const response=(rows:unknown[])=>({rows,rowCount:rows.length});

type State={status:'PENDING'|'IN_FLIGHT'|'ACKED'|'DEAD';attempts:number;hash?:string;expires?:Date;lastError?:string};
function fakeDb(mode:'POLL'|'LEASED'='LEASED', foreign=false) {
  const state:State={status:'PENDING',attempts:0};
  const sqlLog:string[]=[];
  let enabled=mode;
  let errorOnClaim=false;
  let lastLease='';
  const query=async(sql:string,args:unknown[]=[])=>{
    sqlLog.push(sql);
    if(sql.includes('FROM external_integrations i JOIN stores'))return response([{
      id:integrationId,store_id:foreign?'22222222-2222-4222-8222-222222222222':storeId,
      provider:'generic',stock_authority:false,delivery_mode:enabled,
      scopes:['events.read','orders.read','catalog.read'],
    }]);
    if(sql.includes('FROM refresh_sessions rs JOIN users'))return response([{}]);
    if(sql.includes('FROM store_memberships sm'))return response(args[0]===storeId?[{role:'OWNER',status:'ACTIVE'}]:[]);
    if(sql.includes('SELECT delivery_mode FROM external_integrations'))return response([{delivery_mode:enabled}]);
    if(sql.startsWith("UPDATE external_integrations SET delivery_mode='LEASED'")){enabled='LEASED';return response([]);}
    if(sql.includes('SELECT delivery_mode AS "deliveryMode"'))return response([{deliveryMode:enabled}]);
    if(sql.includes('SELECT id FROM external_integrations'))return response(!foreign&&enabled==='LEASED'?[{id:integrationId}]:[]);
    if(sql.includes('SELECT d.event_id::text AS id')){
      if(errorOnClaim)throw new Error('postgres failure');
      if(foreign || (state.status!=='PENDING'&&state.status!=='IN_FLIGHT') || state.status==='IN_FLIGHT'&&state.expires&&state.expires.getTime()>Date.now())return response([]);
      return response([{id:eventId,type:'order.changed',resourceId,createdAt:new Date(),attempts:state.attempts}]);
    }
    if(sql.includes('RETURNING attempts,lease_expires_at')){
      state.status='IN_FLIGHT';state.attempts++;state.hash=String(args[3]);
      state.expires=new Date(Date.now()+5*60*1000);
      return response([{attempts:state.attempts,leaseExpiresAt:state.expires}]);
    }
    if(sql.includes('SELECT status,(lease_expires_at>now()) AS "leaseValid"')){
      if(foreign || args[1]!==storeId || args[3]!==state.hash)return response([]);
      return response([{status:state.status,leaseValid:state.expires ? state.expires.getTime()>Date.now() : null}]);
    }
    if(sql.includes("SET status='ACKED'")){state.status='ACKED';state.expires=undefined;return response([]);}
    if(sql.includes("SELECT attempts FROM external_event_deliveries")){
      if(foreign || args[1]!==storeId || args[3]!==state.hash || state.status!=='IN_FLIGHT' || !state.expires || state.expires.getTime()<=Date.now())return response([]);
      return response([{attempts:state.attempts}]);
    }
    if(sql.includes('SET status=$4') && sql.includes('next_attempt_at')){
      state.status=String(args[3]) as State['status'];state.hash=undefined;state.expires=undefined;state.lastError=String(args[5]);return response([]);
    }
    if(sql.includes('SELECT status,count(*)::int AS count'))return response([{status:state.status,count:1}]);
    if(sql.includes('SELECT count(*)::text AS count FROM external_change_events'))return response([{count:'0'}]);
    if(sql.includes('FROM external_event_deliveries WHERE integration_id')&&sql.includes('last_error_code'))return response(state.lastError?[{eventId,status:state.status,attempts:state.attempts,lastErrorCode:state.lastError}]:[]);
    if(sql.includes("SET status='PENDING',attempts=0")){
      if(state.status!=='DEAD'||args[1]!==storeId)return response([]);
      state.status='PENDING';state.attempts=0;state.lastError=undefined;return response([{event_id:eventId}]);
    }
    if(sql.includes("SET status='DEAD'")){
      if(state.status==='IN_FLIGHT'&&state.attempts>=MAX_DELIVERY_ATTEMPTS&&state.expires&&state.expires.getTime()<=Date.now()){
        state.status='DEAD';state.hash=undefined;state.expires=undefined;return response([{}]);
      }
    }
    return response([]);
  };
  return {query,state,sqlLog,setClaimError(v:boolean){errorOnClaim=v;},get mode(){return enabled;},get lastLease(){return lastLease;}};
}
async function fixture(t:TestContext,db:ReturnType<typeof fakeDb>, complete=false){
  const old=config.ENABLE_EXTERNAL_INTEGRATIONS;config.ENABLE_EXTERNAL_INTEGRATIONS=true;
  t.after(()=>{config.ENABLE_EXTERNAL_INTEGRATIONS=old;});
  t.mock.method(pool,'query',db.query);
  t.mock.method(pool,'connect',async()=>({query:db.query,release(){}}));
  const app=Fastify();t.after(()=>app.close());
  if(complete)await app.register(externalIntegrationRoutes);
  else await app.register(externalDeliveryRoutes);
  return app;
}
const claim=(app:Awaited<ReturnType<typeof fixture>>,limit=1)=>app.inject({method:'POST',url:'/v1/external/events/claim',headers:auth,payload:{limit}});

// regras puras devem ser confiaveis mesmo sem PostgreSQL de teste.
test('retry exponencial e token de lease aleatorio',()=>{
  assert.equal(retryDelaySeconds(1),5);
  assert.equal(retryDelaySeconds(2),10);
  assert.equal(retryDelaySeconds(8),640);
  assert.equal(retryDelaySeconds(99),900);
  assert.throws(()=>retryDelaySeconds(0));
  const a=leaseSecret(),b=leaseSecret();
  assert.match(a,/^f40l_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a,b);assert.notEqual(hashValue(a),a);
});

test('claim exige credencial e modo leased',async t=>{
  const db=fakeDb('POLL');const app=await fixture(t,db);
  assert.equal((await app.inject({method:'POST',url:'/v1/external/events/claim',payload:{limit:1}})).statusCode,401);
  assert.equal((await claim(app)).statusCode,409);
  assert.equal((await app.inject({method:'POST',url:'/v1/external/events/claim',headers:auth,payload:{limit:31}})).statusCode,409);
});

test('claim gera um lease e ACK idempotente fecha evento sem expor PII',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const first=await claim(app);assert.equal(first.statusCode,200,first.body);
  assert.equal(first.json().events.length,1);
  const item=first.json().events[0];
  assert.equal(item.id,eventId);assert.equal(item.attempts,1);
  assert.match(item.leaseToken,/^f40l_/);
  assert.equal(db.state.hash,hashValue(item.leaseToken));
  assert.equal((await claim(app)).json().events.length,0);
  const ack=()=>app.inject({method:'POST',url:`/v1/external/events/${eventId}/ack`,headers:auth,payload:{leaseToken:item.leaseToken}});
  assert.equal((await ack()).json().idempotent,false);
  assert.equal((await ack()).json().idempotent,true);
  assert.equal(db.state.status,'ACKED');
  assert.equal((await claim(app)).json().events.length,0);
  assert.ok(db.sqlLog.some(sql=>sql.includes('INSERT INTO external_event_acks')));
});

test('token de outro lease e evento de outra loja nao liberam ACK',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const r=await claim(app);const leaseToken=r.json().events[0].leaseToken;
  const bad=await app.inject({method:'POST',url:`/v1/external/events/${eventId}/ack`,headers:auth,payload:{leaseToken:leaseSecret()}});
  assert.equal(bad.statusCode,409);
  assert.equal(db.state.status,'IN_FLIGHT');
  assert.equal((await app.inject({method:'POST',url:`/v1/external/events/${eventId}/nack`,headers:auth,payload:{leaseToken,code:'timeout com CPF',retryable:true}})).statusCode,400);
});

test('NACK reprograma com backoff, repeticao antiga nao e aceita',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const leased=(await claim(app)).json().events[0];
  const nack=()=>app.inject({method:'POST',url:`/v1/external/events/${eventId}/nack`,headers:auth,
    payload:{leaseToken:leased.leaseToken,code:'ERP_TIMEOUT',retryable:true}});
  const result=await nack();assert.equal(result.statusCode,200,result.body);
  assert.equal(result.json().status,'PENDING');assert.equal(result.json().nextAttemptInSeconds,5);
  assert.equal(db.state.lastError,'ERP_TIMEOUT');
  assert.equal((await nack()).statusCode,409);
});

test('NACK irrecuperavel vai a DEAD e nao concede novo lease',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const leased=(await claim(app)).json().events[0];
  const response=await app.inject({method:'POST',url:`/v1/external/events/${eventId}/nack`,headers:auth,
    payload:{leaseToken:leased.leaseToken,code:'INVALID_MAPPING',retryable:false}});
  assert.equal(response.statusCode,200,response.body);
  assert.equal(response.json().status,'DEAD');
  assert.equal((await claim(app)).json().events.length,0);
});

test('lease expirado nao pode ser confirmado fora do prazo',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const leased=(await claim(app)).json().events[0];
  db.state.expires=new Date(Date.now()-1000);
  const res=await app.inject({method:'POST',url:`/v1/external/events/${eventId}/ack`,headers:auth,
    payload:{leaseToken:leased.leaseToken}});
  assert.equal(res.statusCode,409);
});

test('falha no banco impede entregar lease sem commit',async t=>{
  const db=fakeDb();const app=await fixture(t,db);db.setClaimError(true);
  const res=await claim(app);assert.equal(res.statusCode,500);
  assert.equal(db.state.attempts,0);
  assert.ok(db.sqlLog.includes('ROLLBACK'));
});

test('modo leased recusa consumo pela API legacy de eventos e ACK',async t=>{
  const db=fakeDb();const app=await fixture(t,db,true);
  const get=await app.inject({method:'GET',url:'/v1/external/events',headers:auth});
  assert.equal(get.statusCode,409);
  const ack=await app.inject({method:'POST',url:'/v1/external/events/ack',headers:auth,payload:{eventIds:[eventId]}});
  assert.equal(ack.statusCode,409);
});

test('OWNER ativa modo leased e acompanha falhas sem receber credenciais',async t=>{
  const db=fakeDb('POLL');const app=await fixture(t,db);
  const jwt=await createAccessToken(userId,randomUUID());
  const ownerAuth={authorization:`Bearer ${jwt}`};
  const path=`/v1/stores/${storeId}/integrations/${integrationId}`;
  const enabled=await app.inject({method:'POST',url:`${path}/enable-leased-delivery`,headers:ownerAuth});
  assert.equal(enabled.statusCode,200,enabled.body);assert.equal(db.mode,'LEASED');
  const report=await app.inject({method:'GET',url:`${path}/delivery`,headers:ownerAuth});
  assert.equal(report.statusCode,200,report.body);
  assert.equal(report.json().counts.PENDING,1);
  assert.equal(JSON.stringify(report.json()).includes(token),false);
});

test('somente OWNER da loja correta pode reabrir falha DEAD',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const jwt=await createAccessToken(userId,randomUUID());
  const ownerAuth={authorization:`Bearer ${jwt}`};
  const wrong=await app.inject({method:'POST',url:`/v1/stores/${randomUUID()}/integrations/${integrationId}/events/${eventId}/retry`,headers:ownerAuth});
  assert.equal(wrong.statusCode,404);
  const leased=(await claim(app)).json().events[0];
  await app.inject({method:'POST',url:`/v1/external/events/${eventId}/nack`,headers:auth,payload:{leaseToken:leased.leaseToken,code:'INVALID_MAPPING',retryable:false}});
  const retried=await app.inject({method:'POST',url:`/v1/stores/${storeId}/integrations/${integrationId}/events/${eventId}/retry`,headers:ownerAuth});
  assert.equal(retried.statusCode,200,retried.body);
  assert.equal(db.state.status,'PENDING');assert.equal(db.state.attempts,0);
});

// Fase 5.6: filtro por tipo nao consome eventos de catalogo quando o worker e somente de pedidos.
test('claim filtra tipos, sem alterar contrato antigo sem filtro',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const filtered=await app.inject({method:'POST',url:'/v1/external/events/claim',headers:auth,
    payload:{limit:1,types:['order.changed']}});
  assert.equal(filtered.statusCode,200,filtered.body);
  assert.ok(db.sqlLog.some(sql=>sql.includes('e.event_type = ANY($4::text[])')));
  assert.ok(db.sqlLog.some(sql=>sql.includes('e.event_type = ANY($5::text[])')));
  const invalid=await app.inject({method:'POST',url:'/v1/external/events/claim',headers:auth,
    payload:{limit:1,types:['order.changed','order.changed']}});
  assert.equal(invalid.statusCode,400,invalid.body);
  const unknown=await app.inject({method:'POST',url:'/v1/external/events/claim',headers:auth,
    payload:{limit:1,types:['unknown.event']}});
  assert.equal(unknown.statusCode,400,unknown.body);
});
