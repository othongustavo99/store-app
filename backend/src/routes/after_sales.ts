import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';
import { allowedRequestTypes, permittedTransition, needsResolutionNote, type CaseStatus } from '../services/after_sales_rules.js';

const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48);
const customerBase=z.object({slug}).strict();
const customerOrder=customerBase.extend({orderId:uuidParam});
const adminBase=z.object({storeId:uuidParam}).strict();
const adminCase=adminBase.extend({caseId:uuidParam});
const createBody=z.object({
  idempotencyKey:uuidParam,
  type:z.enum(['CANCEL','RETURN','REFUND']),
  reason:z.string().trim().min(10).max(1200),
}).strict();
const statusBody=z.object({
  status:z.enum(['IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION','REJECTED','CLOSED']),
  note:z.string().trim().max(1200).optional(),
}).strict();

async function storeIdForSlug(value:string):Promise<string> {
  const r=await pool.query<{id:string}>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'",[value]);
  if(!r.rowCount)throw new ApiError(404,'Loja não encontrada.');
  return r.rows[0].id;
}
const SELECT_CASE=`SELECT a.id,a.store_id AS "storeId",a.order_id AS "orderId",
  a.customer_id AS "customerId",u.display_name AS "customerName",
  a.request_type AS type,a.status,a.reason,a.staff_notes AS "staffNotes",
  a.created_at AS "createdAt",a.updated_at AS "updatedAt",a.closed_at AS "closedAt"
  FROM after_sales_requests a JOIN users u ON u.id=a.customer_id`;

export async function afterSalesRoutes(app:FastifyInstance):Promise<void> {
  app.get('/v1/shops/:slug/after-sales/requests',async(req)=>{
    const {slug:shop}=validated(customerBase,req.params);
    const {userId}=await requireIdentity(req);
    const storeId=await storeIdForSlug(shop);
    const r=await pool.query(`${SELECT_CASE} WHERE a.store_id=$1 AND a.customer_id=$2
      ORDER BY a.created_at DESC LIMIT 100`,[storeId,userId]);
    return {requests:r.rows};
  });

  app.post('/v1/shops/:slug/orders/:orderId/after-sales',
    {config:{rateLimit:{max:5,timeWindow:'1 hour'}}},async(req,reply)=>{
    const {slug:shop,orderId}=validated(customerOrder,req.params);
    const {userId}=await requireIdentity(req);
    const storeId=await storeIdForSlug(shop);
    const body=validated(createBody,req.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa solicitações concorrentes para um pedido; cliente e loja são sempre validados.
      const order=await client.query<{status:string}>(`SELECT status FROM orders
        WHERE id=$1 AND store_id=$2 AND customer_id=$3 FOR UPDATE`,[orderId,storeId,userId]);
      if(!order.rowCount)throw new ApiError(404,'Pedido não encontrado.');
      const previous=await client.query<{id:string;order_id:string;request_type:string}>(`SELECT id,order_id,request_type FROM after_sales_requests
        WHERE store_id=$1 AND customer_id=$2 AND idempotency_key=$3`,[storeId,userId,body.idempotencyKey]);
      if(previous.rowCount){
        if(previous.rows[0].order_id!==orderId || previous.rows[0].request_type!==body.type)
          throw new ApiError(409,'A mesma chave de solicitação já foi utilizada em outro pedido.');
        await client.query('COMMIT');
        return reply.code(200).send({requestId:previous.rows[0].id,alreadyCreated:true});
      }
      if(!allowedRequestTypes(order.rows[0].status).includes(body.type))
        throw new ApiError(409,'Este tipo de solicitação não está disponível para a etapa atual do pedido.');
      const pending=await client.query(`SELECT 1 FROM after_sales_requests WHERE order_id=$1
        AND status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION')`,[orderId]);
      if(pending.rowCount)throw new ApiError(409,'Já existe uma solicitação em andamento para este pedido.');
      const inserted=await client.query<{id:string}>(`INSERT INTO after_sales_requests
        (store_id,order_id,customer_id,request_type,reason,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [storeId,orderId,userId,body.type,body.reason,body.idempotencyKey]);
      const id=inserted.rows[0].id;
      await client.query(`INSERT INTO after_sales_events(request_id,store_id,actor_id,status,note)
        VALUES($1,$2,$3,'OPEN','Solicitação recebida')`,[id,storeId,userId]);
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'AFTER_SALES_REQUESTED','after_sales_request',$3,$4::jsonb)`,
        [storeId,userId,id,JSON.stringify({type:body.type,orderId})]);
      await client.query('COMMIT');
      return reply.code(201).send({requestId:id});
    } catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });

  app.get('/v1/stores/:storeId/after-sales/requests',async(req)=>{
    const {storeId}=validated(adminBase,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    const r=await pool.query(`${SELECT_CASE} WHERE a.store_id=$1 ORDER BY
      CASE WHEN a.status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION') THEN 0 ELSE 1 END,
      a.created_at DESC LIMIT 200`,[storeId]);
    return {requests:r.rows};
  });

  app.patch('/v1/stores/:storeId/after-sales/requests/:caseId',async(req)=>{
    const {storeId,caseId}=validated(adminCase,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const {status,note}=validated(statusBody,req.body);
    if(needsResolutionNote(status) && (!note || note.length<15))
      throw new ApiError(400,'Informe uma justificativa de pelo menos 15 caracteres.');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const current=await client.query<{status:CaseStatus;order_id:string}>(`SELECT status,order_id
        FROM after_sales_requests WHERE id=$1 AND store_id=$2 FOR UPDATE`,[caseId,storeId]);
      if(!current.rowCount)throw new ApiError(404,'Solicitação não encontrada.');
      if(!permittedTransition(current.rows[0].status,status))
        throw new ApiError(409,'Transição de solicitação inválida.');
      // Uma operação financeira iniciada só pode concluir por confirmação no gateway.
      const refund=await client.query(`SELECT 1 FROM payment_refund_operations
        WHERE after_sales_id=$1 AND store_id=$2`,[caseId,storeId]);
      if(refund.rowCount && current.rows[0].status!==status)
        throw new ApiError(409,'Estorno em andamento ou confirmado. Use a conciliação financeira.');
      if(current.rows[0].status!==status){
        await client.query(`UPDATE after_sales_requests SET status=$3,staff_notes=$4,
          handled_by=$5,updated_at=now(),closed_at=CASE WHEN $3 IN ('REJECTED','CLOSED') THEN now() ELSE NULL END
          WHERE id=$1 AND store_id=$2`,[caseId,storeId,status,note??null,identity.userId]);
        await client.query(`INSERT INTO after_sales_events(request_id,store_id,actor_id,status,note)
          VALUES($1,$2,$3,$4,$5)`,[caseId,storeId,identity.userId,status,note??null]);
        await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
          VALUES($1,$2,'AFTER_SALES_STATUS_CHANGED','after_sales_request',$3,$4::jsonb)`,
          [storeId,identity.userId,caseId,JSON.stringify({from:current.rows[0].status,to:status})]);
      }
      await client.query('COMMIT');
      // Mesmo se a solicitação foi concluída, nunca alteramos orders/payments automaticamente.
      return {ok:true,status};
    }catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });
}
