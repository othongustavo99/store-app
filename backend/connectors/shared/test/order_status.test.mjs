import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileStatuses,inspectOne,validateStatusMap,rawProviderStatus,mappedStatus} from '../order_status_core.mjs';
const id='11111111-1111-4111-8111-111111111111';
const storeId='22222222-2222-4222-8222-222222222222';
function kit(provider='bling',status='ACEITO'){
  const s={order:{id,isDemo:false,status:'PAID',paymentStatus:'APPROVED'}};
  let link={externalOrderId:'25',externalStatus:'RECEIVED',sourceVersion:'10'};
  const writes=[];
  const store={async request(path,opts){
    if(path===`/v1/external/orders/${id}`)return s;
    if(path===`/v1/external/orders/${id}/sync`){
      if(opts?.method==='POST'){
        writes.push(opts.body);link={...link,externalStatus:opts.body.externalStatus,sourceVersion:String(opts.body.sourceVersion)};
        return {orderId:id,externalOrderId:'25'};
      }
      return {sync:link};
    }
    throw Error('unexpected');}};
  const response=provider==='bling'?{data:{id:25,numeroLoja:`F40-${id}`,situacao:{id:status}}}:
    provider==='omie'?{pedido_venda_produto:{cabecalho:{codigo_pedido:25,codigo_pedido_integracao:`F40-${id}`,etapa:status}}}:
      {id:25,numeroOrdemCompra:`F40-${id}`,situacao:status};
  const erp={async find(){return response;}};
  const verify=(remote,ref,n)=>{
    if(provider==='bling'){assert.equal(remote.data.numeroLoja,ref);assert.equal(remote.data.id,n);}
    else if(provider==='omie'){assert.equal(remote.pedido_venda_produto.cabecalho.codigo_pedido_integracao,ref);assert.equal(remote.pedido_venda_produto.cabecalho.codigo_pedido,n);}
    else{assert.equal(remote.numeroOrdemCompra,ref);assert.equal(remote.id,n);}
  };
  const state={schema:1,provider,storeId,orders:{[id]:{stage:'LINKED',erpId:25,reference:`F40-${id}`}}};
  const statusMap={[status]:'ACCEPTED'};
  return {provider,storeId,state,store,erp,verify,statusMap,writes,get link(){return link;},set link(value){link=value},s};
}
async function run(k,apply=false,persist=async()=>{}){
  return reconcileStatuses({...k,orderIds:[id],apply,persist});
}
test('raw status fields are provider-specific (no inference)',()=>{
  assert.equal(rawProviderStatus('bling',{data:{situacao:{id:42}}}),'42');
  assert.equal(rawProviderStatus('omie',{pedido_venda_produto:{cabecalho:{etapa:'30'}}}),'30');
  assert.equal(rawProviderStatus('olist',{situacao:10}), '10');
  assert.equal(rawProviderStatus('bling',{data:{situacao:'Atendido'}}),null);
});
test('rejects unapproved status maps',()=>{
  assert.throws(()=>validateStatusMap({'3':'PAID'}),/STATUS_MAP_INVALID/);
  assert.throws(()=>validateStatusMap({}),/STATUS_MAP_REQUIRED/);
  assert.equal(mappedStatus('olist',{situacao:1},{'2':'DELIVERED'}).status,null);
});
for(const provider of ['bling','omie','olist'])test(`${provider}: read-only preview flags status change, no write`,async()=>{
  const k=kit(provider,provider==='olist'?3:'30');
  const r=await run(k);
  assert.equal(r.results[0].result,'STATUS_CHANGED');assert.equal(k.writes.length,0);
});
test('status update changes metadata only; no order fulfillment or fiscal changes',async()=>{
  const k=kit();let saves=0;
  const r=await run(k,true,async()=>{saves++;});
  assert.equal(r.results[0].result,'STATUS_UPDATED');
  assert.equal(k.writes.length,1);assert.equal(saves,2);
  assert.deepEqual(Object.keys(k.writes[0]).sort(),['eventId','externalOrderId','externalStatus','sourceVersion']);
  assert.equal(k.writes[0].externalStatus,'ACCEPTED');assert.equal(k.state.statusUpdates[id],undefined);
});
test('write failure preserves the idempotent operation for next run',async()=>{
  const k=kit();let first=true;const request=k.store.request;
  k.store.request=async(path,opts)=>{
    if(opts?.method==='POST'&&first){first=false;throw Error('timeout');}
    return request(path,opts);
  };
  const r=await run(k,true);
  assert.equal(r.results[0].result,'REVIEW_STATUS_UPDATE_FAILED');
  const prev={...k.state.statusUpdates[id]};
  const next=await run(k,true);
  assert.equal(next.results[0].result,'STATUS_UPDATED');
  assert.equal(k.writes[0].eventId,prev.eventId);assert.equal(k.writes[0].sourceVersion,prev.sourceVersion);
});
test('replay of post after successful write cannot duplicate event',async()=>{
  const k=kit();let once=true;const orig=k.store.request;
  k.store.request=async(path,opts)=>{
    const res=await orig(path,opts);
    if(opts?.method==='POST'&&once){once=false;throw Error('connection dropped after commit');}
    return res;
  };
  await run(k,true);
  assert.equal(k.state.statusUpdates[id].externalStatus,'ACCEPTED');
  const r=await run(k,true);
  assert.equal(r.results[0].result,'STATUS_RECOVERED');
  assert.equal(k.writes.length,1);
  assert.equal(k.state.statusUpdates[id],undefined);
});
test('unknown situation needs review, never auto updates',async()=>{
  const k=kit();k.statusMap={'10':'ACCEPTED'};
  const r=await run(k,true);
  assert.equal(r.results[0].result,'REVIEW_STATUS_UNMAPPED');assert.equal(k.writes.length,0);
});
test('ERP cancellation requires manual review',async()=>{
  const k=kit();k.statusMap={'ACEITO':'CANCELED'};
  const r=await run(k,true);
  assert.equal(r.results[0].result,'REVIEW_STATUS_UNSAFE');assert.equal(k.writes.length,0);
});
test('unpaid order cannot update ERP status',async()=>{
  const k=kit();k.s.order.status='PENDING_PAYMENT';
  const r=await run(k,true);
  assert.equal(r.results[0].result,'REVIEW_ORDER_CLOSED');assert.equal(k.writes.length,0);
});
test('linked ERP id mismatch and missing link require review',async()=>{
  const k=kit();k.state.orders[id].erpId=26;
  assert.equal((await run(k)).results[0].result,'REVIEW_EXTERNAL_ID_CONFLICT');
  const k2=kit();k2.link=null;
  assert.equal((await run(k2)).results[0].result,'REVIEW_STORE_LINK_MISSING');
});
test('uncertain creation is never retried',async()=>{
  const k=kit();k.state.orders[id].stage='NEEDS_RECONCILIATION';
  k.erp.find=()=>{throw Error('should not look up');};
  assert.equal((await run(k)).results[0].result,'REVIEW_UNCERTAIN_CREATION');
});
test('identity mismatch cannot update status',async()=>{
  const k=kit();k.verify=()=>{throw Error('wrong order');};
  assert.equal((await run(k,true)).results[0].result,'REVIEW_IDENTITY_MISMATCH');assert.equal(k.writes.length,0);
});
test('pending status change blocked when remote changed',async()=>{
  const k=kit();k.state.statusUpdates={[id]:{eventId:'33333333-3333-4333-8333-333333333333',sourceVersion:42,externalOrderId:25,externalStatus:'PROCESSING'}};
  assert.equal((await run(k,true)).results[0].result,'REVIEW_STATUS_CHANGE_CONFLICT');assert.equal(k.writes.length,0);
});
test('pending status update blocked by newer store version',async()=>{
  const k=kit();k.state.statusUpdates={[id]:{eventId:'33333333-3333-4333-8333-333333333333',sourceVersion:12,externalOrderId:25,externalStatus:'ACCEPTED'}};
  k.link={externalOrderId:'25',externalStatus:'RECEIVED',sourceVersion:'14'};
  assert.equal((await run(k,true)).results[0].result,'REVIEW_STATUS_CHANGE_CONFLICT');assert.equal(k.writes.length,0);
});
test('invalid tenant config rejected upfront',async()=>{
  const k=kit();k.state.storeId='33333333-3333-4333-8333-333333333333';
  await assert.rejects(run(k,true),/STATUS_SETTINGS_INVALID/);
});
test('no source response data or personal customer fields in report',async()=>{
  const k=kit();k.s.order.customer={name:'SENSITIVE',cpf:'00000000000'};
  const report=await run(k);
  assert.equal(JSON.stringify(report).includes('SENSITIVE'),false);
});
