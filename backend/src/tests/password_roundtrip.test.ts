import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hashPassword, verifyPassword } from '../security/password.js';

test('senha cadastrada deve funcionar no login e recusar outra senha', async () => {
  const password = 'Senha-para-teste-aleatorio-2026!';
  const digest = await hashPassword(password);
  assert.match(digest, /^scrypt\$v1\$/);
  assert.equal(await verifyPassword(password, digest), true);
  assert.equal(await verifyPassword('senha-incorreta-999', digest), false);
  assert.equal(await verifyPassword(password, 'hash-invalido'), false);
});

test('cada cadastro usa um salt diferente', async () => {
  const a = await hashPassword('mesma-senha-forte!');
  const b = await hashPassword('mesma-senha-forte!');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('mesma-senha-forte!', a), true);
  assert.equal(await verifyPassword('mesma-senha-forte!', b), true);
});
