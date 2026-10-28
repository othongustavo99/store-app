import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { validated } from '../security/validation.js';
import { createProductInput, productMetadataInput, variantInput, editVariantInput, signCloudinaryUpload } from '../services/catalog_management.js';

const base = z.object({storeId: z.string().uuid()});
const productParams = base.extend({productId:z.string().uuid()});
const variantParams = base.extend({variantId:z.string().uuid()});

function duplicateError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throw new ApiError(409, 'SKU ou identificador já cadastrado nesta loja.');
  }
  throw error;
}
async function categoryExists(client: PoolClient, storeId:string, categoryId:string) {
  const r = await client.query("SELECT 1 FROM categories WHERE id=$1 AND store_id=$2 AND status='ACTIVE'", [categoryId,storeId]);
  if (!r.rowCount) throw new ApiError(400, 'Categoria inválida para esta loja.');
}
async function audit(client: PoolClient, storeId:string, actor:string, event:string, entityType:string, id:string) {
  await client.query('INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id) VALUES($1,$2,$3,$4,$5)', [storeId,actor,event,entityType,id]);
}
async function writeTransaction<T>(action:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await action(client);
    await client.query('COMMIT');
    return result;
  } catch(e) { await client.query('ROLLBACK'); duplicateError(e); }
  finally { client.release(); }
}

export async function catalogManagementRoutes(app: FastifyInstance) {
  app.get('/v1/stores/:storeId/catalog/manage/products', async (req) => {
    const {storeId}=validated(base,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    const result=await pool.query(`
      SELECT p.id,p.name,p.description,p.category_id AS "categoryId",p.status,
             p.images,p.videos,p.old_price_cents::text AS "oldPriceCents",
             p.is_featured AS "isFeatured",p.is_new AS "isNew",p.created_at AS "createdAt",
             COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'id',v.id,'sku',v.sku,'color',v.attributes->>'color','size',v.attributes->>'size',
               'imageUrl',v.attributes->>'imageUrl','status',v.status,
               'onHand',v.on_hand,'reserved',v.reserved,'available',v.on_hand-v.reserved,
               'priceCents',v.price_cents::text) ORDER BY v.created_at)
               FROM product_variants v WHERE v.product_id=p.id),'[]'::jsonb) AS variants
      FROM products p WHERE p.store_id=$1 AND p.status <> 'ARCHIVED'
      ORDER BY p.created_at DESC LIMIT 500`,[storeId]);
    return {products:result.rows.map(p=>({
      ...p, priceCents: p.variants?.find((v:{status:string})=>v.status==='ACTIVE')?.priceCents ?? p.variants?.[0]?.priceCents ?? '0',
    }))};
  });

  app.post('/v1/stores/:storeId/catalog/manage/products', async (req,reply) => {
    const {storeId}=validated(base,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const body=validated(createProductInput,req.body);
    const id=await writeTransaction(async client=>{
      await categoryExists(client,storeId,body.categoryId);
      const productId=randomUUID();
      await client.query(`INSERT INTO products(id,store_id,category_id,name,slug,description,status,
        images,videos,old_price_cents,is_featured,is_new) VALUES($1,$2,$3,$4,$1,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
        [productId,storeId,body.categoryId,body.name,body.description,body.status,
          JSON.stringify(body.images),JSON.stringify(body.videos),body.oldPriceCents ?? null,body.isFeatured,body.isNew]);
      for (const v of body.variants) {
        const variantId=randomUUID();
        await client.query(`INSERT INTO product_variants(id,store_id,product_id,sku,attributes,price_cents,on_hand)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
          [variantId,storeId,productId,v.sku.toUpperCase(),JSON.stringify({color:v.color,size:v.size,imageUrl:v.imageUrl ?? null}),body.priceCents,v.initialStock]);
        if(v.initialStock>0) await client.query(`INSERT INTO inventory_movements(store_id,variant_id,performed_by,kind,quantity_delta,notes)
          VALUES($1,$2,$3,'RECEIPT',$4,'Estoque inicial do cadastro')`,[storeId,variantId,identity.userId,v.initialStock]);
      }
      await audit(client,storeId,identity.userId,'PRODUCT_CREATED','product',productId);
      return productId;
    });
    return reply.code(201).send({id});
  });

  app.patch('/v1/stores/:storeId/catalog/manage/products/:productId', async req=>{
    const {storeId,productId}=validated(productParams,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const body=validated(productMetadataInput,req.body);
    await writeTransaction(async client=>{
      await categoryExists(client,storeId,body.categoryId);
      const existing=await client.query('SELECT id FROM products WHERE id=$1 AND store_id=$2 AND status<>\'ARCHIVED\' FOR UPDATE',[productId,storeId]);
      if (!existing.rowCount) throw new ApiError(404,'Produto não encontrado.');
      const hasActive=await client.query("SELECT 1 FROM product_variants WHERE product_id=$1 AND store_id=$2 AND status='ACTIVE'",[productId,storeId]);
      if(body.status==='PUBLISHED' && !hasActive.rowCount) throw new ApiError(409,'Cadastre pelo menos uma variante ativa para publicar.');
      await client.query(`UPDATE products SET name=$3,description=$4,category_id=$5,
        images=$6::jsonb,videos=$7::jsonb,old_price_cents=$8,is_featured=$9,is_new=$10,
        status=$11,updated_at=now() WHERE id=$1 AND store_id=$2`,
        [productId,storeId,body.name,body.description,body.categoryId,JSON.stringify(body.images),
          JSON.stringify(body.videos),body.oldPriceCents,body.isFeatured,body.isNew,body.status]);
      // Importante: NÃO tocar em on_hand/reserved. Inventário controla movimentos.
      await client.query("UPDATE product_variants SET price_cents=$3,updated_at=now() WHERE product_id=$1 AND store_id=$2 AND status='ACTIVE'",[productId,storeId,body.priceCents]);
      await audit(client,storeId,identity.userId,'PRODUCT_METADATA_UPDATED','product',productId);
    });
    return {id:productId};
  });

  app.post('/v1/stores/:storeId/catalog/manage/products/:productId/variants',async(req,reply)=>{
    const {storeId,productId}=validated(productParams,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const body=validated(variantInput,req.body);
    const id=await writeTransaction(async client=>{
      const p=await client.query<{price_cents:string}>(`SELECT v.price_cents::text AS price_cents
        FROM products p JOIN product_variants v ON v.product_id=p.id
        WHERE p.id=$1 AND p.store_id=$2 AND p.status<>'ARCHIVED' AND v.status='ACTIVE' ORDER BY v.created_at LIMIT 1`,[productId,storeId]);
      if(!p.rowCount) throw new ApiError(409,'Produto sem variante ativa: edite um rascunho antes de adicionar variantes.');
      const existing=await client.query(`SELECT 1 FROM product_variants WHERE store_id=$1 AND product_id=$2
        AND status='ACTIVE' AND lower(attributes->>'color')=lower($3) AND lower(attributes->>'size')=lower($4)`,
        [storeId,productId,body.color,body.size]);
      if(existing.rowCount) throw new ApiError(409,'Combinação cor/tamanho já existe.');
      const variantId=randomUUID();
      await client.query(`INSERT INTO product_variants(id,store_id,product_id,sku,attributes,price_cents,on_hand)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`,[variantId,storeId,productId,body.sku.toUpperCase(),JSON.stringify({color:body.color,size:body.size,imageUrl:body.imageUrl ?? null}),p.rows[0].price_cents,body.initialStock]);
      if(body.initialStock>0) await client.query(`INSERT INTO inventory_movements(store_id,variant_id,performed_by,kind,quantity_delta,notes)
        VALUES($1,$2,$3,'RECEIPT',$4,'Estoque inicial de nova variante')`,[storeId,variantId,identity.userId,body.initialStock]);
      await audit(client,storeId,identity.userId,'VARIANT_CREATED','product_variant',variantId);
      return variantId;
    });
    return reply.code(201).send({id});
  });

  app.patch('/v1/stores/:storeId/catalog/manage/variants/:variantId',async req=>{
    const {storeId,variantId}=validated(variantParams,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const body=validated(editVariantInput,req.body);
    await writeTransaction(async client=>{
      const r=await client.query<{reserved:number;product_id:string}>(`SELECT v.reserved,v.product_id FROM product_variants v
        JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        WHERE v.id=$1 AND v.store_id=$2 AND p.status<>'ARCHIVED' FOR UPDATE OF v`,[variantId,storeId]);
      if (!r.rowCount) throw new ApiError(404,'Variante não encontrada.');
      if(body.status==='INACTIVE' && r.rows[0].reserved>0) throw new ApiError(409,'Variante tem unidades reservadas; aguarde os pedidos.');
      const dup=await client.query(`SELECT 1 FROM product_variants WHERE product_id=$1 AND store_id=$2 AND id<>$3
        AND status='ACTIVE' AND lower(attributes->>'color')=lower($4) AND lower(attributes->>'size')=lower($5)`,
        [r.rows[0].product_id,storeId,variantId,body.color,body.size]);
      if(body.status==='ACTIVE' && dup.rowCount) throw new ApiError(409,'Combinação cor/tamanho já cadastrada.');
      await client.query(`UPDATE product_variants SET sku=$3, attributes=$4::jsonb,status=$5,updated_at=now()
        WHERE id=$1 AND store_id=$2`,[variantId,storeId,body.sku.toUpperCase(),JSON.stringify({color:body.color,size:body.size,imageUrl:body.imageUrl}),body.status]);
      await audit(client,storeId,identity.userId,'VARIANT_METADATA_UPDATED','product_variant',variantId);
    });
    return {id:variantId};
  });

  // Assinatura efêmera. Nunca envia API_SECRET ao cliente.
  app.post('/v1/stores/:storeId/catalog/manage/media/sign', {config:{rateLimit:{max:15,timeWindow:'1 minute'}}},async req=>{
    const {storeId}=validated(base,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    if(!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
      throw new ApiError(503,'Upload não configurado. Preencha as variáveis Cloudinary no Railway.');
    }
    const timestamp=Math.floor(Date.now()/1000);
    const folder=`lojas/${storeId}/produtos`;
    return {cloudName:config.CLOUDINARY_CLOUD_NAME,apiKey:config.CLOUDINARY_API_KEY,
      timestamp,folder,signature:signCloudinaryUpload(config.CLOUDINARY_API_SECRET,folder,timestamp)};
  });
}
