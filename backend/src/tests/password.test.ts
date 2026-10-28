import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../security/password.js';

test('senhas usam salt diferente e são verificáveis', async () => {
  const a = await hashPassword('minha_senha_de_teste_2026');
  const b = await hashPassword('minha_senha_de_teste_2026');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('minha_senha_de_teste_2026', a), true);
  assert.equal(await verifyPassword('senha_incorreta', a), false);
  assert.equal(await verifyPassword('qualquer', 'scrypt$v1$invalido'), false);
});
