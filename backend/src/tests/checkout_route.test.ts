import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { createAccessToken } from '../security/tokens.js';
import { commerceRoutes } from '../routes/commerce.js';

const storeId = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000001';
const userId = '30000000-0000-4000-8000-000000000001';
const url = 'https://checkout.example.invalid/payment';
type Options = { cached?: boolean; cachedTotal?: number; wrongReference?: boolean; badStoredTotal?: boolean; badGatewayTotal?: boolean; failUpdate?: boolean };

async function fixture(t: TestContext, options: Options = {}) {
  const previous = { ...config };
  Object.assign(config, { ENABLE_REAL_PAYMENTS: true, PAYMENT_PILOT_STORE_ID: storeId,
    MERCADOPAGO_ACCESS_TOKEN: 'test-only-token-never-sent', PUBLIC_BASE_URL: 'https://api.example.invalid', MERCADOPAGO_WEBHOOK_SECRET: 'test-only-webhook-secret' });
  t.after(() => { Object.assign(config, previous); });
  const calls: { method: string; body: Record<string, unknown> | null }[] = [];
  const statements: string[] = [];
  let saved = false;
  const order = { id: orderId, store_id: storeId, customer_id: userId, status: 'PENDING_PAYMENT', is_demo: false,
    subtotal_cents: '10000', discount_cents: '1000', shipping_cents: '0', total_cents: options.badStoredTotal ? '9500' : '9000',
    reservation_expires_at: new Date(Date.now() + 3600000),
    checkout_url: options.cached ? url : null, checkout_reference: options.cached ? 'pref-existing' : null,
    checkout_expires_at: options.cached ? new Date(Date.now() + 600000) : null };
  t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('SELECT id FROM stores')) return { rowCount: 1, rows: [{ id: storeId }] };
    if (sql.includes('FROM refresh_sessions')) return { rowCount: 1, rows: [{}] };
    if (sql.includes('SELECT 1 FROM orders')) return { rowCount: 1, rows: [{}] };
    if (sql.includes('FROM orders o')) {
      assert.match(sql, /o\.discount_cents=0/);
      return { rowCount: 1, rows: [{ id: orderId, isDemo: false, paymentProvider: 'mercadopago', checkoutUrl: null }] };
    }
    if (sql.includes('FROM order_items')) return { rowCount: 0, rows: [] };
    throw new Error('Consulta inesperada no teste');
  });
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('SELECT o.*')) return { rowCount: 1, rows: [order] };
      if (sql.includes('SELECT product_name,quantity')) return { rowCount: 1, rows: [{ product_name: 'Camisa', quantity: 1, unit_price_cents: '10000' }] };
      if (sql.includes('UPDATE payments SET checkout_url')) saved = true;
      return { rowCount: 0, rows: [] };
    }, release: () => {},
  }));
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, body });
    if (method === 'PUT' && options.failUpdate) return Response.json({ error: 'simulated' }, { status: 503 });
    const price = method === 'GET' ? options.cachedTotal ?? 100 : options.badGatewayTotal ? 100 : 90;
    return Response.json({ id: options.cached ? 'pref-existing' : 'pref-new', init_point: url,
      external_reference: options.wrongReference ? 'other-order' : orderId,
      items: [{ title: 'Camisa', quantity: 1, unit_price: price, currency_id: 'BRL' }] });
  });
  const app = Fastify();
  t.after(() => app.close());
  await app.register(commerceRoutes);
  const token = await createAccessToken(userId, '40000000-0000-4000-8000-000000000001');
  const response = await app.inject({ method: 'POST', url: `/v1/shops/loja-a/orders/${orderId}/checkout`, headers: { authorization: `Bearer ${token}` } });
  return { response, calls, statements, saved };
}

test('rota envia R$90 ao gateway para pedido R$100 menos cupom R$10', async t => {
  const result = await fixture(t);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.json().checkoutUrl, url);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].method, 'POST');
  const items = result.calls[0].body!.items as { unit_price: number; quantity: number }[];
  assert.equal(items.reduce((sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity, 0), 9000);
  assert.ok(result.saved);
});
test('preferência antiga sem desconto é corrigida antes de reutilizar o mesmo link', async t => {
  const result = await fixture(t, { cached: true });
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(result.calls.map(call => call.method), ['GET', 'PUT']);
  assert.equal((result.calls[1].body!.items as { unit_price: number }[])[0].unit_price, 90);
  assert.equal(result.saved, false);
});
test('preferência já correta é reutilizada sem criar cobrança adicional', async t => {
  const result = await fixture(t, { cached: true, cachedTotal: 90 });
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(result.calls.map(call => call.method), ['GET']);
});
test('pedido inconsistente bloqueia gateway e desfaz transação', async t => {
  const result = await fixture(t, { badStoredTotal: true });
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.calls.length, 0);
  assert.ok(result.statements.includes('ROLLBACK'));
});
test('preferência de outro pedido não é alterada nem reutilizada', async t => {
  const result = await fixture(t, { cached: true, wrongReference: true });
  assert.equal(result.response.statusCode, 409);
  assert.deepEqual(result.calls.map(call => call.method), ['GET']);
});
test('resposta divergente do gateway bloqueia retorno do link e persistência', async t => {
  const result = await fixture(t, { badGatewayTotal: true });
  assert.equal(result.response.statusCode, 502);
  assert.equal(result.saved, false);
});
test('falha ao corrigir preferência antiga não devolve link com valor incorreto', async t => {
  const result = await fixture(t, { cached: true, failUpdate: true });
  assert.equal(result.response.statusCode, 502);
  assert.equal(result.response.json().checkoutUrl, undefined);
});
