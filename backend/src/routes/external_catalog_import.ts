import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { uuidParam, validated } from '../security/validation.js';
import { requireIntegration } from '../integrations/core.js';
import { applyCatalogBatch, catalogBatch, productImport } from '../services/external_catalog_sync.js';

const mapParams = z.object({productId:uuidParam}).strict();
const mapBody = z.object({externalId:z.string().trim().min(1).max(180)}).strict();

export async function catalogImportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/external/catalog/categories', async req=>{
    const identity = await requireIntegration(req,'catalog.read');
    const r = await pool.query(`SELECT id,name,slug,status FROM categories
      WHERE store_id=$1 ORDER BY name,id`,[identity.storeId]);
    return {categories:r.rows};
  });

  app.put('/v1/external/mappings/products/:productId', async req=>{
    const identity = await requireIntegration(req,'mapping.write');
    const { productId }=validated(mapParams,req.params);
    const { externalId }=validated(mapBody,req.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const active=await client.query(`SELECT 1 FROM external_integrations
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL FOR SHARE`,[identity.id,identity.storeId]);
      if(!active.rowCount) throw new ApiError(401,'Integracao revogada.');
      const product = await client.query(`SELECT 1 FROM products
        WHERE id=$1 AND store_id=$2 AND status<>'ARCHIVED' FOR UPDATE`,[productId,identity.storeId]);
      if(!product.rowCount) throw new ApiError(404,'Produto nao encontrado nesta loja.');
      const old=await client.query<{external_id:string}>(`SELECT external_id FROM external_product_mappings
        WHERE integration_id=$1 AND product_id=$2`,[identity.id,productId]);
      if(old.rowCount && old.rows[0].external_id!==externalId)
        throw new ApiError(409,'Produto ja mapeado para outro ID externo. Alteracao exige reconciliacao manual.');
      await client.query(`INSERT INTO external_product_mappings(integration_id,store_id,product_id,external_id)
        VALUES($1,$2,$3,$4) ON CONFLICT(integration_id,product_id) DO NOTHING`,[identity.id,identity.storeId,productId,externalId]);
      await client.query('COMMIT');
      return {mapped:true,productId,externalId};
    } catch(error) {
      await client.query('ROLLBACK');
      if((error as {code?:string})?.code==='23505') throw new ApiError(409,'ID externo ja vinculado a outro produto.');
      throw error;
    } finally {client.release();}
  });

  app.post('/v1/external/catalog/products/upsert', async req=>{
    const identity=await requireIntegration(req,'catalog.write');
    const product=validated(productImport,req.body);
    const result=await applyCatalogBatch(identity,[product]);
    return { ...result.results[0] };
  });

  app.post('/v1/external/catalog/batch', async req=>{
    const identity=await requireIntegration(req,'catalog.write');
    const {products}=validated(catalogBatch,req.body);
    return applyCatalogBatch(identity,products);
  });
}
