import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateOrderExportSettings,prepareOrderExport,checkOlistOrderIdentity} from '../order_export_rules.mjs';
import {createOrderStoreClient,createOlistOrderClient} from '../order_export_clients.mjs';
import {loadOrderExportState,persistState,startCreate} from '../order_export_state.mjs';
import {exportOne,reconcileOne} from '../order_export.mjs';
const STORE='11111111-1111-4111-8111-111111111111',ORDER='22222222-2222-4222-8222-222222222222',VARIANT='33333333-3333-4333-8333-333333333333';
const auth=`f40i_${'a'.repeat(43)}`;
const settings={storeId:STORE,orderIds:[ORDER],contactIds:{[ORDER]:123}};
const order={order:{id:ORDER,status:'PAID',paymentStatus:'APPROVED',isDemo:false,fulfillmentMethod:'PICKUP',
 subtotalCents:'10000',shippingCents:'0',discountCents:'1000',totalCents:'9000',items:[{variantId:VARIANT,externalVariantId:'42',quantity:2,unitPriceCents:'5000'}]}};
const quiet={log() {},error() {}};
const temp=async()=>join(await mkdtemp(join(tmpdir(),'f40-order-')),'state.json');
const mockStore=({sync=null,write}={})=>({request:async(path,options)=>{
 if(path.endsWith('/sync')){
   if(options?.method==='POST'){if(write)return write(options.body);return {orderId:ORDER,externalOrderId:options.body.externalOrderId};}
   return {orderId:ORDER,sync};
 }
 return order;
}});
const mockOlist=({create,find}={})=>({create:create||(async()=>({id:190})),find:find||(async()=>({id:190,numeroOrdemCompra:`F40-${ORDER}`}))});
const response=(obj,status=200)=>({ok:status>=200&&status<300,status,json:async()=>obj});

test('config aceita somente lista explicita de pedidos e contatos da mesma loja',()=>{
 assert.equal(validateOrderExportSettings(settings).storeId,STORE);
 assert.throws(()=>validateOrderExportSettings({...settings,orderIds:[ORDER,ORDER]}),{code:'ORDER_IDS_INVALID'});
 assert.throws(()=>validateOrderExportSettings({...settings,contactIds:{'bad':123}}),{code:'ORDER_CONTACTS_INVALID'});
});
test('normaliza pedido pago e total financeiro sem dados pessoais',()=>{
 const plan=prepareOrderExport(order,123);
 assert.equal(plan.totalCents,9000);assert.equal(plan.body.valorDesconto,10);
 assert.equal(plan.body.itens[0].produto.id,42);assert.equal(plan.body.itens[0].valorUnitario,50);
 assert.equal(plan.body.numeroOrdemCompra,`F40-${ORDER}`);assert.equal(plan.body.situacao,0);
 assert.equal(JSON.stringify(plan).includes('customer'),false);
});
test('rejeita pedido demo, nao pago, entrega, contato ausente e variante sem mapeamento',()=>{
 for(const changed of [{isDemo:true},{status:'PENDING_PAYMENT'},{paymentStatus:'PENDING'}, {fulfillmentMethod:'DELIVERY'}])
  assert.throws(()=>prepareOrderExport({order:{...order.order,...changed}},123));
 assert.throws(()=>prepareOrderExport(order,undefined),{code:'ORDER_CONTACT_MAPPING_REQUIRED'});
 assert.throws(()=>prepareOrderExport({order:{...order.order,items:[{...order.order.items[0],externalVariantId:null}]}},123),{code:'ORDER_VARIANT_NOT_MAPPED'});
});
test('rejeita totais diferentes, valores fracionarios e itens repetidos',()=>{
 assert.throws(()=>prepareOrderExport({order:{...order.order,totalCents:'8900'}},123),{code:'ORDER_TOTALS_MISMATCH'});
 assert.throws(()=>prepareOrderExport({order:{...order.order,items:[{...order.order.items[0],unitPriceCents:'1.25'}]}},123),{code:'ORDER_AMOUNT_INVALID'});
 assert.throws(()=>prepareOrderExport({order:{...order.order,items:[...order.order.items,...order.order.items]}},123),{code:'ORDER_VARIANT_DUPLICATE_OR_INVALID'});
});
test('Store API so permite consultar pedidos e registrar sync; rejeita host inseguro',async()=>{
 assert.throws(()=>createOrderStoreClient({url:'https://erp.example/v1',token:auth}));
 assert.throws(()=>createOrderStoreClient({url:'http://erp.example/',token:auth}));
 const calls=[];
 const client=createOrderStoreClient({url:'https://f40.test/',token:auth,fetchImpl:async(url,opts)=>{calls.push([url,opts.method]);return response({ok:true});}});
 await assert.rejects(client.request('/v1/external/inventory/42'),{code:'STORE_ROUTE_FORBIDDEN'});
 assert.deepEqual(await client.request(`/v1/external/orders/${ORDER}`),{ok:true});
 assert.deepEqual(await client.request(`/v1/external/orders/${ORDER}/sync`,{method:'POST',body:{foo:'bar'}}),{ok:true});
 assert.deepEqual(calls.map(x=>x[1]),['GET','POST']);
});
test('Olist nao repete POST depois de erro de rede ou timeout',async()=>{
 let calls=0;
 const client=createOlistOrderClient({accessToken:async()=> 'segredo',fetchImpl:async(url,opts)=>{calls++;assert.ok(url.endsWith('/pedidos'));assert.equal(opts.method,'POST');throw Error('timeout');}});
 await assert.rejects(client.create({itens:[]}),{code:'OLIST_CREATE_UNCERTAIN'});
 assert.equal(calls,1);
});
test('Olist retorno invalido nao deve ser interpretado como confirmacao',async()=>{
 const client=createOlistOrderClient({accessToken:async()=> 'x',fetchImpl:async()=>response({nao:'tem id'})});
 await assert.rejects(client.create({itens:[]}),{code:'OLIST_CREATE_RESPONSE_UNCERTAIN'});
});
test('valida a referencia Store App antes de reconciliar com ERP',()=>{
 assert.equal(checkOlistOrderIdentity({id:190,numeroOrdemCompra:`F40-${ORDER}`},`F40-${ORDER}`,190),true);
 assert.throws(()=>checkOlistOrderIdentity({id:190,numeroOrdemCompra:'outra'},`F40-${ORDER}`,190),{code:'ERP_ORDER_IDENTITY_MISMATCH'});
});
test('preview nao envia ou persiste mesmo com contato mapeado',async()=>{
 let creates=0;const result=await exportOne({store:mockStore(),olist:mockOlist({create:async()=>{creates++;}}),orderId:ORDER,contactId:123,mode:'PREVIEW',logger:quiet});
 assert.equal(result.preview,true);assert.equal(creates,0);
});
test('cria uma unica vez, vincula no Store App, segunda execucao nao recria',async()=>{
 const path=await temp(),state=await loadOrderExportState(path,STORE);
 let creates=0, links=0;
 const store=mockStore({write:async body=>{links++;return {orderId:ORDER,externalOrderId:body.externalOrderId};}});
 const olist=mockOlist({create:async()=>{creates++;return {id:190};}});
 assert.equal((await exportOne({store,olist,state,statePath:path,orderId:ORDER,contactId:123,mode:'APPLY',logger:quiet})).linked,true);
 assert.equal(state.orders[ORDER].stage,'LINKED');
 // GET /sync sem link nesta simulacao: nao dispara segundo POST porque o estado local impede.
 await assert.rejects(exportOne({store,olist,state,statePath:path,orderId:ORDER,contactId:123,mode:'APPLY',logger:quiet}),{code:'ORDER_LINK_MISSING_IN_STORE'});
 assert.equal(creates,1);assert.equal(links,1);
});
test('sincronizacao falha depois que ERP criou: proxima execucao so tenta vincular',async()=>{
 const path=await temp(),state=await loadOrderExportState(path,STORE);let creates=0,links=0;
 const olist=mockOlist({create:async()=>{creates++;return {id:190};}});
 const store=mockStore({write:async body=>{links++;if(links===1)throw Error('STORE_TEMPORARY');return {orderId:ORDER,externalOrderId:body.externalOrderId};}});
 await assert.rejects(exportOne({store,olist,state,statePath:path,orderId:ORDER,contactId:123,mode:'APPLY',logger:quiet}));
 assert.equal(state.orders[ORDER].stage,'CREATED');
 assert.equal((await exportOne({store,olist,state,statePath:path,orderId:ORDER,contactId:123,mode:'APPLY',logger:quiet})).linked,true);
 assert.equal(creates,1);assert.equal(links,2);
});
test('POST remoto incerto bloqueia repeticao e exige conciliacao manual',async()=>{
 const path=await temp(),state=await loadOrderExportState(path,STORE);let writes=0;
 const olist=mockOlist({create:async()=>{writes++;throw Error('TIMEOUT');}});
 await assert.rejects(exportOne({store:mockStore(),olist,state,statePath:path,orderId:ORDER,contactId:123,mode:'APPLY',logger:quiet}));
 assert.equal(state.orders[ORDER].stage,'NEEDS_RECONCILIATION');
 await assert.rejects(exportOne({store:mockStore(),olist,state,statePath:path,orderId:ORDER,contactId:123,mode:'APPLY',logger:quiet}),{code:'ORDER_RECONCILIATION_REQUIRED'});
 assert.equal(writes,1);
});
test('crash com estado em voo nunca desencadeia segundo envio',async()=>{
 const path=await temp(),state=await loadOrderExportState(path,STORE);
 startCreate(state,ORDER,`F40-${ORDER}`);await persistState(path,state);
 const loaded=await loadOrderExportState(path,STORE);
 await assert.rejects(exportOne({store:mockStore(),olist:mockOlist(),state:loaded,statePath:path,orderId:ORDER,contactId:123,mode:'APPLY',logger:quiet}),{code:'ORDER_RECONCILIATION_REQUIRED'});
});
test('reconciliacao exige identificador e referencia corretos, depois registra link',async()=>{
 const path=await temp(),state=await loadOrderExportState(path,STORE);
 startCreate(state,ORDER,`F40-${ORDER}`);state.orders[ORDER].stage='NEEDS_RECONCILIATION';await persistState(path,state);
 await assert.rejects(reconcileOne({store:mockStore(),olist:mockOlist({find:async()=>({id:190,numeroOrdemCompra:'outro'})}),state,statePath:path,orderId:ORDER,erpId:190}),{code:'ERP_ORDER_IDENTITY_MISMATCH'});
 assert.equal((await reconcileOne({store:mockStore(),olist:mockOlist(),state,statePath:path,orderId:ORDER,erpId:190})).linked,true);
 assert.equal(state.orders[ORDER].stage,'LINKED');
});
test('estado nao pode ser reutilizado entre estabelecimentos',async()=>{
 const path=await temp(),state=await loadOrderExportState(path,STORE);await persistState(path,state);
 await assert.rejects(loadOrderExportState(path,'44444444-4444-4444-8444-444444444444'),{code:'ORDER_STATE_TENANT_MISMATCH'});
 assert.ok((await readFile(path,'utf8')).includes(STORE));
});
