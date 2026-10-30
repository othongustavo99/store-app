import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pool } from '../db/pool.js';
import { catalogRoutes } from '../routes/catalog.js';
import { catalogFacets } from '../services/catalog_discovery.js';

const storeId = '10000000-0000-4000-8000-000000000001';
const first = '20000000-0000-4000-8000-000000000002';
const second = '20000000-0000-4000-8000-000000000001';
const row = (id: string, price = '7990') => ({ id, name: 'Camisa', description: '', category_id: null,
  size_guide: '', status: 'PUBLISHED', created_at: new Date('2026-01-01T00:00:00Z'), sort_price_cents: price,
  images: [], videos: [], old_price_cents: null, is_featured: false, is_new: false,
  variants: [{ id: 'v1', color: 'Marinho', size: '38', stock: 3, imageUrl: null, priceCents: price }] });

test('opções vêm do catálogo e não inventam cores ou tamanhos; duplicatas são normalizadas', () => {
  assert.deepEqual(catalogFacets([
    { color: ' Marinho ', size: '40' }, { color: 'marinho', size: '38' },
    { color: 'Lavanda', size: 'M' }, { color: '', size: null }, { color: null, size: 'P' },
  ]), { colors: ['Lavanda', 'Marinho'], sizes: ['P', 'M', '38', '40'] });
});

test('rota de filtros usa apenas variantes ativas e publicadas da loja', async t => {
  t.mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    if (sql.includes('SELECT id FROM stores')) return { rowCount: 1, rows: [{ id: storeId }] };
    assert.deepEqual(values, [storeId]);
    assert.match(sql, /p\.status='PUBLISHED'/);
    assert.match(sql, /v\.status='ACTIVE'/);
    assert.match(sql, /p\.store_id=\$1/);
    return { rowCount: 1, rows: [{ color: 'Lavanda', size: '42' }] };
  });
  const app = Fastify(); t.after(() => app.close()); await app.register(catalogRoutes);
  assert.deepEqual((await app.inject('/v1/shops/loja-a/catalog/filters')).json(), { colors: ['Lavanda'], sizes: ['42'] });
});

test('menor preço usa ordenação no servidor e cursor com desempate estável', async t => {
  const queries: { sql: string; values: unknown[] }[] = [];
  t.mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    if (sql.includes('SELECT id FROM stores')) return { rowCount: 1, rows: [{ id: storeId }] };
    queries.push({ sql, values });
    return { rowCount: 2, rows: [row(first), row(second)] };
  });
  const app = Fastify(); t.after(() => app.close()); await app.register(catalogRoutes);
  const page = await app.inject('/v1/shops/loja-a/catalog/search?sort=price_asc&limit=1');
  assert.equal(page.statusCode, 200);
  const cursor = page.json().nextCursor;
  assert.deepEqual(JSON.parse(Buffer.from(cursor, 'base64url').toString()), {
    t: '2026-01-01T00:00:00.000Z', id: first, sort: 'price_asc', price: '7990',
  });
  await app.inject(`/v1/shops/loja-a/catalog/search?sort=price_asc&limit=1&cursor=${cursor}`);
  assert.match(queries[0].sql, /COALESCE\(pricing\.price_cents,0\) ASC,\s*p\.created_at DESC,p\.id DESC/);
  assert.match(queries[1].sql, /pricing\.price_cents,0\)>\$\d+::bigint/);
  assert.ok(queries[1].values.includes('7990'));
});

test('maior preço usa comparação descendente com o mesmo critério de desempate', async t => {
  let query = '';
  t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('SELECT id FROM stores')) return { rowCount: 1, rows: [{ id: storeId }] };
    query = sql; return { rowCount: 0, rows: [] };
  });
  const app = Fastify(); t.after(() => app.close()); await app.register(catalogRoutes);
  const cursor = Buffer.from(JSON.stringify({ t: '2026-01-01T00:00:00Z', id: first, sort: 'price_desc', price: '7990' })).toString('base64url');
  assert.equal((await app.inject(`/v1/shops/loja-a/catalog/search?sort=price_desc&cursor=${cursor}`)).statusCode, 200);
  assert.match(query, /pricing\.price_cents,0\)<\$\d+::bigint/);
  assert.match(query, /pricing\.price_cents,0\) DESC,/);
});

test('cursor antigo continua válido para ordenação padrão por novidades', async t => {
  let query = '';
  t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('SELECT id FROM stores')) return { rowCount: 1, rows: [{ id: storeId }] };
    query = sql; return { rowCount: 0, rows: [] };
  });
  const app = Fastify(); t.after(() => app.close()); await app.register(catalogRoutes);
  const cursor = Buffer.from(JSON.stringify({ t: '2026-01-01T00:00:00Z', id: first })).toString('base64url');
  assert.equal((await app.inject(`/v1/shops/loja-a/catalog/search?cursor=${cursor}`)).statusCode, 200);
  assert.match(query, /\(p\.created_at,p\.id\)</);
});

test('cursor de outra ordenação e sort inválido são rejeitados antes da consulta', async t => {
  let queried = false;
  t.mock.method(pool, 'query', async () => { queried = true; throw new Error('Consulta inesperada'); });
  const app = Fastify(); t.after(() => app.close()); await app.register(catalogRoutes);
  const cursor = Buffer.from(JSON.stringify({ t: '2026-01-01T00:00:00Z', id: first, sort: 'newest' })).toString('base64url');
  for (const query of [`sort=price_asc&cursor=${cursor}`, 'sort=invalid', 'minPrice=90&maxPrice=10']) {
    assert.equal((await app.inject(`/v1/shops/loja-a/catalog/search?${query}`)).statusCode, 400);
  }
  assert.equal(queried, false);
});

test('cor, tamanho e estoque filtram a mesma variante e não combinações distintas', async t => {
  t.mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    if (sql.includes('SELECT id FROM stores')) return { rowCount: 1, rows: [{ id: storeId }] };
    assert.match(sql, /EXISTS \(SELECT 1 FROM product_variants v WHERE .*v\.on_hand>v\.reserved/s);
    assert.ok(values.includes('Lavanda') && values.includes('42'));
    return { rowCount: 0, rows: [] };
  });
  const app = Fastify(); t.after(() => app.close()); await app.register(catalogRoutes);
  assert.equal((await app.inject('/v1/shops/loja-a/catalog/search?color=Lavanda&size=42&available=true')).statusCode, 200);
});
