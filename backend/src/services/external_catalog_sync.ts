import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { skuSchema, httpsUrl } from './catalog_management.js';
import { hashValue, type IntegrationIdentity } from '../integrations/core.js';

const externalId = z.string().trim().min(1).max(180);
const priceCents = z.union([z.number().int(),z.string().regex(/^[0-9]{1,9}$/)])
  .transform(v=>Number(v)).pipe(z.number().int().min(1).max(100000000));
const gtinField = z.string().regex(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/)
  .refine(validGtin, 'GTIN/EAN com digito verificador invalido.');

export function validGtin(gtin: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin)) return false;
  const digits = Array.from(gtin, Number);
  let total = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3)
    total += digits[i] * weight;
  return (10 - total % 10) % 10 === digits[digits.length - 1];
}

const variant = z.object({
  externalVariantId: externalId,
  sku: skuSchema.transform(s=>s.toUpperCase()),
  priceCents,
  gtin: gtinField.nullable().optional(),
  color: z.string().trim().min(1).max(60).optional(),
  size: z.string().trim().min(1).max(50).optional(),
  imageUrl: httpsUrl.nullable().optional(),
  status: z.enum(['ACTIVE','INACTIVE']).optional(),
}).strict();

export const productImport = z.object({
  eventId: z.string().uuid(),
  sourceVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  externalProductId: externalId,
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(12000).optional(),
  images: z.array(httpsUrl).max(20).optional(),
  status: z.enum(['DRAFT','PUBLISHED','HIDDEN']).optional(),
  variants: z.array(variant).min(1).max(40),
}).strict().superRefine((product, ctx) => {
  const ids = new Set<string>(); const skus = new Set<string>(); const gtins = new Set<string>();
  for (let i = 0; i < product.variants.length; i++) {
    const v = product.variants[i];
    if (ids.has(v.externalVariantId)) ctx.addIssue({code:'custom',path:['variants',i,'externalVariantId'],message:'ID externo repetido.'});
    if (skus.has(v.sku)) ctx.addIssue({code:'custom',path:['variants',i,'sku'],message:'SKU repetido.'});
    if (v.gtin && gtins.has(v.gtin)) ctx.addIssue({code:'custom',path:['variants',i,'gtin'],message:'GTIN repetido.'});
    ids.add(v.externalVariantId);skus.add(v.sku);if (v.gtin) gtins.add(v.gtin);
  }
});
export const catalogBatch = z.object({
  products: z.array(productImport).min(1).max(10),
}).strict().superRefine((data,ctx)=>{
  const events = new Set<string>(); const ids = new Set<string>();
  const variants = new Set<string>(); const skus = new Set<string>(); const gtins = new Set<string>();
  data.products.forEach((p, i)=>{
    if (events.has(p.eventId)) ctx.addIssue({code:'custom',path:['products',i,'eventId'],message:'Evento repetido no lote.'});
    if (ids.has(p.externalProductId)) ctx.addIssue({code:'custom',path:['products',i,'externalProductId'],message:'Produto repetido no lote.'});
    events.add(p.eventId);ids.add(p.externalProductId);
    p.variants.forEach((v,j)=>{
      if (variants.has(v.externalVariantId)) ctx.addIssue({code:'custom',path:['products',i,'variants',j,'externalVariantId'],message:'ID de variante repetido no lote.'});
      if (skus.has(v.sku)) ctx.addIssue({code:'custom',path:['products',i,'variants',j,'sku'],message:'SKU repetido no lote.'});
      if (v.gtin && gtins.has(v.gtin)) ctx.addIssue({code:'custom',path:['products',i,'variants',j,'gtin'],message:'GTIN repetido no lote.'});
      variants.add(v.externalVariantId);skus.add(v.sku);if(v.gtin)gtins.add(v.gtin);
    });
  });
});
export type CatalogProduct = z.infer<typeof productImport>;

export function asCatalogConflict(error: unknown): never {
  const code = (error as { code?: string })?.code;
  if (code === '23505') throw new ApiError(409,'SKU, GTIN ou ID externo ja vinculado a outro produto/variante nesta loja. Utilize mapeamento explicito.');
  if (code === '23503' || code === '23514') throw new ApiError(409,'Referencia ou valor do catalogo incompativel com as regras do banco.');
  throw error;
}

async function applyProduct(client: PoolClient, identity: IntegrationIdentity, input: CatalogProduct) {
  const storeId = identity.storeId;
  const hash = hashValue(JSON.stringify(input));
  const old = await client.query<{payload_hash:string;product_id:string}>(`
    SELECT payload_hash,product_id FROM external_catalog_operations
    WHERE integration_id=$1 AND event_id=$2`,[identity.id,input.eventId]);
  if (old.rowCount) {
    if (old.rows[0].payload_hash!==hash) throw new ApiError(409,'eventId reutilizado com dados diferentes.');
    return {externalProductId:input.externalProductId,productId:old.rows[0].product_id,idempotent:true,created:false};
  }
  const category = await client.query(`SELECT 1 FROM categories
    WHERE id=$1 AND store_id=$2 AND status='ACTIVE' FOR SHARE`,[input.categoryId,storeId]);
  if(!category.rowCount) throw new ApiError(409,'Categoria inativa ou nao pertence a loja. Consulte /v1/external/catalog/categories.');

  const mapped = await client.query<{product_id:string}>(`
    SELECT product_id FROM external_product_mappings WHERE integration_id=$1 AND external_id=$2`,
  [identity.id,input.externalProductId]);
  const created = !mapped.rowCount;
  const productId = mapped.rows[0]?.product_id ?? randomUUID();
  const version = await client.query<{source_version:string}>(`
    SELECT source_version::text AS source_version FROM external_catalog_positions
    WHERE integration_id=$1 AND product_id=$2`,[identity.id,productId]);
  if(version.rowCount && BigInt(input.sourceVersion)<=BigInt(version.rows[0].source_version))
    throw new ApiError(409,'Versao de produto antiga ou repetida. Utilize uma sourceVersion maior.');
  const present = await client.query<{status:string;images:string[];description:string}>(`
    SELECT status,images,description FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE`,[productId,storeId]);
  if (mapped.rowCount && (!present.rowCount || present.rows[0].status==='ARCHIVED'))
    throw new ApiError(409,'Produto mapeado foi arquivado ou removido; revisao manual necessaria.');
  if (created) {
    await client.query(`INSERT INTO products(id,store_id,category_id,name,slug,description,status,images)
      VALUES($1,$2,$3,$4,$1,$5,'DRAFT',$6::jsonb)`,[productId,storeId,input.categoryId,input.name,input.description??'',JSON.stringify(input.images??[])]);
    await client.query(`INSERT INTO external_product_mappings(integration_id,store_id,product_id,external_id)
      VALUES($1,$2,$3,$4)`,[identity.id,storeId,productId,input.externalProductId]);
  } else {
    await client.query(`UPDATE products SET category_id=$3,name=$4,
      description=COALESCE($5::text,description),images=COALESCE($6::jsonb,images),updated_at=now()
      WHERE id=$1 AND store_id=$2`,[productId,storeId,input.categoryId,input.name,input.description??null,input.images ? JSON.stringify(input.images):null]);
  }
  const finalImages = input.images ?? present.rows[0]?.images ?? [];
  const wantedStatus = input.status ?? (created?'DRAFT':present.rows[0].status);
  for (const v of input.variants) {
    const linked = await client.query<{id:string;product_id:string;status:string;reserved:number;attributes:{color?:string;size?:string;imageUrl?:string|null}}>(`
      SELECT pv.id,pv.product_id,pv.status,pv.reserved,pv.attributes FROM external_variant_mappings m
      JOIN product_variants pv ON pv.id=m.variant_id AND pv.store_id=m.store_id
      WHERE m.integration_id=$1 AND m.external_id=$2 AND m.store_id=$3 FOR UPDATE OF pv`,
    [identity.id,v.externalVariantId,storeId]);
    if (linked.rowCount && linked.rows[0].product_id !== productId)
      throw new ApiError(409,'Variante externa vinculada a outro produto. Corrija o mapeamento.');
    const variantId = linked.rows[0]?.id ?? randomUUID();
    const oldAttributes = linked.rows[0]?.attributes ?? {};
    const color = v.color ?? oldAttributes.color ?? 'Padrao';
    const size = v.size ?? oldAttributes.size ?? 'Unico';
    const status = v.status ?? linked.rows[0]?.status ?? 'ACTIVE';
    if(linked.rowCount && status==='INACTIVE' && linked.rows[0].reserved>0)
      throw new ApiError(409,'Nao pode desativar variante com unidades reservadas.');
    const attrs = JSON.stringify({color,size,imageUrl:v.imageUrl===undefined?(oldAttributes.imageUrl??null):v.imageUrl});
    const dup = await client.query(`SELECT 1 FROM product_variants
      WHERE store_id=$1 AND product_id=$2 AND id<>$3
      AND lower(attributes->>'color')=lower($4) AND lower(attributes->>'size')=lower($5)
      AND status='ACTIVE'`,[storeId,productId,variantId,color,size]);
    if (status==='ACTIVE' && dup.rowCount) throw new ApiError(409,'Outra variante ativa possui a mesma combinacao cor/tamanho.');
    if (linked.rowCount) {
      // Preserva ON_HAND e RESERVED. Estoque so pode ser atualizado pela rota de inventario.
      await client.query(`UPDATE product_variants SET sku=$3,price_cents=$4,
        gtin=CASE WHEN $8::boolean THEN $5::varchar ELSE gtin END,attributes=$6::jsonb,status=$7,updated_at=now()
        WHERE id=$1 AND store_id=$2`,[variantId,storeId,v.sku,v.priceCents,v.gtin??null,attrs,status,v.gtin!==undefined]);
    } else {
      await client.query(`INSERT INTO product_variants
        (id,store_id,product_id,sku,attributes,price_cents,gtin,on_hand,reserved,status)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,0,0,$8)`,
      [variantId,storeId,productId,v.sku,attrs,v.priceCents,v.gtin??null,status]);
      await client.query(`INSERT INTO external_variant_mappings(integration_id,store_id,variant_id,external_id)
        VALUES($1,$2,$3,$4)`,[identity.id,storeId,variantId,v.externalVariantId]);
    }
  }
  if(wantedStatus==='PUBLISHED') {
    if(!finalImages.length) throw new ApiError(409,'Publicacao exige ao menos uma foto HTTPS. Envie images ou mantenha o produto como DRAFT.');
    const count = await client.query(`SELECT 1 FROM product_variants
      WHERE store_id=$1 AND product_id=$2 AND status='ACTIVE' LIMIT 1`,[storeId,productId]);
    if(!count.rowCount) throw new ApiError(409,'Publicacao exige ao menos uma variante ativa.');
  }
  await client.query(`UPDATE products SET status=$3,updated_at=now() WHERE id=$1 AND store_id=$2`,[productId,storeId,wantedStatus]);
  await client.query(`INSERT INTO external_catalog_positions(integration_id,store_id,product_id,source_version)
    VALUES($1,$2,$3,$4) ON CONFLICT(integration_id,product_id)
    DO UPDATE SET source_version=EXCLUDED.source_version,updated_at=now()`,
  [identity.id,storeId,productId,input.sourceVersion]);
  await client.query(`INSERT INTO external_catalog_operations
    (integration_id,store_id,event_id,product_id,payload_hash,source_version)
    VALUES($1,$2,$3,$4,$5,$6)`,[identity.id,storeId,input.eventId,productId,hash,input.sourceVersion]);
  await client.query(`INSERT INTO audit_logs(store_id,event,entity_type,entity_id,metadata)
    VALUES($1,'EXTERNAL_CATALOG_SYNC','product',$2,$3::jsonb)`,
  [storeId,productId,JSON.stringify({integrationId:identity.id,eventId:input.eventId,sourceVersion:input.sourceVersion,created,variants:input.variants.length})]);
  return {externalProductId:input.externalProductId,productId,idempotent:false,created};
}

export async function applyCatalogBatch(identity: IntegrationIdentity, products: CatalogProduct[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Revogacao e batches concorrentes aguardam a conclusao da transacao em curso.
    const auth = await client.query(`SELECT 1 FROM external_integrations
      WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL AND catalog_authority FOR SHARE`,[identity.id,identity.storeId]);
    if(!auth.rowCount) throw new ApiError(403,'Integracao sem autoridade de catalogo ou revogada.');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,['catalog-import:'+identity.storeId,identity.id]);
    // Gatilhos do outbox marcam a origem somente nesta transacao.
    await client.query(`SELECT set_config('f40.integration_id',$1,true)`,[identity.id]);
    const results = [];
    for(const input of products) results.push(await applyProduct(client,identity,input));
    await client.query('COMMIT');
    return {results,applied:results.filter(r=>!r.idempotent).length,replayed:results.filter(r=>r.idempotent).length};
  } catch (e) {
    await client.query('ROLLBACK');
    return asCatalogConflict(e);
  } finally { client.release(); }
}
