import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireStoreRole } from '../security/identity.js';
import { ApiError } from '../security/errors.js';
import { uuidParam, validated } from '../security/validation.js';

const params=z.object({storeId:uuidParam,orderId:uuidParam}).strict();
const tracking=z.object({trackingCode:z.string().trim().regex(/^[A-Za-z0-9-]{5,70}$/),
  notes:z.string().trim().max(300).default('')}).strict();
const change=z.object({status:z.enum(['IN_TRANSIT','DELIVERED']),
  notes:z.string().trim().max(300).default('')}).strict();

export async function shipmentManagementRoutes(app:FastifyInstance){
  // A API não compra etiquetas nem simula rastreio das transportadoras: apenas registra
  // fatos informados pela equipe, que devem ser verificados no provedor.
  app.put('/v1/stores/:storeId/orders/:orderId/shipment',async req=>{
    const {storeId,orderId}=validated(params,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const body=validated(tracking,req.body);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const order=await client.query<{status:string;fulfillment_method:string;shipping_carrier:string|null}>(
        'SELECT status,fulfillment_method,shipping_carrier FROM orders WHERE id=$1 AND store_id=$2 FOR UPDATE',[orderId,storeId]);
      if(!order.rowCount)throw new ApiError(404,'Pedido não encontrado.');
      if(order.rows[0].fulfillment_method!=='DELIVERY' || order.rows[0].status!=='PREPARING')
        throw new ApiError(409,'Apenas entregas pagas e em preparação podem ser postadas.');
      const pending=await client.query(`SELECT 1 FROM after_sales_requests WHERE order_id=$1
        AND status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION')`,[orderId]);
      if(pending.rowCount)throw new ApiError(409,'Pedido com pós-venda em análise.');
      const result=await client.query<{id:string}>(`INSERT INTO shipments(order_id,store_id,carrier,tracking_code,status)
        VALUES($1,$2,$3,$4,'IN_TRANSIT') ON CONFLICT(order_id) DO NOTHING RETURNING id`,
        [orderId,storeId,order.rows[0].shipping_carrier,body.trackingCode]);
      if(!result.rowCount)throw new ApiError(409,'Este pedido já possui rastreamento.');
      await client.query(`INSERT INTO shipment_events(shipment_id,store_id,status,description,occurred_at)
        VALUES($1,$2,'IN_TRANSIT',$3,now())`,[result.rows[0].id,storeId,body.notes||'Postagem registrada manualmente pela loja']);
      await client.query("UPDATE orders SET status='SHIPPED',updated_at=now() WHERE id=$1",[orderId]);
      await client.query(`INSERT INTO order_events(order_id,store_id,actor_id,status,notes)
        VALUES($1,$2,$3,'SHIPPED',$4)`,[orderId,storeId,identity.userId,body.notes||'Postagem informada pela loja']);
      await client.query('COMMIT');
      return {ok:true};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });
  app.patch('/v1/stores/:storeId/orders/:orderId/shipment/status',async req=>{
    const {storeId,orderId}=validated(params,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const body=validated(change,req.body);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const order=await client.query<{status:string}>(
        'SELECT status FROM orders WHERE id=$1 AND store_id=$2 AND fulfillment_method=\'DELIVERY\' FOR UPDATE',[orderId,storeId]);
      if(!order.rowCount || order.rows[0].status!=='SHIPPED')throw new ApiError(409,'Pedido não está em transporte.');
      const pending=await client.query(`SELECT 1 FROM after_sales_requests WHERE order_id=$1
        AND status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION')`,[orderId]);
      if(pending.rowCount)throw new ApiError(409,'Pedido com pós-venda em análise.');
      const sh=await client.query<{id:string}>(
        'UPDATE shipments SET status=$3,updated_at=now() WHERE store_id=$1 AND order_id=$2 RETURNING id',
        [storeId,orderId,body.status]);
      if(!sh.rowCount)throw new ApiError(409,'Pedido sem postagem registrada.');
      await client.query(`INSERT INTO shipment_events(shipment_id,store_id,status,description,occurred_at)
        VALUES($1,$2,$3,$4,now())`,[sh.rows[0].id,storeId,body.status,body.notes||'Atualização manual informada pela loja']);
      if(body.status==='DELIVERED'){
        await client.query("UPDATE orders SET status='DELIVERED',updated_at=now() WHERE id=$1",[orderId]);
        await client.query(`INSERT INTO order_events(order_id,store_id,actor_id,status,notes)
          VALUES($1,$2,$3,'DELIVERED',$4)`,[orderId,storeId,identity.userId,body.notes||'Entrega confirmada pela equipe']);
      }
      await client.query('COMMIT');
      return {ok:true};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });
}
