import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { PoolClient } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';

const storeParams = z.object({ storeId: uuidParam });
const productParams = z.object({ storeId: uuidParam, productId: uuidParam });
const categoryParams = z.object({ storeId: uuidParam, categoryId: uuidParam });
const publicParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,48}$/) });
const publicProductParams = publicParams.extend({ productId: uuidParam });
const url = z.string().url().max(2048).refine((v) => v.startsWith('https://'), 'Somente HTTPS');
const variantSchema = z.object({
  color: z.string().trim().min(1).max(60),
  size: z.string().trim().min(1).max(50),
  stock: z.number().int().min(0).max(1000000),
  imageUrl: url.nullable().optional(),
}).strict();
const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().max(12000).default(''),
  categoryId: uuidParam,
  price: z.number().finite().nonnegative().max(1000000),
  oldPrice: z.number().finite().nonnegative().max(1000000).nullable().optional(),
  images: z.array(url).max(20).default([]),
  videos: z.array(url).max(5).default([]),
  variants: z.array(variantSchema).min(1).max(120),
  isFeatured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED']).optional(),
}).strict();
const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  icon: z.string().max(24).default('🏷️'),
  imageUrl: z.union([url, z.literal('')]).default(''),
}).strict();
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const money = (value: string | number | null) => value === null ? null : Number(value) / 100;
const catalogEvents = new EventEmitter();
catalogEvents.setMaxListeners(0);
export const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(0);
export const supportEvents = new EventEmitter();
supportEvents.setMaxListeners(0);

// Uma conexão LISTEN dedicada por instância; PostgreSQL distribui entre réplicas.
export async function startCatalogListener(app: FastifyInstance): Promise<void> {
  let closed = false;
  let listeningClient: PoolClient | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  async function connect() {
    if (closed) return;
    try {
      const client = await pool.connect();
      listeningClient = client;
      client.on('notification', (msg) => {
        if (msg.channel === 'loja_catalog_changed' && msg.payload) catalogEvents.emit(msg.payload);
        if (msg.channel === 'loja_support_changed' && msg.payload) {
          try {
            const evt = JSON.parse(msg.payload) as { storeId?: string; customerId?: string };
            if (evt.storeId && evt.customerId) {
              supportEvents.emit(`store:${evt.storeId}`);
              supportEvents.emit(`user:${evt.storeId}:${evt.customerId}`);
            }
          } catch { app.log.warn('Evento de atendimento inválido'); }
        }
        if (msg.channel === 'loja_order_changed' && msg.payload) {
          try {
            const evt = JSON.parse(msg.payload) as { storeId?: string; customerId?: string };
            if (evt.storeId) orderEvents.emit(`store:${evt.storeId}`);
            if (evt.customerId) orderEvents.emit(`user:${evt.storeId}:${evt.customerId}`);
          } catch { app.log.warn('Evento de pedidos inválido'); }
        }
      });
      const onError = (err: Error) => {
        app.log.warn({ err: err.message }, 'LISTEN de catálogo desconectado');
        client.removeListener('error', onError);
        client.release(true);
        if (listeningClient === client) listeningClient = null;
        if (!closed) retry = setTimeout(() => void connect(), 3000);
      };
      client.on('error', onError);
      await client.query('LISTEN loja_catalog_changed');
      await client.query('LISTEN loja_order_changed');
      await client.query('LISTEN loja_support_changed');
    } catch (e) {
      app.log.warn({ err: String(e) }, 'Não foi possível iniciar LISTEN de catálogo');
      if (listeningClient) { listeningClient.release(true); listeningClient = null; }
      if (!closed) retry = setTimeout(() => void connect(), 3000);
    }
  }
  await connect();
  app.addHook('onClose', async () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (listeningClient) { listeningClient.release(true); listeningClient = null; }
  });
}

async function lookupStore(slug: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'", [slug]);
  if (!result.rowCount) throw new ApiError(404, 'Loja não encontrada.');
  return result.rows[0].id;
}

type CategoryRow = { id: string; name: string; icon: string; image_url: string };
async function categories(storeId: string) {
  const result = await pool.query<CategoryRow>(
    "SELECT id,name,icon,image_url FROM categories WHERE store_id=$1 AND status='ACTIVE' ORDER BY name", [storeId]);
  return result.rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon, imageUrl: r.image_url }));
}

type ProductRow = {
  id: string; name: string; description: string; category_id: string; size_guide: string; status: string;
  created_at: Date; images: string[]; videos: string[]; old_price_cents: string | null;
  is_featured: boolean; is_new: boolean;
  variants: Array<{ id: string; color: string; size: string; stock: number; imageUrl: string | null; priceCents: string }>;
};
function toPublicProduct(p: ProductRow) {
  return {
    id: p.id, name: p.name, description: p.description, sizeGuide:p.size_guide, categoryId: p.category_id,
    status: p.status, createdAt: p.created_at.toISOString(),
    price: p.variants.length ? money(p.variants[0].priceCents) : 0,
    oldPrice: money(p.old_price_cents), images: p.images, videos: p.videos,
    isFeatured: p.is_featured, isNew: p.is_new,
    variants: p.variants.map((v) => ({ id: v.id, color: v.color, size: v.size, stock: v.stock, imageUrl: v.imageUrl })),
  };
}

async function products(storeId: string, includeUnpublished: boolean, productId: string | null = null) {
  const result = await pool.query<ProductRow>(`
    SELECT p.id,p.name,p.description,p.category_id,p.size_guide,p.status,p.created_at,
           p.images,p.videos,p.old_price_cents,p.is_featured,p.is_new,
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'id',v.id,'color',v.attributes->>'color','size',v.attributes->>'size',
             'stock',v.on_hand-v.reserved,'imageUrl',v.attributes->>'imageUrl',
             'priceCents',v.price_cents::text) ORDER BY v.created_at)
             FROM product_variants v WHERE v.product_id=p.id AND v.status='ACTIVE'), '[]'::jsonb) AS variants
    FROM products p WHERE p.store_id=$1 AND (($2::boolean AND p.status <> 'ARCHIVED') OR p.status='PUBLISHED')
    AND ($3::uuid IS NULL OR p.id=$3)
    ORDER BY p.created_at DESC LIMIT 500`, [storeId, includeUnpublished, productId]);
  return result.rows.map(toPublicProduct);
}

async function assertCategory(client: PoolClient, storeId: string, categoryId: string) {
  const found = await client.query("SELECT 1 FROM categories WHERE id=$1 AND store_id=$2 AND status='ACTIVE'", [categoryId, storeId]);
  if (!found.rowCount) throw new ApiError(400, 'Categoria inválida para esta loja.');
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/v1/shops/:slug/catalog/categories', async (req) => {
    const { slug } = validated(publicParams, req.params);
    return { categories: await categories(await lookupStore(slug)) };
  });
  app.get('/v1/shops/:slug/catalog/products', async (req) => {
    const { slug } = validated(publicParams, req.params);
    return { products: await products(await lookupStore(slug), false) };
  });
  // Paginação keyset: nenhum catálogo inteiro precisa ser carregado para pesquisar.
  // Cursor de posição (não é credencial), sempre validado por Zod.
  const searchQuery = z.object({
    q: z.string().trim().max(120).optional(),
    discounted:z.enum(['true']).optional(),featured:z.enum(['true']).optional(),new:z.enum(['true']).optional(),
    categoryId: uuidParam.optional(), color: z.string().trim().max(60).optional(),
    size: z.string().trim().max(50).optional(), available: z.enum(['true','false']).optional(),
    minPrice: z.coerce.number().finite().min(0).max(1000000).optional(),
    maxPrice: z.coerce.number().finite().min(0).max(1000000).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(200).optional(),
  }).strict();
  app.get('/v1/shops/:slug/catalog/search', async (req) => {
    const { slug } = validated(publicParams, req.params);
    const args = validated(searchQuery, req.query);
    if (args.minPrice !== undefined && args.maxPrice !== undefined && args.minPrice > args.maxPrice) {
      throw new ApiError(400, 'Faixa de preço inválida.');
    }
    let after: { t: string; id: string } | null = null;
    if (args.cursor) {
      try {
        const raw = JSON.parse(Buffer.from(args.cursor, 'base64url').toString('utf8'));
        after = validated(z.object({ t: z.string().datetime(), id: uuidParam }).strict(), raw);
      } catch { throw new ApiError(400, 'Cursor inválido.'); }
    }
    const storeId = await lookupStore(slug);
    const params: unknown[] = [storeId];
    const conditions: string[] = ["p.store_id=$1", "p.status='PUBLISHED'"];
    const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
    if (args.q) conditions.push(`(strpos(lower(p.name), lower(${bind(args.q)}))>0 OR strpos(lower(p.description),lower(${bind(args.q)}))>0)`);
    if (args.categoryId) conditions.push(`p.category_id=${bind(args.categoryId)}`);
    if (args.discounted) conditions.push(`p.old_price_cents IS NOT NULL AND EXISTS
      (SELECT 1 FROM product_variants dv WHERE dv.product_id=p.id AND dv.status='ACTIVE'
       AND dv.price_cents<p.old_price_cents)`);
    if (args.featured) conditions.push('p.is_featured=TRUE');
    if (args.new) conditions.push('p.is_new=TRUE');
    if (after) {
      const when = bind(after.t); const id = bind(after.id);
      conditions.push(`(p.created_at,p.id)<(${when}::timestamptz,${id}::uuid)`);
    }
    const variantConditions = ["v.product_id=p.id", "v.status='ACTIVE'"];
    if (args.color) variantConditions.push(`lower(v.attributes->>'color')=lower(${bind(args.color)})`);
    if (args.size) variantConditions.push(`lower(v.attributes->>'size')=lower(${bind(args.size)})`);
    if (args.available === 'true') variantConditions.push('v.on_hand>v.reserved');
    if (args.minPrice !== undefined) variantConditions.push(`v.price_cents>=${bind(cents(args.minPrice))}`);
    if (args.maxPrice !== undefined) variantConditions.push(`v.price_cents<=${bind(cents(args.maxPrice))}`);
    if (variantConditions.length > 2) conditions.push(`EXISTS (SELECT 1 FROM product_variants v WHERE ${variantConditions.join(' AND ')})`);
    const limitParam = bind(args.limit + 1);
    const data = await pool.query<ProductRow>(`
      SELECT p.id,p.name,p.description,p.category_id,p.size_guide,p.status,p.created_at,
             p.images,p.videos,p.old_price_cents,p.is_featured,p.is_new,
             COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'id',v.id,'color',v.attributes->>'color','size',v.attributes->>'size',
               'stock',v.on_hand-v.reserved,'imageUrl',v.attributes->>'imageUrl',
               'priceCents',v.price_cents::text) ORDER BY v.created_at)
               FROM product_variants v WHERE v.product_id=p.id AND v.status='ACTIVE'), '[]'::jsonb) AS variants
      FROM products p WHERE ${conditions.join(' AND ')}
      ORDER BY p.created_at DESC,p.id DESC LIMIT ${limitParam}`, params);
    const hasMore = data.rows.length > args.limit;
    const rows = data.rows.slice(0, args.limit);
    const last = rows.at(-1);
    return { products: rows.map(toPublicProduct), nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify({ t: last.created_at.toISOString(), id: last.id })).toString('base64url')
      : null };
  });

  app.get('/v1/shops/:slug/catalog/products/:productId', async (req) => {
    const { slug, productId } = validated(publicProductParams, req.params);
    const list = await products(await lookupStore(slug), false, productId);
    const product = list.find((p) => p.id === productId);
    if (!product) throw new ApiError(404, 'Produto não encontrado.');
    return { product };
  });
  app.get('/v1/shops/:slug/catalog/events', async (req, reply) => {
    const { slug } = validated(publicParams, req.params);
    const storeId = await lookupStore(slug);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const emit = () => {
      if (!reply.raw.destroyed) reply.raw.write('event: catalog\ndata: {"changed":true}\n\n');
    };
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) return;
      debounce = setTimeout(() => { debounce = null; emit(); }, 250);
    };
    catalogEvents.on(storeId, schedule);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
    }, 20000);
    const cleanup = () => { clearInterval(heartbeat); if (debounce) clearTimeout(debounce); catalogEvents.off(storeId, schedule); };
    reply.raw.on('close', cleanup);
    emit();
  });

  app.get('/v1/stores/:storeId/catalog/categories', async (req) => {
    const { storeId } = validated(storeParams, req.params);
    await requireStoreRole(req, storeId, ['OWNER','MANAGER','STAFF']);
    return { categories: await categories(storeId) };
  });
  app.get('/v1/stores/:storeId/catalog/products', async (req) => {
    const { storeId } = validated(storeParams, req.params);
    await requireStoreRole(req, storeId, ['OWNER','MANAGER','STAFF']);
    return { products: await products(storeId, true) };
  });
  app.post('/v1/stores/:storeId/catalog/categories', async (req, reply) => {
    const { storeId } = validated(storeParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER','MANAGER']);
    const body = validated(categorySchema, req.body);
    const id = randomUUID();
    await pool.query(`INSERT INTO categories (id,store_id,name,slug,icon,image_url)
      VALUES ($1,$2,$3,$4,$5,$6)`, [id,storeId,body.name,id,body.icon,body.imageUrl]);
    await pool.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
      VALUES ($1,$2,'CATEGORY_CREATED','category',$3)`, [storeId,identity.userId,id]);
    return reply.code(201).send({ category: { id, ...body } });
  });

  async function saveProduct(storeId: string, productId: string | null,
    body: z.infer<typeof productSchema>, actorId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assertCategory(client, storeId, body.categoryId);
      const id = productId ?? randomUUID();
      if (productId) {
        const existing = await client.query('SELECT id FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE', [id,storeId]);
        if (!existing.rowCount) throw new ApiError(404, 'Produto não encontrado.');
        await client.query(`UPDATE products SET name=$3,description=$4,category_id=$5,
          images=$6::jsonb,videos=$7::jsonb,old_price_cents=$8,is_featured=$9,is_new=$10,
          status=$11,updated_at=now() WHERE id=$1 AND store_id=$2`,
          [id,storeId,body.name,body.description,body.categoryId,JSON.stringify(body.images),
            JSON.stringify(body.videos),body.oldPrice == null ? null : cents(body.oldPrice),
            body.isFeatured,body.isNew,body.status ?? 'PUBLISHED']);
      } else {
        await client.query(`INSERT INTO products(id,store_id,category_id,name,slug,description,
          images,videos,old_price_cents,is_featured,is_new,status)
          VALUES($1,$2,$3,$4,$1,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,
          [id,storeId,body.categoryId,body.name,body.description,JSON.stringify(body.images),
            JSON.stringify(body.videos),body.oldPrice == null ? null : cents(body.oldPrice),
            body.isFeatured,body.isNew,body.status ?? 'PUBLISHED']);
      }
      const variants = await client.query<{id:string; attributes:{color:string;size:string};on_hand:number;reserved:number}>(
        'SELECT id,attributes,on_hand,reserved FROM product_variants WHERE product_id=$1 AND store_id=$2 FOR UPDATE', [id,storeId]);
      if (productId && body.variants.length !== variants.rows.length) {
        throw new ApiError(409, 'Use o novo painel de variantes para criar/desativar SKUs.');
      }
      const keys = new Set<string>();
      for (const variant of body.variants) {
        const key = JSON.stringify([variant.color.toLowerCase(),variant.size.toLowerCase()]);
        if (keys.has(key)) throw new ApiError(400, 'Variantes duplicadas (cor/tamanho).');
        keys.add(key);
        const previous = variants.rows.find((v) => JSON.stringify([
          v.attributes.color.toLowerCase(),v.attributes.size.toLowerCase()]) === key);
        if (previous) {
          // O PUT antigo não pode alterar estoque: somente a central de inventário
          // registra mudanças com motivo, idempotência e proteção de reservas.
          if (variant.stock !== previous.on_hand - previous.reserved) {
            throw new ApiError(409, 'Estoque alterado. Use Inventário e movimentações para ajustar quantidades.');
          }
          await client.query(`UPDATE product_variants SET attributes=$3::jsonb,
            price_cents=$4, status='ACTIVE', updated_at=now()
            WHERE id=$1 AND store_id=$2`, [previous.id,storeId,JSON.stringify({color:variant.color,size:variant.size,imageUrl:variant.imageUrl ?? null}),cents(body.price)]);
        } else {
          if (productId) throw new ApiError(409, 'Utilize o painel de variantes para cadastrar novos SKUs.');
          const variantId = randomUUID();
          await client.query(`INSERT INTO product_variants(id,store_id,product_id,sku,attributes,price_cents,on_hand)
            VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, [variantId,storeId,id,variantId,JSON.stringify(variant),cents(body.price),variant.stock]);
          if (variant.stock) await client.query(`INSERT INTO inventory_movements(store_id,variant_id,performed_by,kind,quantity_delta,notes)
            VALUES ($1,$2,$3,'RECEIPT',$4,'Estoque inicial')`, [storeId,variantId,actorId,variant.stock]);
        }
      }
      for (const existing of variants.rows) {
        const key = JSON.stringify([existing.attributes.color.toLowerCase(),existing.attributes.size.toLowerCase()]);
        if (!keys.has(key)) {
          if (productId) throw new ApiError(409, 'Use o novo painel para desativar variantes.');
          if (existing.reserved > 0) throw new ApiError(409, 'Variante reservada não pode ser removida.');
          await client.query("UPDATE product_variants SET status='INACTIVE',updated_at=now() WHERE id=$1", [existing.id]);
        }
      }
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
        VALUES ($1,$2,$3,'product',$4)`, [storeId,actorId,productId ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED',id]);
      await client.query('COMMIT');
      return id;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  }

  app.post('/v1/stores/:storeId/catalog/products', async (req, reply) => {
    const { storeId } = validated(storeParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER','MANAGER']);
    const body = validated(productSchema, req.body);
    const id = await saveProduct(storeId, null, body, identity.userId);
    return reply.code(201).send({ id });
  });
  app.put('/v1/stores/:storeId/catalog/products/:productId', async (req) => {
    const { storeId, productId } = validated(productParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER','MANAGER']);
    const body = validated(productSchema, req.body);
    return { id: await saveProduct(storeId, productId, body, identity.userId) };
  });
  app.delete('/v1/stores/:storeId/catalog/products/:productId', async (req, reply) => {
    const { storeId, productId } = validated(productParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER','MANAGER']);
    const changed = await pool.query(`UPDATE products SET status='ARCHIVED',updated_at=now()
      WHERE id=$1 AND store_id=$2 RETURNING id`, [productId,storeId]);
    if (!changed.rowCount) throw new ApiError(404, 'Produto não encontrado.');
    await pool.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
      VALUES ($1,$2,'PRODUCT_ARCHIVED','product',$3)`, [storeId,identity.userId,productId]);
    return reply.code(204).send();
  });
}
