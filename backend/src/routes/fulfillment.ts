import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';

const shopParams = z.object({
  slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48), orderId:uuidParam,
}).strict();
const adminParams = z.object({storeId:uuidParam,orderId:uuidParam}).strict();

async function timeline(storeId:string,orderId:string,customerId?:string) {
  const found=await pool.query(`SELECT id,status,pickup_preparation AS "pickupPreparation",fulfillment_method AS "fulfillment",
    reservation_expires_at AS "reservationExpiresAt",
    (SELECT provider FROM payments WHERE order_id=orders.id AND store_id=orders.store_id
      AND provider IN ('offline','mercadopago','demo') LIMIT 1) AS "paymentProvider",
    (SELECT status FROM payments WHERE order_id=orders.id AND store_id=orders.store_id
      AND provider IN ('offline','mercadopago','demo') LIMIT 1) AS "paymentStatus",
    shipping_service_id AS "shippingServiceId",shipping_address AS "customerContact",
    created_at AS "createdAt" FROM orders WHERE id=$1 AND store_id=$2
      AND ($3::uuid IS NULL OR customer_id=$3)`,[orderId,storeId,customerId??null]);
  if(!found.rowCount)throw new ApiError(404,'Pedido não encontrado.');
  const events=await pool.query(`SELECT status,notes,created_at AS "createdAt" FROM order_events
    WHERE store_id=$1 AND order_id=$2 ORDER BY created_at,id LIMIT 200`,[storeId,orderId]);
  return {order:found.rows[0],events:events.rows};
}

export async function fulfillmentRoutes(app:FastifyInstance) {
  app.get('/v1/shops/:slug/orders/:orderId/timeline',async req=>{
    const {slug,orderId}=validated(shopParams,req.params);
    const identity=await requireIdentity(req);
    const shop=await pool.query<{id:string}>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'",[slug]);
    if(!shop.rowCount)throw new ApiError(404,'Loja não encontrada.');
    return timeline(shop.rows[0].id,orderId,identity.userId);
  });
  app.get('/v1/stores/:storeId/orders/:orderId/timeline',async req=>{
    const {storeId,orderId}=validated(adminParams,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    return timeline(storeId,orderId);
  });
}
