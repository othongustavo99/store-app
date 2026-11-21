/**
 * Frequencia40 F5.13 — auditoria OFFLINE de invariantes de exportacao ERP/PDV.
 * Somente cenarios sinteticos. Nao le .env, nao acessa rede, banco ou APIs reais.
 * Passar NAO equivale a homologacao do fornecedor nem libera operacao comercial.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {paidPickup,loadState,saveState} from './safe_order_export.mjs';
import {consumeOrderBatch} from './order_queue_core.mjs';
import {queueOptions} from './order_queue_cli.mjs';
import {blingOrderAdapter} from '../bling/order_export_adapter.mjs';
import {omieOrderAdapter} from '../omie/order_export_adapter.mjs';
import {prepareOrderExport} from '../olist/order_export_rules.mjs';

const STORE='11111111-1111-4111-8111-111111111111';
const ORDER='22222222-2222-4222-8222-222222222222';
const VARIANT='33333333-3333-4333-8333-333333333333';
const OTHER='44444444-4444-4444-8444-444444444444';
const quiet={log(){},error(){}};
const payload=(change={})=>({order:{id:ORDER,status:'PAID',paymentStatus:'APPROVED',
  isDemo:false,fulfillmentMethod:'PICKUP',subtotalCents:'10000',shippingCents:'0',
  discountCents:'0',totalCents:'10000',
  items:[{variantId:VARIANT,externalVariantId:'700',quantity:2,unitPriceCents:'5000'}],...change}});
const event=id=>({id,type:'order.changed',resourceId:ORDER,leaseToken:'f40l_'+'a'.repeat(43)});

async function simulateQueue({events=[event('1')],snapshot=payload(),throwExport=null,ackError=false}={}){
  const calls=[];
  const queue={
    claim:async()=>events,
    ack:async e=>{calls.push(['ACK',e.id]);if(ackError)throw Error('SIMULATED_ACK_TIMEOUT');},
    nack:async(e,code,retryable)=>calls.push(['NACK',e.id,code,retryable]),
  };
  let exports=0;
  const summary=await consumeOrderBatch({queue,allowedOrderIds:new Set([ORDER]),logger:quiet,
    getSnapshot:async()=>snapshot,
    exportOne:async()=>{exports++;if(throwExport)throw throwExport;return {linked:true,erpId:777};}});
  return {summary,calls,exports};
}

/** Retorna somente codigos operacionais; nenhum dado pessoal, URL, token ou payload remoto. */
export async function runOfflineSafetyAudit(){
  const checks=[];
  async function verify(code,action){
    try{await action();checks.push({code,passed:true});}
    catch{checks.push({code,passed:false});}
  }
  await verify('PAYMENT_DEMO_AND_DELIVERY_GUARDS',()=>{
    assert.equal(paidPickup(payload()).totalCents,10000);
    for(const change of [{status:'PENDING_PAYMENT'},{paymentStatus:'PENDING'},
      {isDemo:true},{fulfillmentMethod:'DELIVERY'}])
      assert.throws(()=>paidPickup(payload(change)));
  });
  await verify('CATALOG_AND_AMOUNT_GUARDS',()=>{
    for(const change of [{items:[{...payload().order.items[0],externalVariantId:null}]},
      {totalCents:'9900'},{discountCents:'100'},{shippingCents:'100'}])
      assert.throws(()=>paidPickup(payload(change)));
  });
  await verify('BLING_ORIGIN_REFERENCE',()=>{
    const plan=blingOrderAdapter.plan(paidPickup(payload()),{orderDate:'2026-11-21'},123);
    assert.equal(plan.body.numeroLoja,`F40-${ORDER}`);
    assert.equal(plan.body.itens[0].produto.id,700);
    assert.equal('parcelas' in plan.body,false);
  });
  await verify('OMIE_EXPLICIT_TAX_MAPPING',()=>{
    const settings={expectedDate:'2026-11-21',etapa:'10',codigoCategoria:'1.01.03',
      codigoContaCorrente:1234,items:{[VARIANT]:{descricao:'Produto ficticio',unidade:'UN',
        cfop:'5.102',ncm:'6109.10.00'}}};
    const plan=omieOrderAdapter.plan(paidPickup(payload()),settings,123);
    assert.equal(plan.body.cabecalho.codigo_pedido_integracao,`F40-${ORDER}`);
    assert.throws(()=>omieOrderAdapter.plan(paidPickup(payload()),{...settings,items:{}},123));
  });
  await verify('OLIST_ORIGIN_REFERENCE',()=>{
    const plan=prepareOrderExport(payload(),123);
    assert.equal(plan.body.numeroOrdemCompra,`F40-${ORDER}`);
    assert.equal(plan.body.itens[0].produto.id,700);
    assert.throws(()=>prepareOrderExport(payload({isDemo:true}),123));
  });
  await verify('QUEUE_WRONG_ORDER_REJECTED',async()=>{
    const out=await simulateQueue({snapshot:payload({id:OTHER})});
    assert.equal(out.exports,0);assert.equal(out.summary.review,1);
    assert.equal(out.calls[0][2],'ORDER_SNAPSHOT_MISMATCH');
  });
  await verify('QUEUE_DUPLICATE_BATCH_GUARD',async()=>{
    const out=await simulateQueue({events:[event('1'),event('2')]});
    assert.equal(out.exports,1);assert.equal(out.summary.acknowledged,1);
    assert.deepEqual(out.calls[1],['NACK','2','QUEUE_DUPLICATE_ORDER_IN_BATCH',true]);
  });
  await verify('QUEUE_UNCERTAIN_EXPORT_NEVER_ACKED',async()=>{
    const out=await simulateQueue({throwExport:{code:'OMIE_CREATE_UNCERTAIN'}});
    assert.equal(out.exports,1);assert.equal(out.summary.acknowledged,0);
    assert.deepEqual(out.calls[0],['NACK','1','OMIE_CREATE_UNCERTAIN',false]);
  });
  await verify('ACK_TIMEOUT_NOT_NACKED',async()=>{
    const out=await simulateQueue({ackError:true});
    assert.equal(out.exports,1);assert.equal(out.summary.ackErrors,1);
    assert.deepEqual(out.calls.map(x=>x[0]),['ACK']);
  });
  await verify('UNPAID_ORDER_NOT_EXPORTED',async()=>{
    const out=await simulateQueue({snapshot:payload({status:'PENDING_PAYMENT',paymentStatus:'PENDING'})});
    assert.equal(out.exports,0);assert.equal(out.summary.acknowledged,1);
  });
  await verify('WORKER_WRITE_OPT_IN',()=>{
    assert.throws(()=>queueOptions({},[]));
    assert.throws(()=>queueOptions({F40_QUEUE_ENABLED:'SIM_HOMOLOGADO'},[]));
  });
  await verify('TENANT_JOURNAL_ISOLATION',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'f40-safety-'));
    try{
      const path=join(dir,'journal.json');
      const journal=await loadState(path,'bling',STORE);
      await saveState(path,journal);
      await assert.rejects(loadState(path,'omie',STORE),{code:'ORDER_STATE_TENANT_MISMATCH'});
      await assert.rejects(loadState(path,'bling',OTHER),{code:'ORDER_STATE_TENANT_MISMATCH'});
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  const failed=checks.filter(c=>!c.passed).length;
  return {phase:'5.13',mode:'OFFLINE_SIMULATED',checks,
    summary:{passed:checks.length-failed,failed,total:checks.length},
    success:failed===0,homologated:false,productionApproved:false,
    realErpCalls:0,automationActivated:false,
    note:'Teste local sintetico. Nao comprova autorizacao de fornecedor, estoque, fiscal, pagamento ou readiness real.'};
}
