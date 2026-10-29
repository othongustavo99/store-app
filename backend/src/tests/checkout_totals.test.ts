import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckoutItems, preferenceMatchesOrder, type CheckoutLine } from '../services/checkout_totals.js';

function build(lines: CheckoutLine[], discount = 0, shipping = 0) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.unit_price_cents) * line.quantity, 0);
  return buildCheckoutItems(lines, { subtotalCents: String(subtotal), discountCents: String(discount),
    shippingCents: String(shipping), totalCents: String(subtotal - discount + shipping) });
}
const line = (price: number, quantity = 1): CheckoutLine => ({ product_name: 'Camisa', quantity, unit_price_cents: String(price) });
const sum = (items: ReturnType<typeof build>) => items.reduce((total, item) => total + Math.round(item.unit_price * 100) * item.quantity, 0);

test('R$100 com cupom de R$10 cobra R$90; o frete permanece integral', () => {
  const items = build([line(10000)], 1000, 1290);
  assert.equal(sum(items), 10290);
  assert.deepEqual(items.at(-1), { title: 'Frete', quantity: 1, unit_price: 12.9, currency_id: 'BRL' });
});
test('sem cupom preserva preço e quantidade dos produtos', () => {
  const items = build([line(7990, 2)], 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].unit_price, 79.9);
});
test('resto de centavo em três unidades não aumenta nem reduz a cobrança', () => {
  const items = build([line(100, 3)], 1);
  assert.equal(sum(items), 299);
  assert.equal(items.reduce((quantity, item) => quantity + item.quantity, 0), 3);
  assert.ok(items.every(item => item.unit_price > 0));
});
test('desconto extremo agrega produtos para não enviar unidades a zero', () => {
  const items = build([line(1, 20), line(100, 2)], 219, 50);
  assert.equal(sum(items), 51);
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].unit_price, 0.01);
});
test('recusa totais adulterados e quantidades inválidas antes de chamar gateway', () => {
  assert.throws(() => buildCheckoutItems([line(100)], {
    subtotalCents: '100', discountCents: '10', shippingCents: '0', totalCents: '100',
  }), /inconsistentes/);
  assert.throws(() => build([line(100, 21)]), /Quantidade/);
  assert.throws(() => build([line(100)], 100), /inconsistentes/);
});
test('400 combinações de valores, unidades, descontos e frete mantêm o total exato', () => {
  let seed = 739;
  const next = () => (seed = (seed * 48271) % 2147483647);
  for (let index = 0; index < 400; index++) {
    const lines = Array.from({ length: next() % 8 + 1 }, () => line(next() % 100000 + 1, next() % 20 + 1));
    const subtotal = lines.reduce((total, item) => total + Number(item.unit_price_cents) * item.quantity, 0);
    const discount = next() % subtotal;
    const shipping = next() % 5000;
    const items = build(lines, discount, shipping);
    assert.equal(sum(items), subtotal - discount + shipping);
    assert.ok(items.every(item => Number.isInteger(item.quantity) && item.quantity > 0 && item.unit_price >= 0.01));
  }
});
test('preferência antiga com preço integral não corresponde ao pedido descontado', () => {
  const items = build([line(10000)]);
  assert.equal(preferenceMatchesOrder({ external_reference: 'order', items }, 'order', '9000'), false);
  assert.equal(preferenceMatchesOrder({ external_reference: 'other', items }, 'order', '10000'), false);
  assert.equal(preferenceMatchesOrder({ external_reference: 'order', items: build([line(10000)], 1000) }, 'order', '9000'), true);
  assert.equal(preferenceMatchesOrder({ external_reference: 'order', items: [{ quantity: 1, unit_price: '90.00', currency_id: 'USD' }] }, 'order', '9000'), false);
});
