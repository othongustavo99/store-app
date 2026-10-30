import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pool } from '../db/pool.js';
import { createAccessToken } from '../security/tokens.js';
import { commerceRoutes } from '../routes/commerce.js';
import { canPrepareUnpaidPickup, statusAfterOfflineConfirmation } from '../services/pickup_preparation.js';

const store = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000001';
const user = '30000000-0000-4000-8000-000000000001';
const variant = '40000000-0000-4000-8000-000000000001';

test('preparo sem dinheiro exige retirada, método de balcão, reserva válida e pagamento pendente', () => {
  const valid = { status:'PENDING_PAYMENT',fulfillment:'PICKUP',offlineMethod:'PAY_ON_PICKUP',
    provider:'offline',paymentStatus:'PENDING',expiresAt:new Date(2000) };
  assert.equal(canPrepareUnpaidPickup(valid,1000),true);
  for (const change of [{fulfillment:'DELIVERY'}, {offlineMethod:'MANUAL_PIX'}, {provider:'mercadopago'},
    {paymentStatus:'APPROVED'}, {expiresAt:new Date(999)}, {expiresAt:null}, {status:'CANCELED'}])
    assert.equal(canPrepareUnpaidPickup({...valid,...change},1000),false);
  assert.equal(statusAfterOfflineConfirmation('READY'),'SHIPPED');
  assert.equal(statusAfterOfflineConfirmation('PREPARING'),'PREPARING');
  assert.equal(statusAfterOfflineConfirmation(undefined),'PAID');
});

async function fixture(t:TestContext, options:{stage?:string;expired?:boolean;blocked?:boolean;
  status?:string;provider?:string;method?:string;fulfillment?:string;role?:string;wrongStore?:boolean;stockFailure?:boolean}={}) {
  const state={id:orderId,store_id:options.wrongStore?user:store,customer_id:user,
    status:options.status??'PENDING_PAYMENT',fulfillment_method:options.fulfillment??'PICKUP',
    shipping_address:{offlineMethod:options.method??'PAY_ON_PICKUP'},pickup_preparation:options.stage??'NONE',
    reservation_expires_at:new Date(Date.now()+(options.expired?-1000:3600000)),onHand:10,reserved:2,
    paymentStatus:options.status==='PAID'?'APPROVED':'PENDING',provider:options.provider??'offline'};
  const statements:{sql:string;values:unknown[]}[]=[];
  const result=(rows:unknown[])=>({rowCount:rows.length,rows});
  const query=async(sql:string,values:unknown[]=[])=>{
    statements.push({sql,values});
    if(sql.includes('FROM refresh_sessions'))return result([{}]);
    if(sql.includes('FROM store_memberships'))return result([{role:options.role??'OWNER',status:'ACTIVE'}]);
    if(sql.includes('SELECT o.*'))return result([{...state}]);
    if(sql.includes('FROM orders o'))return result([{id:orderId,status:state.status,pickupPreparation:state.pickup_preparation,
      paymentProvider:state.provider,paymentStatus:state.paymentStatus}]);
    if(sql.includes('SELECT provider,status FROM payments'))return result([{provider:state.provider,status:state.paymentStatus}]);
    if(sql.includes('SELECT 1 FROM after_sales_requests'))return result(options.blocked?[{}]:[]);
    if(sql.includes('SELECT variant_id,quantity FROM order_items'))return result([{variant_id:variant,quantity:2}]);
    if(sql.includes('SET on_hand=on_hand-$3')){
      if(options.stockFailure)return result([]);
      state.onHand-=2;state.reserved-=2;return result([{id:variant}]);
    }
    if(sql.includes('UPDATE orders SET pickup_preparation'))state.pickup_preparation=String(values[2]);
    if(sql.includes('UPDATE orders SET status=$2,paid_at'))state.status=String(values[1]);
    if(sql.includes("UPDATE payments SET status='APPROVED'"))state.paymentStatus='APPROVED';
    return result([]);
  };
  t.mock.method(pool,'query',query);
  t.mock.method(pool,'connect',async()=>({query,release(){}}));
  const app=Fastify();t.after(()=>app.close());await app.register(commerceRoutes);
  const token=await createAccessToken(user,variant);
  const headers={authorization:`Bearer ${token}`};
  const prepare=(stage:string)=>app.inject({method:'PATCH',url:`/v1/stores/${store}/orders/${orderId}/pickup-preparation`,headers,payload:{stage}});
  const confirm=()=>app.inject({method:'POST',url:`/v1/stores/${store}/orders/${orderId}/confirm-offline`,headers});
  return{app,headers,state,statements,prepare,confirm};
}

test('preparo e pronto mantêm dinheiro pendente e estoque reservado; repetição não duplica evento',async t=>{
  const f=await fixture(t);
  assert.equal((await f.prepare('PREPARING')).statusCode,200);
  assert.equal((await f.prepare('READY')).statusCode,200);
  assert.equal((await f.prepare('READY')).statusCode,200);
  assert.equal(f.state.status,'PENDING_PAYMENT');assert.equal(f.state.paymentStatus,'PENDING');
  assert.equal(f.state.onHand,10);assert.equal(f.state.reserved,2);
  assert.equal(f.statements.filter(s=>s.sql.includes('INSERT INTO order_events')).length,2);
  assert.equal(f.statements.some(s=>s.sql.includes('UPDATE payments')||s.sql.includes('INSERT INTO inventory_movements')),false);
});
test('não pula diretamente para pronto e não regride o preparo',async t=>{
  const f=await fixture(t);
  assert.equal((await f.prepare('READY')).statusCode,409);
  await f.prepare('PREPARING');await f.prepare('READY');
  assert.equal((await f.prepare('PREPARING')).statusCode,409);
});
for(const [name,option] of [
  ['reserva vencida',{expired:true}],['pós-venda ativo',{blocked:true}],['Pix combinado',{method:'MANUAL_PIX'}],
  ['gateway',{provider:'mercadopago'}],['entrega',{fulfillment:'DELIVERY'}],['pedido cancelado',{status:'CANCELED'}],
] as const){
  test(`${name} não permite preparo de retirada sem pagamento`,async t=>{
    const f=await fixture(t,option);assert.equal((await f.prepare('PREPARING')).statusCode,409);
    assert.equal(f.statements.some(s=>s.sql.includes('UPDATE orders SET pickup_preparation')),false);
  });
}
test('funcionário sem gestão e pedido de outra loja não podem ser preparados',async t=>{
  const staff=await fixture(t,{role:'STAFF'});assert.equal((await staff.prepare('PREPARING')).statusCode,403);
});
test('isolamento por loja bloqueia acesso mesmo com papel de gerente em outra loja',async t=>{
  const f=await fixture(t,{wrongStore:true});assert.equal((await f.prepare('PREPARING')).statusCode,404);
});
for(const [stage,next] of [['NONE','PAID'],['PREPARING','PREPARING'],['READY','SHIPPED']]){
  test(`confirmação financeira preserva preparo ${stage} e baixa venda uma única vez`,async t=>{
    const f=await fixture(t,{stage});
    const first=await f.confirm();assert.equal(first.statusCode,200);
    assert.equal(f.state.status,next);assert.equal(f.state.paymentStatus,'APPROVED');
    assert.equal(f.state.onHand,8);assert.equal(f.state.reserved,0);
    assert.equal((await f.confirm()).statusCode,200);
    assert.equal(f.state.onHand,8);
    assert.equal(f.statements.filter(s=>s.sql.includes('INSERT INTO inventory_movements')).length,1);
  });
}
test('confirmação de reserva pronta mas vencida não baixa estoque nem marca pagamento',async t=>{
  const f=await fixture(t,{stage:'READY',expired:true});assert.equal((await f.confirm()).statusCode,409);
  assert.equal(f.state.onHand,10);assert.equal(f.state.paymentStatus,'PENDING');
});
test('falha no saldo reservado desfaz confirmação sem registrar pagamento aprovado',async t=>{
  const f=await fixture(t,{stage:'READY',stockFailure:true});assert.equal((await f.confirm()).statusCode,409);
  assert.ok(f.statements.some(s=>s.sql==='ROLLBACK'));
  assert.equal(f.statements.some(s=>s.sql.includes("UPDATE payments SET status='APPROVED'")),false);
});
