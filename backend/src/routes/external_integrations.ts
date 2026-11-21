import type { FastifyInstance } from 'fastify';
import { catalogImportRoutes } from './external_catalog_import.js';
import { externalOrderSyncRoutes } from './external_order_sync.js';
import { externalDeliveryRoutes } from './external_delivery.js';
import { externalConnectorHealthRoutes } from './external_connector_health.js';
import { externalIntegrationReadinessRoutes } from './external_integration_readiness.js';
import { externalDeploymentProfileRoutes } from './external_deployment_profile.js';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireStoreRole } from '../security/identity.js';
import { ApiError } from '../security/errors.js';
import { uuidParam, validated } from '../security/validation.js';
import {
  assertIntegrationsEnabled, createIntegrationKey, decodeOrderCursor, encodeOrderCursor,
  hashValue, requireIntegration,
} from '../integrations/core.js';

const storeParams = z.object({ storeId: uuidParam }).strict();
const integrationParams = storeParams.extend({ integrationId: uuidParam });
const variantParams = z.object({ variantId: uuidParam }).strict();
const createBody = z.object({
  name: z.string().trim().min(3).max(100),
  provider: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  stockAuthority: z.boolean().default(false),
  catalogAuthority: z.boolean().default(false),
  orderAuthority: z.boolean().default(false),
  customerDataAccess: z.boolean().default(false),
}).strict();
const mappingBody = z.object({ externalId: z.string().trim().min(1).max(180) }).strict();
const stockBody = z.object({
  eventId: uuidParam,
  sourceVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  onHand: z.number().int().min(0).max(1000000),
}).strict();
const catalogQuery = z.object({
  after: uuidParam.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const orderQuery = z.object({
  cursor: z.string().max(240).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const eventQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();
const ackEventsBody = z.object({
  eventIds: z.array(z.string().regex(/^[1-9][0-9]{0,17}$/)).min(1).max(200),
}).strict();

function conflict(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
    throw new ApiError(409, 'Identificador duplicado ou ja existe integracao responsavel por estoque, catalogo ou pedidos desta loja.');
  throw error;
}

export async function externalIntegrationRoutes(app: FastifyInstance): Promise<void> {
  // Gestão por proprietario. A chave so e retornada uma unica vez, nunca em listagens.
  app.post('/v1/stores/:storeId/integrations', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    assertIntegrationsEnabled();
    const { storeId } = validated(storeParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const body = validated(createBody, req.body);
    const secret = createIntegrationKey();
    const scopes = ['catalog.read', 'orders.read', 'events.read', 'mapping.write'];
    if (body.stockAuthority) scopes.push('stock.write');
    if (body.catalogAuthority) scopes.push('catalog.write');
    if (body.orderAuthority) scopes.push('orders.write');
    if (body.customerDataAccess) scopes.push('orders.customer.read');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(`
        INSERT INTO external_integrations(store_id,name,provider,token_prefix,token_hash,scopes,stock_authority,catalog_authority,order_authority,created_by)
        VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10) RETURNING id`,
      [storeId, body.name, body.provider, secret.prefix, secret.hash, scopes, body.stockAuthority, body.catalogAuthority, body.orderAuthority, identity.userId]);
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'INTEGRATION_CREATED','external_integration',$3,$4::jsonb)`,
      [storeId, identity.userId, result.rows[0].id, JSON.stringify({ provider: body.provider, stockAuthority: body.stockAuthority, catalogAuthority: body.catalogAuthority, orderAuthority: body.orderAuthority, customerDataAccess: body.customerDataAccess })]);
      await client.query('COMMIT');
      return reply.code(201).send({ integrationId: result.rows[0].id, token: secret.key,
        tokenPrefix: secret.prefix, scopes, stockAuthority: body.stockAuthority, catalogAuthority: body.catalogAuthority, orderAuthority: body.orderAuthority, customerDataAccess: body.customerDataAccess,
        warning: 'Guarde a credencial agora. Ela nao podera ser consultada novamente.' });
    } catch (error) {
      await client.query('ROLLBACK');
      return conflict(error);
    } finally { client.release(); }
  });

  app.get('/v1/stores/:storeId/integrations', async req => {
    assertIntegrationsEnabled();
    const { storeId } = validated(storeParams, req.params);
    await requireStoreRole(req, storeId, ['OWNER']);
    const result = await pool.query(`SELECT id,name,provider,token_prefix AS "tokenPrefix",
      scopes,stock_authority AS "stockAuthority",catalog_authority AS "catalogAuthority",order_authority AS "orderAuthority",delivery_mode AS "deliveryMode",created_at AS "createdAt",revoked_at AS "revokedAt"
      FROM external_integrations WHERE store_id=$1 ORDER BY created_at DESC`, [storeId]);
    return { integrations: result.rows };
  });

  app.post('/v1/stores/:storeId/integrations/:integrationId/revoke', async req => {
    assertIntegrationsEnabled();
    const { storeId, integrationId } = validated(integrationParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`UPDATE external_integrations SET revoked_at=now()
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL RETURNING id`, [integrationId, storeId]);
      if (!result.rowCount) throw new ApiError(404, 'Integracao ativa nao encontrada.');
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
        VALUES($1,$2,'INTEGRATION_REVOKED','external_integration',$3)`, [storeId, identity.userId, integrationId]);
      await client.query('COMMIT');
      return { revoked: true };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });

  // O proprietario pode promover uma integracao ja existente sem perder mapeamentos e versoes.
  app.post('/v1/stores/:storeId/integrations/:integrationId/enable-orders', async req => {
    assertIntegrationsEnabled();
    const { storeId, integrationId } = validated(integrationParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const present = await client.query<{order_authority:boolean}>(`SELECT order_authority FROM external_integrations
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL FOR UPDATE`, [integrationId, storeId]);
      if (!present.rowCount) throw new ApiError(404,'Integracao ativa nao encontrada.');
      if (!present.rows[0].order_authority) {
        await client.query(`UPDATE external_integrations
          SET order_authority=TRUE,scopes=CASE WHEN 'orders.write'=ANY(scopes) THEN scopes
          ELSE array_append(scopes,'orders.write') END WHERE id=$1 AND store_id=$2`, [integrationId,storeId]);
        await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
          VALUES($1,$2,'INTEGRATION_ORDER_AUTHORITY_GRANTED','external_integration',$3)`,
        [storeId,identity.userId,integrationId]);
      }
      await client.query('COMMIT');
      return { orderAuthority: true, alreadyEnabled: present.rows[0].order_authority };
    } catch(e) { await client.query('ROLLBACK'); return conflict(e); }
    finally { client.release(); }
  });

  // Acesso a dados pessoais e concedido separadamente pelo OWNER, e nao pela simples leitura de pedidos.
  app.post('/v1/stores/:storeId/integrations/:integrationId/enable-customer-data', async req => {
    assertIntegrationsEnabled();
    const {storeId,integrationId}=validated(integrationParams,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER']);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const active=await client.query<{scopes:string[]}>(`SELECT scopes FROM external_integrations
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL FOR UPDATE`,[integrationId,storeId]);
      if(!active.rowCount)throw new ApiError(404,'Integracao ativa nao encontrada.');
      const alreadyEnabled=active.rows[0].scopes.includes('orders.customer.read');
      if(!alreadyEnabled){
        await client.query(`UPDATE external_integrations SET scopes=array_append(scopes,'orders.customer.read')
          WHERE id=$1 AND store_id=$2`,[integrationId,storeId]);
        await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
          VALUES($1,$2,'INTEGRATION_CUSTOMER_ACCESS_GRANTED','external_integration',$3)`,
        [storeId,identity.userId,integrationId]);
      }
      await client.query('COMMIT');
      return {customerDataAccess:true,alreadyEnabled};
    }catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });

  await app.register(catalogImportRoutes);
  await app.register(externalOrderSyncRoutes);
  await app.register(externalDeliveryRoutes);
  await app.register(externalConnectorHealthRoutes);
  await app.register(externalIntegrationReadinessRoutes);
  await app.register(externalDeploymentProfileRoutes);

  // API externa: dados limitados EXCLUSIVAMENTE a loja vinculada a credencial.
  app.get('/v1/external/catalog/variants', async req => {
    const identity = await requireIntegration(req, 'catalog.read');
    const { after, limit } = validated(catalogQuery, req.query);
    const result = await pool.query(`SELECT v.id AS "variantId",v.product_id AS "productId",
      p.name AS "productName",p.description,p.status AS "productStatus",
      p.category_id AS "categoryId",v.status AS "variantStatus",v.sku,
      v.attributes->>'color' AS color,v.attributes->>'size' AS size,v.gtin,
      v.price_cents::text AS "priceCents",v.on_hand AS "onHand",v.reserved,
      (v.on_hand-v.reserved) AS available,v.updated_at AS "variantUpdatedAt",
      p.updated_at AS "productUpdatedAt",m.external_id AS "externalId",
      pm.external_id AS "externalProductId"
      FROM product_variants v
      JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
      LEFT JOIN external_variant_mappings m
        ON m.integration_id=$2 AND m.store_id=v.store_id AND m.variant_id=v.id
      LEFT JOIN external_product_mappings pm
        ON pm.integration_id=$2 AND pm.store_id=v.store_id AND pm.product_id=v.product_id
      WHERE v.store_id=$1 AND ($3::uuid IS NULL OR v.id>$3::uuid)
      ORDER BY v.id ASC LIMIT $4`, [identity.storeId, identity.id, after ?? null, limit + 1]);
    const hasMore = result.rows.length > limit;
    const variants = result.rows.slice(0, limit);
    return { variants, nextAfter: variants.length ? variants[variants.length - 1].variantId : (after ?? null), hasMore };
  });

  app.get('/v1/external/orders', async req => {
    const identity = await requireIntegration(req, 'orders.read');
    const { cursor, limit } = validated(orderQuery, req.query);
    const since = decodeOrderCursor(cursor);
    const headers = await pool.query(`SELECT o.id,o.status,o.is_demo AS "isDemo",
      o.fulfillment_method AS "fulfillmentMethod",o.subtotal_cents::text AS "subtotalCents",
      o.shipping_cents::text AS "shippingCents",o.discount_cents::text AS "discountCents",
      o.total_cents::text AS "totalCents",o.created_at AS "createdAt",
      o.updated_at AS "updatedAt",o.paid_at AS "paidAt",
      to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime"
      FROM orders o WHERE o.store_id=$1
        AND (o.created_at,o.id)>($2::timestamptz,$3::uuid)
      ORDER BY o.created_at,o.id LIMIT $4`,
    [identity.storeId, since.date, since.id, limit + 1]);
    const hasMore = headers.rows.length > limit;
    const rows = headers.rows.slice(0, limit);
    const ids: string[] = rows.map((r: { id: string }) => r.id);
    const items = ids.length ? await pool.query(`SELECT oi.order_id AS "orderId",oi.product_id AS "productId",
      oi.variant_id AS "variantId",oi.product_name AS "productName",oi.sku_snapshot AS sku,
      oi.variant_snapshot AS variant,oi.quantity,oi.unit_price_cents::text AS "unitPriceCents",
      m.external_id AS "externalVariantId"
      FROM order_items oi
      LEFT JOIN external_variant_mappings m ON m.integration_id=$3
        AND m.store_id=oi.store_id AND m.variant_id=oi.variant_id
      WHERE oi.store_id=$1 AND oi.order_id=ANY($2::uuid[]) ORDER BY oi.id`,
    [identity.storeId, ids, identity.id]) : { rows: [] };
    const byOrder = new Map<string, unknown[]>();
    for (const item of items.rows as Array<{ orderId: string }>) {
      const existing = byOrder.get(item.orderId) ?? [];
      existing.push(item);
      byOrder.set(item.orderId, existing);
    }
    const orders = rows.map((r: { id: string; cursorTime: string }) => {
      const { cursorTime: _cursorTime, ...rest } = r;
      return { ...rest, items: byOrder.get(r.id) ?? [] };
    });
    const last = rows[rows.length - 1] as { id: string; cursorTime: string } | undefined;
    return { orders, hasMore, nextCursor: last ? encodeOrderCursor(last.cursorTime, last.id) : (cursor ?? null) };
  });

  // Entrega ao menos uma vez: eventos reaparecem ate ACK; nenhuma transacao atrasada e perdida por cursor.
  app.get('/v1/external/events', async req => {
    const identity = await requireIntegration(req, 'events.read');
    if (identity.deliveryMode === 'LEASED') throw new ApiError(409, 'Use /v1/external/events/claim para esta integracao.');
    const { limit } = validated(eventQuery, req.query);
    const result = await pool.query(`SELECT e.id::text AS id,e.event_type AS type,
      e.resource_id AS "resourceId",e.created_at AS "createdAt"
      FROM external_change_events e WHERE e.store_id=$1
        AND (e.origin_integration_id IS DISTINCT FROM $2::uuid) AND NOT EXISTS (
        SELECT 1 FROM external_event_acks a WHERE a.integration_id=$2 AND a.event_id=e.id)
      ORDER BY e.id LIMIT $3`, [identity.storeId, identity.id, limit + 1]);
    const hasMore = result.rows.length > limit;
    const events = result.rows.slice(0, limit);
    return { events, hasMore, requiresAck: true };
  });

  app.post('/v1/external/events/ack', async req => {
    const identity = await requireIntegration(req, 'events.read');
    if (identity.deliveryMode === 'LEASED') throw new ApiError(409, 'Use ACK por lease em /v1/external/events/:eventId/ack.');
    const { eventIds } = validated(ackEventsBody, req.body);
    if (new Set(eventIds).size !== eventIds.length) throw new ApiError(400, 'eventIds duplicados.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ id: string }>(`SELECT id::text AS id
        FROM external_change_events WHERE store_id=$1 AND id=ANY($2::bigint[])`,
      [identity.storeId, eventIds]);
      if (found.rows.length !== eventIds.length) throw new ApiError(404, 'Um ou mais eventos nao pertencem a esta loja.');
      await client.query(`INSERT INTO external_event_acks(integration_id,event_id)
        SELECT $1,e.id FROM external_change_events e
        WHERE e.store_id=$2 AND e.id=ANY($3::bigint[])
        ON CONFLICT DO NOTHING`, [identity.id, identity.storeId, eventIds]);
      await client.query('COMMIT');
      return { acknowledged: eventIds.length };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });

  app.get('/v1/external/catalog/products/:productId', async req => {
    const identity = await requireIntegration(req, 'catalog.read');
    const { productId } = validated(z.object({ productId: uuidParam }).strict(), req.params);
    const result = await pool.query(`SELECT p.id,p.name,p.slug,p.description,p.status,
      p.category_id AS "categoryId",p.images,p.videos,p.updated_at AS "updatedAt",
      pm.external_id AS "externalProductId" FROM products p
      LEFT JOIN external_product_mappings pm ON pm.integration_id=$3
        AND pm.store_id=p.store_id AND pm.product_id=p.id
      WHERE p.store_id=$1 AND p.id=$2`, [identity.storeId, productId, identity.id]);
    if (!result.rowCount) throw new ApiError(404, 'Produto nao encontrado nesta loja.');
    const variants = await pool.query(`SELECT v.id AS "variantId",v.sku,v.status,v.gtin,
      v.attributes,v.price_cents::text AS "priceCents",v.on_hand AS "onHand",v.reserved,
      (v.on_hand-v.reserved) AS available,m.external_id AS "externalId"
      FROM product_variants v LEFT JOIN external_variant_mappings m
        ON m.integration_id=$3 AND m.store_id=v.store_id AND m.variant_id=v.id
      WHERE v.store_id=$1 AND v.product_id=$2 ORDER BY v.id`, [identity.storeId, productId, identity.id]);
    return { product: { ...result.rows[0], variants: variants.rows } };
  });

  app.get('/v1/external/catalog/variants/:variantId', async req => {
    const identity = await requireIntegration(req, 'catalog.read');
    const { variantId } = validated(variantParams, req.params);
    const result = await pool.query(`SELECT v.id AS "variantId",v.product_id AS "productId",
      p.name AS "productName",p.description,p.status AS "productStatus",
      p.category_id AS "categoryId",v.status AS "variantStatus",v.sku,
      v.attributes->>'color' AS color,v.attributes->>'size' AS size,v.gtin,
      v.price_cents::text AS "priceCents",v.on_hand AS "onHand",v.reserved,
      (v.on_hand-v.reserved) AS available,v.updated_at AS "variantUpdatedAt",
      p.updated_at AS "productUpdatedAt",m.external_id AS "externalId",
      pm.external_id AS "externalProductId"
      FROM product_variants v
      JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
      LEFT JOIN external_variant_mappings m
        ON m.integration_id=$2 AND m.store_id=v.store_id AND m.variant_id=v.id
      LEFT JOIN external_product_mappings pm
        ON pm.integration_id=$2 AND pm.store_id=v.store_id AND pm.product_id=v.product_id
      WHERE v.store_id=$1 AND v.id=$3`, [identity.storeId, identity.id, variantId]);
    if (!result.rowCount) throw new ApiError(404, 'Variante nao encontrada nesta loja.');
    return { variant: result.rows[0] };
  });

  app.get('/v1/external/orders/:orderId', async req => {
    const identity = await requireIntegration(req, 'orders.read');
    const { orderId } = validated(z.object({ orderId: uuidParam }).strict(), req.params);
    const result = await pool.query(`SELECT o.id,o.status,o.is_demo AS "isDemo",
      o.fulfillment_method AS "fulfillmentMethod",o.subtotal_cents::text AS "subtotalCents",
      o.shipping_cents::text AS "shippingCents",o.discount_cents::text AS "discountCents",
      o.total_cents::text AS "totalCents",o.created_at AS "createdAt",
      o.updated_at AS "updatedAt",o.paid_at AS "paidAt",
      o.shipping_service_id AS "shippingServiceId",o.shipping_carrier AS "shippingCarrier",
      (SELECT p.status FROM payments p WHERE p.order_id=o.id AND p.store_id=o.store_id
        ORDER BY p.updated_at DESC LIMIT 1) AS "paymentStatus"
      FROM orders o WHERE o.store_id=$1 AND o.id=$2`, [identity.storeId, orderId]);
    if (!result.rowCount) throw new ApiError(404, 'Pedido nao encontrado nesta loja.');
    const items = await pool.query(`SELECT oi.product_id AS "productId",oi.variant_id AS "variantId",
      oi.product_name AS "productName",oi.sku_snapshot AS sku,oi.variant_snapshot AS variant,
      oi.quantity,oi.unit_price_cents::text AS "unitPriceCents",m.external_id AS "externalVariantId"
      FROM order_items oi LEFT JOIN external_variant_mappings m
        ON m.integration_id=$3 AND m.store_id=oi.store_id AND m.variant_id=oi.variant_id
      WHERE oi.store_id=$1 AND oi.order_id=$2 ORDER BY oi.id`, [identity.storeId, orderId, identity.id]);
    return { order: { ...result.rows[0], items: items.rows } };
  });

  // Dados pessoais somente para conectores autorizados separadamente pelo proprietario.
  app.get('/v1/external/orders/:orderId/customer', async req => {
    const identity=await requireIntegration(req,'orders.customer.read');
    const {orderId}=validated(z.object({orderId:uuidParam}).strict(),req.params);
    const r=await pool.query(`SELECT o.id AS "orderId",
      jsonb_build_object('name',o.shipping_address->>'name',
        'phone',o.shipping_address->>'phone','email',u.email) AS customer,
      CASE WHEN o.fulfillment_method='DELIVERY' THEN
        o.shipping_address - 'name' - 'phone' - 'notes' - 'offlineMethod' - 'demoPaymentMethod'
        ELSE NULL END AS "deliveryAddress",
      o.shipping_address->>'notes' AS notes
      FROM orders o JOIN users u ON u.id=o.customer_id
      WHERE o.store_id=$1 AND o.id=$2`,[identity.storeId,orderId]);
    if(!r.rowCount)throw new ApiError(404,'Pedido nao encontrado nesta loja.');
    return r.rows[0];
  });

  // O adaptador do ERP pode manter o ID proprio sem mudar SKU ou IDs internos do app.
  app.put('/v1/external/mappings/variants/:variantId', async req => {
    const identity = await requireIntegration(req, 'mapping.write');
    const { variantId } = validated(variantParams, req.params);
    const { externalId } = validated(mappingBody, req.body);
    const existing = await pool.query(`SELECT 1 FROM product_variants
      WHERE id=$1 AND store_id=$2`, [variantId, identity.storeId]);
    if (!existing.rowCount) throw new ApiError(404, 'Variante nao encontrada nesta loja.');
    try {
      await pool.query(`INSERT INTO external_variant_mappings(integration_id,store_id,variant_id,external_id)
        VALUES($1,$2,$3,$4)
        ON CONFLICT (integration_id,variant_id) DO UPDATE
          SET external_id=EXCLUDED.external_id,updated_at=now()`,
      [identity.id, identity.storeId, variantId, externalId]);
      return { mapped: true, variantId, externalId };
    } catch (error) { return conflict(error); }
  });

  // Snapshot absoluto vindo do ERP. A versao de origem e obrigatoriamente monotônica.
  app.put('/v1/external/inventory/:variantId', async req => {
    const identity = await requireIntegration(req, 'stock.write');
    if (!identity.stockAuthority) throw new ApiError(403, 'Integracao sem autoridade sobre o estoque.');
    const { variantId } = validated(variantParams, req.params);
    const body = validated(stockBody, req.body);
    const payloadHash = hashValue(JSON.stringify({ variantId, sourceVersion: body.sourceVersion, onHand: body.onHand }));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Revogacoes ficam bloqueadas enquanto a atualizacao transacional esta em andamento.
      const active = await client.query(`SELECT 1 FROM external_integrations
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL AND stock_authority FOR SHARE`,
      [identity.id, identity.storeId]);
      if (!active.rowCount) throw new ApiError(401, 'Integracao revogada.');
      // Serializa reenvios concorrentes do mesmo evento (inclusive para variantes diferentes).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [identity.id, body.eventId]);
      const previous = await client.query<{ payload_hash: string }>(`
        SELECT payload_hash FROM external_stock_operations WHERE integration_id=$1 AND event_id=$2`,
      [identity.id, body.eventId]);
      if (previous.rowCount) {
        if (previous.rows[0].payload_hash !== payloadHash) throw new ApiError(409, 'eventId reutilizado com outro conteudo.');
        await client.query('COMMIT');
        return { idempotent: true, acceptedOnHand: body.onHand, sourceVersion: body.sourceVersion };
      }
      const variant = await client.query<{ on_hand: number; reserved: number }>(`
        SELECT v.on_hand,v.reserved FROM product_variants v
        JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        WHERE v.id=$1 AND v.store_id=$2 AND v.status='ACTIVE' AND p.status<>'ARCHIVED'
        FOR UPDATE OF v`, [variantId, identity.storeId]);
      if (!variant.rowCount) throw new ApiError(404, 'Variante ativa nao encontrada nesta loja.');
      const version = await client.query<{ source_version: string }>(`
        SELECT source_version::text AS source_version FROM external_stock_positions
        WHERE integration_id=$1 AND variant_id=$2`, [identity.id, variantId]);
      if (version.rowCount && BigInt(body.sourceVersion) <= BigInt(version.rows[0].source_version))
        throw new ApiError(409, 'Versao de estoque antiga ou repetida. Reenvie um snapshot com nova sourceVersion.');
      const before = variant.rows[0];
      if (body.onHand < before.reserved)
        throw new ApiError(409, 'Estoque informado menor que as unidades reservadas pelos pedidos. Reconcilie primeiro.');
      const delta = body.onHand - before.on_hand;
      if (delta) {
        await client.query(`UPDATE product_variants SET on_hand=$3,updated_at=now()
          WHERE id=$1 AND store_id=$2`, [variantId, identity.storeId, body.onHand]);
        await client.query(`INSERT INTO inventory_movements(store_id,variant_id,kind,quantity_delta,reference_id,notes)
          VALUES($1,$2,$3,$4,$5,$6)`,
        [identity.storeId, variantId, delta > 0 ? 'RECEIPT' : 'ADJUSTMENT', delta, body.eventId,
          `ERP/PDV ${identity.provider}; versao ${body.sourceVersion}`]);
      }
      await client.query(`INSERT INTO external_stock_positions(integration_id,store_id,variant_id,source_version)
        VALUES($1,$2,$3,$4) ON CONFLICT(integration_id,variant_id)
        DO UPDATE SET source_version=EXCLUDED.source_version,updated_at=now()`,
      [identity.id, identity.storeId, variantId, body.sourceVersion]);
      await client.query(`INSERT INTO external_stock_operations
        (integration_id,store_id,event_id,variant_id,payload_hash,source_version,quantity)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [identity.id, identity.storeId, body.eventId, variantId, payloadHash, body.sourceVersion, body.onHand]);
      await client.query(`INSERT INTO audit_logs(store_id,event,entity_type,entity_id,metadata)
        VALUES($1,'EXTERNAL_STOCK_SET','product_variant',$2,$3::jsonb)`,
      [identity.storeId, variantId, JSON.stringify({ integrationId: identity.id, eventId: body.eventId,
        before: before.on_hand, after: body.onHand, sourceVersion: body.sourceVersion })]);
      await client.query('COMMIT');
      return { idempotent: false, onHand: body.onHand, reserved: before.reserved,
        available: body.onHand - before.reserved, delta, sourceVersion: body.sourceVersion };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
}
