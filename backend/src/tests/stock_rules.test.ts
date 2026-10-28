import test from 'node:test';
import assert from 'node:assert/strict';
import { stockAfterAdjustment } from '../services/stock_rules.js';

test('entrada aumenta estoque físico, mantendo reservas', () => {
  assert.equal(stockAfterAdjustment(10, 3, 5), 15);
});
test('saída utiliza apenas estoque disponível', () => {
  assert.equal(stockAfterAdjustment(10, 3, -7), 3);
  assert.throws(() => stockAfterAdjustment(10, 3, -8), /reservadas/);
});
test('nunca admite zero, frações, negativos físicos ou exceder limite', () => {
  assert.throws(() => stockAfterAdjustment(10, 0, 0));
  assert.throws(() => stockAfterAdjustment(10, 0, 1.5));
  assert.throws(() => stockAfterAdjustment(10, 0, -11));
  assert.throws(() => stockAfterAdjustment(1000000, 0, 1));
});
