import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pool } from '../db/pool.js';
import { catalogRoutes } from '../routes/catalog.js';
import { createAccessToken } from '../security/tokens.js';

const store = '10000000-0000-4000-8000-000000000001';
const category = '20000000-0000-4000-8000-000000000001';
const user = '30000000-0000-4000-8000-000000000001';
const root = `/v1/stores/${store}/catalog/categories`;

async function fixture(t: TestContext, options: {
  role?: string; duplicate?: boolean; linked?: boolean; missing?: boolean;
} = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    const rows = (() => {
      if (sql.includes('FROM refresh_sessions')) return [{}];
      if (sql.includes('FROM store_memberships')) return [{ role: options.role ?? 'MANAGER', status: 'ACTIVE' }];
      if (sql.includes('FROM products')) return options.linked ? [{}] : [];
      if (sql.includes('lower(btrim(name))')) return options.duplicate ? [{}] : [];
      if (sql.includes('FROM categories')) return options.missing ? [] : [{ name: 'camisetas' }];
      return [];
    })();
    return { rows, rowCount: rows.length };
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  const app = Fastify();
  t.after(() => app.close());
  await app.register(catalogRoutes);
  const headers = { authorization: `Bearer ${await createAccessToken(user, store)}` };
  return {
    queries,
    request: (method: 'POST' | 'PUT' | 'DELETE', payload?: { name: string }) =>
      app.inject({ method, url: method === 'POST' ? root : `${root}/${category}`, headers, payload }),
  };
}

test('criação e edição persistem a inicial maiúscula sem alterar o restante do nome', async (t) => {
  const { request, queries } = await fixture(t);
  const created = await request('POST', { name: '  óculos UV ' });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().category.name, 'Óculos UV');
  const updated = await request('PUT', { name: 'camisetas' });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.json().category, { id: category, name: 'Camisetas', icon: '🏷️', imageUrl: '' });
  const update = queries.find((q) => q.sql.includes('UPDATE categories'));
  assert.deepEqual(update?.params, [category, store, 'Camisetas', '🏷️', '']);
  assert.equal(queries.filter((q) => q.sql === 'COMMIT').length, 2);
});

test('nome duplicado é rejeitado antes de gravar', async (t) => {
  const { request, queries } = await fixture(t, { duplicate: true });
  assert.equal((await request('PUT', { name: '  vestidos ' })).statusCode, 409);
  assert.equal(queries.find((q) => q.sql.includes('lower(btrim(name))'))?.params[2], 'Vestidos');
  assert.equal(queries.some((q) => q.sql.includes('UPDATE categories')), false);
  assert.ok(queries.some((q) => q.sql === 'ROLLBACK'));
});

test('remoção oculta a categoria da loja e registra auditoria na mesma transação', async (t) => {
  const { request, queries } = await fixture(t);
  assert.equal((await request('DELETE')).statusCode, 204);
  assert.deepEqual(queries.find((q) => q.sql.includes('FOR UPDATE'))?.params, [category, store]);
  assert.deepEqual(queries.find((q) => q.sql.includes("SET status='HIDDEN'"))?.params, [category, store]);
  assert.deepEqual(queries.find((q) => q.sql.includes('CATEGORY_REMOVED'))?.params, [store, user, category]);
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('produto vinculado impede remoção', async (t) => {
  const { request, queries } = await fixture(t, { linked: true });
  assert.equal((await request('DELETE')).statusCode, 409);
  assert.equal(queries.some((q) => q.sql.includes('UPDATE categories')), false);
  assert.equal(queries.at(-1)?.sql, 'ROLLBACK');
});

test('categoria de outra loja ou removida não pode ser editada nem removida', async (t) => {
  const { request, queries } = await fixture(t, { missing: true });
  assert.equal((await request('PUT', { name: 'Vestidos' })).statusCode, 404);
  assert.equal((await request('DELETE')).statusCode, 404);
  assert.equal(queries.some((q) => q.sql.includes('UPDATE categories')), false);
});

test('STAFF não abre transação de escrita em categorias', async (t) => {
  const { request, queries } = await fixture(t, { role: 'STAFF' });
  assert.equal((await request('POST', { name: 'Calças' })).statusCode, 403);
  assert.equal((await request('PUT', { name: 'Calças' })).statusCode, 403);
  assert.equal((await request('DELETE')).statusCode, 403);
  assert.equal(queries.some((q) => q.sql === 'BEGIN'), false);
});
