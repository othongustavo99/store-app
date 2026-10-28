import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireStoreRole } from '../security/identity.js';
import { ApiError } from '../security/errors.js';
import { uuidParam, validated } from '../security/validation.js';
import { stockAfterAdjustment } from '../services/stock_rules.js';

const storeParams = z.object({ storeId: uuidParam });
const variantParams = storeParams.extend({ variantId: uuidParam });
const listQuery = z.object({
  q: z.string().trim().max(100).default(''),
  onlyLow: z.enum(['true','false']).default('false'),
  threshold: z.coerce.number().int().min(0).max(1000).default(5),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const movementQuery = z.object({
  variantId: uuidParam.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
}).strict();
const adjustBody = z.object({
  requestId: uuidParam,
  delta: z.number().int().min(-100000).max(100000).refine((v) => v !== 0),
  notes: z.string().trim().min(4).max(300),
}).strict();

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  // Indicadores derivados somente de pagamentos/pedidos. Nenhuma conta cliente entra nos totais.
  app.get('/v1/stores/:storeId/operations/summary', async (req) => {
    const { storeId } = validated(storeParams, req.params);
    await requireStoreRole(req, storeId, ['OWNER','MANAGER','STAFF']);
    const [stock, orders] = await Promise.all([
      pool.query<{ activeVariants: string; availableUnits: string; reservedUnits: string; lowVariants: string; outVariants: string }>(`
        SELECT count(*)::text AS "activeVariants",
          COALESCE(sum(v.on_hand-v.reserved),0)::text AS "availableUnits",
          COALESCE(sum(v.reserved),0)::text AS "reservedUnits",
          count(*) FILTER (WHERE v.on_hand-v.reserved BETWEEN 1 AND 5)::text AS "lowVariants",
          count(*) FILTER (WHERE v.on_hand-v.reserved = 0)::text AS "outVariants"
        FROM product_variants v JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        WHERE v.store_id=$1 AND v.status='ACTIVE' AND p.status <> 'ARCHIVED'`, [storeId]),
      pool.query<{ pendingOrders: string; toPrepare: string; inProgress: string; paidOrderCount: string; grossPaidCents: string }>(`
        SELECT count(*) FILTER (WHERE status='PENDING_PAYMENT')::text AS "pendingOrders",
          count(*) FILTER (WHERE status='PAID')::text AS "toPrepare",
          count(*) FILTER (WHERE status IN ('PREPARING','SHIPPED'))::text AS "inProgress",
          count(*) FILTER (WHERE status IN ('PAID','PREPARING','SHIPPED','DELIVERED'))::text AS "paidOrderCount",
          COALESCE(sum(total_cents) FILTER (WHERE status IN ('PAID','PREPARING','SHIPPED','DELIVERED')),0)::text AS "grossPaidCents"
        FROM orders WHERE store_id=$1`, [storeId]),
    ]);
    return { stock: stock.rows[0], orders: orders.rows[0],
      note: 'Valor bruto de pedidos pagos, não é lucro nem repasse; reembolsos parciais não são suportados.' };
  });

  app.get('/v1/stores/:storeId/inventory', async (req) => {
    const { storeId } = validated(storeParams, req.params);
    const { role } = await requireStoreRole(req, storeId, ['OWNER','MANAGER','STAFF']);
    const filter = validated(listQuery, req.query);
    const pattern = `%${filter.q.replace(/[\\%_]/g, '\\$&')}%`;
    const params = [storeId,pattern,filter.onlyLow==='true',filter.threshold,filter.limit,(filter.page-1)*filter.limit];
    const where = `v.store_id=$1 AND p.status<>'ARCHIVED' AND v.status='ACTIVE'
      AND ($2='' OR p.name ILIKE $2 ESCAPE '\\' OR v.sku ILIKE $2 ESCAPE '\\'
        OR v.attributes->>'color' ILIKE $2 ESCAPE '\\' OR v.attributes->>'size' ILIKE $2 ESCAPE '\\')
      AND (NOT $3::boolean OR v.on_hand-v.reserved <= $4::integer)`;
    const [rows,count] = await Promise.all([
      pool.query(`SELECT v.id AS "variantId",v.product_id AS "productId",p.name AS "productName",
          p.status AS "productStatus",v.sku,v.attributes->>'color' AS color,
          v.attributes->>'size' AS size,v.on_hand AS "onHand",v.reserved,
          v.on_hand-v.reserved AS available,v.price_cents::text AS "priceCents",
          v.updated_at AS "updatedAt"
        FROM product_variants v JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        WHERE ${where} ORDER BY p.name,v.sku,v.id LIMIT $5 OFFSET $6`,params),
      pool.query<{total:string}>(`SELECT count(*)::text AS total FROM product_variants v
        JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id WHERE ${where}`,params.slice(0,4)),
    ]);
    return { variants: rows.rows, total: Number(count.rows[0].total), page:filter.page, limit:filter.limit,
      canAdjust: role === 'OWNER' || role === 'MANAGER' };
  });

  app.get('/v1/stores/:storeId/inventory/movements', async (req) => {
    const { storeId } = validated(storeParams, req.params);
    await requireStoreRole(req, storeId, ['OWNER','MANAGER','STAFF']);
    const { variantId,limit } = validated(movementQuery, req.query);
    const result=await pool.query(`SELECT m.id,m.variant_id AS "variantId",p.name AS "productName",
      v.sku,m.kind,m.quantity_delta AS delta,m.notes,m.created_at AS "createdAt",
      u.display_name AS "actorName"
      FROM inventory_movements m
      JOIN product_variants v ON v.id=m.variant_id AND v.store_id=m.store_id
      JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
      LEFT JOIN users u ON u.id=m.performed_by
      WHERE m.store_id=$1 AND ($2::uuid IS NULL OR m.variant_id=$2::uuid)
      ORDER BY m.created_at DESC,m.id DESC LIMIT $3`,[storeId,variantId??null,limit]);
    return { movements: result.rows };
  });

  app.post('/v1/stores/:storeId/inventory/:variantId/adjust', async (req,reply) => {
    const { storeId,variantId } = validated(variantParams,req.params);
    const { identity } = await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const body = validated(adjustBody,req.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa até mesmo reenvios concorrentes com chave idêntica.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[storeId,body.requestId]);
      const existing=await client.query<{variant_id:string;delta:number;notes:string;after_on_hand:number}>(`
        SELECT variant_id,delta,notes,after_on_hand FROM inventory_adjustment_requests
        WHERE store_id=$1 AND id=$2`,[storeId,body.requestId]);
      if (existing.rowCount) {
        const old=existing.rows[0];
        if (old.variant_id!==variantId || old.delta!==body.delta || old.notes!==body.notes)
          throw new ApiError(409,'Chave de operação reutilizada com dados diferentes.');
        await client.query('COMMIT');
        return { idempotent:true,afterOnHand:old.after_on_hand };
      }
      const r=await client.query<{on_hand:number;reserved:number}>(`
        SELECT v.on_hand,v.reserved FROM product_variants v
        JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        WHERE v.id=$1 AND v.store_id=$2 AND v.status='ACTIVE' AND p.status<>'ARCHIVED'
        FOR UPDATE OF v`,[variantId,storeId]);
      if(!r.rowCount) throw new ApiError(404,'Variante não encontrada nesta loja.');
      const before=r.rows[0];
      let after:number;
      try { after=stockAfterAdjustment(before.on_hand,before.reserved,body.delta); }
      catch(e) { throw new ApiError(409,(e as Error).message); }
      await client.query(`UPDATE product_variants SET on_hand=$3,updated_at=now()
        WHERE id=$1 AND store_id=$2`,[variantId,storeId,after]);
      await client.query(`INSERT INTO inventory_adjustment_requests
        (id,store_id,variant_id,performed_by,delta,notes,before_on_hand,after_on_hand)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [body.requestId,storeId,variantId,identity.userId,body.delta,body.notes,before.on_hand,after]);
      await client.query(`INSERT INTO inventory_movements(store_id,variant_id,performed_by,kind,quantity_delta,reference_id,notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,[storeId,variantId,identity.userId,
          body.delta>0?'RECEIPT':'ADJUSTMENT',body.delta,body.requestId,body.notes]);
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'STOCK_ADJUSTED','variant',$3,$4::jsonb)`,[storeId,identity.userId,variantId,
          JSON.stringify({delta:body.delta,requestId:body.requestId,before:before.on_hand,after})]);
      await client.query('COMMIT');
      return reply.code(200).send({ idempotent:false, beforeOnHand:before.on_hand,
        afterOnHand:after, reserved:before.reserved,available:after-before.reserved });
    } catch(e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });
}
