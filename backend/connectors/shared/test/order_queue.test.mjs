import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeasedQueueClient} from '../leased_queue_client.mjs';
import {consumeOrderBatch,orderEligibility,runOrderQueue} from '../order_queue_core.mjs';
import {queueOptions} from '../order_queue_cli.mjs';
const orderId='22222222-2222-4222-8222-222222222222';
const lease='f40l_'+ 'a'.repeat(43);
const apiToken='f40i_'+ 'b'.repeat(43);
const event=(id='1',resourceId=orderId)=>({id,type:'order.changed',resourceId,leaseToken:lease});
const order=(status='PAID',paymentStatus='APPROVED')=>({order:{id:orderId,status,paymentStatus,isDemo:false}});
function setup({events=[event()],allowed=true,snapshot=order(),exportResult={linked:true,erpId:123},exportError=null,ackError=false}={}){
  const calls=[];const queue={async claim(limit){calls.push(['claim',limit]);return events;},async ack(e){calls.push(['ack',e.id]);if(ackError)throw Error('timeout');},
    async nack(e,code,retryable){calls.push(['nack',e.id,code,retryable]);}};
  let exported=0;
  const job={queue,limit:5,logger:{log(){},error(){}},allowedOrderIds:allowed?new Set([orderId]):new Set(),
    getSnapshot:async()=>{calls.push(['read']);return snapshot;},
    exportOne:async()=>{exported++;if(exportError)throw exportError;return exportResult;}};
  return {job,calls,exported:()=>exported};
}

test('libera ACK somente apos exportacao comprovada e vinculada',async()=>{
  const x=setup();const result=await consumeOrderBatch(x.job);
  assert.equal(result.acknowledged,1);assert.equal(x.exported(),1);
  assert.deepEqual(x.calls.map(c=>c[0]),['claim','read','ack']);
});
test('pedido sem aprovacao por loja vai a revisao sem GET nem POST ERP',async()=>{
  const x=setup({allowed:false});const s=await consumeOrderBatch(x.job);
  assert.equal(s.review,1);assert.equal(x.exported(),0);
  assert.deepEqual(x.calls.at(-1),['nack','1','ORDER_APPROVAL_REQUIRED',false]);
});
test('pedido pendente e ACK sem criar venda; novo evento de pagamento sera processado depois',async()=>{
  const x=setup({snapshot:order('PENDING_PAYMENT','PENDING')});const s=await consumeOrderBatch(x.job);
  assert.equal(s.acknowledged,1);assert.equal(x.exported(),0);
  assert.deepEqual(x.calls.at(-1),['ack','1']);
});
test('cancelamento e fraude requerem revisao, nunca ACK de sincronizacao de status',async()=>{
  for(const status of ['CANCELED','REFUNDED','PAYMENT_REVIEW']){
    const x=setup({snapshot:order(status,'APPROVED')});const s=await consumeOrderBatch(x.job);
    assert.equal(s.review,1);assert.equal(x.exported(),0);
    assert.equal(x.calls.at(-1)[2],'ORDER_PAYMENT_REVIEW');
  }
});
test('exportacao sem confirmacao do ERP nao recebe ACK',async()=>{
  const x=setup({exportResult:{preview:true}});const s=await consumeOrderBatch(x.job);
  assert.equal(s.review,1);assert.equal(s.acknowledged,0);
  assert.equal(x.calls.at(-1)[2],'ORDER_EXPORT_UNCONFIRMED');
});
test('erro incerto de criacao exige conciliacao e impede reenvio cego',async()=>{
  const x=setup({exportError:{code:'OMIE_CREATE_UNCERTAIN'}});const s=await consumeOrderBatch(x.job);
  assert.equal(s.review,1);assert.deepEqual(x.calls.at(-1),['nack','1','OMIE_CREATE_UNCERTAIN',false]);
});
test('falha temporaria antes da confirmacao do ERP permite retry pela fila',async()=>{
  const x=setup({exportError:{code:'STORE_HTTP_503'}});const s=await consumeOrderBatch(x.job);
  assert.equal(s.retry,1);assert.deepEqual(x.calls.at(-1),['nack','1','STORE_HTTP_503',true]);
});
test('se ACK falhar depois da exportacao, NAO executar NACK; lease expira e usa estado persistente',async()=>{
  const x=setup({ackError:true});const s=await consumeOrderBatch(x.job);
  assert.equal(s.ackErrors,1);assert.equal(x.exported(),1);
  assert.equal(x.calls.filter(c=>c[0]==='nack').length,0);
});
test('evento nao reconhecido nao deve ser ACK',async()=>{
  const x=setup({events:[{...event(),type:'catalog.product.changed'}]});const s=await consumeOrderBatch(x.job);
  assert.equal(s.review,1);assert.equal(x.exported(),0);
  assert.equal(x.calls.at(-1)[2],'QUEUE_EVENT_INVALID');
});
test('link preexistente e comprovado permite ACK sem novo POST',async()=>{
  const x=setup({exportResult:{alreadyLinked:true,erpId:777}});const s=await consumeOrderBatch(x.job);
  assert.equal(s.acknowledged,1);
});
test('cliente de fila solicita apenas order.changed, nao eventos de catalogo',async()=>{
  const calls=[];
  const client=createLeasedQueueClient({url:'https://example.com/',token:apiToken,
    fetchImpl:async(url,init)=>{calls.push([String(url),JSON.parse(init.body),init.headers.Authorization]);
      if(String(url).endsWith('/claim'))return {ok:true,json:async()=>({events:[event()]})};
      return {ok:true,json:async()=>({acknowledged:true})};}});
  const events=await client.claim(3);
  assert.equal(events.length,1);
  assert.deepEqual(calls[0][1],{limit:3,types:['order.changed']});
  await client.ack(events[0]);
  assert.equal(calls[1][1].leaseToken,lease);
  assert.equal(calls[0][2],`Bearer ${apiToken}`);
});
test('cliente rejeita URL insegura e eventos de tipo nao solicitado',async()=>{
  assert.throws(()=>createLeasedQueueClient({url:'http://example.com/',token:apiToken}),/QUEUE_CONFIG_INVALID/);
  const client=createLeasedQueueClient({url:'http://localhost:8000/',token:apiToken,
    fetchImpl:async()=>({ok:true,json:async()=>({events:[{...event(),type:'catalog.product.changed'}]})})});
  await assert.rejects(client.claim(1),/QUEUE_CLAIM_INVALID/);
});
test('fila de pedidos exige habilitacao tripla; por padrao nao realiza nenhuma escrita',()=>{
  const yes={F40_QUEUE_ENABLED:'SIM_HOMOLOGADO',F40_APPLY:'CONFIRMO_ENVIO_PEDIDOS',
    F40_ORDER_PROVIDER_CONTRACT_CONFIRMED:'SIM_HOMOLOGACAO'};
  assert.throws(()=>queueOptions({},[]),/QUEUE_WRITE_NOT_AUTHORIZED/);
  assert.throws(()=>queueOptions({...yes,F40_QUEUE_BATCH_LIMIT:'30'},[]),/QUEUE_TIMING_INVALID/);
  assert.deepEqual(queueOptions(yes,['--once']),{once:true,intervalMs:10000,limit:5});
});
test('roda apenas uma vez com --once, sem esperar intervalo',async()=>{
  let runs=0;
  await runOrderQueue({batch:async()=>{runs++;return {claimed:0,acknowledged:0,review:0,retry:0,ackErrors:0};},
    once:true,intervalMs:10000,logger:{log(){},error(){}},delay:()=>{throw Error('should not delay');}});
  assert.equal(runs,1);
});
test('elegibilidade valida pagamento e pedido demo',()=>{
  assert.equal(orderEligibility(order()).kind,'ELIGIBLE');
  assert.equal(orderEligibility({...order(),order:{...order().order,isDemo:true}}).code,'ORDER_DEMO_FORBIDDEN');
});
