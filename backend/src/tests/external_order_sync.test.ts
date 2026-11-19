import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { createIntegrationKey } from '../integrations/core.js';
import { externalOrderSyncRoutes } from '../routes/external_order_sync.js';
import { assertFulfillmentTransition, externalOrderUpdate, validNfeAccessKey } from '../services/external_order_sync.js';

const storeId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const integrationId = '33333333-3333-4333-8333-333333333333';
const credential = createIntegrationKey();
const auth = {authorization:`Bearer ${credential.key}`};
const result = (rows:unknown[]=[]) => ({rows,rowCount:rows.length});
const base = (change:Record<string,unknown>={})=>({
  eventId:randomUUID(),sourceVersion:1,externalOrderId:'ERP-457',externalStatus:'ACCEPTED',...change,
});
function sampleKey():string {
  const stem='35'+'2611'+'12345678000190'+'55'+'001'+'000000123'+'1'+'12345678';
  assert.equal(stem.length,43);
  let sum=0,weight=2;
  for(let i=42;i>=0;i--){sum+=Number(stem[i])*weight;weight=weight===9?2:weight+1;}
  const rest=sum%11;
  return stem+String(rest===0||rest===1?0:11-rest);
}

type DbOptions={ status?:string; demo?:boolean; carrier?:boolean; afterSales?:boolean; scope?:boolean; authority?:boolean; foreignStore?:boolean };
function fakeDb(options:DbOptions={}) {
  const ops = new Map<string,{payload_hash:string;order_id:string}>();
  let link:{external_order_id:string;source_version:string;external_status:string;invoice:unknown}|undefined;
  let status=options.status??'PAID';
  let fiscal: {order_id:string;document:unknown}|undefined;
  const executed:Array<{sql:string;args:unknown[]}> = [];
  const q=async (sql:string,args:unknown[]=[]) => {
    executed.push({sql,args});
    if(sql.includes('FROM external_integrations i JOIN stores')) return result([{
      id:integrationId,store_id:storeId,provider:'erp-exemplo',stock_authority:false,
      scopes:options.scope===false?['orders.read']:['orders.read','orders.write'],
    }]);
    if(sql.includes('FROM external_integrations') && sql.includes('FOR SHARE')) return result(options.authority===false?[]:[{}]);
    if(sql.includes('FROM orders') && sql.includes('FOR UPDATE')) {
      if(options.foreignStore || args[1]!==storeId) return result();
      return result([{id:orderId,status,is_demo:!!options.demo,
        fulfillment_method:options.carrier?'DELIVERY':'PICKUP',shipping_service_id:options.carrier?'123':null}]);
    }
    if(sql.includes('FROM external_order_operations')) return result(ops.has(String(args[1]))?[ops.get(String(args[1]))]:[]);
    if(sql.includes('SELECT status,is_demo AS "isDemo" FROM orders WHERE'))
      return result(options.foreignStore?[]:[{status,isDemo:!!options.demo}]);
    if(sql.includes('source_version::text AS "sourceVersion"') && sql.includes('FROM external_order_links'))
      return result(link?[{externalOrderId:link.external_order_id,sourceVersion:link.source_version,
        externalStatus:link.external_status,invoice:link.invoice,updatedAt:'2026-11-19T12:00:00Z'}]:[]);
    if(sql.includes('SELECT document FROM external_order_fiscal_documents')) return result(fiscal?[{document:fiscal.document}]:[]);
    if(sql.includes('FROM external_order_links') && sql.includes('source_version::text')) return result(link?[link]:[]);
    if(sql.includes('FROM after_sales_requests')) return result(options.afterSales?[{}]:[]);
    if(sql.startsWith('INSERT INTO external_order_links')) {
      link={external_order_id:String(args[3]),source_version:String(args[4]),external_status:String(args[5]),invoice:args[6]};
    }
    if(sql.startsWith('UPDATE orders SET status=')) status=String(args[2]);
    if(sql.includes('FROM external_order_fiscal_documents') && sql.includes('FOR UPDATE')) return result(fiscal?[fiscal]:[]);
    if(sql.startsWith('INSERT INTO external_order_fiscal_documents')) fiscal={order_id:orderId,document:JSON.parse(String(args[4]))};
    if(sql.startsWith('INSERT INTO external_order_operations')) ops.set(String(args[2]),{order_id:orderId,payload_hash:String(args[4])});
    return result();
  };
  return {q,executed,ops,get status(){return status;},get link(){return link;}};
}

async function fixture(t:TestContext,db:ReturnType<typeof fakeDb>) {
  const previous=config.ENABLE_EXTERNAL_INTEGRATIONS;
  config.ENABLE_EXTERNAL_INTEGRATIONS=true;
  t.after(()=>{config.ENABLE_EXTERNAL_INTEGRATIONS=previous;});
  t.mock.method(pool,'query',db.q);
  t.mock.method(pool,'connect',async()=>({query:db.q,release(){}}));
  const app=Fastify(); t.after(()=>app.close());
  await app.register(externalOrderSyncRoutes);
  return app;
}
const path=`/v1/external/orders/${orderId}/sync`;
const post=(app:Awaited<ReturnType<typeof fixture>>,payload:object)=>app.inject({method:'POST',url:path,headers:auth,payload});

test('valida chave NF-e com digito verificador, modelo, serie e numero',()=>{
  const key=sampleKey();
  assert.equal(validNfeAccessKey(key),true);
  assert.equal(validNfeAccessKey(key.slice(0,43)+(key[43]==='0'?'1':'0')),false);
  const doc={model:'55',accessKey:key,series:'1',number:'123',issuedAt:'2026-11-19T12:00:00-03:00',status:'AUTHORIZED'};
  assert.equal(externalOrderUpdate.safeParse(base({invoice:doc})).success,true);
  assert.equal(externalOrderUpdate.safeParse(base({invoice:{...doc,model:'65'}})).success,false);
  assert.equal(externalOrderUpdate.safeParse(base({invoice:{...doc,number:'124'}})).success,false);
  assert.equal(externalOrderUpdate.safeParse(base({invoice:{...doc,accessKey:'3'.repeat(44)}})).success,false);
  assert.equal(externalOrderUpdate.safeParse(base({sourceVersion:0})).success,false);
});

test('contrato impede salto de estado, entrega transportadora e pagamento nao confirmado',()=>{
  assert.equal(assertFulfillmentTransition('PAID','PREPARING','PICKUP',null),true);
  assert.equal(assertFulfillmentTransition('PREPARING','PREPARING','PICKUP',null),false);
  assert.throws(()=>assertFulfillmentTransition('PENDING_PAYMENT','PREPARING','PICKUP',null));
  assert.throws(()=>assertFulfillmentTransition('PAID','DELIVERED','PICKUP',null));
  assert.throws(()=>assertFulfillmentTransition('PREPARING','SHIPPED','DELIVERY','123'));
  assert.equal(assertFulfillmentTransition('PREPARING','SHIPPED','DELIVERY','0'),true);
});

test('link e transicao de preparo sem mexer em pagamentos ou reservas, com replay idempotente',async t=>{
  const db=fakeDb();const app=await fixture(t,db);const first=base({fulfillmentStatus:'PREPARING'});
  const r=await post(app,first);assert.equal(r.statusCode,200,r.body);
  assert.equal(db.status,'PREPARING');assert.equal(db.link?.external_order_id,'ERP-457');
  assert.equal(r.json().fulfillmentChanged,true);
  const n=db.executed.filter(x=>x.sql.includes('INSERT INTO order_events')).length;
  const replay=await post(app,first);
  assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().idempotent,true);
  assert.equal(db.executed.filter(x=>x.sql.includes('INSERT INTO order_events')).length,n);
  assert.ok(db.executed.some(x=>x.sql.includes('set_config(\'f40.integration_id\'')));
  assert.ok(db.executed.every(x=>!/UPDATE payments|UPDATE product_variants|INSERT INTO inventory_movements/.test(x.sql)));
  assert.equal((await post(app,{...first,externalOrderId:'ERRO'})).statusCode,409);
  assert.equal((await post(app,base({sourceVersion:1}))).statusCode,409);
  assert.equal((await post(app,base({sourceVersion:2,externalOrderId:'OUTRO'}))).statusCode,409);
  assert.equal((await post(app,base({sourceVersion:2,externalStatus:'PROCESSING'}))).statusCode,200);
  assert.equal(db.link?.external_status,'PROCESSING');
});

test('pedido nao pago, demonstrativo ou de outra loja nao pode ser conciliado',async t=>{
  const db=fakeDb({status:'PENDING_PAYMENT'});const app=await fixture(t,db);
  assert.equal((await post(app,base({fulfillmentStatus:'PREPARING'}))).statusCode,409);
  assert.equal((await post(app,base({invoice:{model:'55',accessKey:sampleKey(),number:'123',series:'1',issuedAt:'2026-11-19T12:00:00-03:00',status:'AUTHORIZED'}}))).statusCode,409);
  assert.equal(db.executed.some(x=>x.sql.includes('INSERT INTO external_order_links')),false);
});

test('transicao com pos-venda pendente e entrega de transportadora sao bloqueadas',async t=>{
  const db=fakeDb({afterSales:true});const app=await fixture(t,db);
  assert.equal((await post(app,base({fulfillmentStatus:'PREPARING'}))).statusCode,409);
  assert.equal(db.status,'PAID');
});

test('sem escopo orders.write, token da fase 1/2 nao recebe acesso de gravacao',async t=>{
  const db=fakeDb({scope:false});const app=await fixture(t,db);
  const response=await post(app,base());assert.equal(response.statusCode,403,response.body);
  assert.equal(db.executed.some(x=>x.sql.includes('INSERT INTO external_order_links')),false);
});

test('credencial de outro estabelecimento nao consegue vincular pedido',async t=>{
  const db=fakeDb({foreignStore:true});const app=await fixture(t,db);
  assert.equal((await post(app,base())).statusCode,404);
  assert.equal(db.executed.some(x=>x.sql.includes('INSERT INTO external_order_links')),false);
});

test('integracao revogada ou sem autoridade transacional recebe 403',async t=>{
  const db=fakeDb({authority:false});const app=await fixture(t,db);
  assert.equal((await post(app,base())).statusCode,403);
});

test('GET do vinculo acompanha o estado e isola pedidos de outras lojas',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const before=await app.inject({method:'GET',url:path,headers:auth});
  assert.equal(before.statusCode,200,before.body);assert.equal(before.json().sync,null);
  assert.equal((await post(app,base())).statusCode,200);
  const after=await app.inject({method:'GET',url:path,headers:auth});
  assert.equal(after.statusCode,200,after.body);
  assert.equal(after.json().sync.externalOrderId,'ERP-457');
  assert.equal(after.json().sync.sourceVersion,'1');
});

test('bloqueia associacao de demonstracao com ERP',async t=>{
  const db=fakeDb({demo:true});const app=await fixture(t,db);
  assert.equal((await post(app,base())).statusCode,409);
});

test('impede despacho por transportadora sem rastreio',async t=>{
  const db=fakeDb({carrier:true,status:'PREPARING'});const app=await fixture(t,db);
  assert.equal((await post(app,base({fulfillmentStatus:'SHIPPED'}))).statusCode,409);
  assert.equal(db.status,'PREPARING');
});

test('documento fiscal e armazenado como referencia; cancelamento nao muda pagamento',async t=>{
  const db=fakeDb();const app=await fixture(t,db);
  const doc={model:'55',accessKey:sampleKey(),series:'1',number:'123',issuedAt:'2026-11-19T12:00:00-03:00',status:'AUTHORIZED'};
  assert.equal((await post(app,base({invoice:doc}))).statusCode,200);
  assert.ok(db.executed.some(x=>x.sql.includes('INSERT INTO external_order_fiscal_documents')));
  const r=await app.inject({method:'GET',url:path,headers:auth});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().documents[0].accessKey,doc.accessKey);
  assert.equal((await post(app,base({sourceVersion:2,externalStatus:'CANCELED',invoice:{...doc,status:'CANCELED'}}))).statusCode,200);
  assert.equal((await post(app,base({sourceVersion:3,invoice:doc}))).statusCode,409);
  assert.equal(db.status,'PAID');
  assert.ok(db.executed.every(x=>!x.sql.includes('UPDATE payments')));
});
