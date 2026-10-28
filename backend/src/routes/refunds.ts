import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';
import { eligibleForFullRefund, matchingApprovedRefund, toCents } from '../services/refund_rules.js';

const scope=z.object({storeId:uuidParam});
const target=scope.extend({caseId:uuidParam});
const confirm=z.object({confirmation:z.literal('REEMBOLSAR'),confirmStockHandled:z.literal(true)}).strict();
type RefundRecord={id:string;store_id:string;order_id:string;after_sales_id:string;
  gateway_payment_id:string;amount_cents:string;idempotency_key:string;
  gateway_refund_id:string|null;status:string};
type RefundResult={id:string;status:string;message:string};

function assertRefundsEnabled(storeId:string):void {
  if (!config.ENABLE_REFUNDS || !config.ENABLE_REAL_PAYMENTS ||
    !config.MERCADOPAGO_ACCESS_TOKEN || config.PAYMENT_PILOT_STORE_ID!==storeId) {
    throw new ApiError(503,'Estornos indisponíveis para esta loja. Confira as configurações do piloto.');
  }
}
async function mp(path:string,method:'GET'|'POST',key?:string):Promise<unknown> {
  const response=await fetch(`https://api.mercadopago.com${path}`,{
    method,
    headers:{Authorization:`Bearer ${config.MERCADOPAGO_ACCESS_TOKEN}`,
      Accept:'application/json',...(key?{'X-Idempotency-Key':key}:{})},
    signal:AbortSignal.timeout(12000),
  });
  if(!response.ok) throw new Error(`GATEWAY_${response.status}`); // nunca registrar resposta, tokens ou payload privado
  return response.json();
}
function recordId(value:unknown):string|null {
  if(typeof value==='number' && Number.isSafeInteger(value) && value>=0) return String(value);
  if(typeof value==='string' && /^\d{1,30}$/.test(value)) return value;
  return null;
}
async function setManualReview(id:string,message:string) {
  await pool.query(`UPDATE payment_refund_operations
    SET status='MANUAL_REVIEW',notes=$2,updated_at=now() WHERE id=$1 AND status<>'CONFIRMED'`,[id,message]);
}
async function getOperation(id:string):Promise<RefundRecord> {
  const r=await pool.query<RefundRecord>('SELECT * FROM payment_refund_operations WHERE id=$1',[id]);
  if(!r.rowCount)throw new ApiError(404,'Operação não encontrada.');
  return r.rows[0];
}
async function finalize(client:PoolClient,op:RefundRecord,refundId:string) {
  // Trava a mesma linha usada pelo checkout e pelo webhook; jamais repõe estoque automaticamente.
  const locked=await client.query<{status:string}>(`SELECT status FROM orders
    WHERE id=$1 AND store_id=$2 FOR UPDATE`,[op.order_id,op.store_id]);
  if(!locked.rowCount) throw new ApiError(404,'Pedido não encontrado.');
  const current=await client.query<{status:string;gateway_refund_id:string|null}>(`SELECT status,gateway_refund_id
    FROM payment_refund_operations WHERE id=$1 FOR UPDATE`,[op.id]);
  if(!current.rowCount)throw new ApiError(404,'Operação não encontrada.');
  if(current.rows[0].status==='CONFIRMED')return;
  if(current.rows[0].gateway_refund_id && current.rows[0].gateway_refund_id!==refundId)
    throw new ApiError(409,'Identificador de estorno divergente. Conferência manual necessária.');
  const updated=await client.query(`UPDATE payments SET status='REFUNDED',updated_at=now()
    WHERE order_id=$1 AND store_id=$2 AND provider='mercadopago'
    AND gateway_payment_id=$3`,[op.order_id,op.store_id,op.gateway_payment_id]);
  if(updated.rowCount!==1)throw new ApiError(409,'Pagamento original não localizado para conciliação.');
  await client.query(`UPDATE payment_refund_operations SET status='CONFIRMED',
    gateway_refund_id=$2,gateway_status='approved',notes=NULL,confirmed_at=now(),updated_at=now() WHERE id=$1`,[op.id,refundId]);
  await client.query(`UPDATE orders SET status='REFUNDED',updated_at=now()
    WHERE id=$1 AND store_id=$2`,[op.order_id,op.store_id]);
  await client.query(`UPDATE after_sales_requests SET status='CLOSED',updated_at=now(),closed_at=now(),
    staff_notes='Reembolso integral confirmado pelo gateway.' WHERE id=$1 AND store_id=$2`,
    [op.after_sales_id,op.store_id]);
  await client.query(`INSERT INTO after_sales_events(request_id,store_id,status,note)
    VALUES($1,$2,'CLOSED','Estorno integral confirmado pelo Mercado Pago')`,[op.after_sales_id,op.store_id]);
  await client.query(`INSERT INTO order_events(order_id,store_id,status,notes)
    VALUES($1,$2,'REFUNDED','Reembolso confirmado pelo Mercado Pago. Estoque físico inalterado.')`,
    [op.order_id,op.store_id]);
  await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
    VALUES($1,NULL,'REFUND_CONFIRMED','payment_refund_operation',$2,$3::jsonb)`,
    [op.store_id,op.id,JSON.stringify({refundId,amountCents:op.amount_cents})]);
}
async function reconcile(op:RefundRecord):Promise<RefundResult> {
  if(op.status==='CONFIRMED') return {id:op.id,status:'CONFIRMED',message:'Reembolso já confirmado.'};
  if(!op.gateway_refund_id) return {id:op.id,status:op.status,
    message:'A operação exige conferência manual no Mercado Pago. Não tente um novo estorno.'};
  const refunds=await mp(`/v1/payments/${encodeURIComponent(op.gateway_payment_id)}/refunds`,'GET');
  const confirmedId=matchingApprovedRefund(refunds,op.gateway_payment_id,op.gateway_refund_id,Number(op.amount_cents));
  if(!confirmedId) return {id:op.id,status:'NEEDS_RECONCILIATION',
    message:'O Mercado Pago ainda não confirmou o estorno integral. Verifique o painel do gateway.'};
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await finalize(client,op,confirmedId);
    await client.query('COMMIT');
  }catch(err){await client.query('ROLLBACK');throw err;}
  finally{client.release();}
  return {id:op.id,status:'CONFIRMED',message:'Reembolso integral confirmado pelo Mercado Pago.'};
}

export async function refundRoutes(app:FastifyInstance):Promise<void> {
  app.get('/v1/stores/:storeId/refunds',async(req)=>{
    const {storeId}=validated(scope,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const results=await pool.query(`SELECT id,order_id AS "orderId",after_sales_id AS "caseId",
      amount_cents::text AS "amountCents",status,gateway_status AS "gatewayStatus",
      created_at AS "createdAt",confirmed_at AS "confirmedAt"
      FROM payment_refund_operations WHERE store_id=$1 ORDER BY created_at DESC LIMIT 100`,[storeId]);
    return {refunds:results.rows,enabled:config.ENABLE_REFUNDS && config.ENABLE_REAL_PAYMENTS &&
      config.PAYMENT_PILOT_STORE_ID===storeId};
  });

  app.post('/v1/stores/:storeId/after-sales/requests/:caseId/refund',
    {config:{rateLimit:{max:3,timeWindow:'1 hour'}}},async(req,reply)=>{
    const {storeId,caseId}=validated(target,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER']);
    assertRefundsEnabled(storeId);
    validated(confirm,req.body);
    const client=await pool.connect();
    let op:RefundRecord;
    let isNew=false;
    try{
      await client.query('BEGIN');
      const ticket=await client.query<{order_id:string;status:string;request_type:string}>(
        `SELECT order_id,status,request_type FROM after_sales_requests
         WHERE id=$1 AND store_id=$2 FOR UPDATE`,[caseId,storeId]);
      if(!ticket.rowCount)throw new ApiError(404,'Solicitação não encontrada.');
      const order=await client.query<{id:string;status:string;paid_at:Date|null;total_cents:string}>(
        `SELECT id,status,paid_at,total_cents::text FROM orders
         WHERE id=$1 AND store_id=$2 FOR UPDATE`,[ticket.rows[0].order_id,storeId]);
      const payment=await client.query<{status:string;gateway_payment_id:string|null;amount_cents:string}>(
        `SELECT status,gateway_payment_id,amount_cents::text FROM payments
         WHERE order_id=$1 AND store_id=$2 AND provider='mercadopago' FOR UPDATE`,
         [ticket.rows[0].order_id,storeId]);
      const existing=await client.query<RefundRecord>(
        'SELECT * FROM payment_refund_operations WHERE order_id=$1 FOR UPDATE',[ticket.rows[0].order_id]);
      if(existing.rowCount){
        op=existing.rows[0];
        if(op.after_sales_id!==caseId)throw new ApiError(409,'Este pedido já possui operação de estorno.');
      }else{
        if(!order.rowCount || !payment.rowCount || !payment.rows[0].gateway_payment_id ||
          !eligibleForFullRefund(order.rows[0].status,payment.rows[0].status,
            ticket.rows[0].status,ticket.rows[0].request_type,Number(order.rows[0].total_cents),order.rows[0].paid_at) ||
          Number(payment.rows[0].amount_cents)!==Number(order.rows[0].total_cents))
          throw new ApiError(409,'Pedido ou pagamento não está elegível para reembolso integral.');
        const inserted=await client.query<RefundRecord>(`INSERT INTO payment_refund_operations
          (store_id,order_id,after_sales_id,requested_by,gateway_payment_id,amount_cents)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
          [storeId,ticket.rows[0].order_id,caseId,identity.userId,
            payment.rows[0].gateway_payment_id,order.rows[0].total_cents]);
        op=inserted.rows[0];isNew=true;
        await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
          VALUES($1,$2,'REFUND_REQUESTED','payment_refund_operation',$3,$4::jsonb)`,
          [storeId,identity.userId,op.id,JSON.stringify({orderId:op.order_id,amountCents:op.amount_cents})]);
      }
      await client.query('COMMIT');
    }catch(err){await client.query('ROLLBACK');throw err;}
    finally{client.release();}
    if(!isNew)return reply.code(op.status==='CONFIRMED'?200:202).send({
      id:op.id,status:op.status,message:'Operação já registrada. Concilie antes de qualquer nova tentativa.'});

    // Uma única chamada POST por operação. Se houver timeout, NUNCA repetir automaticamente:
    // a solicitação pode ter chegado ao gateway apesar da perda de resposta.
    try {
      const payment=await mp(`/v1/payments/${encodeURIComponent(op.gateway_payment_id)}`,'GET');
      if(!payment || typeof payment!=='object' ||
        recordId((payment as Record<string,unknown>).id)!==op.gateway_payment_id ||
        (payment as Record<string,unknown>).external_reference!==op.order_id ||
        (payment as Record<string,unknown>).currency_id!=='BRL' ||
        (payment as Record<string,unknown>).status!=='approved' ||
        toCents((payment as Record<string,unknown>).transaction_amount)!==Number(op.amount_cents)) {
        await setManualReview(op.id,'Pagamento não corresponde ao pedido/valor.');
        return reply.code(202).send({id:op.id,status:'MANUAL_REVIEW',message:'Pagamento divergente. Conferência manual obrigatória.'});
      }
      const previous=await mp(`/v1/payments/${encodeURIComponent(op.gateway_payment_id)}/refunds`,'GET');
      if(!Array.isArray(previous) || previous.length!==0){
        await setManualReview(op.id,'O gateway já possui reembolso ou resposta de conciliação inesperada.');
        return reply.code(202).send({id:op.id,status:'MANUAL_REVIEW',message:'Já existe uma operação de devolução no gateway. Confira manualmente.'});
      }
      const response=await mp(`/v1/payments/${encodeURIComponent(op.gateway_payment_id)}/refunds`,'POST',op.idempotency_key);
      const refundId=recordId(response && typeof response==='object'?(response as Record<string,unknown>).id:null);
      if(refundId)await pool.query(`UPDATE payment_refund_operations SET gateway_refund_id=$2,
        gateway_status=$3,updated_at=now() WHERE id=$1`,[op.id,refundId,
          String(response && typeof response==='object'?(response as Record<string,unknown>).status:'unknown')]);
      const current=await getOperation(op.id);
      if(current.gateway_refund_id)return reply.code(202).send(await reconcile(current));
    }catch{
      // Código de erro, timeout ou queda do DB após POST: não repetir; precisa consultar o gateway.
    }
    return reply.code(202).send({id:op.id,status:'NEEDS_RECONCILIATION',
      message:'Verifique a devolução no Mercado Pago e use Conciliar. Não execute outro reembolso.'});
  });

  app.post('/v1/stores/:storeId/after-sales/requests/:caseId/refund/reconcile',
    {config:{rateLimit:{max:10,timeWindow:'1 hour'}}},async(req,reply)=>{
    const {storeId,caseId}=validated(target,req.params);
    await requireStoreRole(req,storeId,['OWNER']);
    assertRefundsEnabled(storeId);
    const r=await pool.query<RefundRecord>(
      'SELECT * FROM payment_refund_operations WHERE store_id=$1 AND after_sales_id=$2',[storeId,caseId]);
    if(!r.rowCount)throw new ApiError(404,'Ainda não existe estorno para esta solicitação.');
    let result:RefundResult;
    try{result=await reconcile(r.rows[0]);}
    catch {result={id:r.rows[0].id,status:'NEEDS_RECONCILIATION',
      message:'Conciliação indisponível. Confira o gateway e tente consultar novamente.'};}
    return reply.code(result.status==='CONFIRMED'?200:202).send(result);
  });
}
