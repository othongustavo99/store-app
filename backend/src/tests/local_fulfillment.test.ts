import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { shippingRoutes } from '../routes/shipping.js';
import { commerceRoutes } from '../routes/commerce.js';
import { shipmentManagementRoutes } from '../routes/shipment_management.js';
import { createAccessToken } from '../security/tokens.js';
import { fulfillmentInput, fulfillmentSettings, localFingerprint, localRate } from '../services/local_fulfillment.js';

const store = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const product = '30000000-0000-4000-8000-000000000001';
const variant = '40000000-0000-4000-8000-000000000001';
const quote = '50000000-0000-4000-8000-000000000001';
const settings = { pickupAddress: 'Rua da Loja, 20', pickupHours: 'Seg a sex, 9h às 18h',
  localEnabled: true, localFeeCents: 700, localEstimate: 'Até dois dias úteis após confirmação',
  localPostalRanges: [{ start: '01000000', end: '01999999' }] };
const row = { pickup_address: settings.pickupAddress, pickup_hours: settings.pickupHours,
  local_enabled: true, local_fee_cents: 700, local_estimate: settings.localEstimate,
  local_postal_ranges: settings.localPostalRanges };
const lines = [{ variantId: variant, quantity: 1, unitCents: '10000' }];

test('configuração exige prazo e faixa real, aceita taxa zero e rejeita faixa invertida', () => {
  assert.equal(fulfillmentInput.safeParse({ ...settings, localFeeCents: 0 }).success, true);
  for (const value of [{ ...settings, localPostalRanges: [] }, { ...settings, localEstimate: '' },
    { ...settings, localPostalRanges: [{ start: '02000000', end: '01000000' }] },
    { ...settings, localFeeCents: -1 }, { ...settings, localFeeCents: 0.1 }]) {
    assert.equal(fulfillmentInput.safeParse(value).success, false);
  }
});
test('área local inclui as bordas e não aceita CEP externo ou modalidade desativada', () => {
  assert.equal(localRate(settings, '01000000')?.priceCents, 700);
  assert.equal(localRate(settings, '01999999')?.id, '0');
  assert.equal(localRate(settings, '02000000'), null);
  assert.equal(localRate({ ...settings, localEnabled: false }, '01000000'), null);
  assert.equal(fulfillmentSettings().localEnabled, false);
});
test('assinatura local detecta mudança de preço, quantidade, taxa, área e prazo', () => {
  const hash = localFingerprint(settings, '01000000', lines);
  for (const modified of [{ ...settings, localFeeCents: 0 }, { ...settings, localEstimate: 'Amanhã' },
    { ...settings, localEnabled: false }, { ...settings, localPostalRanges: [] }]) {
    assert.notEqual(localFingerprint(modified, '01000000', lines), hash);
  }
  assert.notEqual(localFingerprint(settings, '01000000', [{ ...lines[0], unitCents: '10001' }]), hash);
  assert.notEqual(localFingerprint(settings, '01000000', [{ ...lines[0], quantity: 2 }]), hash);
});

async function fixture(t: TestContext, options: { fee?: number; changed?: boolean; expired?: boolean;
  previous?: boolean; role?: string; status?: string; carrier?: boolean } = {}) {
  const original = { ...config };
  Object.assign(config, { ENABLE_REAL_PAYMENTS: false, SHIPPING_MELHOR_ENVIO_TOKEN: undefined,
    SHIPPING_MELHOR_ENVIO_SANDBOX: true });
  t.after(() => Object.assign(config, original));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Nenhum provedor deve ser chamado'); });
  const statements: { sql: string; values: unknown[] }[] = [];
  const actualRow = { ...row, local_fee_cents: options.fee ?? 700 };
  const actualSettings = fulfillmentSettings(actualRow);
  const result = (rows: unknown[]) => ({ rowCount: rows.length, rows });
  const query = async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values });
    if (sql.includes('FROM refresh_sessions')) return result([{}]);
    if (sql.includes('FROM store_memberships')) return result([{ role: options.role ?? 'OWNER', status: 'ACTIVE' }]);
    if (sql.includes('SELECT id FROM stores')) return result([{ id: store }]);
    if (sql.includes('SELECT is_demo')) return result([{ is_demo: false }]);
    if (sql.includes('SELECT offline_methods')) return result([{ offline_methods: ['MANUAL_PIX', 'PAY_ON_PICKUP'] }]);
    if (sql.includes('SELECT * FROM store_fulfillment_settings')) return result([actualRow]);
    if (sql.includes('FROM store_shipping_settings')) return result([]);
    if (sql.includes('FROM orders WHERE store_id=$1 AND customer_id=$2 AND idempotency_key=$3'))
      return result(options.previous ? [{ id: product }] : []);
    if (sql.includes('FROM product_variants v')) return result([{ id: variant, product_id: product,
      name: 'Camisa', sku: 'CAM-M', attributes: { color: 'Azul', size: 'M' },
      price_cents: '10000', on_hand: 10, reserved: 0 }]);
    if (sql.includes('FROM product_variants WHERE')) return result([{ price_cents: '10000', on_hand: 10, reserved: 0 }]);
    if (sql.includes('INSERT INTO shipping_quotes')) return result([{ id: quote, expires_at: new Date(Date.now() + 900000) }]);
    if (sql.includes('FROM shipping_quotes')) return result([{ provider: 'LOCAL',
      origin_postal_code: '00000000', destination_postal_code: '01000000',
      cart_hash: localFingerprint(options.changed ? { ...actualSettings, localFeeCents: 500 } : actualSettings, '01000000', lines),
      services: [localRate(actualSettings, '01000000')], expires_at: new Date(Date.now() + (options.expired ? -1 : 900000)) }]);
    if (sql.includes('SELECT o.*')) return result([{ id: product, store_id: store, status: options.status ?? 'PREPARING' }]);
    if (sql.includes('FROM orders o')) return result([{ id: product, totalCents: '10700', paymentProvider: 'offline' }]);
    if (sql.includes('SELECT fulfillment_method')) return result([{ fulfillment_method: 'DELIVERY', shipping_service_id: options.carrier ? '7' : '0' }]);
    if (sql.includes('SELECT status,fulfillment_method,shipping_carrier')) return result([
      {status:'PREPARING',fulfillment_method:'DELIVERY',shipping_service_id:'0'}]);
    return result([]);
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  const app = Fastify(); t.after(() => app.close());
  await app.register(shippingRoutes); await app.register(commerceRoutes); await app.register(shipmentManagementRoutes);
  const token = await createAccessToken(user, quote);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers, statements };
}
const body = () => ({ idempotencyKey: quote, offlineMethod: 'MANUAL_PIX', fulfillment: 'DELIVERY',
  customer: { name: 'Cliente Local', phone: '11999999999' },
  items: [{ productId: product, color: 'Azul', size: 'M', quantity: 1 }],
  shipping: { quoteId: quote, serviceId: '0', address: { postalCode: '01000000', street: 'Rua de Casa',
    number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' } } });

test('cotação local dispensa token e dimensões e salva taxa do servidor', async t => {
  const { app, headers, statements } = await fixture(t);
  const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/shipping/quotes', headers,
    payload: { destinationPostalCode: '01000000', mode: 'LOCAL', items: body().items } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().sandbox, false);
  assert.equal(response.json().options[0].priceCents, 700);
  assert.ok(statements.some(s => s.sql.includes("'LOCAL') RETURNING")));
});
test('CEP fora da área não gera cotação local', async t => {
  const { app, headers, statements } = await fixture(t);
  const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/shipping/quotes', headers,
    payload: { destinationPostalCode: '02000000', mode: 'LOCAL', items: body().items } });
  assert.equal(response.statusCode, 409);
  assert.equal(statements.some(s => s.sql.includes('INSERT INTO shipping_quotes')), false);
});
test('pedido local com Pix combinado inclui taxa e continua aguardando pagamento', async t => {
  const { app, headers, statements } = await fixture(t);
  const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/checkout/orders', headers, payload: body() });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().offlinePending, true);
  const saved = statements.find(s => s.sql.includes('INSERT INTO orders('))!;
  assert.equal(saved.values[4], 'PENDING_PAYMENT');
  assert.equal(saved.values[6], 700);
  assert.equal(saved.values[7], '10700');
  assert.equal(JSON.parse(String(saved.values[8])).deliveryMode, 'LOCAL');
});
test('entrega gratuita local é aceita e não altera o subtotal dos produtos', async t => {
  const { app, headers, statements } = await fixture(t, { fee: 0 });
  const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/checkout/orders', headers, payload: body() });
  assert.equal(response.statusCode, 201);
  assert.equal(statements.find(s => s.sql.includes('INSERT INTO orders('))!.values[7], '10000');
});
for (const [title, options] of [['taxa alterada', { changed: true }], ['cotação vencida', { expired: true }]] as const) {
  test(`${title} impede reserva e criação do pedido`, async t => {
    const { app, headers, statements } = await fixture(t, options);
    const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/checkout/orders', headers, payload: body() });
    assert.equal(response.statusCode, 409);
    assert.equal(statements.some(s => s.sql.includes('INSERT INTO orders(')), false);
    assert.ok(statements.some(s => s.sql === 'ROLLBACK'));
  });
}
test('pagamento na retirada não é aceito para entrega mesmo se habilitado', async t => {
  const { app, headers } = await fixture(t);
  const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/checkout/orders', headers,
    payload: { ...body(), offlineMethod: 'PAY_ON_PICKUP' } });
  assert.equal(response.statusCode, 400);
});
test('repetição da mesma intenção retorna pedido anterior sem reservar novamente', async t => {
  const { app, headers, statements } = await fixture(t, { previous: true });
  const response = await app.inject({ method: 'POST', url: '/v1/shops/loja-a/checkout/orders', headers, payload: body() });
  assert.equal(response.statusCode, 201);
  assert.equal(statements.some(s => s.sql.includes('INSERT INTO orders(')), false);
});
test('funcionário sem gestão não altera retirada ou taxa local', async t => {
  const { app, headers, statements } = await fixture(t, { role: 'STAFF' });
  const response = await app.inject({ method: 'PUT', url: `/v1/stores/${store}/shipping/fulfillment`, headers, payload: settings });
  assert.equal(response.statusCode, 403);
  assert.equal(statements.some(s => s.sql.includes('INSERT INTO store_fulfillment_settings')), false);
});

test('painel recebe configuração salva e papel de gestão', async t => {
  const { app, headers } = await fixture(t);
  const response = await app.inject({ url: `/v1/stores/${store}/shipping/setup`, headers });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().myRole, 'OWNER');
  assert.deepEqual(response.json().fulfillment, settings);
});
for (const [current, next] of [['PREPARING', 'SHIPPED'], ['SHIPPED', 'DELIVERED']]) {
  test(`entrega local avança de ${current} para ${next} sem rastreio inventado`, async t => {
    const { app, headers, statements } = await fixture(t, { status: current });
    const response = await app.inject({ method: 'PATCH', url: `/v1/stores/${store}/orders/${product}/status`,
      headers, payload: { status: next } });
    assert.equal(response.statusCode, 200);
    assert.ok(statements.some(s => s.sql.includes('UPDATE orders SET status=$2') && s.values[1] === next));
    assert.equal(statements.some(s => s.sql.includes('INSERT INTO shipments')), false);
  });
}
test('entrega por transportadora continua exigindo a expedição com rastreio', async t => {
  const { app, headers, statements } = await fixture(t, { carrier: true });
  const response = await app.inject({ method: 'PATCH', url: `/v1/stores/${store}/orders/${product}/status`,
    headers, payload: { status: 'SHIPPED' } });
  assert.equal(response.statusCode, 409);
  assert.equal(statements.some(s => s.sql.includes('UPDATE orders SET status=$2')), false);
});
test('pagamento pendente não pode ser marcado como entrega concluída', async t => {
  const { app, headers } = await fixture(t, { status: 'PENDING_PAYMENT' });
  const response = await app.inject({ method: 'PATCH', url: `/v1/stores/${store}/orders/${product}/status`,
    headers, payload: { status: 'DELIVERED' } });
  assert.equal(response.statusCode, 409);
});
test('entrega local não aceita postagem artificial pelo painel de transportadora', async t => {
  const {app,headers,statements}=await fixture(t);
  const response=await app.inject({method:'PUT',url:`/v1/stores/${store}/orders/${product}/shipment`,headers,
    payload:{trackingCode:'FAKE12345'}});
  assert.equal(response.statusCode,409);
  assert.equal(statements.some(s=>s.sql.includes('INSERT INTO shipments')),false);
});
