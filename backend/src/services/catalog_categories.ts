import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';

type CategoryInput = { name: string; icon: string; imageUrl: string };

export async function withCategoryTransaction<T>(storeId: string,
  action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`catalog-categories:${storeId}`]);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assertActiveCategory(client: PoolClient, storeId: string, categoryId: string) {
  const found = await client.query(`SELECT 1 FROM categories
    WHERE id=$1 AND store_id=$2 AND status='ACTIVE' FOR SHARE`, [categoryId, storeId]);
  if (!found.rowCount) throw new ApiError(400, 'Categoria inválida para esta loja.');
}

export async function saveCategory(storeId: string, actorId: string, body: CategoryInput, categoryId?: string) {
  const { name, icon, imageUrl } = body;
  return withCategoryTransaction(storeId, async (client) => {
    const id = categoryId ?? randomUUID();
    let currentName: string | undefined;
    if (categoryId) {
      const current = await client.query<{ name: string }>(`SELECT name FROM categories
        WHERE id=$1 AND store_id=$2 AND status='ACTIVE'`, [id, storeId]);
      if (!current.rowCount) throw new ApiError(404, 'Categoria não encontrada.');
      currentName = current.rows[0].name;
    }
    if (currentName?.trim().toLowerCase() !== name.toLowerCase()) {
      const duplicate = await client.query(`SELECT 1 FROM categories
        WHERE store_id=$1 AND status='ACTIVE' AND id<>$2 AND lower(btrim(name))=lower($3)`, [storeId, id, name]);
      if (duplicate.rowCount) throw new ApiError(409, 'Já existe uma categoria com esse nome.');
    }
    if (categoryId) {
      await client.query(`UPDATE categories SET name=$3, icon=$4, image_url=$5, updated_at=now()
        WHERE id=$1 AND store_id=$2`, [id, storeId, name, icon, imageUrl]);
    } else {
      await client.query(`INSERT INTO categories (id,store_id,name,slug,icon,image_url)
        VALUES ($1,$2,$3,$4,$5,$6)`, [id, storeId, name, id, icon, imageUrl]);
    }
    await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
      VALUES ($1,$2,$3,'category',$4)`, [storeId, actorId, categoryId ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED', id]);
    return { id, ...body };
  });
}

export async function removeCategory(client: PoolClient, storeId: string, categoryId: string, actorId: string | null) {
  const found = await client.query(`SELECT 1 FROM categories
    WHERE id=$1 AND store_id=$2 AND status='ACTIVE' FOR UPDATE`, [categoryId, storeId]);
  if (!found.rowCount) throw new ApiError(404, 'Categoria não encontrada.');

  const products = await client.query(`SELECT 1 FROM products
    WHERE store_id=$1 AND category_id=$2 AND status<>'ARCHIVED' LIMIT 1`, [storeId, categoryId]);
  if (products.rowCount) {
    throw new ApiError(409, 'Mova os produtos vinculados para outra categoria antes de remover esta.');
  }
  await client.query(`UPDATE categories SET status='HIDDEN', updated_at=now()
    WHERE id=$1 AND store_id=$2`, [categoryId, storeId]);
  await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
    VALUES ($1,$2,'CATEGORY_REMOVED','category',$3)`, [storeId, actorId, categoryId]);
}
