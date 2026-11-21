// F5.6: a fila informa alteracoes; somente pedido pago e aprovado pode gerar POST no ERP.
// Acknowledgment significa exportacao confirmada (ou evento ainda nao elegivel, p.ex. nao pago).
import {QueueError} from './leased_queue_client.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paidStatuses=new Set(['PAID','PREPARING','SHIPPED','DELIVERED']);
const transientCodes=new Set(['STORE_REQUEST_FAILED','STORE_NETWORK_ERROR','QUEUE_NETWORK_ERROR',
  'STORE_HTTP_408','STORE_HTTP_425','STORE_HTTP_429','STORE_HTTP_500','STORE_HTTP_502',
  'STORE_HTTP_503','STORE_HTTP_504','ERP_LOOKUP_FAILED','OMIE_LOOKUP_FAILED',
  'BLING_LOOKUP_FAILED','OLIST_LOOKUP_FAILED']);
export function classifyQueueError(error){
  const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{2,47}$/.test(error.code)?error.code:'ORDER_EXPORT_REVIEW';
  return {code,retryable:error?.retryable===true||transientCodes.has(code)};
}
export function orderEligibility(snapshot){
  const order=snapshot?.order;
  if(!order||!uuid.test(order.id??''))return {kind:'REVIEW',code:'ORDER_SNAPSHOT_INVALID'};
  if(order.isDemo!==false)return {kind:'REVIEW',code:'ORDER_DEMO_FORBIDDEN'};
  if(order.status==='PENDING_PAYMENT')return {kind:'DEFER',code:'ORDER_AWAITING_PAYMENT'};
  if(!paidStatuses.has(order.status)||order.paymentStatus!=='APPROVED')
    return {kind:'REVIEW',code:'ORDER_PAYMENT_REVIEW'};
  return {kind:'ELIGIBLE'};
}
export async function consumeOrderBatch({queue,allowedOrderIds,getSnapshot,exportOne,limit=5,logger=console}){
  if(!(allowedOrderIds instanceof Set)||typeof getSnapshot!=='function'||typeof exportOne!=='function')
    throw new QueueError('QUEUE_HANDLER_INVALID');
  const events=await queue.claim(limit);
  const summary={claimed:events.length,acknowledged:0,review:0,retry:0,ackErrors:0};
  for(const event of events){
    let decision='';
    try{
      if(event.type!=='order.changed'||!uuid.test(event.resourceId??''))throw new QueueError('QUEUE_EVENT_INVALID');
      if(!allowedOrderIds.has(event.resourceId))throw new QueueError('ORDER_APPROVAL_REQUIRED');
      const eligibility=orderEligibility(await getSnapshot(event.resourceId));
      if(eligibility.kind==='REVIEW')throw new QueueError(eligibility.code);
      if(eligibility.kind==='ELIGIBLE'){
        const exported=await exportOne(event.resourceId);
        if(!exported||(exported.linked!==true&&exported.alreadyLinked!==true)||
          !Number.isSafeInteger(exported.erpId)||exported.erpId<1)
          throw new QueueError('ORDER_EXPORT_UNCONFIRMED');
      }
      // DEFER: nao existe venda paga para exportar. Outro order.changed surgira na mudanca de status.
      decision='ACK';
      await queue.ack(event);
      summary.acknowledged++;
    }catch(error){
      if(decision==='ACK'){
        // Se ACK falhou depois do ERP confirmar, jamais NACK/inicie outro POST.
        // O lease expira e a reentrega usa o estado persistente do exportador.
        summary.ackErrors++;
        logger.error(`[queue] ${event.id} ACK_FAILED`);
        continue;
      }
      const {code,retryable}=classifyQueueError(error);
      try{
        await queue.nack(event,code,retryable);
        if(retryable)summary.retry++;else summary.review++;
        logger.error(`[queue] ${event.id} ${code}`);
      }catch{
        summary.ackErrors++;
        logger.error(`[queue] ${event.id} NACK_FAILED`);
      }
    }
  }
  return summary;
}
export async function runOrderQueue({batch,once,intervalMs,stopping=()=>false,logger=console,
  delay=ms=>new Promise(r=>setTimeout(r,ms)),onCycle=async()=>{}}){
  do{
    let failure;
    let report;
    try{
      const summary=await batch();
      logger.log(`[queue] claimed=${summary.claimed} ack=${summary.acknowledged} review=${summary.review} retry=${summary.retry} errors=${summary.ackErrors}`);
      report={result:summary.review||summary.retry||summary.ackErrors?'WARNING':'OK',summary};
    }catch(error){
      failure=error;
      const errorCode=classifyQueueError(error).code;
      logger.error(`[queue] ${errorCode}`);
      report={result:'ERROR',errorCode};
    }
    // Falha na telemetria NAO invalida ACK, nao provoca reenvio ao ERP.
    try {await onCycle(report);} catch {logger.error('[queue] HEALTH_REPORT_FAILED');}
    if(once&&failure)throw failure;
    if(once||stopping())break;
    await delay(intervalMs);
  }while(!stopping());
}
