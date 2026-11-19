import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { createAccessToken } from '../security/tokens.js';
import { createIntegrationKey, decodeOrderCursor, encodeOrderCursor } from '../integrations/core.js';
import { externalIntegrationRoutes } from '../routes/external_integrations.js';

const storeId = '11111111-1111-4111-8111-111111111111';
const otherStore = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const integrationId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';
const secret = createIntegrationKey();
const response = (rows: unknown[]) => ({ rowCount: rows.length, rows });

async function apiFixture(t: TestContext, query: (sql: string, params?: unknown[]) => Promise<unknown>) {
  const previous = config.ENABLE_EXTERNAL_INTEGRATIONS;
  config.ENABLE_EXTERNAL_INTEGRATIONS = true;
  t.after(() => { config.ENABLE_EXTERNAL_INTEGRATIONS = previous; });
  t.mock.method(pool, 'query', query);
  const app = Fastify();
  t.after(() => app.close());
  await app.register(externalIntegrationRoutes);
  return app;
}

const identity = {
  id: integrationId, store_id: storeId, provider: 'erp-teste', stock_authority: true,
  scopes: ['catalog.read', 'orders.read', 'events.read', 'mapping.write', 'stock.write'],
};
const integrationAuth = { authorization: `Bearer ${secret.key}` };

test('tokens de integracao usam segredo aleatorio e hash, nunca chave salva em texto puro', () => {
  const a = createIntegrationKey();
  const b = createIntegrationKey();
  assert.match(a.key, /^f40i_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.key, b.key);
  assert.notEqual(a.hash, a.key);
  assert.equal(a.hash.length, 64);
  assert.equal(a.prefix, a.key.slice(0, 18));
});

test('cursor de pedidos conserva microssegundos e rejeita payload adulterado', () => {
  const iso = '2026-11-19T09:02:03.123456Z';
  const cursor = encodeOrderCursor(iso, variantId);
  assert.deepEqual(decodeOrderCursor(cursor), { date: iso, id: variantId });
  assert.throws(() => decodeOrderCursor('foo'));
});

test('credenciais de usuarios comuns nao podem acessar API externa', async t => {
  const queries: string[] = [];
  const app = await apiFixture(t, async (sql) => { queries.push(sql); return response([]); });
  const jwt = await createAccessToken(userId, randomUUID());
  const r = await app.inject({ method: 'GET', url: '/v1/external/catalog/variants',
    headers: { authorization: `Bearer ${jwt}` } });
  assert.equal(r.statusCode, 401);
  assert.equal(queries.length, 0);
});

test('catalogo e eventos consultam apenas a loja vinculada ao token', async t => {
  const params: unknown[][] = [];
  const app = await apiFixture(t, async (sql, values) => {
    params.push(values ?? []);
    if (sql.includes('FROM external_integrations i JOIN stores')) return response([identity]);
    if (sql.includes('FROM product_variants v')) return response([{
      variantId, productId: variantId, sku: 'CAMISETA-1', onHand: 8, reserved: 2,
    }]);
    if (sql.includes('FROM external_change_events e')) return response([{
      id: '7', type: 'catalog.variant.changed', resourceId: variantId,
    }]);
    return response([]);
  });
  const catalog = await app.inject({ method: 'GET', url: '/v1/external/catalog/variants', headers: integrationAuth });
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json().variants.length, 1);
  assert.equal(catalog.json().nextAfter, variantId);
  const events = await app.inject({ method: 'GET', url: '/v1/external/events', headers: integrationAuth });
  assert.equal(events.statusCode, 200);
  assert.equal(events.json().requiresAck, true);
  const scopedQueries = params.filter((p) => p[0] === storeId);
  assert.equal(scopedQueries.length, 2);
  assert.equal(params.flat().includes(otherStore), false);
});

test('estoque externo e idempotente, monotônico e respeita unidades reservadas', async t => {
  let onHand = 10;
  const reserved = 2;
  let sourceVersion = 0;
  const operations = new Map<string,string>();
  const executed: string[] = [];
  const query = async (sql: string, args: unknown[] = []) => {
    executed.push(sql);
    if (sql.includes('FROM external_integrations i JOIN stores')) return response([identity]);
    if (sql.includes('FROM external_integrations') && sql.includes('FOR SHARE')) return response([{}]);
    if (sql.includes('FROM external_stock_operations')) {
      const hash = operations.get(String(args[1]));
      return response(hash ? [{ payload_hash: hash }] : []);
    }
    if (sql.includes('FROM product_variants v') && sql.includes('FOR UPDATE OF v')) return response([{ on_hand: onHand, reserved }]);
    if (sql.includes('FROM external_stock_positions')) return response(sourceVersion ? [{source_version: String(sourceVersion)}] : []);
    if (sql.startsWith('UPDATE product_variants')) { onHand = Number(args[2]); return response([]); }
    if (sql.includes('INSERT INTO external_stock_positions')) { sourceVersion = Number(args[3]); return response([]); }
    if (sql.includes('INSERT INTO external_stock_operations')) { operations.set(String(args[2]), String(args[4])); return response([]); }
    return response([]);
  };
  const app = await apiFixture(t, query);
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  const endpoint = `/v1/external/inventory/${variantId}`;
  const id = randomUUID();
  const put = (payload: object) => app.inject({ method: 'PUT', url: endpoint, headers: integrationAuth, payload });
  const first = await put({ eventId: id, sourceVersion: 10, onHand: 8 });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().delta, -2);
  assert.equal(onHand, 8);
  const count = executed.filter(q => q.includes('INSERT INTO inventory_movements')).length;
  const replay = await put({ eventId: id, sourceVersion: 10, onHand: 8 });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().idempotent, true);
  assert.equal(executed.filter(q => q.includes('INSERT INTO inventory_movements')).length, count);
  assert.equal((await put({ eventId: id, sourceVersion: 10, onHand: 9 })).statusCode, 409);
  assert.equal((await put({ eventId: randomUUID(), sourceVersion: 9, onHand: 7 })).statusCode, 409);
  assert.equal((await put({ eventId: randomUUID(), sourceVersion: 11, onHand: 1 })).statusCode, 409);
  assert.equal(onHand, 8);
  assert.equal((await put({ eventId: randomUUID(), sourceVersion: 12, onHand: 6 })).statusCode, 200);
  assert.equal(onHand, 6);
});

test('sem autoridade, integracao nao pode gravar saldo de estoque', async t => {
  const app = await apiFixture(t, async sql => {
    if (sql.includes('FROM external_integrations i JOIN stores')) return response([{
      ...identity, stock_authority: false, scopes: ['catalog.read', 'orders.read', 'events.read'],
    }]);
    return response([]);
  });
  const r = await app.inject({ method: 'PUT', url: `/v1/external/inventory/${variantId}`,
    headers: integrationAuth, payload: { eventId: randomUUID(), sourceVersion: 1, onHand: 4 } });
  assert.equal(r.statusCode, 403);
});

test('gestao da integracao exige login do proprietario', async t => {
  const app = await apiFixture(t, async (sql) => {
    if (sql.includes('FROM refresh_sessions')) return response([{}]);
    if (sql.includes('FROM store_memberships')) return response([{ role: 'STAFF', status: 'ACTIVE' }]);
    return response([]);
  });
  const jwt = await createAccessToken(userId, randomUUID());
  const r = await app.inject({ method: 'POST', url: `/v1/stores/${storeId}/integrations`,
    headers: { authorization: `Bearer ${jwt}` },
    payload: { name: 'ERP Loja', provider: 'generic', stockAuthority: true } });
  assert.equal(r.statusCode, 403);
});

test('ACK so confirma eventos existentes na propria loja', async t => {
  const actions: string[] = [];
  let allowed = true;
  const query = async (sql: string, params: unknown[] = []) => {
    actions.push(sql);
    if (sql.includes('FROM external_integrations i JOIN stores')) return response([identity]);
    if (sql.includes('SELECT id::text AS id') && sql.includes('FROM external_change_events')) {
      return response(allowed ? [{ id: String((params[1] as string[])[0]) }] : []);
    }
    return response([]);
  };
  const app = await apiFixture(t, query);
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  const endpoint = '/v1/external/events/ack';
  let r = await app.inject({method:'POST',url:endpoint,headers:integrationAuth,payload:{eventIds:['20']}});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().acknowledged,1);
  allowed = false;
  r = await app.inject({method:'POST',url:endpoint,headers:integrationAuth,payload:{eventIds:['21']}});
  assert.equal(r.statusCode,404);
  assert.equal(actions.some(q=>q.includes('ROLLBACK')),true);
  assert.equal((await app.inject({method:'POST',url:endpoint,headers:integrationAuth,
    payload:{eventIds:['21','21']}})).statusCode,400);
});

test('pedidos usam cursor de microssegundos, paginam e mantem isolamento', async t => {
  const orderId = '66666666-6666-4666-8666-666666666666';
  const cursorTime = '2026-11-19T11:00:02.123456Z';
  const params: unknown[][] = [];
  const app = await apiFixture(t, async (sql, args) => {
    params.push(args ?? []);
    if (sql.includes('FROM external_integrations i JOIN stores')) return response([identity]);
    if (sql.includes('FROM orders o WHERE')) return response([{
      id: orderId, status: 'PAID', totalCents:'9000', cursorTime,
    }]);
    if (sql.includes('FROM order_items oi')) return response([{
      orderId, sku:'SKU-1', quantity:1, unitPriceCents:'9000',
    }]);
    return response([]);
  });
  const first = await app.inject({ method:'GET',url:'/v1/external/orders?limit=50',headers:integrationAuth });
  assert.equal(first.statusCode,200,first.body);
  assert.equal(first.json().orders[0].items.length,1);
  const cursor = first.json().nextCursor;
  assert.deepEqual(decodeOrderCursor(cursor),{ date:cursorTime,id:orderId });
  const second = await app.inject({ method:'GET',url:'/v1/external/orders?cursor='+encodeURIComponent(cursor),headers:integrationAuth });
  assert.equal(second.statusCode,200);
  assert.ok(params.some(x=>x[1]===cursorTime));
  assert.equal(params.flat().includes(otherStore),false);
});

test('rotas permanecem desativadas ate habilitar explicitamente', async t => {
  const app = await apiFixture(t, async()=>response([]));
  config.ENABLE_EXTERNAL_INTEGRATIONS = false;
  const r = await app.inject({method:'GET',url:'/v1/external/events',headers:integrationAuth});
  assert.equal(r.statusCode,503);
});
