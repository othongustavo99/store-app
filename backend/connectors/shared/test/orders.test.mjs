import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {paidPickup,validateSettings,createStoreOrderClient,loadState,saveState,exportOrder,reconcileOrder} from '../safe_order_export.mjs';
import {blingOrderAdapter} from '../../bling/order_export_adapter.mjs';
import {omieOrderAdapter} from '../../omie/order_export_adapter.mjs';
import {createBlingOrderApi} from '../../bling/order_export_api.mjs';
import {createOmieOrderApi} from '../../omie/order_export_api.mjs';
const STORE='11111111-1111-4111-8111-111111111111',ORDER='22222222-2222-4222-8222-222222222222',VARIANT='33333333-3333-4333-8333-333333333333';
const snapshot={order:{id:ORDER,status:'PAID',paymentStatus:'APPROVED',isDemo:false,fulfillmentMethod:'PICKUP',subtotalCents:'10000',shippingCents:'0',discountCents:'0',totalCents:'10000',items:[{variantId:VARIANT,externalVariantId:'700',quantity:2,unitPriceCents:'5000'}]}};
const base={storeId:STORE,orderIds:[ORDER],contactIds:{[ORDER]:123456}};
const blingSettings={...base,orderDate:'2026-11-19'};
const omieSettings={...base,expectedDate:'2026-11-19',etapa:'10',codigoCategoria:'1.01.03',codigoContaCorrente:123456,items:{[VARIANT]:{descricao:'Camiseta',unidade:'UN',cfop:'5.102',ncm:'6109.10.00'}}};
const temp=async()=>join(await mkdtemp(join(tmpdir(),'f40-orders-')),'journal.json');
const store=(handlers={})=>({request:async(path,options)=>path.endsWith('/sync')?(options?.method==='POST'?(handlers.ack?.(options.body)??{orderId:ORDER,externalOrderId:options.body.externalOrderId}):{sync:handlers.sync??null}):snapshot});
const erp=(provider,handlers={})=>({create:handlers.create??(async()=>({id:190})),find:handlers.find??(async()=>provider.id==='bling'?{data:{id:190,numeroLoja:`F40-${ORDER}`}}:{pedido_venda_produto:{cabecalho:{codigo_pedido:190,codigo_pedido_integracao:`F40-${ORDER}`}}})});
const quiet={log(){},error(){}};
const pairs=[[blingOrderAdapter,blingSettings],[omieOrderAdapter,omieSettings]];
const httpResponse=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('validacao financeira rejeita pedido nao pago, demo, entrega, desconto e falta de mapeamento',()=>{
 assert.equal(paidPickup(snapshot).totalCents,10000);
 for(const changes of [{paymentStatus:'PENDING'},{isDemo:true},{fulfillmentMethod:'DELIVERY'},{discountCents:'100'},{subtotalCents:'9999'},{items:[{...snapshot.order.items[0],externalVariantId:null}]}]){
  assert.throws(()=>paidPickup({order:{...snapshot.order,...changes}}));
 }
});
test('restricao de loja/pedidos e IDs de contatos',()=>{
 assert.equal(validateSettings(base).storeId,STORE);
 assert.throws(()=>validateSettings({...base,orderIds:[ORDER,ORDER]}));
 assert.throws(()=>validateSettings({...base,contactIds:{[ORDER]:0}}));
});
test('payload Bling usa numeroLoja e ID oficial de produto; sem financeiro/fiscal automatico',()=>{
 const plan=blingOrderAdapter.plan(paidPickup(snapshot),blingSettings,123456);
 assert.equal(plan.body.numeroLoja,`F40-${ORDER}`);
 assert.equal(plan.body.itens[0].produto.id,700);
 assert.equal(plan.body.itens[0].valor,50);
 assert.equal(plan.body.contato.id,123456);
 assert.equal('parcelas' in plan.body,false);
 assert.throws(()=>blingOrderAdapter.plan(paidPickup(snapshot),{...blingSettings,orderDate:'2026-02-30'},123456));
});
test('payload Omie exige parametrizacao fiscal explicita',()=>{
 const plan=omieOrderAdapter.plan(paidPickup(snapshot),omieSettings,123456);
 assert.equal(plan.body.cabecalho.codigo_pedido_integracao,`F40-${ORDER}`);
 assert.equal(plan.body.det[0].produto.codigo_produto,'700');
 assert.equal(plan.body.det[0].produto.cfop,'5.102');
 assert.equal(plan.body.det[0].produto.valor_unitario,50);
 assert.throws(()=>omieOrderAdapter.plan(paidPickup(snapshot),{...omieSettings,items:{}},123456));
});
test('API Store restrita a detalhes de pedido e link, bloqueia caminhos extras',async()=>{
 const auth=`f40i_${'a'.repeat(43)}`;
 const client=createStoreOrderClient({url:'https://store.test/',token:auth,fetchImpl:async()=>httpResponse({ok:true})});
 await assert.rejects(client.request('/v1/external/inventory/1'),{code:'STORE_ROUTE_FORBIDDEN'});
 assert.deepEqual(await client.request(`/v1/external/orders/${ORDER}`),{ok:true});
 assert.throws(()=>createStoreOrderClient({url:'http://store.test/',token:auth}));
});
test('Bling POST unico e sem retry em timeout, retorno sem id fica incerto',async()=>{
 let count=0;
 const b=createBlingOrderApi({accessToken:async()=> 'token',fetchImpl:async(_url,opts)=>{count++;assert.equal(opts.method,'POST');throw Error('timeout');}});
 await assert.rejects(b.create({}),{code:'BLING_CREATE_UNCERTAIN'});assert.equal(count,1);
 const invalid=createBlingOrderApi({accessToken:async()=> 'token',fetchImpl:async()=>httpResponse({data:{}})});
 await assert.rejects(invalid.create({}),{code:'BLING_CREATE_RESPONSE_UNCERTAIN'});
});
test('Omie POST unico e sem retry em timeout; contrato endpoint',async()=>{
 let count=0;const om=createOmieOrderApi({token:'x'.repeat(32),fetchImpl:async(url,opts)=>{
  count++;assert.equal(url,'https://app.omie.com.br/api/v1/produtos/pedido/');
  assert.equal(JSON.parse(opts.body).call,'IncluirPedido');throw Error('timeout');}});
 await assert.rejects(om.create({}),{code:'OMIE_CREATE_UNCERTAIN'});assert.equal(count,1);
});
for(const [provider,settings] of pairs){
 test(`${provider.id}: preview nao modifica ERP nem estado`,async()=>{
  let calls=0;const path=await temp();const result=await exportOrder({provider,settings,store:store(),erp:erp(provider,{create:async()=>{calls++;}}),orderId:ORDER,apply:false,logger:quiet});
  assert.equal(result.mode,'PREVIEW');assert.equal(calls,0);
 });
 test(`${provider.id}: cria pedido uma vez, consulta origem e registra link`,async()=>{
  const path=await temp(),state=await loadState(path,provider.id,STORE);let creations=0;
  const result=await exportOrder({provider,settings,store:store(),erp:erp(provider,{create:async()=>{creations++;return {id:190};}}),orderId:ORDER,state,statePath:path,apply:true,logger:quiet});
  assert.equal(result.linked,true);assert.equal(creations,1);assert.equal(state.orders[ORDER].stage,'LINKED');
  await assert.rejects(exportOrder({provider,settings,store:store(),erp:erp(provider,{create:async()=>{creations++;return {id:190};}}),orderId:ORDER,state,statePath:path,apply:true,logger:quiet}),{code:'ORDER_LINK_MISSING_IN_STORE'});
  assert.equal(creations,1);
 });
 test(`${provider.id}: falha na criacao bloqueia segundo POST`,async()=>{
  const path=await temp(),state=await loadState(path,provider.id,STORE);let creations=0;
  const api=erp(provider,{create:async()=>{creations++;throw Error('TIMEOUT');}});
  await assert.rejects(exportOrder({provider,settings,store:store(),erp:api,orderId:ORDER,state,statePath:path,apply:true,logger:quiet}));
  assert.equal(state.orders[ORDER].stage,'NEEDS_RECONCILIATION');
  await assert.rejects(exportOrder({provider,settings,store:store(),erp:api,orderId:ORDER,state,statePath:path,apply:true,logger:quiet}),{code:'ORDER_RECONCILIATION_REQUIRED'});
  assert.equal(creations,1);
 });
 test(`${provider.id}: link falha depois da criacao e retry so vincula`,async()=>{
  const path=await temp(),state=await loadState(path,provider.id,STORE);let creations=0,acks=0;
  const api=erp(provider,{create:async()=>{creations++;return {id:190};}});
  const s=store({ack:body=>{acks++;if(acks===1)throw Error('STORE_TIMEOUT');return {orderId:ORDER,externalOrderId:body.externalOrderId};}});
  await assert.rejects(exportOrder({provider,settings,store:s,erp:api,orderId:ORDER,state,statePath:path,apply:true,logger:quiet}));
  assert.equal(state.orders[ORDER].stage,'CREATED');
  const result=await exportOrder({provider,settings,store:s,erp:api,orderId:ORDER,state,statePath:path,apply:true,logger:quiet});
  assert.equal(result.linked,true);assert.equal(creations,1);assert.equal(acks,2);
 });
 test(`${provider.id}: conciliacao de erro incerto exige mesmo ID e referencia`,async()=>{
  const path=await temp(),state=await loadState(path,provider.id,STORE);
  state.orders[ORDER]={stage:'NEEDS_RECONCILIATION',reference:`F40-${ORDER}`,erpId:null,eventId:ORDER,sourceVersion:123};await saveState(path,state);
  const api=erp(provider,{find:async()=>provider.id==='bling'?{data:{id:190,numeroLoja:'INCORRETO'}}:{pedido_venda_produto:{cabecalho:{codigo_pedido:190,codigo_pedido_integracao:'INCORRETO'}}}});
  await assert.rejects(reconcileOrder({provider,store:store(),erp:api,state,statePath:path,orderId:ORDER,erpId:190}));
  assert.equal((await reconcileOrder({provider,store:store(),erp:erp(provider),state,statePath:path,orderId:ORDER,erpId:190})).linked,true);
 });
}
test('journal nao pode ser compartilhado entre fornecedores ou lojas',async()=>{
 const path=await temp(),state=await loadState(path,'bling',STORE);await saveState(path,state);
 await assert.rejects(loadState(path,'omie',STORE),{code:'ORDER_STATE_TENANT_MISMATCH'});
 await assert.rejects(loadState(path,'bling','44444444-4444-4444-8444-444444444444'),{code:'ORDER_STATE_TENANT_MISMATCH'});
});
