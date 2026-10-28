import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pool } from '../db/pool.js';

/** Executar LOCALMENTE em uma loja nova, nunca no comando de deploy. */
async function main() {
  const slug = process.env.MIGRATE_STORE_SLUG;
  if (!slug || !/^[a-z0-9-]{3,48}$/.test(slug)) throw Error('Defina MIGRATE_STORE_SLUG.');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw Error('Defina GOOGLE_APPLICATION_CREDENTIALS local.');
  const dry = process.env.MIGRATE_DRY_RUN !== 'false';
  if (!dry && process.env.ALLOW_CATALOG_IMPORT !== 'YES') throw Error('Importação exige ALLOW_CATALOG_IMPORT=YES.');
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const [catSnap, prodSnap] = await Promise.all([
    db.collection('categories').get(), db.collection('products').get(),
  ]);
  const store = await pool.query<{ id: string }>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'", [slug]);
  if (!store.rowCount) throw Error('Loja de destino inexistente.');
  const storeId = store.rows[0].id;
  const occupied = await pool.query('SELECT 1 FROM categories WHERE store_id=$1 LIMIT 1', [storeId]);
  const productsOccupied = await pool.query('SELECT 1 FROM products WHERE store_id=$1 LIMIT 1', [storeId]);
  if (occupied.rowCount || productsOccupied.rowCount) throw Error('Destino deve ter categorias e produtos vazios.');
  const categoryDocs = catSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const productDocs = prodSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const knownCategories = new Set(categoryDocs.map((c) => c.id));
  for (const product of productDocs) {
    if (!knownCategories.has(product.data.categoryId)) throw Error(`Categoria inexistente no produto ${product.id}.`);
    if (!Array.isArray(product.data.variants) || product.data.variants.length === 0) throw Error(`Variantes inválidas no produto ${product.id}.`);
  }
  console.log(`Loja ${slug}: ${categoryDocs.length} categorias / ${productDocs.length} produtos.`);
  if (dry) { console.log('Prévia concluída: sem gravações no PostgreSQL.'); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [storeId]);
    const categoryIds = new Map<string,string>();
    for (const category of categoryDocs) {
      const id = randomUUID();
      categoryIds.set(category.id, id);
      await client.query(`INSERT INTO categories(id,store_id,name,slug,icon,image_url,legacy_firebase_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id,storeId,category.data.name,id,
          category.data.icon ?? '🏷️',category.data.imageUrl ?? '',category.id]);
    }
    for (const product of productDocs) {
      const data = product.data;
      const id = randomUUID();
      const price = Number(data.price);
      if (!Number.isFinite(price) || price < 0) throw Error(`Preço inválido: ${product.id}`);
      const old = data.oldPrice == null ? null : Number(data.oldPrice);
      if (old !== null && (!Number.isFinite(old) || old < 0)) throw Error(`Preço antigo inválido: ${product.id}`);
      const urls = (raw: unknown) => Array.isArray(raw) ? raw.filter(
        (s): s is string => typeof s === 'string' && s.startsWith('https://')) : [];
      const created = data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? Date.now());
      if (!Number.isFinite(created.getTime())) throw Error(`Data inválida: ${product.id}`);
      await client.query(`INSERT INTO products (id,store_id,category_id,name,slug,description,status,
        images,videos,old_price_cents,is_featured,is_new,legacy_firebase_id,created_at)
        VALUES ($1,$2,$3,$4,$1,$5,'PUBLISHED',$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12)`,
        [id,storeId,categoryIds.get(data.categoryId),data.name,String(data.description ?? ''),
          JSON.stringify(urls(data.images)),JSON.stringify(urls(data.videos)),old === null ? null : Math.round(old*100),
          Boolean(data.isFeatured),Boolean(data.isNew),product.id,created]);
      for (const v of data.variants as Array<Record<string,unknown>>) {
        const stock = Number(v.stock);
        if (!Number.isInteger(stock) || stock < 0) throw Error(`Estoque inválido: ${product.id}`);
        const variantId = randomUUID();
        await client.query(`INSERT INTO product_variants(id,store_id,product_id,sku,attributes,price_cents,on_hand)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, [variantId,storeId,id,variantId,
            JSON.stringify({color:v.color,size:v.size,imageUrl:v.imageUrl ?? null}),Math.round(price*100),stock]);
        if (stock) await client.query(`INSERT INTO inventory_movements(store_id,variant_id,kind,quantity_delta,notes)
          VALUES ($1,$2,'RECEIPT',$3,'Importação do Firebase')`, [storeId,variantId,stock]);
      }
    }
    await client.query('COMMIT');
    console.log('Importação concluída. Verifique o catálogo no endpoint HTTP.');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

main().catch((e) => { console.error('Importação cancelada:', e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });
