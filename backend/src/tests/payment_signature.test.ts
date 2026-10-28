import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMercadoPagoSignature } from '../security/payment_signature.js';

test('verifica assinatura e rejeita adulteração/replay', () => {
  const ts = String(Math.floor(Date.now()/1000));
  const key = 'test-key-very-long-not-real';
  const manifest = `id:1234;request-id:abc;ts:${ts};`;
  const signature = `ts=${ts},v1=${createHmac('sha256',key).update(manifest).digest('hex')}`;
  assert.equal(verifyMercadoPagoSignature(signature,'abc','1234',key),true);
  assert.equal(verifyMercadoPagoSignature(signature,'forged','1234',key),false);
  assert.equal(verifyMercadoPagoSignature(signature,'abc','1235',key),false);
  assert.equal(verifyMercadoPagoSignature(signature,'abc','1234',key,Date.now()+11*60_000),false);
  assert.equal(verifyMercadoPagoSignature(undefined,'abc','1234',key),false);
});
