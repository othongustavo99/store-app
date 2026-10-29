import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pool } from '../db/pool.js';
import { catalogRoutes } from '../routes/catalog.js';

const storeId = '10000000-0000-4000-8000-000000000001';
const productId = '20000000-0000-4000-8000-000000000080';

test('resolução pública usa IDs salvos e a loja do slug, sem limite da Home', async t => {
  const queries: unknown[][] = [];
  t.mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    queries.push(values);
    if (sql.includes('SELECT id FROM stores')) return { rowCount: 1, rows: [{ id: storeId }] };
    assert.match(sql, /p\.store_id=\$1/);
    assert.match(sql, /p\.status='PUBLISHED'/);
    assert.match(sql, /p\.id=ANY\(\$4::uuid\[\]\)/);
    assert.deepEqual(values, [storeId, false, null, [productId]]);
    return { rowCount: 1, rows: [{ id: productId, name: 'Produto 80', description: '', size_guide: '',
      category_id: null, status: 'PUBLISHED', created_at: new Date('2026-01-01'),
      images: [], videos: [], old_price_cents: null, is_featured: false, is_new: false,
      variants: [{ id: 'variant', color: 'Preto', size: 'M', stock: 3, imageUrl: null, priceCents: '7990' }] }] };
  });
  const app = Fastify();
  t.after(() => app.close());
  await app.register(catalogRoutes);
  const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/catalog/products/resolve', payload: { ids: [productId, productId] } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().products[0].id, productId);
  assert.equal(queries.length, 2);
});

test('resolução rejeita IDs inválidos, lote acima do limite e campos extras', async t => {
  let queried = false;
  t.mock.method(pool, 'query', async () => { queried = true; throw new Error('Consulta indevida'); });
  const app = Fastify();
  t.after(() => app.close());
  await app.register(catalogRoutes);
  for (const payload of [{ ids: ['invalid'] }, { ids: [] }, { ids: Array(101).fill(productId) }, { ids: [productId], storeId }]) {
    const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/catalog/products/resolve', payload });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(queried, false);
});

test('produto ausente não é exposto e loja inexistente retorna 404', async t => {
  let active = true;
  t.mock.method(pool, 'query', async (sql: string) => sql.includes('SELECT id FROM stores')
    ? { rowCount: active ? 1 : 0, rows: active ? [{ id: storeId }] : [] }
    : { rowCount: 0, rows: [] });
  const app = Fastify();
  t.after(() => app.close());
  await app.register(catalogRoutes);
  const request = { method: 'POST' as const, url: '/v1/shops/loja-a/catalog/products/resolve', payload: { ids: [productId] } };
  assert.deepEqual((await app.inject(request)).json(), { products: [] });
  active = false;
  assert.equal((await app.inject(request)).statusCode, 404);
});
